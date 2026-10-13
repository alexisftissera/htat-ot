/* ============================================================
   HTAT · Tests de la API (Worker htat_api_worker.js)
   Cubren el contrato básico: CORS, autenticación Google,
   lectura abierta, escritura con lista de permitidos y
   administración de usuarios. El D1 y el R2 son fakes en
   memoria; la verificación de Google se inyecta con el seam
   env.__verificarGoogle (nunca definido en producción).

   Ejecutar: node --test tests
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "../htat_api_worker.js";

/* ---------- fakes en memoria ---------- */
const COLUMNAS = [
  "id", "ot", "fechaEmision", "linea", "activo", "tipoPlan", "parteSistema",
  "tareaEspecifica", "consumoEnergia", "presionGas", "observaciones",
  "firmaNombre", "firmaFecha", "creadoEn", "actualizadoEn", "autor", "editadoPor",
  "foto1", "foto2", "foto3", "foto4", "foto5",
  "foto6", "foto7", "foto8", "foto9", "firmaImg", "novedad",
];

function baseDePrueba() {
  const ots = new Map();
  const lineas = new Set();
  const usuarios = new Map(); // email -> { email, nombre, nivel }

  function prepare(sql) {
    const s = sql;
    const q = {
      bind(...args) { this.args = args; return this; },
      async first() {
        const a = this.args || [];
        if (/select email, nombre, nivel from usuarios where email/i.test(s)) {
          const u = usuarios.get(a[0]);
          return u ? { ...u } : null;
        }
        if (/select foto1,.*from ots where id/i.test(s)) {
          const cur = ots.get(a[0]) || {};
          const row = {};
          for (let i = 1; i <= 9; i++) row["foto" + i] = cur["foto" + i] || "";
          row.firmaImg = cur.firmaImg || "";
          return row;
        }
        if (/select \* from ots/i.test(s) || /select.*from ots/i.test(s)) {
          return ots.get(a[0]) || null;
        }
        return null;
      },
      async all() {
        if (/select nombre from lineas order by nombre/i.test(s)) {
          return { results: [...lineas].sort().map((nombre) => ({ nombre })) };
        }
        if (/select email, nombre, nivel from usuarios order by email/i.test(s)) {
          return { results: [...usuarios.values()].map((u) => ({ ...u })) };
        }
        if (/select \* from ots/i.test(s)) {
          return { results: [...ots.values()] };
        }
        return { results: [] };
      },
      async run() {
        const a = this.args || [];
        if (/insert or ignore into usuarios/i.test(s)) {
          const [email, nombre, nivel] = a;
          if (!usuarios.has(email)) usuarios.set(email, { email, nombre: nombre || "", nivel });
        }
        if (/update usuarios set nombre = \?, nivel = \? where email = \?/i.test(s)) {
          const [nombre, nivel, email] = a;
          const u = usuarios.get(email);
          if (u) { u.nombre = nombre; u.nivel = nivel; }
        }
        if (/delete from usuarios where email/i.test(s)) {
          usuarios.delete(a[0]);
        }
        if (/insert or ignore into lineas/i.test(s)) {
          lineas.add(a[0]);
        }
        if (/delete from lineas where nombre/i.test(s)) {
          lineas.delete(a[0]);
        }
        if (/insert into ots/i.test(s)) {
          const fila = {};
          COLUMNAS.forEach((c, i) => { fila[c] = a[i]; });
          ots.set(fila.id, fila);
        }
        if (/delete from ots where id/i.test(s)) {
          ots.delete(a[0]);
        }
        return { results: [] };
      },
    };
    return q;
  }

  return { ots, lineas, usuarios, prepare };
}

function bucketDePrueba() {
  const objetos = new Map(); // key -> { bytes, contentType }
  return {
    get: async (key) => {
      const o = objetos.get(key);
      return o
        ? { httpMetadata: { contentType: o.contentType }, arrayBuffer: async () => o.bytes.slice().buffer }
        : null;
    },
    put: async (key, bytes, opts) => {
      objetos.set(key, { bytes, contentType: (opts && opts.httpMetadata && opts.httpMetadata.contentType) || "image/png" });
    },
    delete: async (claves) => { (claves || []).forEach((k) => objetos.delete(k)); },
    list: async ({ prefix }) => ({
      objects: [...objetos.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })),
      truncated: false,
    }),
  };
}

