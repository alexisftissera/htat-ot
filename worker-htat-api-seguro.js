/* ============================================================
   HTAT · API del historial compartido
   Cloudflare Worker + D1 (datos) + R2 (fotos y firma)

   La app habla este contrato:
     GET  /            -> lista de OTs (JSON)
     GET  /?img=<key>  -> { ok, mime, b64 } de una imagen
     POST /  {OT...}   -> "OK"   (guarda/actualiza)
     POST /  {action:"delete", id:"..."} -> "OK"

   Bindings requeridos (Configuracion del Worker):
     - D1  con nombre  DB      -> base htat
     - R2  con nombre  BUCKET  -> bucket htat-evidencias

   SEGURIDAD (ajustado):
     - La API está protegida por Cloudflare Access (la app y la API
       son aplicaciones Access). Sin sesión válida no se llega acá.
     - CORS: solo se habilita para el origen exacto de la app
       (htat-ot.htat.workers.dev) y se permiten credenciales. Ya NO
       se usa "*" porque el navegador lo rechaza con credentials.
   ============================================================ */

const COLUMNAS = [
  "id", "ot", "fechaEmision", "linea", "activo", "tipoPlan", "parteSistema",
  "tareaEspecifica", "consumoEnergia", "presionGas", "observaciones",
  "firmaNombre", "firmaFecha", "creadoEn", "actualizadoEn",
  "foto1", "foto2", "foto3", "foto4", "foto5", "firmaImg", "novedad",
];

/* Origen exacto del frontend (la PWA). Solo desde acá se aceptan
   lecturas/escrituras con credenciales. Se puede ampliar esta lista
   si algún día se agrega otra app legítima. */
const ORIGENES_PERMITIDOS = [
  "https://htat-ot.htat.workers.dev",
];

function headersCORS(request) {
  const origin = (request && request.headers.get("Origin")) || "";
  let cors = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (ORIGENES_PERMITIDOS.includes(origin)) {
    cors["Access-Control-Allow-Origin"] = origin;
    cors["Access-Control-Allow-Credentials"] = "true";
    cors["Vary"] = "Origin";
  }
  return cors;
}

function json(datos, request) {
  return new Response(JSON.stringify(datos), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...headersCORS(request) },
  });
}
function texto(s, request) {
  return new Response(s, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headersCORS(request) },
  });
}

/* ---------- base64 <-> bytes ---------- */
function bytesABase64(bytes) {
  let bin = "";
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  }
  return btoa(bin);
}
function base64ABytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function parseDataUrl(d) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(d || "");
  return m ? { mime: m[1], bytes: base64ABytes(m[2]) } : null;
}
function extDe(mime) {
  if (mime && mime.indexOf("jpeg") >= 0) return "jpg";
  if (mime && mime.indexOf("webp") >= 0) return "webp";
  return "png";
}

/* ---------- R2 ---------- */
async function borrarPrefijo(env, prefijo) {
  let cursor;
  do {
    const lista = await env.BUCKET.list({ prefix: prefijo, cursor });
    const claves = lista.objects.map((o) => o.key);
    if (claves.length) await env.BUCKET.delete(claves);
    cursor = lista.truncated ? lista.cursor : undefined;
  } while (cursor);
}
async function guardarImagen(env, clave, dataUrl) {
  const d = parseDataUrl(dataUrl);
  if (!d) return "";
  await env.BUCKET.put(clave, d.bytes, { httpMetadata: { contentType: d.mime } });
  return clave;
}

