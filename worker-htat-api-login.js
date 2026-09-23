/* ============================================================
   HTAT · API del historial compartido (con LOGIN PROPIO)
   Cloudflare Worker + D1 (datos) + R2 (fotos y firma)

   La app habla este contrato:
     GET  /?estado=1         -> { ok, loginCreado }   (¿hay usuarios?)
     GET  /?me=1             -> { ok, usuario, nombre, admin }  (validar token)
     POST /  {accion:"login", usuario, password}    -> { ok, token, usuario, nombre }
     POST /  {accion:"logout"}                      -> "OK"
     POST /  {accion:"primer-usuario", usuario, password, nombre}
                               -> crea el primer usuario (solo si no hay ninguno)
     POST /  {accion:"agregar-usuario", usuario, password, nombre}
                               -> crea otro usuario (solo administrador)
     GET  /            -> lista de OTs (JSON)        [requiere sesión]
     GET  /?img=<key>  -> { ok, mime, b64 }          [requiere sesión]
     POST /  {OT...}   -> "OK"   (guarda/actualiza)  [requiere sesión]
     POST /  {action:"delete", id:"..."} -> "OK"     [requiere sesión]

   Seguridad:
     - CORS: solo el origen exacto de la app. Ya NO se usa "*".
     - Autenticación: todo endpoint de datos exige el header
       "Authorization: Bearer <token>". Las contraseñas se guardan
       como hash PBKDF2-SHA256 (nunca en texto plano).
     - Sesiones: token aleatorio de 32 bytes, guardado en D1, que
       vence a los DIAS_SESION (7 días por defecto).

   Bindings requeridos (Configuracion del Worker):
     - D1  con nombre  DB      -> base htat
     - R2  con nombre  BUCKET  -> bucket htat-evidencias

   Tablas D1 adicionales (crear una vez en la consola):
     CREATE TABLE IF NOT EXISTS usuarios (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       usuario TEXT NOT NULL UNIQUE,
       salt TEXT NOT NULL,
       hash TEXT NOT NULL,
       nombre TEXT NOT NULL DEFAULT '',
       activo INTEGER NOT NULL DEFAULT 1,
       admin INTEGER NOT NULL DEFAULT 0,
       creadoEn TEXT NOT NULL
     );
     CREATE TABLE IF NOT EXISTS sesiones (
       token TEXT PRIMARY KEY,
       usuario TEXT NOT NULL,
       creadaEn TEXT NOT NULL,
       expiraEn TEXT NOT NULL
     );
     CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario);
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

/* Dentro de este tiempo la sesión sigue válida sin volver a pedir login. */
const DIAS_SESION = 7;
const ITERACIONES_PBKDF2 = 120000;

function headersCORS(request) {
  const origin = (request && request.headers.get("Origin")) || "";
  let cors = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (ORIGENES_PERMITIDOS.includes(origin)) {
    cors["Access-Control-Allow-Origin"] = origin;
    cors["Access-Control-Allow-Credentials"] = "true";
    cors["Vary"] = "Origin";
  }
  return cors;
}

function json(datos, request, status) {
  return new Response(JSON.stringify(datos), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headersCORS(request) },
  });
}
function texto(s, request, status) {
  return new Response(s, {
    status: status || 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headersCORS(request) },
  });
}
function noAuth(request) {
  return json({ ok: false, error: "Sesión requerida. Ingresá con tu usuario y contraseña.", code: "SESION_REQUERIDA" }, request, 401);
}
function pausa(ms) {
  return new Promise((res) => setTimeout(res, ms));
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

/* ---------- contraseñas (PBKDF2-SHA256) ---------- */
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? base64ABytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERACIONES_PBKDF2, hash: "SHA-256" },
    key, 256
  );
  return { salt: bytesABase64(salt), hash: bytesABase64(new Uint8Array(bits)) };
}
/* Comparación constante en tiempo (evita medir cuántos caracteres coinciden). */
function igualSeguro(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verificarPassword(password, saltB64, hashB64) {
  try {
    const { hash } = await hashPassword(password, saltB64);
    return igualSeguro(hash, hashB64);
  } catch (e) {
    return false;
  }
}

/* ---------- sesiones ---------- */
function nuevoToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function expiraSesion() {
  return new Date(Date.now() + DIAS_SESION * 24 * 3600 * 1000).toISOString();
}
async function autenticar(env, request) {
  const h = request.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const fila = await env.DB.prepare("SELECT * FROM sesiones WHERE token = ?").bind(token).first();
  if (!fila) return null;
  const exp = new Date(fila.expiraEn).getTime();
  if (!(exp > Date.now())) {
    await env.DB.prepare("DELETE FROM sesiones WHERE token = ?").bind(token).run();
    return null;
  }
  return fila;
}
async function crearSesion(env, usuario) {
  const token = nuevoToken();
  await env.DB.prepare(
    "INSERT INTO sesiones (token, usuario, creadaEn, expiraEn) VALUES (?, ?, ?, ?)"
  ).bind(token, usuario, new Date().toISOString(), expiraSesion()).run();
  return token;
}

/* ---------- autenticación: endpoints ---------- */
async function estado(env, request) {
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarios").first();
  return json({ ok: true, loginCreado: !!(c && c.n > 0) }, request);
}
async function me(env, sesion, request) {
  const u = await env.DB.prepare("SELECT usuario, nombre, admin FROM usuarios WHERE usuario = ?")
    .bind(sesion.usuario).first();
  if (!u) return noAuth(request);
  return json({ ok: true, usuario: u.usuario, nombre: u.nombre || "", admin: u.admin === 1 }, request);
}
async function login(env, cuerpo, request) {
  const usuario = String(cuerpo.usuario || "").trim().toLowerCase();
  const password = String(cuerpo.password || "");
  if (!usuario || !password) return json({ ok: false, error: "Ingresá usuario y contraseña." }, request, 400);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE usuario = ?").bind(usuario).first();
  /* siempre se espera un instante aunque no exista el usuario (anti fuerza bruta) */
  await pausa(300);
  if (!u || u.activo !== 1) return json({ ok: false, error: "Usuario o contraseña incorrectos." }, request, 401);
  const valido = await verificarPassword(password, u.salt, u.hash);
  if (!valido) return json({ ok: false, error: "Usuario o contraseña incorrectos." }, request, 401);
  await env.DB.prepare("DELETE FROM sesiones WHERE usuario = ? AND expiraEn <= ?")
    .bind(u.usuario, new Date().toISOString()).run();
  const token = await crearSesion(env, u.usuario);
  return json({ ok: true, token, usuario: u.usuario, nombre: u.nombre || "" }, request);
}
async function logout(env, sesion, request) {
  const h = request.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (token) await env.DB.prepare("DELETE FROM sesiones WHERE token = ?").bind(token).run();
  return texto("OK", request);
}
async function primerUsuario(env, cuerpo, request) {
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarios").first();
  if (c && c.n > 0) return json({ ok: false, error: "Ya existe un usuario registrado." }, request, 403);
  return crearUsuario(env, cuerpo, request, true);
}
async function agregarUsuario(env, sesion, cuerpo, request) {
  const admin = await env.DB.prepare("SELECT admin FROM usuarios WHERE usuario = ?").bind(sesion.usuario).first();
  if (!admin || admin.admin !== 1) return json({ ok: false, error: "Se necesita un administrador." }, request, 403);
  return crearUsuario(env, cuerpo, request, false);
}
async function crearUsuario(env, cuerpo, request, esAdmin) {
  const usuario = String(cuerpo.usuario || "").trim().toLowerCase();
  const password = String(cuerpo.password || "");
  const nombre = String(cuerpo.nombre || "").trim();
  if (!usuario || password.length < 6) {
    return json({ ok: false, error: "Usuario obligatorio y contraseña de al menos 6 caracteres." }, request, 400);
  }
  const existente = await env.DB.prepare("SELECT id FROM usuarios WHERE usuario = ?").bind(usuario).first();
  if (existente) return json({ ok: false, error: "Ese usuario ya existe." }, request, 409);
  const { salt, hash } = await hashPassword(password);
  const ahora = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO usuarios (usuario, salt, hash, nombre, activo, admin, creadoEn) VALUES (?, ?, ?, ?, 1, ?, ?)"
  ).bind(usuario, salt, hash, nombre, esAdmin ? 1 : 0, ahora).run();
  const token = await crearSesion(env, usuario);
  return json({ ok: true, token, usuario, nombre }, request);
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

/* ---------- despacho ---------- */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: headersCORS(request) });
    }
    try {
      const url = new URL(request.url);
      /* Refuerzo: si el Origin no está permitido, no respondo datos. */
      if (request.method === "GET" || request.method === "POST") {
        const origin = (request.headers.get("Origin") || "").trim();
        if (origin && !ORIGENES_PERMITIDOS.includes(origin)) {
          return new Response("Origen no permitido", { status: 403, headers: headersCORS(request) });
        }
      }
      if (request.method === "GET") {
        if (url.searchParams.get("estado") !== null) return await estado(env, request);
        const sesion = await autenticar(env, request);
        if (!sesion) return noAuth(request);
        if (url.searchParams.get("me") !== null) return await me(env, sesion, request);
        const img = url.searchParams.get("img");
        if (img) return await imagen(env, img, request);
        if (url.searchParams.get("lineas") !== null) return await listarLineas(env, request);
        return await listar(env, request);
      }
      if (request.method === "POST") {
        const cuerpo = await request.json().catch(() => ({}));
        const accion = cuerpo && cuerpo.accion;
        if (accion === "login") return await login(env, cuerpo, request);
        if (accion === "primer-usuario") return await primerUsuario(env, cuerpo, request);
        /* desde acá, todo requiere sesión */
        const sesion = await autenticar(env, request);
        if (!sesion) return noAuth(request);
        if (accion === "logout") return await logout(env, sesion, request);
        if (accion === "agregar-usuario") return await agregarUsuario(env, sesion, cuerpo, request);
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