/* perfiles: token -> perfil Google devuelto por el seam (como usuarioDeGoogle) */
function entorno({ admin = "alexistissera1@gmail.com", perfiles = {}, editor = false } = {}) {
  const db = baseDePrueba();
  if (editor) {
    db.usuarios.set("hector@ejemplo.com", { email: "hector@ejemplo.com", nombre: "Hector", nivel: "usuario" });
  }
  return {
    GOOGLE_CLIENT_ID: "cliente-123.apps.googleusercontent.com",
    HTAT_ADMIN: admin,
    DB: db,
    BUCKET: bucketDePrueba(),
    /* Por defecto el rate limiting queda apagado en los tests: los casos
       que lo prueban fijan su propio límite (ver "rate limiting:"). */
    RATE_LECTURA: 0,
    RATE_ESCRITURA: 0,
    RATE_IMAGENES: 0,
    __verificarGoogle: async (token) => perfiles[token] || null,
  };
}

const ORIGEN_OK = "https://htat-ot.htat.workers.dev";

function peticion(consulta = "/", opciones = {}) {
  const headers = { Origin: ORIGEN_OK, ...(opciones.headers || {}) };
  if (opciones.token) headers["Authorization"] = "Bearer " + opciones.token;
  const init = { method: opciones.method || (opciones.body !== undefined ? "POST" : "GET"), headers };
  if (opciones.body !== undefined) {
    init.body = typeof opciones.body === "string" ? opciones.body : JSON.stringify(opciones.body);
  }
  return new Request("https://htat-api.htat.workers.dev" + consulta, init);
}

async function cuerpo(r) {
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}

/* ---------- perfiles de prueba ---------- */
const PERFILES = {
  "token-lector": { email: "vista@ejemplo.com", nombre: "Vista", foto: "" },
  "token-editor": { email: "hector@ejemplo.com", nombre: "Hector", foto: "" },
  "token-admin": { email: "alexistissera1@gmail.com", nombre: "Alexis", foto: "" },
  "token-aux": { email: "aux@ejemplo.com", nombre: "Aux", foto: "" },
};

const OT_BASE = {
  id: "ot-1", ot: "999", fechaEmision: "2026-09-24T10:00:00.000Z",
  linea: "LINEA 1", activo: "COMPRESORA C-101", tipoPlan: "PREVENTIVOS",
  parteSistema: "Rodamientos", tareaEspecifica: "Cambio de rodamientos",
};

/* ============================================================
   CORS
   ============================================================ */
test("CORS: preflight permitido responde 204 con cabeceras", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", {
    method: "OPTIONS",
    headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
  }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGEN_OK);
  assert.match(r.headers.get("Access-Control-Allow-Methods") || "", /POST/);
  assert.match(r.headers.get("Access-Control-Allow-Headers") || "", /Authorization/i);
});

test("CORS: preflight de origen no permitido responde 403", async () => {
  const env = entorno({ perfiles: PERFILES });
  const req = new Request("https://htat-api.htat.workers.dev/", {
    method: "OPTIONS",
    headers: { Origin: "https://malo-ejemplo.com" },
  });
  const r = await worker.fetch(req, env);
  assert.equal(r.status, 403);
});

test("CORS: GET de origen no permitido responde 403", async () => {
  const env = entorno({ perfiles: PERFILES });
  const req = new Request("https://htat-api.htat.workers.dev/?yo=1", {
    headers: { Origin: "https://malo-ejemplo.com", Authorization: "Bearer token-admin" },
  });
  const r = await worker.fetch(req, env);
  assert.equal(r.status, 403);
});

/* ============================================================
   Autenticación
   ============================================================ */
test("GET /?yo=1 sin sesión responde 401", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?yo=1"), env);
  assert.equal(r.status, 401);
  const c = await cuerpo(r);
  assert.equal(c.ok, false);
});

