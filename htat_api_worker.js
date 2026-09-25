/* ============================================================
   HTAT · API del historial compartido
   Cloudflare Worker + D1 (datos) + R2 (fotos y firma)

   Desde v4 el historial es de LECTURA ABIERTA: cualquier cuenta de
   Google válida (token verificado contra Google) puede VER todo
   (OTs, fotos, líneas, su perfil). Para AGREGAR, MODIFICAR o BORRAR
   hace falta estar en la lista de usuarios permitidos (tabla D1
   "usuarios" o el administrador de HTAT_ADMIN). La lista la maneja
   un administrador desde la app.

   Contrato:
     GET  /                    -> lista de OTs (JSON) [cualquier Google válido]
     GET  /?img=<key>          -> { ok, mime, b64 } de una imagen  [ídem]
     GET  /?lineas=1           -> lista de líneas compartidas       [ídem]
     GET  /?yo=1               -> { email, nombre, foto, nivel }    [ídem]
     GET  /?usuarios=1         -> lista de usuarios permitidos (solo admin)
     POST /  {OT...}                                 -> "OK"  [requiere edición]
     POST /  {action:"delete", id}                   -> "OK"  [ídem]
     POST /  {action:"linea", nombre}                -> "OK"  [ídem]
     POST /  {action:"linea-borrar", nombre}         -> "OK"  [ídem]
     POST /  {action:"usuario-agregar", email}       -> "OK" (solo admin)
     POST /  {action:"usuario-borrar", email}        -> "OK" (solo admin)

   Autenticación: el cliente manda "Authorization: Bearer <id_token>"
   (token de Google). El Worker valida la firma RSA contra las claves
   públicas de Google (JWKS), comprueba las claims (emisor, audiencia,
   expiración, email verificado) y asigna el nivel:
     - "lectura": cualquier cuenta de Google válida (solo VER).
     - "usuario"/"admin": cuentas de la lista permitida (edición).

   Variables de entorno del Worker:
     GOOGLE_CLIENT_ID  -> Client ID de OAuth 2.0 de Google (obligatorio)
     HTAT_ADMIN        -> email del administrador (siempre permitido)
     HTAT_ORIGENES     -> (opcional) orígenes extra separados por coma

   Bindings requeridos:
     - D1  con nombre  DB      -> base htat
     - R2  con nombre  BUCKET  -> bucket htat-evidencias

   Fotografías: se guardan/leen hasta 9 (columnas foto1..foto9).
   Para bases existentes correr antes la migración correspondiente;
   para bases nuevas el esquema htat_api_schema.sql ya incluye las 9
   columnas y la tabla usuarios.
   ============================================================ */

import {
  decodificarJWT,
  base64URLABytes,
  normalizarEmail,
  validarClaims,
  perfilDe,
} from "./auth-core.mjs";

const COLUMNAS = [
  "id", "ot", "fechaEmision", "linea", "activo", "tipoPlan", "parteSistema",
  "tareaEspecifica", "consumoEnergia", "presionGas", "observaciones",
  "firmaNombre", "firmaFecha", "creadoEn", "actualizadoEn",
  "foto1", "foto2", "foto3", "foto4", "foto5",
  "foto6", "foto7", "foto8", "foto9", "firmaImg", "novedad",
];

const N_FOTOS = 9;

/* Orígenes desde los que la app puede llamar a la API. Sin almacenar
   cookies la política es "origen permitido" por lista blanca. */
const ORIGENES_POR_DEFECTO = [
  "https://htat-ot.htat.workers.dev",
  "http://localhost:8080",
  "https://localhost:8080",
];

