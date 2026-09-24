/* ============================================================
   htat · Base compartida (historial central)
   Mediante una API en Cloudflare (D1 + R2), las OTs guardadas
   por todas las personas que usan la app se acumulan en una
   misma base. El historial y el resumen mensual mezclan lo
   local (IndexedDB) con lo compartido (la base).

   Desde v3 la API requiere sesión: cada llamada sale con
   "Authorization: Bearer <token de Google>" y, si la sesión
   caduca (HTTP 401), se renueva automáticamente y se reintenta.
   ============================================================ */
"use strict";

const Cloud = (() => {
  let cache = null;
  let cacheAt = 0;
  let warming = null;
  let failAt = 0;
  let lastOk = 0;   // última vez que una operación con la base salió bien
  const TTL = 60000;

  function lastSync() { return lastOk; }
  function base() { return (CONF.cloud.webAppUrl || "").replace(/\/+$/, ""); }

  /* Hace falta configuración Y sesión de Google activa. */
  function isConfigured() {
    return Auth.haySesion() && /^https:\/\//.test(CONF.cloud.webAppUrl || "");
  }

  /* Fetch con sesión: agrega la cabecera Authorization y, ante 401,
     renueva la sesión (Auth) y reintenta una vez. */
  async function api(recursos, init) {
    if (!Auth.haySesion()) throw new Error("Necesitás iniciar sesión con Google para usar el historial compartido.");
    const opts = init || {};
    const headers = new Headers(opts.headers || {});
    headers.set("Authorization", "Bearer " + Auth.token());
    const config = Object.assign({}, opts, { headers });
    if (opts.cache) config.cache = opts.cache;

    for (let intento = 1; intento <= 2; intento++) {
      let res;
      try {
        res = await fetch(base() + recursos, config);
      } catch (e) {
        throw new Error("No se pudo contactar la base: " + e.message);
      }
      if (res.status === 401 && intento === 1) {
        await Auth.sesionInvalida().catch(() => null);
        headers.set("Authorization", "Bearer " + Auth.token());
        continue;
      }
      return res;
    }
    throw new Error("Sesión de Google no válida. Volvé a iniciar sesión.");
  }

  /* Registro ligero (sin fotos ni imagen de firma) para la base. */
  function toMeta(rec) {
    return {
      id: rec.id,
      ot: rec.ot,
      fechaEmision: rec.fechaEmision || "",
      linea: rec.linea || "",
      activo: rec.activo || "",
      tipoPlan: rec.tipoPlan || "",
      parteSistema: rec.parteSistema || "",
      tareaEspecifica: rec.tareaEspecifica || "",
      consumoEnergia: rec.consumoEnergia || null,
      presionGas: rec.presionGas || null,
      observaciones: rec.observaciones || "",
      novedad: !!rec.novedad,
      firmaNombre: (rec.firma && rec.firma.nombre) || "",
      firmaFecha: (rec.firma && rec.firma.fecha) || "",
      creadoEn: rec.creadoEn || new Date().toISOString(),
      actualizadoEn: rec.actualizadoEn || new Date().toISOString(),
    };
  }

  /* Devuelve una OT con la forma que usa la app para el historial. */
  function toRecord(row) {
    const fotoIds = [];
    /* La base compartida guarda hasta CONF.limits.maxFotos (9). Se leen
       todas las columnas fotoN para que ninguna evidencia se pierda. */
    for (let n = 1; n <= CONF.limits.maxFotos; n++) {
      const fid = row["foto" + n];
      if (fid) fotoIds.push(String(fid));
    }
    return {
      id: row.id,
      ot: parseInt(row.ot, 10) || 0,
      fechaEmision: row.fechaEmision || "",
      linea: row.linea || "",
      activo: row.activo || "",
      tipoPlan: row.tipoPlan || "",
      parteSistema: row.parteSistema || "",
      tareaEspecifica: row.tareaEspecifica || "",
      consumoEnergia: row.consumoEnergia || null,
      presionGas: row.presionGas || null,
      observaciones: row.observaciones || "",
      novedad: row.novedad === true || row.novedad === "true" || row.novedad === "si" || row.novedad === "SI" || row.novedad === 1 || row.novedad === "1",
      /* Las imágenes viven en el bucket (R2): acá llega la referencia
         (key); los bytes se piden solo cuando hacen falta. */
      fotos: fotoIds.map((fileId) => ({ fileId })),
      firma: (row.firmaNombre || row.firmaFecha || row.firmaImg)
        ? { nombre: row.firmaNombre || "", fecha: row.firmaFecha || "", fileId: row.firmaImg ? String(row.firmaImg) : "" }
        : null,
      creadoEn: row.creadoEn || "",
      actualizadoEn: row.actualizadoEn || "",
      hub: true,
      sincronizado: true,   // vino de la base: ya está compartido entre todos
    };
  }

  async function push(rec) {
    if (!isConfigured()) return false;
    const meta = toMeta(rec);
    /* Las imágenes viajan aparte: la base guarda solo la referencia.
       Si alguna foto no se pudo descargar (p. ej. sin conexión), NO se
       envían las imágenes para no borrar las que ya están guardadas. */
    const fotos = Array.isArray(rec.fotos) ? rec.fotos : [];
    const todasListas = fotos.every((f) => (typeof f === "string" ? true : !!(f && f.dataUrl)));
    const carga = {
      ...meta,
      firmaDataUrl: (rec.firma && rec.firma.dataUrl) || "",
    };
    if (todasListas) {
      carga.fotos = fotos
        .map((f) => (typeof f === "string" ? f : (f && f.dataUrl) || ""))
        .filter((s) => !!s);
    } else {
      carga.conservarImagenes = true;
    }
    let txt;
    try {
      const res = await api("/", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(carga),
      });
      txt = await res.text();
    } catch (e) {
      throw new Error("No se pudo contactar la base: " + e.message);
    }
    if (txt === "OK" || txt.includes('"ok"')) {
      lastOk = Date.now();
      if (Array.isArray(cache)) {
        const i = cache.findIndex((x) => x && x.id === meta.id);
        if (i >= 0) cache[i] = meta; else cache.push(meta);
        cacheAt = Date.now();
      }
      return true;
    }
    throw new Error("La base no confirmó el guardado. Respuesta: " + txt.slice(0, 100));
  }

  async function del(id) {
    if (!isConfigured()) return false;
    let txt;
    try {
      const res = await api("/", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete", id }),
      });
      txt = await res.text();
    } catch (e) {
      throw new Error("No se pudo contactar la base: " + e.message);
    }
    if (txt === "OK") {
      lastOk = Date.now();
      if (Array.isArray(cache)) {
        cache = cache.filter((x) => x && x.id !== id);
        cacheAt = Date.now();
      }
      return true;
    }
    throw new Error("La base no confirmó la baja. Respuesta: " + txt.slice(0, 100));
  }

  /* Prueba de conexión: lee los registros de la base y devuelve el resultado. */
  async function probar() {
    if (!isConfigured()) {
      return { ok: false, msg: "Ingresá con tu cuenta de Google para conectar el historial compartido." };
    }
    try {
      const res = await api("/", { method: "GET", cache: "no-store" });
      const txt = await res.text();
      let n = -1;
      try {
        const filas = JSON.parse(txt);
        n = Array.isArray(filas) ? filas.length : -1;
      } catch (e) { n = -1; }
      if (res.ok && n >= 0) {
        lastOk = Date.now();
        return { ok: true, msg: "Conexión OK · " + n + " registro(s) en la base" };
      }
      return { ok: false, msg: "La base respondió HTTP " + res.status + " — " + txt.slice(0, 140) };
    } catch (e) {
      return { ok: false, msg: "Sin conexión con la base: " + e.message };
    }
  }

  /* Perfil en la base: email, nombre y nivel (admin/usuario). Sirve para
     saber si la persona puede administrar los usuarios permitidos. */
  async function quienSoy() {
    if (!isConfigured()) return null;
    const res = await api("/?yo=1", { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.email ? { email: d.email, nombre: d.nombre || "", foto: d.foto || "", nivel: d.nivel || "usuario" } : null;
  }

  /* ---------- líneas compartidas ---------- */
  let lineasCache = null;

  async function lineas(force) {
    if (!isConfigured()) return lineasCache || [];
    if (!force && lineasCache) return lineasCache;
    const res = await api("/?lineas=1", { method: "GET", cache: "no-store" });
    const arr = await res.json();
    lineasCache = Array.isArray(arr) ? arr : [];
    return lineasCache;
  }

  async function agregarLinea(nombre) {
    const n = String(nombre || "").trim().toUpperCase();
    if (!n) throw new Error("Nombre vacío");
    if (!isConfigured()) throw new Error("Sin conexión con la base");
    const res = await api("/", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "linea", nombre: n }),
    });
    const txt = (await res.text()).trim();
    if (txt !== "OK") throw new Error("La base no confirmó: " + txt.slice(0, 80));
    if (Array.isArray(lineasCache) && !lineasCache.includes(n)) lineasCache.push(n);
    else lineasCache = null;
    return n;
  }

  /* ---------- usuarios permitidos (solo administradores) ---------- */
  async function usuariosPermitidos() {
    const res = await api("/?usuarios=1", { method: "GET", cache: "no-store" });
    const d = await res.json();
    if (!res.ok) throw new Error((d && d.error) || "No se pudo leer la lista de usuarios.");
    return Array.isArray(d) ? d : [];
  }
  async function usuariosAgregar(email, nombre) {
    const res = await api("/", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "usuario-agregar", email, nombre }),
    });
    const txt = (await res.text()).trim();
    if (txt !== "OK") throw new Error("La base no confirmó: " + txt.slice(0, 80));
  }
  async function usuariosBorrar(email) {
    const res = await api("/", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "usuario-borrar", email }),
    });
    const txt = (await res.text()).trim();
    if (txt !== "OK") throw new Error("La base no confirmó: " + txt.slice(0, 80));
  }

  /* Cuál de las dos versiones de una misma OT es más reciente. */
  function esMasNueva(a, b) {
    return String(a.actualizadoEn || "") > String(b.actualizadoEn || "");
  }

  /* Si la base acumuló filas repetidas del mismo id (por versiones viejas
     del backend), se queda con la más reciente. */
  function dedupeRows(rows) {
    const map = new Map();
    (rows || []).forEach((r) => {
      if (!r || !r.id) return;
      const prev = map.get(r.id);
      if (!prev || esMasNueva(r, prev)) map.set(r.id, r);
    });
    return Array.from(map.values());
  }

  /* Junta lo local con lo compartido: para una misma OT gana la versión
     editada más recientemente (así un cambio hecho en otro dispositivo
     sí se ve reflejado acá). */
  function unir(local, remotos) {
    const map = new Map();
    local.forEach((r) => map.set(r.id, r));
    (remotos || []).forEach((r) => {
      if (!r || !r.id) return;
      const prev = map.get(r.id);
      if (!prev) { map.set(r.id, toRecord(r)); return; }
      if (esMasNueva(r, prev)) map.set(r.id, toRecord(r));
    });
    return Array.from(map.values());
  }

  async function pullAll(force) {
    if (!isConfigured()) return [];
    if (!force && cache && Date.now() - cacheAt < TTL) return cache;
    const res = await api("/", { method: "GET", cache: "no-store" });
    const rows = await res.json();
    cache = dedupeRows(Array.isArray(rows) ? rows : []);
    cacheAt = Date.now();
    lastOk = Date.now();
    return cache;
  }

  /* Junta lo local con lo compartido y evita duplicados por id. */
  async function mergedAll() {
    const local = await DB.all();
    const remote = await pullAll().catch(() => []);
    return unir(local, remote);
  }

  /* Igual que mergedAll pero sin esperar a la red: usa la última copia
     descargada (puede estar un poco vieja) junto con lo local. */
  async function mergedFast() {
    const local = await DB.all();
    return unir(local, cache || []);
  }

  function isFresh() {
    return isConfigured() && !!cache && Date.now() - cacheAt < TTL;
  }

  /* Baja una imagen de la base (foto o firma) y la devuelve como dataURL. */
  async function imagenUrlDe(fileId) {
    if (!fileId || !isConfigured()) return "";
    try {
      const res = await api("/?img=" + encodeURIComponent(fileId), {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data || !data.ok || !data.b64) return "";
      return "data:" + (data.mime || "image/png") + ";base64," + data.b64;
    } catch (e) {
      console.warn("htat: no se pudo bajar la imagen " + fileId, e);
      return "";
    }
  }

  /* Completa en memoria los dataURL de las fotos y la firma de una OT
     del historial compartido (los bytes no viajan con el listado). */
  async function imagenesDe(rec) {
    if (!rec) return rec;
    const fotos = rec.fotos || [];
    const ids = fotos.map((f) => (f && f.fileId) || "");
    const firmaId = (rec.firma && rec.firma.fileId) || "";
    const bajadas = await Promise.all(
      ids.map((id) => (id ? imagenUrlDe(id) : Promise.resolve("")))
        .concat([firmaId ? imagenUrlDe(firmaId) : Promise.resolve("")])
    );
    fotos.forEach((f, i) => { if (ids[i]) f.dataUrl = bajadas[i] || ""; });
    if (rec.firma && firmaId) rec.firma.dataUrl = bajadas[ids.length] || "";
    return rec;
  }

  /* Refresca la copia compartida en segundo plano (una a la vez).
     El callback se llama SOLO cuando una descarga logró actualizar
     el caché, nunca en forma sincrónica (evita bucles de re-render). */
  function warm(done) {
    if (!isConfigured() || isFresh() || Date.now() - failAt < 10000) return;
    if (!warming) {
      warming = pullAll(true)
        .then(() => {
          warming = null;
          if (done) done();
        })
        .catch(() => {
          warming = null;
          failAt = Date.now();
        });
    } else if (done) {
      warming.then(done, () => {});
    }
  }

  return {
    isConfigured, push, del, probar, pullAll, mergedAll, mergedFast, isFresh,
    warm, imagenesDe, lastSync, lineas, agregarLinea,
    quienSoy, usuariosPermitidos, usuariosAgregar, usuariosBorrar,
  };
})();