test("GET /?yo=1 con token inválido responde 401", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?yo=1", { token: "token-roto" }), env);
  assert.equal(r.status, 401);
});

test("GET /?yo=1 cuenta nueva queda nivel 'lectura'", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?yo=1", { token: "token-lector" }), env);
  assert.equal(r.status, 200);
  const c = await cuerpo(r);
  assert.equal(c.email, "vista@ejemplo.com");
  assert.equal(c.nivel, "lectura");
});

test("GET /?yo=1 usuario de la lista queda nivel 'usuario'", async () => {
  const env = entorno({ perfiles: PERFILES });
  await env.DB.prepare("INSERT OR IGNORE INTO usuarios (email, nombre, nivel, creadoEn) VALUES (?, ?, ?, ?)")
    .bind("hector@ejemplo.com", "Hector", "usuario", new Date().toISOString()).run();
  const r = await worker.fetch(peticion("/?yo=1", { token: "token-editor" }), env);
  assert.equal(r.status, 200);
  const c = await cuerpo(r);
  assert.equal(c.nivel, "usuario");
});

test("GET /?yo=1 con HTAT_ADMIN responde admin (bootstrap)", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?yo=1", { token: "token-admin" }), env);
  assert.equal(r.status, 200);
  const c = await cuerpo(r);
  assert.equal(c.nivel, "admin");
});

/* ============================================================
   Lectura abierta (cualquier cuenta de Google válida)
   ============================================================ */
test("GET / lista de OTs es accesible para un lector", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", { token: "token-lector" }), env);
  assert.equal(r.status, 200);
  const lista = await cuerpo(r);
  assert.ok(Array.isArray(lista));
});

test("GET /?lineas=1 es accesible para un lector", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?lineas=1", { token: "token-lector" }), env);
  assert.equal(r.status, 200);
  const lista = await cuerpo(r);
  assert.ok(Array.isArray(lista));
});

test("GET /?img con una clave con formato válido pero inexistente responde ok:false", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?img=fotos/ot-9/1.jpg", { token: "token-lector" }), env);
  assert.equal(r.status, 200);
  const c = await cuerpo(r);
  assert.equal(c.ok, false);
});

/* ================================================================
   Seguridad: escudo anti-saturación, tamaño del envío, formatos
   ================================================================ */
test("rate limiting: al pasarse del límite responde 429 con Retry-After", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  env.RATE_ESCRITURA = 2;                     // límite bajo solo para este caso
  const ip = "10.0.0.99";                    // IP propia: no ensucia el cubo de los demás
  const ipOpciones = { "CF-Connecting-IP": ip };
  const r1 = await worker.fetch(peticion("/", { token: "token-editor", headers: ipOpciones, body: { ...OT_BASE, id: "ot-l1" } }), env);
  assert.equal(await r1.text(), "OK");
  const r2 = await worker.fetch(peticion("/", { token: "token-editor", headers: ipOpciones, body: { ...OT_BASE, id: "ot-l2" } }), env);
  assert.equal(await r2.text(), "OK");
  const r3 = await worker.fetch(peticion("/", { token: "token-editor", headers: ipOpciones, body: { ...OT_BASE, id: "ot-l3" } }), env);
  assert.equal(r3.status, 429);
  assert.equal(r3.headers.get("Retry-After"), "60");
  const c = await cuerpo(r3);
  assert.equal(c.ok, false);
});

test("rate limiting: un límite en 0 lo desactiva", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  env.RATE_ESCRITURA = 0;
  const ip = "10.0.0.98";
  for (let i = 0; i < 5; i++) {
    const r = await worker.fetch(peticion("/", {
      token: "token-editor",
      headers: { "CF-Connecting-IP": ip },
      body: { ...OT_BASE, id: "ot-libre-" + i },
    }), env);
    assert.equal(await r.text(), "OK", "con límite 0 nunca debe cortar");
  }
});

test("POST gigante (Content-Length) se rechaza con 413 sin tocar la base", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    headers: { "Content-Length": String(30 * 1024 * 1024) },
    body: { ...OT_BASE },
  }), env);
  assert.equal(r.status, 413);
  assert.equal(env.DB.ots.size, 0, "no debe guardar nada");
});

test("id de OT con caracteres raros se rechaza (no llega a formar claves del bucket)", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  for (const id of ["../../secreto", "ot 1", "ot/1", "a".repeat(65), ""]) {
    const r = await worker.fetch(peticion("/", { token: "token-editor", body: { ...OT_BASE, id } }), env);
    const t = await r.text();
    assert.ok(t === "ID_INVALIDO" || t === "FALTA_ID", `id "${id}" deberia rechazarse, vino: ${t}`);
  }
  assert.equal(env.DB.ots.size, 0, "no se guardo ninguna OT");
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.equal(claves.length, 0, "no se escribio nada en el bucket");
});

test("DELETE con id raro no borra nada", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, id: "ot-ok", fotos: ["data:image/jpeg;base64," + Buffer.from("x").toString("base64")] },
  }), env);
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { action: "delete", id: "../ot-ok" },
  }), env);
  assert.equal(await r.text(), "ID_INVALIDO");
  assert.ok(env.DB.ots.has("ot-ok"), "la OT buena sigue viva");
});

test("GET /?img con clave fuera de formato se rechaza con 400", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  for (const clave of ["../../ot-ok/1.jpg", "ot-ok/1.jpg", "fotos/ot-ok/99.jpg", "otales/cosas.jpg"]) {
    const r = await worker.fetch(peticion("/?img=" + encodeURIComponent(clave), { token: "token-lector" }), env);
    assert.equal(r.status, 400, `clave "${clave}" deberia dar 400`);
  }
});

test("texto demasiado largo se recorta al guardar", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const gigante = "A".repeat(20000);
  await worker.fetch(peticion("/", { token: "token-editor", body: { ...OT_BASE, observaciones: gigante } }), env);
  const fila = env.DB.ots.get("ot-1");
  assert.ok(fila.observaciones.length <= 4000, "se recorta: " + fila.observaciones.length);
});

/* ============================================================
   Escritura: un lector NO puede escribir
   ============================================================ */
test("POST guardar OT con lector responde 403", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", { token: "token-lector", body: OT_BASE }), env);
  assert.equal(r.status, 403);
  const c = await cuerpo(r);
  assert.match(c.error, /no modificarlo/);
});

test("POST delete con lector responde 403", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", { token: "token-lector", body: { action: "delete", id: "ot-1" } }), env);
  assert.equal(r.status, 403);
});

test("POST linea con lector responde 403", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", { token: "token-lector", body: { action: "linea", nombre: "NUEVA" } }), env);
  assert.equal(r.status, 403);
});

/* ============================================================
   Editor: puede guardar, borrar y manejar líneas
   ============================================================ */
test("POST guardar OT con editor guarda y aparece en GET /", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: OT_BASE }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OK");
  const lista = await cuerpo(await worker.fetch(peticion("/", { token: "token-lector" }), env));
  const ot = lista.find((x) => x.id === "ot-1");
  assert.ok(ot, "la OT guardada aparece en la lista");
  assert.equal(ot.ot, "999");
  assert.equal(ot.activo, "COMPRESORA C-101");
});

test("POST guardar OT con autor lo conserva y aparece en GET /", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { ...OT_BASE, autor: "hector@ejemplo.com", editadoPor: "hector@ejemplo.com" } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OK");
  const lista = await cuerpo(await worker.fetch(peticion("/", { token: "token-lector" }), env));
  const ot = lista.find((x) => x.id === "ot-1");
  assert.ok(ot, "la OT guardada aparece en la lista");
  assert.equal(ot.autor, "hector@ejemplo.com");
  assert.equal(ot.editadoPor, "hector@ejemplo.com");
});

test("POST masivo activa el límite 429 y avisa cuándo reintentar", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  env.RATE_ESCRITURA = 3;                   // mismo mecanismo, con un tope chico para ir rápido
  const ip = { "CF-Connecting-IP": "10.0.0.77" };
  const estados = [];
  for (let i = 0; i < 5; i++) {
    const r = await worker.fetch(peticion("/", { token: "token-editor", headers: ip, body: { ...OT_BASE, id: "ot-rl-" + i } }), env);
    estados.push(r.status);
    await r.text();
  }
  assert.deepEqual(estados, [200, 200, 200, 429, 429], "corta a partir del 4to envío");
  const extra = await worker.fetch(peticion("/", { token: "token-editor", headers: ip, body: { ...OT_BASE, id: "ot-rl-x" } }), env);
  assert.equal(extra.status, 429);
  const detalle = await extra.json();
  assert.equal(detalle.ok, false);
  assert.ok(Number(extra.headers.get("Retry-After")) >= 1, "informa cuándo reintentar");
});

test("respuestas API traen cabeceras de seguridad", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/?yo=1", { token: "token-lector" }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(r.headers.get("Referrer-Policy"), "no-referrer");
});

test("POST delete con editor elimina la OT", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await env.DB.prepare(
    "INSERT INTO ots (" + COLUMNAS.join(", ") + ") VALUES (" + COLUMNAS.map(() => "?").join(", ") + ") " +
    "ON CONFLICT(id) DO UPDATE SET ot = excluded.ot"
  ).bind(...COLUMNAS.map((c) => (c === "id" ? "ot-1" : ""))).run();
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { action: "delete", id: "ot-1" } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OK");
  const lista = await cuerpo(await worker.fetch(peticion("/", { token: "token-lector" }), env));
  assert.equal(lista.length, 0);
});

test("POST linea con editor agrega la línea compartida", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { action: "linea", nombre: "nueva linea" } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OK");
  const lineas = await cuerpo(await worker.fetch(peticion("/?lineas=1", { token: "token-lector" }), env));
  assert.ok(lineas.includes("NUEVA LINEA"), "la línea normalizada aparece");
});

test("POST linea-borrar con editor elimina la línea", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await env.DB.prepare("INSERT OR IGNORE INTO lineas (nombre, creadoEn) VALUES (?, ?)")
    .bind("BORRARME", new Date().toISOString()).run();
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { action: "linea-borrar", nombre: "borrarme" } }), env);
  assert.equal(r.status, 200);
  const lineas = await cuerpo(await worker.fetch(peticion("/?lineas=1", { token: "token-lector" }), env));
  assert.ok(!lineas.includes("BORRARME"));
});

/* ============================================================
   Usuarios permitidos: solo administradores
   ============================================================ */
test("GET /?usuarios=1 es 403 para lector y editor", async () => {
  const env = entorno({ perfiles: PERFILES });
  const rL = await worker.fetch(peticion("/?usuarios=1", { token: "token-lector" }), env);
  assert.equal(rL.status, 403);
  const rE = await worker.fetch(peticion("/?usuarios=1", { token: "token-editor" }), env);
  assert.equal(rE.status, 403);
});

test("GET /?usuarios=1 con admin incluye bootstrap y los de la tabla", async () => {
  const env = entorno({ perfiles: PERFILES });
  await env.DB.prepare("INSERT OR IGNORE INTO usuarios (email, nombre, nivel, creadoEn) VALUES (?, ?, ?, ?)")
    .bind("hector@ejemplo.com", "Hector", "usuario", new Date().toISOString()).run();
  const r = await worker.fetch(peticion("/?usuarios=1", { token: "token-admin" }), env);
  assert.equal(r.status, 200);
  const lista = await cuerpo(r);
  const mails = lista.map((u) => u.email);
  assert.ok(mails.includes("alexistissera1@gmail.com"), "admin bootstrap presente");
  assert.ok(mails.includes("hector@ejemplo.com"));
  assert.ok(lista.find((u) => u.email === "alexistissera1@gmail.com").nivel === "admin");
});

test("POST usuario-agregar: admin agrega, valida email y actualiza", async () => {
  const env = entorno({ perfiles: PERFILES });
  const ok = await worker.fetch(peticion("/", {
    token: "token-admin",
    body: { action: "usuario-agregar", email: "Nuevo@Ejemplo.com", nombre: "Nuevo" },
  }), env);
  assert.equal(ok.status, 200);
  const mal = await worker.fetch(peticion("/", {
    token: "token-admin",
    body: { action: "usuario-agregar", email: "no un email" },
  }), env);
  assert.equal(mal.status, 400);
  const lista = await cuerpo(await worker.fetch(peticion("/?usuarios=1", { token: "token-admin" }), env));
  const u = lista.find((x) => x.email === "nuevo@ejemplo.com");
  assert.ok(u, "email normalizado agregado");
  assert.equal(u.nivel, "usuario");
});

test("POST usuario-agregar con no-admin responde 403", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { action: "usuario-agregar", email: "x@ejemplo.com" },
  }), env);
  assert.equal(r.status, 403);
});

test("POST usuario-borrar: admin borra pero no puede quitar al admin principal", async () => {
  const env = entorno({ perfiles: PERFILES });
  await env.DB.prepare("INSERT OR IGNORE INTO usuarios (email, nombre, nivel, creadoEn) VALUES (?, ?, ?, ?)")
    .bind("aux@ejemplo.com", "Aux", "usuario", new Date().toISOString()).run();
  const ok = await worker.fetch(peticion("/", {
    token: "token-admin",
    body: { action: "usuario-borrar", email: "aux@ejemplo.com" },
  }), env);
  assert.equal(ok.status, 200);
  const prohibido = await worker.fetch(peticion("/", {
    token: "token-admin",
    body: { action: "usuario-borrar", email: "alexistissera1@gmail.com" },
  }), env);
  assert.equal(prohibido.status, 400);
  const lista = await cuerpo(await worker.fetch(peticion("/?usuarios=1", { token: "token-admin" }), env));
  assert.ok(!lista.some((u) => u.email === "aux@ejemplo.com"));
  assert.ok(lista.some((u) => u.email === "alexistissera1@gmail.com"));
});

/* ============================================================
   Validaciones y fotos
   ============================================================ */
test("POST guardar sin id responde FALTA_ID", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { ot: "999" } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "FALTA_ID");
});

test("POST delete sin id responde FALTA_ID", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { action: "delete" } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "FALTA_ID");
});

test("POST linea sin nombre responde FALTA_NOMBRE", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const r = await worker.fetch(peticion("/", { token: "token-editor", body: { action: "linea", nombre: "  " } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "FALTA_NOMBRE");
});

test("Método no permitido responde 405", async () => {
  const env = entorno({ perfiles: PERFILES });
  const r = await worker.fetch(peticion("/", { method: "PUT", token: "token-admin" }), env);
  assert.equal(r.status, 405);
});

test("guardar con foto y firma sube a R2 y el delete lo limpia", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const foto = "data:image/jpeg;base64," + Buffer.from("foto-bytes").toString("base64");
  const firma = "data:image/png;base64," + Buffer.from("firma-bytes").toString("base64");
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, fotos: [foto], firmaDataUrl: firma },
  }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OK");
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.ok(claves.includes("fotos/ot-1/1.jpg"), "foto en R2");
  assert.ok(claves.some((k) => /^firmas\/ot-1\./.test(k)), "firma en R2");

  const d = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { action: "delete", id: "ot-1" },
  }), env);
  assert.equal(d.status, 200);
  const restantes = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.equal(restantes.length, 0, "delete limpia fotos y firma de R2");
});

/* ============================================================
   Evidencias: un guardado sin fotos NO puede borrar las que ya hay
   (regresión: cargar una OT de otro usuario y guardarla vaciaba el
   bucket con las fotos y la firma).
   ============================================================ */
const FOTO = "data:image/jpeg;base64," + Buffer.from("foto-bytes").toString("base64");
const FOTO2 = "data:image/jpeg;base64," + Buffer.from("foto2-bytes").toString("base64");
const FIRMA = "data:image/png;base64," + Buffer.from("firma-bytes").toString("base64");