/* ---------- CORS ---------- */
function origenesPermitidos(env) {
  const extra = (env.HTAT_ORIGENES || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return new Set([...ORIGENES_POR_DEFECTO, ...extra]);
}
function cabecerasCORS(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (origin && !origenesPermitidos(env).has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(datos, cors) {
  return new Response(JSON.stringify(datos), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}
function texto(s, cors) {
  return new Response(s, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
  });
}
function respuesta(status, cors, detalle) {
  return new Response(detalle ? JSON.stringify(detalle) : null, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
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

/* ================================================================
   AUTENTICACIÓN GOOGLE (Sign in with Google)
   ================================================================ */
let jwksCache = null;

/* Claves públicas de Google (JWKS). Cacheadas en memoria 12 h; si la
   descarga falla se reutiliza la copia anterior (rotan muy lento). */
async function clavesGoogle(env) {
  const ahora = Date.now();
  if (jwksCache && ahora - jwksCache.at < 12 * 3600 * 1000) return jwksCache.claves;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    headers: { "User-Agent": "htat-api" },
    cf: { cacheTtl: 3600 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (jwksCache) return jwksCache.claves;
    throw new Error("Google certs HTTP " + res.status);
  }
  const datos = await res.json();
  const claves = (datos.keys || []).filter((k) => k.kty === "RSA" && k.alg === "RS256");
  if (!claves.length) {
    if (jwksCache) return jwksCache.claves;
    throw new Error("Sin claves Google válidas");
  }
  jwksCache = { claves, at: ahora };
  return claves;
}

/* Verifica la firma RSA (RS256) con WebCrypto y la clave JWK de Google. */
async function verificarFirma(jwt, clave) {
  const jwk = { kty: "RSA", n: clave.n, e: clave.e, alg: "RS256", use: "sig" };
  const key = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );
  const datos = new TextEncoder().encode(jwt.mensaje);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwt.firma, datos);
}

/* Valida un ID token de Google de punta a punta. Devuelve el perfil o null. */
async function usuarioDeGoogle(token, env) {
  if (!token) return null;
  const jwt = decodificarJWT(token);
  if (!jwt) return null;
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID no configurado");

  const claims = validarClaims(jwt.payload, clientId, Date.now());
  if (!claims.ok) return null;

  const claves = await clavesGoogle(env);
  const kid = jwt.header && jwt.header.kid;
  const clave = claves.find((k) => k.kid === kid) || claves[0];
  if (!clave) return null;
  if (!(await verificarFirma(jwt, clave))) return null;

  const p = perfilDe(jwt.payload);
  if (!p.email) return null;
  return p;
}

/* Punto de inyección para tests: si el entorno trae __verificarGoogle,
   se usa en lugar de validar la firma contra Google (JWKS/WebCrypto).
   Nunca se define en producción: solo los tests lo usan. */
async function verificarGoogle(token, env) {
  if (env && typeof env.__verificarGoogle === "function") {
    return await env.__verificarGoogle(token);
  }
  return await usuarioDeGoogle(token, env);
}

/* ¿El email está en la lista de permitidos? El admin de HTAT_ADMIN
   siempre entra (fallback de emergencia si se vacía la lista). */
async function esPermitido(env, email) {
  const admin = (env.HTAT_ADMIN || "").trim().toLowerCase();
  if (admin && email === admin) return { email, nivel: "admin", bootstrap: true };
  const fila = await env.DB
    .prepare("SELECT email, nombre, nivel FROM usuarios WHERE email = ?")
    .bind(email)
    .first();
  return fila || null;
}

function esAdmin(user) {
  return !!(user && (user.nivel === "admin"));
}

/* Middleware de LECTURA: exige sesión de Google válida. Cualquier
   cuenta de Google funciona (nivel "lectura" si no está en la lista
   permitida; "usuario"/"admin" si sí está). Devuelve { error } o
   { user }. */
async function autorizar(request, env, cors) {
  const m = /^Bearer\s+(.+)$/i.exec((request.headers.get("Authorization") || "").trim());
  let user = null;
  let errorAuth = null;
  try {
    user = await verificarGoogle(m ? m[1] : "", env);
  } catch (e) {
    errorAuth = e.message || String(e);
  }
  if (!user) {
    return {
      error: respuesta(401, cors, {
        ok: false,
        error: "No autorizado: sesión de Google inválida" + (errorAuth ? " (" + errorAuth + ")" : ""),
      }),
    };
  }
  const permitido = await esPermitido(env, user.email);
  if (!permitido) {
    /* Cualquier cuenta de Google válida puede VER el historial. */
    return {
      user: {
        email: user.email,
        nivel: "lectura",
        nombre: user.nombre,
        foto: user.foto,
      },
    };
  }
  return {
    user: {
      email: permitido.email,
      nivel: permitido.nivel,
      nombre: (permitido.nombre && !user.nombre) ? permitido.nombre : user.nombre,
      foto: user.foto,
    },
  };
}

/* Middleware de ESCRITURA: igual que autorizar, pero exige estar en
   la lista permitida (nivel "usuario" o "admin"). */
async function autorizarEscritura(request, env, cors) {
  const base = await autorizar(request, env, cors);
  if (base.error) return base;
  if (base.user.nivel === "lectura") {
    return {
      error: respuesta(403, cors, {
        ok: false,
        error: "La cuenta " + base.user.email + " puede ver el historial, pero no modificarlo. Pedí permiso de edición al administrador.",
      }),
    };
  }
  return base;
}

/* ---------- guardar / actualizar ---------- */
async function guardar(env, cors, datos) {
  const id = String(datos.id || "");
  if (!id) return texto("FALTA_ID", cors);

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
  return texto("OK", cors);
}

async function borrar(env, cors, id) {
  const clave = String(id || "");
  if (!clave) return texto("FALTA_ID", cors);
  await borrarPrefijo(env, "fotos/" + clave + "/");
  await borrarPrefijo(env, "firmas/" + clave + ".");
  await env.DB.prepare("DELETE FROM ots WHERE id = ?").bind(clave).run();
  return texto("OK", cors);
}

/* ---------- listar ---------- */
async function listar(env, cors) {
  const res = await env.DB.prepare("SELECT * FROM ots").all();
  const filas = (res.results || []).map((r) => {
    ["consumoEnergia", "presionGas"].forEach((k) => {
      if (typeof r[k] === "string" && r[k] !== "") {
        try { r[k] = JSON.parse(r[k]); } catch (e) { /* queda como texto */ }
      }
    });
    return r;
  });
  return json(filas, cors);
}

/* ---------- imagen ---------- */
async function imagen(env, cors, clave) {
  const obj = await env.BUCKET.get(clave);
  if (!obj) return json({ ok: false, error: "no existe" }, cors);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const mime = (obj.httpMetadata && obj.httpMetadata.contentType) || "image/png";
  return json({ ok: true, mime, b64: bytesABase64(bytes) }, cors);
}

/* ---------- lineas ---------- */
function normLinea(nombre) {
  return String(nombre || "").trim().toUpperCase();
}
async function listarLineas(env, cors) {
  const res = await env.DB.prepare("SELECT nombre FROM lineas ORDER BY nombre").all();
  return json((res.results || []).map((r) => r.nombre), cors);
}
async function agregarLinea(env, cors, nombre) {
  const n = normLinea(nombre);
  if (!n) return texto("FALTA_NOMBRE", cors);
  await env.DB
    .prepare("INSERT OR IGNORE INTO lineas (nombre, creadoEn) VALUES (?, ?)")
    .bind(n, new Date().toISOString())
    .run();
  return texto("OK", cors);
}
async function borrarLinea(env, cors, nombre) {
  const n = normLinea(nombre);
  if (!n) return texto("FALTA_NOMBRE", cors);
  await env.DB.prepare("DELETE FROM lineas WHERE nombre = ?").bind(n).run();
  return texto("OK", cors);
}

/* ---------- usuarios permitidos ---------- */
async function listarUsuarios(env, cors, user) {
  if (!esAdmin(user)) return respuesta(403, cors, { ok: false, error: "Solo administradores" });
  const res = await env.DB
    .prepare("SELECT email, nombre, nivel FROM usuarios ORDER BY email")
    .all();
  const lista = (res.results || []).map((r) => ({
    email: r.email,
    nombre: r.nombre || "",
    nivel: r.nivel || "usuario",
  }));
  /* El admin de emergencia (HTAT_ADMIN) aparece aunque no esté en la tabla. */
  const adminBootstrap = (env.HTAT_ADMIN || "").trim().toLowerCase();
  if (adminBootstrap && !lista.some((u) => u.email === adminBootstrap)) {
    lista.unshift({ email: adminBootstrap, nombre: "", nivel: "admin" });
  }
  return json(lista, cors);
}
async function agregarUsuario(env, cors, user, cuerpo) {
  if (!esAdmin(user)) return respuesta(403, cors, { ok: false, error: "Solo administradores" });
  const email = normalizarEmail(cuerpo && cuerpo.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return respuesta(400, cors, { ok: false, error: "Email no válido" });
  }
  const nombre = String((cuerpo && cuerpo.nombre) || "").trim();
  const nivel = String((cuerpo && cuerpo.nivel) || "usuario").trim();
  const nivelFinal = nivel === "admin" ? "admin" : "usuario";
  await env.DB
    .prepare("INSERT OR IGNORE INTO usuarios (email, nombre, nivel, creadoEn) VALUES (?, ?, ?, ?)")
    .bind(email, nombre, nivelFinal, new Date().toISOString())
    .run();
  /* Si ya existía, actualiza nombre/nivel. */
  await env.DB
    .prepare("UPDATE usuarios SET nombre = ?, nivel = ? WHERE email = ?")
    .bind(nombre, nivelFinal, email)
    .run();
  return texto("OK", cors);
}
async function borrarUsuario(env, cors, user, email) {
  if (!esAdmin(user)) return respuesta(403, cors, { ok: false, error: "Solo administradores" });
  const e = normalizarEmail(email);
  if (!e) return respuesta(400, cors, { ok: false, error: "Email no válido" });
  const adminDescartable = (env.HTAT_ADMIN || "").trim().toLowerCase();
  if (adminDescartable && e === adminDescartable) {
    return respuesta(400, cors, { ok: false, error: "No se puede quitar el administrador principal" });
  }
  await env.DB.prepare("DELETE FROM usuarios WHERE email = ?").bind(e).run();
  return texto("OK", cors);
}

export default {
  async fetch(request, env) {
    const cors = cabecerasCORS(request, env);
    if (!cors) {
      return new Response("Origen no permitido", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      const url = new URL(request.url);

      if (request.method === "GET") {
        const auth = await autorizar(request, env, cors);
        if (auth.error) return auth.error;
        const img = url.searchParams.get("img");
        if (img) return await imagen(env, cors, img);
        if (url.searchParams.get("lineas") !== null) return await listarLineas(env, cors);
        if (url.searchParams.get("usuarios") !== null) return await listarUsuarios(env, cors, auth.user);
        if (url.searchParams.get("yo") !== null) return json(auth.user, cors);
        return await listar(env, cors);
      }

      if (request.method === "POST") {
        const cuerpo = await request.json().catch(() => ({}));
        if (cuerpo && cuerpo.action === "delete") {
          const auth = await autorizarEscritura(request, env, cors);
          if (auth.error) return auth.error;
          return await borrar(env, cors, cuerpo.id);
        }
        if (cuerpo && cuerpo.action === "linea") {
          const auth = await autorizarEscritura(request, env, cors);
          if (auth.error) return auth.error;
          return await agregarLinea(env, cors, cuerpo.nombre);
        }
        if (cuerpo && cuerpo.action === "linea-borrar") {
          const auth = await autorizarEscritura(request, env, cors);
          if (auth.error) return auth.error;
          return await borrarLinea(env, cors, cuerpo.nombre);
        }
        if (cuerpo && cuerpo.action === "usuario-agregar") {
          const auth = await autorizarEscritura(request, env, cors);
          if (auth.error) return auth.error;
          return await agregarUsuario(env, cors, auth.user, cuerpo);
        }
        if (cuerpo && cuerpo.action === "usuario-borrar") {
          const auth = await autorizarEscritura(request, env, cors);
          if (auth.error) return auth.error;
          return await borrarUsuario(env, cors, auth.user, cuerpo.email);
        }
        const auth = await autorizarEscritura(request, env, cors);
        if (auth.error) return auth.error;
        return await guardar(env, cors, cuerpo);
      }

      return new Response("Metodo no permitido", { status: 405, headers: cors });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
      });
    }
  },
};