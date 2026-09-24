/* ============================================================
   HTAT · Tests del núcleo de autenticación Google
   Ejecutar: node --test tests/
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  base64URLABytes,
  base64URLTexto,
  decodificarJWT,
  bearerDe,
  normalizarEmail,
  validarClaims,
  perfilDe,
} from "../auth-core.mjs";

/* ---------- helpers ---------- */
const b64url = (s) =>
  Buffer.from(String(s), "utf8").toString("base64url");

function tokenArmado(payload, header) {
  const h = b64url(JSON.stringify(header || { alg: "RS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  return h + "." + p + "." + "firma-falsa";
}

const ahora = Math.floor(Date.now() / 1000);
const CLIENTE = "cliente-123.apps.googleusercontent.com";

function payloadBase(extra) {
  return {
    iss: "https://accounts.google.com",
    azp: CLIENTE,
    aud: CLIENTE,
    sub: "cuenta-1",
    email: "Operador@Gmail.com",
    email_verified: "true",
    at_hash: "x",
    name: "Hector",
    picture: "https://foto",
    iat: ahora - 60,
    exp: ahora + 3600,
    ...extra,
  };
}

/* ---------- base64url ---------- */
test("base64url: decode y roundtrip", () => {
  const bytes = base64URLABytes("ho-la_-");
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(base64URLTexto("aG9sYS0t"), "hola--");
});

test("base64url: texto multilínea", () => {
  assert.equal(base64URLTexto(b64url("héctor")), "héctor");
});

/* ---------- JWT ---------- */
test("decodificarJWT: token válido de 3 partes", () => {
  const token = tokenArmado(payloadBase());
  const jwt = decodificarJWT(token);
  assert.ok(jwt);
  assert.equal(jwt.header.alg, "RS256");
  assert.equal(jwt.payload.email, "Operador@Gmail.com");
  assert.equal(jwt.mensaje, token.split(".").slice(0, 2).join("."));
});

test("decodificarJWT: rechaza tokens rotos", () => {
  assert.equal(decodificarJWT(""), null);
  assert.equal(decodificarJWT("a.b"), null);
  assert.equal(decodificarJWT("notajwt"), null);
  assert.equal(decodificarJWT("a.b.c.d"), null);
});

/* ---------- Authorization ---------- */
test("bearerDe: extrae el token", () => {
  assert.equal(bearerDe("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerDe("bearer  x "), "x");
  assert.equal(bearerDe("Basic xyz"), "");
  assert.equal(bearerDe(null), "");
  assert.equal(bearerDe(""), "");
});

/* ---------- email ---------- */
test("normalizarEmail: minúsculas y sin espacios", () => {
  assert.equal(normalizarEmail("  Operador@gmail.com "), "operador@gmail.com");
  assert.equal(normalizarEmail(null), "");
});

/* ---------- claims ---------- */
test("validarClaims: token válido pasa", () => {
  const r = validarClaims(payloadBase(), CLIENTE, Date.now());
  assert.equal(r.ok, true);
});

test("validarClaims: aud distinta falla", () => {
  const r = validarClaims(payloadBase({ aud: "otra-app" }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "aud");
});

test("validarClaims: soporta aud en array", () => {
  const r = validarClaims(payloadBase({ aud: [CLIENTE, "otra"] }), CLIENTE, Date.now());
  assert.equal(r.ok, true);
});

test("validarClaims: azp distinto falla", () => {
  const r = validarClaims(payloadBase({ azp: "otra-app" }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "azp");
});

test("validarClaims: iss desconocida falla", () => {
  const r = validarClaims(payloadBase({ iss: "https://evil.com" }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "iss");
});

test("validarClaims: expirado falla", () => {
  const r = validarClaims(payloadBase({ exp: ahora - 200 }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "exp");
});

test("validarClaims: iat en el futuro lejano falla", () => {
  const r = validarClaims(payloadBase({ iat: ahora + 5000 }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "iat");
});

test("validarClaims: email sin verificar falla", () => {
  const r = validarClaims(payloadBase({ email_verified: "false" }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "email");
});

test("validarClaims: sin email falla", () => {
  const r = validarClaims(payloadBase({ email: "" }), CLIENTE, Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "email");
});

test("validarClaims: sin GOOGLE_CLIENT_ID configurado falla", () => {
  const r = validarClaims(payloadBase(), "", Date.now());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "aud");
});

/* ---------- perfil ---------- */
test("perfilDe: normaliza y extrae perfil", () => {
  const p = perfilDe(payloadBase());
  assert.deepEqual(p, {
    email: "operador@gmail.com",
    nombre: "Hector",
    foto: "https://foto",
    sub: "cuenta-1",
  });
});