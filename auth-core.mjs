/* ============================================================
   HTAT · Núcleo de autenticación Google (puro — sin red ni crypto)
   Funciones compartidas entre el Worker (htat_api_worker.js) y
   los tests (Node). La verificación de la firma RSA del token
   queda en el Worker (WebCrypto, disponible en Cloudflare).
   ============================================================ */

/* base64url -> bytes (Uint8Array) */
export function base64URLABytes(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* base64url -> texto UTF-8 */
export function base64URLTexto(s) {
  return new TextDecoder().decode(base64URLABytes(s));
}

/* Separa un JWT (ID token de Google) en header, payload y firma. */
export function decodificarJWT(token) {
  const partes = String(token || "").split(".");
  if (partes.length !== 3) return null;
  try {
    const header = JSON.parse(base64URLTexto(partes[0]));
    const payload = JSON.parse(base64URLTexto(partes[1]));
    return {
      header,
      payload,
      firma: base64URLABytes(partes[2]),
      mensaje: partes[0] + "." + partes[1],
    };
  } catch (e) {
    return null;
  }
}

/* Cabecera "Authorization: Bearer xxx" -> "xxx" (o ""). */
export function bearerDe(autorizacion) {
  const m = /^Bearer\s+(.+)$/i.exec(String(autorizacion || "").trim());
  return m ? m[1].trim() : "";
}

/* Email normalizado (minúsculas, sin espacios). */
export function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/* Valida las CLAIMS de un ID token de Google (sin verificar la firma).
   "ahora" en segundos epoch. Devuelve { ok, motivo }. */
export function validarClaims(payload, clientId, ahora) {
  const p = payload || {};
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!clientId || !aud.includes(clientId)) return { ok: false, motivo: "aud" };
  if (p.azp && p.azp !== clientId) return { ok: false, motivo: "azp" };
  const iss = String(p.iss || "");
  if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
    return { ok: false, motivo: "iss" };
  }
  const exp = Number(p.exp || 0);
  const iat = Number(p.iat || 0);
  const t = Math.floor(ahora / 1000);
  const SESGO = 60; // tolerancia de reloj, segundos
  if (!exp || exp + SESGO < t) return { ok: false, motivo: "exp" };
  if (iat > t + SESGO) return { ok: false, motivo: "iat" };
  if (!p.email || String(p.email_verified) !== "true") return { ok: false, motivo: "email" };
  return { ok: true, motivo: "ok" };
}

/* Perfil mínimo a partir de claims ya validadas. */
export function perfilDe(payload) {
  return {
    email: normalizarEmail(payload && payload.email),
    nombre: (payload && payload.name) || "",
    foto: (payload && payload.picture) || "",
    sub: (payload && payload.sub) || "",
  };
}