async function otConEvidencias(env) {
  await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, fotos: [FOTO, FOTO2], firmaDataUrl: FIRMA },
  }), env);
  return {
    fila: env.DB.ots.get("ot-1"),
    claves: (await env.BUCKET.list({})).objects.map((o) => o.key),
  };
}

test("guardar sin fotos (listas vacías) conserva fotos y firma", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const antes = await otConEvidencias(env);

  /* Es lo que manda la app cuando la OT se cargó del historial y este
     equipo todavía no tiene las imágenes descargadas. */
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, fotos: [], observaciones: "editada" },
  }), env);
  assert.equal(await r.text(), "OK");

  const fila = env.DB.ots.get("ot-1");
  assert.equal(fila.foto1, antes.fila.foto1, "foto1 conservada");
  assert.equal(fila.foto2, antes.fila.foto2, "foto2 conservada");
  assert.equal(fila.foto3, "", "no aparecieron fotos nuevas");
  assert.equal(fila.firmaImg, antes.fila.firmaImg, "firma conservada");
  assert.equal(fila.observaciones, "editada", "el resto de los datos sí se actualiza");
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.deepEqual(claves.sort(), antes.claves.sort(), "R2 intacto");
});

test("guardar sin el campo fotos (app vieja) conserva las evidencias", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  const antes = await otConEvidencias(env);
  await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, observaciones: "sin fotos" },
  }), env);
  const fila = env.DB.ots.get("ot-1");
  assert.equal(fila.foto1, antes.fila.foto1);
  assert.equal(fila.firmaImg, antes.fila.firmaImg);
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.deepEqual(claves.sort(), antes.claves.sort());
});

test("borrarFotos quita de verdad las fotos de D1 y de R2", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await otConEvidencias(env);
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, fotos: [], borrarFotos: true, firmaDataUrl: FIRMA },
  }), env);
  assert.equal(await r.text(), "OK");
  const fila = env.DB.ots.get("ot-1");
  assert.equal(fila.foto1, "");
  assert.equal(fila.foto2, "");
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.ok(!claves.some((k) => k.startsWith("fotos/ot-1/")), "las fotos salieron de R2");
  assert.ok(claves.some((k) => k.startsWith("firmas/ot-1.")), "la firma sigue");
});

test("quitar una foto deja el resto y limpia la que sobra de R2", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await otConEvidencias(env);
  /* La app manda borrarFotos cuando en el formulario quedaron menos fotos
     de las que traía la OT. */
  const r = await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, fotos: [FOTO], borrarFotos: true, firmaDataUrl: FIRMA },
  }), env);
  assert.equal(await r.text(), "OK");
  const fila = env.DB.ots.get("ot-1");
  assert.equal(fila.foto1, "fotos/ot-1/1.jpg");
  assert.equal(fila.foto2, "", "la segunda foto ya no está");
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.ok(claves.includes("fotos/ot-1/1.jpg"));
  assert.ok(!claves.includes("fotos/ot-1/2.jpg"), "R2 sin la foto quitada");
});

test("cambiar la extensión de una firma no deja el archivo viejo", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await otConEvidencias(env);
  const firmaJpg = "data:image/jpeg;base64," + Buffer.from("firma-jpg").toString("base64");
  await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, firmaDataUrl: firmaJpg },
  }), env);
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key).filter((k) => k.startsWith("firmas/"));
  assert.deepEqual(claves, ["firmas/ot-1.jpg"]);
  assert.equal(env.DB.ots.get("ot-1").firmaImg, "firmas/ot-1.jpg");
});

test("una OT nueva sin fotos no deja restos", async () => {
  const env = entorno({ perfiles: PERFILES, editor: true });
  await worker.fetch(peticion("/", {
    token: "token-editor",
    body: { ...OT_BASE, fotos: [] },
  }), env);
  const fila = env.DB.ots.get("ot-1");
  assert.equal(fila.foto1, "");
  assert.equal(fila.firmaImg, "");
  const claves = (await env.BUCKET.list({})).objects.map((o) => o.key);
  assert.deepEqual(claves, []);
});