/* ---------- guardar / actualizar ---------- */
async function guardar(env, datos, request) {
  const id = String(datos.id || "");
  if (!id) return texto("FALTA_ID", request);

  const fila = {};
  COLUMNAS.forEach((c) => {
    const v = datos[c];
    fila[c] = v === undefined || v === null
      ? ""
      : (typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  fila.novedad = datos.novedad ? 1 : 0;

  if (datos.conservarImagenes) {
    /* No llegaron las fotos (sin conexion): se conservan las que ya hay. */
    const actual = await env.DB
      .prepare("SELECT foto1,foto2,foto3,foto4,foto5,firmaImg FROM ots WHERE id = ?")
      .bind(id)
      .first();
    for (let i = 1; i <= 5; i++) fila["foto" + i] = actual ? actual["foto" + i] || "" : "";
    fila.firmaImg = actual ? actual.firmaImg || "" : "";
  } else {
    await borrarPrefijo(env, "fotos/" + id + "/");
    await borrarPrefijo(env, "firmas/" + id + ".");
    const fotos = Array.isArray(datos.fotos) ? datos.fotos.slice(0, 5) : [];
    for (let i = 1; i <= 5; i++) {
      const dataUrl = fotos[i - 1];
      const d = parseDataUrl(dataUrl);
      const clave = "fotos/" + id + "/" + i + "." + extDe(d && d.mime);
      fila["foto" + i] = dataUrl ? await guardarImagen(env, clave, dataUrl) : "";
    }
    const df = parseDataUrl(datos.firmaDataUrl);
    const claveFirma = "firmas/" + id + "." + extDe(df && df.mime);
    fila.firmaImg = datos.firmaDataUrl ? await guardarImagen(env, claveFirma, datos.firmaDataUrl) : "";
  }

  const columnas = COLUMNAS.join(", ");
  const marcas = COLUMNAS.map(() => "?").join(", ");
  const actualiza = COLUMNAS.filter((c) => c !== "id").map((c) => c + " = excluded." + c).join(", ");
  await env.DB
    .prepare(
      "INSERT INTO ots (" + columnas + ") VALUES (" + marcas + ") " +
      "ON CONFLICT(id) DO UPDATE SET " + actualiza
    )
    .bind(...COLUMNAS.map((c) => fila[c]))
    .run();
  return texto("OK", request);
}

async function borrar(env, id, request) {
  const clave = String(id || "");
  if (!clave) return texto("FALTA_ID", request);
  await borrarPrefijo(env, "fotos/" + clave + "/");
  await borrarPrefijo(env, "firmas/" + clave + ".");
  await env.DB.prepare("DELETE FROM ots WHERE id = ?").bind(clave).run();
  return texto("OK", request);
}

/* ---------- listar ---------- */
async function listar(env, request) {
  const res = await env.DB.prepare("SELECT * FROM ots").all();
  const filas = (res.results || []).map((r) => {
    ["consumoEnergia", "presionGas"].forEach((k) => {
      if (typeof r[k] === "string" && r[k] !== "") {
        try { r[k] = JSON.parse(r[k]); } catch (e) { /* queda como texto */ }
      }
    });
    return r;
  });
  return json(filas, request);
}

/* ---------- imagen ---------- */
async function imagen(env, clave, request) {
  const obj = await env.BUCKET.get(clave);
  if (!obj) return json({ ok: false, error: "no existe" }, request);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const mime = (obj.httpMetadata && obj.httpMetadata.contentType) || "image/png";
  return json({ ok: true, mime, b64: bytesABase64(bytes) }, request);
}

/* ---------- lineas ---------- */
function normLinea(nombre) {
  return String(nombre || "").trim().toUpperCase();
}
async function listarLineas(env, request) {
  const res = await env.DB.prepare("SELECT nombre FROM lineas ORDER BY nombre").all();
  return json((res.results || []).map((r) => r.nombre), request);
}
async function agregarLinea(env, nombre, request) {
  const n = normLinea(nombre);
  if (!n) return texto("FALTA_NOMBRE", request);
  await env.DB
    .prepare("INSERT OR IGNORE INTO lineas (nombre, creadoEn) VALUES (?, ?)")
    .bind(n, new Date().toISOString())
    .run();
  return texto("OK", request);
}
async function borrarLinea(env, nombre, request) {
  const n = normLinea(nombre);
  if (!n) return texto("FALTA_NOMBRE", request);
  await env.DB.prepare("DELETE FROM lineas WHERE nombre = ?").bind(n).run();
  return texto("OK", request);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: headersCORS(request) });
    }
    try {
      const url = new URL(request.url);
      /* Con Access activo, solo llegan peticiones de sesiones válidas.
         Refuerzo: si el Origin no está permitido, no respondo datos. */
      if (request.method === "GET" || request.method === "POST") {
        const origin = (request.headers.get("Origin") || "").trim();
        if (origin && !ORIGENES_PERMITIDOS.includes(origin)) {
          return new Response("Origen no permitido", { status: 403, headers: headersCORS(request) });
        }
      }
      if (request.method === "GET") {
        const img = url.searchParams.get("img");
        if (img) return await imagen(env, img, request);
        if (url.searchParams.get("lineas") !== null) return await listarLineas(env, request);
        return await listar(env, request);
      }
      if (request.method === "POST") {
        const cuerpo = await request.json().catch(() => ({}));
        if (cuerpo && cuerpo.action === "delete") return await borrar(env, cuerpo.id, request);
        if (cuerpo && cuerpo.action === "linea") return await agregarLinea(env, cuerpo.nombre, request);
        if (cuerpo && cuerpo.action === "linea-borrar") return await borrarLinea(env, cuerpo.nombre, request);
        return await guardar(env, cuerpo, request);
      }
      return new Response("Metodo no permitido", { status: 405, headers: headersCORS(request) });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", ...headersCORS(request) },
      });
    }
  },
};