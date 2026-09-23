/* Integración: js/auth.js (frontend) <-> worker-htat-api-login.js (backend).
   Mocks de localStorage/CONF/fetch apuntando al Worker con D1 en memoria. */
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");

function makeDB() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL,
      nombre TEXT NOT NULL DEFAULT '', activo INTEGER NOT NULL DEFAULT 1,
      admin INTEGER NOT NULL DEFAULT 0, creadoEn TEXT NOT NULL
    );
    CREATE TABLE sesiones (
      token TEXT PRIMARY KEY, usuario TEXT NOT NULL,
      creadaEn TEXT NOT NULL, expiraEn TEXT NOT NULL
    );
    CREATE TABLE ots (
      id TEXT PRIMARY KEY, ot TEXT, fechaEmision TEXT, linea TEXT, activo TEXT,
      tipoPlan TEXT, parteSistema TEXT, tareaEspecifica TEXT, consumoEnergia TEXT,
      presionGas TEXT, observaciones TEXT, firmaNombre TEXT, firmaFecha TEXT,
      creadoEn TEXT, actualizadoEn TEXT, foto1 TEXT, foto2 TEXT, foto3 TEXT,
      foto4 TEXT, foto5 TEXT, firmaImg TEXT, novedad INTEGER
    );
  `);
  return {
    prepare(sql) {
      let stmt = db.prepare(sql);
      const handle = {
        first() { this.args = this.args || []; return stmt.get(...this.args); },
        all() { this.args = this.args || []; return stmt.all(...this.args); },
        run() { this.args = this.args || []; return stmt.run(...this.args); },
        bind(...args) { this.args = args; stmt = db.prepare(sql); return this; },
      };
      return handle;
    },
  };
}

async function main() {
  const mod = await import("file://" + ROOT.replace(/\\/g, "/") + "/worker-htat-api-login.js");
  const env = { DB: makeDB(), BUCKET: { list: async () => ({ objects: [], truncated: false }), put: async () => {}, get: async () => null, delete: async () => {} } };

  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const sandbox = {
    localStorage,
    CONF: { cloud: { webAppUrl: "https://htat-api.htat.workers.dev/" } },
    fetch: async (url, opts) => {
      const req = new Request(String(url), {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
      });
      return mod.default.fetch(req, env);
    },
    navigator: { onLine: true },
    window: null,
    console, Error, Promise, Date, JSON, Object, Array, String, Number, Boolean, Math,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const code = fs.readFileSync(path.join(ROOT, "js", "auth.js"), "utf8");
  vm.runInContext(code + "\n;this.__Auth = Auth;", sandbox);
  const Auth = sandbox.__Auth;

  const res = [];
  const A = (n, c, x) => res.push(`${c ? "PASS" : "FAIL"} · ${n}${x ? " · " + x : ""}`);

  // 1) estado inicial
  const e = await Auth.estado();
  A("Auth.estado sin usuarios", e && e.loginCreado === false, JSON.stringify(e));

  // 2) crear primer usuario (modo auto-detectado por la app)
  const c = await Auth.crearPrimerUsuario("alexis", "secreto1", "Tissera Alexis");
  A("crear primer usuario + token guardado", c.ok === true && Auth.estaLogueado() === true && Auth.token().length === 64, JSON.stringify(c));

  // 3) validar token guardado
  const v = await Auth.validar();
  A("validar() token válido", v.ok === true && v.data.usuario === "alexis" && v.data.admin === true, JSON.stringify(v));

  // 4) login con contraseña mala → error
  let err = "";
  try { await Auth.login("alexis", "mala"); } catch (ex) { err = ex.message; }
  A("login contraseña mala lanza error", /incorrectos/.test(err), err);

  // 5) logout y validar → expirada; mostrarLogin por 401 (simular llamado de cloud.js)
  await Auth.logout();
  const v2 = await Auth.validar();
  A("después de logout la validación falla", v2.ok === false, JSON.stringify(v2));

  console.log(res.join("\n"));
  const fails = res.filter((l) => l.startsWith("FAIL"));
  console.log(`\n${res.length - fails.length}/${res.length} OK`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });