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

   Fotografías: se guardan/leen hasta 9 (columnas foto1..foto9).
   Para bases existentes correr antes la migración correspondiente
   (deploy/sql-migracion-9-fotos.sql); para bases nuevas el esquema
   htat_api_schema.sql ya incluye las 9 columnas.
   ============================================================ */

const COLUMNAS = [
  "id", "ot", "fechaEmision", "linea", "activo", "tipoPlan", "parteSistema",
  "tareaEspecifica", "consumoEnergia", "presionGas", "observaciones",
  "firmaNombre", "firmaFecha", "creadoEn", "actualizadoEn",
  "foto1", "foto2", "foto3", "foto4", "foto5",
  "foto6", "foto7", "foto8", "foto9", "firmaImg", "novedad",
];

const N_FOTOS = 9;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(datos) {
  return new Response(JSON.stringify(datos), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}
function texto(s) {
  return new Response(s, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
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
async function guardar(env, datos) {
  const id = String(datos.id || "");
  if (!id) return texto("FALTA_ID");

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
      .prepare("SELECT foto1,foto2,foto3,foto4,foto5,foto6,foto7,foto8,foto9,firmaImg FROM ots WHERE id = ?")
      .bind(id)
      .first();
    for (let i = 1; i <= N_FOTOS; i++) fila["foto" + i] = actual ? actual["foto" + i] || "" : "";
    fila.firmaImg = actual ? actual.firmaImg || "" : "";
  } else {
    await borrarPrefijo(env, "fotos/" + id + "/");
    await borrarPrefijo(env, "firmas/" + id + ".");
    const fotos = Array.isArray(datos.fotos) ? datos.fotos.slice(0, N_FOTOS) : [];
    for (let i = 1; i <= N_FOTOS; i++) {
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
  return texto("OK");
}

async function borrar(env, id) {
  const clave = String(id || "");
  if (!clave) return texto("FALTA_ID");
  await borrarPrefijo(env, "fotos/" + clave + "/");
  await borrarPrefijo(env, "firmas/" + clave + ".");
  await env.DB.prepare("DELETE FROM ots WHERE id = ?").bind(clave).run();
  return texto("OK");
}

/* ---------- listar ---------- */
async function listar(env) {
  const res = await env.DB.prepare("SELECT * FROM ots").all();
  const filas = (res.results || []).map((r) => {
    ["consumoEnergia", "presionGas"].forEach((k) => {
      if (typeof r[k] === "string" && r[k] !== "") {
        try { r[k] = JSON.parse(r[k]); } catch (e) { /* queda como texto */ }
      }
    });
    return r;
  });
  return json(filas);
}

/* ---------- imagen ---------- */
async function imagen(env, clave) {
  const obj = await env.BUCKET.get(clave);
  if (!obj) return json({ ok: false, error: "no existe" });
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const mime = (obj.httpMetadata && obj.httpMetadata.contentType) || "image/png";
  return json({ ok: true, mime, b64: bytesABase64(bytes) });
}

/* ---------- lineas ---------- */
function normLinea(nombre) {
  return String(nombre || "").trim().toUpperCase();
}
async function listarLineas(env) {
  const res = await env.DB.prepare("SELECT nombre FROM lineas ORDER BY nombre").all();
  return json((res.results || []).map((r) => r.nombre));
}
async function agregarLinea(env, nombre) {
  const n = normLinea(nombre);
  if (!n) return texto("FALTA_NOMBRE");
  await env.DB
    .prepare("INSERT OR IGNORE INTO lineas (nombre, creadoEn) VALUES (?, ?)")
    .bind(n, new Date().toISOString())
    .run();
  return texto("OK");
}
async function borrarLinea(env, nombre) {
  const n = normLinea(nombre);
  if (!n) return texto("FALTA_NOMBRE");
  await env.DB.prepare("DELETE FROM lineas WHERE nombre = ?").bind(n).run();
  return texto("OK");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        const img = url.searchParams.get("img");
        if (img) return await imagen(env, img);
        if (url.searchParams.get("lineas") !== null) return await listarLineas(env);
        return await listar(env);
      }
      if (request.method === "POST") {
        const cuerpo = await request.json().catch(() => ({}));
        if (cuerpo && cuerpo.action === "delete") return await borrar(env, cuerpo.id);
        if (cuerpo && cuerpo.action === "linea") return await agregarLinea(env, cuerpo.nombre);
        if (cuerpo && cuerpo.action === "linea-borrar") return await borrarLinea(env, cuerpo.nombre);
        return await guardar(env, cuerpo);
      }
      return new Response("Metodo no permitido", { status: 405, headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
      });
    }
  },
};
