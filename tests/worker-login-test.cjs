/* Prueba local del worker-htat-api-login usando node:sqlite (D1 es SQLite).
   No toca producción: corre todo en memoria. */
const { DatabaseSync } = require("node:sqlite");

function makeDB() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      nombre TEXT NOT NULL DEFAULT '',
      activo INTEGER NOT NULL DEFAULT 1,
      admin INTEGER NOT NULL DEFAULT 0,
      creadoEn TEXT NOT NULL
    );
    CREATE TABLE sesiones (
      token TEXT PRIMARY KEY,
      usuario TEXT NOT NULL,
      creadaEn TEXT NOT NULL,
      expiraEn TEXT NOT NULL
    );
    CREATE TABLE ots (
      id TEXT PRIMARY KEY, ot TEXT, fechaEmision TEXT, linea TEXT, activo TEXT,
      tipoPlan TEXT, parteSistema TEXT, tareaEspecifica TEXT, consumoEnergia TEXT,
      presionGas TEXT, observaciones TEXT, firmaNombre TEXT, firmaFecha TEXT,
      creadoEn TEXT, actualizadoEn TEXT, foto1 TEXT, foto2 TEXT, foto3 TEXT,
      foto4 TEXT, foto5 TEXT, firmaImg TEXT, novedad INTEGER
    );
    CREATE TABLE lineas (nombre TEXT PRIMARY KEY, creadoEn TEXT);
  `);
  // Envolver para imitar el binding de D1: prepare().bind().first()/.all()/.run()
  const api = {
    prepare(sql) {
      let stmt = db.prepare(sql);
      const handle = {
        bind(...args) {
          stmt = db.prepare(sql);
          for (const a of args) { if (a !== undefined) stmt = stmt; }
          handle.args = args;
          return handle;
        },
        first() {
          return stmt.get(...(handle.args || []));
        },
        all() {
          return stmt.all(...(handle.args || []));
        },
        run() {
          return stmt.run(...(handle.args || []));
        },
      };
      return handle;
    },
  };
  return api;
}

async function main() {
  const mod = await import("file://" + process.cwd().replace(/\\/g, "/") + "/htat-ot/worker-htat-api-login.js");
  const DB = makeDB();
  const bucketCalls = [];
  const env = {
    DB,
    BUCKET: {
      list: async () => ({ objects: [], truncated: false }),
      put: async (k) => { bucketCalls.push(k); },
      get: async () => null,
      delete: async () => {},
    },
  };

  const ok = (r) => r.status >= 200 && r.status < 300;
  const json = async (r) => { try { return await r.json(); } catch { return null; } };
  const get = (req) => mod.default.fetch(req, env);
  const postFetch = async (body, extraHeaders) => {
    const headers = Object.assign(
      { "Content-Type": "text/plain", "Origin": "https://htat-ot.htat.workers.dev" },
      extraHeaders || {}
    );
    const req = new Request("https://htat-api.htat.workers.dev/", {
      method: "POST", headers, body: JSON.stringify(body),
    });
    return mod.default.fetch(req, env);
  };

  const res = [];
  const A = (name, cond, extra) => res.push(`${cond ? "PASS" : "FAIL"} · ${name}${extra ? " · " + extra : ""}`);

  // 1) estado: aún sin usuarios
  let r = await get(new Request("https://htat-api.htat.workers.dev/?estado=1", { headers: { Origin: "https://htat-ot.htat.workers.dev" } }));
  let d = await json(r);
  A("estado sin usuarios", ok(r) && d.loginCreado === false, JSON.stringify(d));

  // 2) GET / sin token → 401
  r = await get(new Request("https://htat-api.htat.workers.dev/", { headers: { Origin: "https://htat-ot.htat.workers.dev" } }));
  A("listar sin token → 401", r.status === 401);

  // 3) primer-usuario
  r = await postFetch({ accion: "primer-usuario", usuario: "Alexis", password: "secreto1", nombre: "Tissera Alexis" });
  d = await json(r);
  A("primer-usuario OK", ok(r) && d.ok && d.token && d.usuario === "alexis", r.status + " " + JSON.stringify(d));
  const token = d.token;

  // 4) primer-usuario repetido → 403
  r = await postFetch({ accion: "primer-usuario", usuario: "otro", password: "secreto1" });
  A("primer-usuario repetido → 403", r.status === 403);

  // 5) login con contraseña incorrecta → 401
  r = await postFetch({ accion: "login", usuario: "alexis", password: "malapass" });
  A("login contraseña mala → 401", r.status === 401);

  // 6) login correcto
  r = await postFetch({ accion: "login", usuario: "ALEXIS", password: "secreto1" });
  d = await json(r);
  A("login correcto (mayúsculas normalizadas)", ok(r) && d.ok && !!d.token, JSON.stringify(d));
  const token2 = d.token;

  // 7) me con token2
  r = await get(new Request("https://htat-api.htat.workers.dev/?me=1", {
    headers: { Origin: "https://htat-ot.htat.workers.dev", Authorization: "Bearer " + token2 },
  }));
  d = await json(r);
  A("me con token válido", ok(r) && d.ok && d.admin === true && d.usuario === "alexis", JSON.stringify(d));

  // 8) listar con token → devuelve array
  r = await get(new Request("https://htat-api.htat.workers.dev/", {
    headers: { Origin: "https://htat-ot.htat.workers.dev", Authorization: "Bearer " + token2 },
  }));
  d = await json(r);
  A("listar con token", ok(r) && Array.isArray(d) && d.length === 0);

  // 9) guardar datos con token (no toca la D1 de producción; es memoria)
  const ot = { id: "unit-test-001", ot: "99999", activo: "P999 - PRUEBA", fechaEmision: "2026-09-23" };
  r = await postFetch({ ...ot }, { Authorization: "Bearer " + token2 });
  d = await r.text();
  A("guardar con token → OK", d === "OK", d);

  // 10) guardar sin token → 401
  r = await get(new Request("https://htat-api.htat.workers.dev/", { headers: {} }));
  A("access sin token sigue 401", r.status === 401);

  // 11) origin no permitido → 403
  r = await get(new Request("https://htat-api.htat.workers.dev/", {
    headers: { Origin: "https://evil.example", Authorization: "Bearer " + token2 },
  }));
  A("origin malicioso → 403", r.status === 403);

  // 12) logout, luego me → 401
  r = await mod.default.fetch(new Request("https://htat-api.htat.workers.dev/", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Origin": "https://htat-ot.htat.workers.dev", "Authorization": "Bearer " + token2 },
    body: JSON.stringify({ accion: "logout" }),
  }), env);
  A("logout → OK", (await r.text()) === "OK");
  r = await get(new Request("https://htat-api.htat.workers.dev/?me=1", {
    headers: { Origin: "https://htat-ot.htat.workers.dev", Authorization: "Bearer " + token2 },
  }));
  A("me después de logout → 401", r.status === 401);

  console.log(res.join("\n"));
  const fails = res.filter((l) => l.startsWith("FAIL"));
  console.log(`\n${res.length - fails.length}/${res.length} OK`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });