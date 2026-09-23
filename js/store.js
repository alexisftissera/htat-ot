/* ============================================================
   htat · Almacenamiento local
   Cada Orden de Trabajo se guarda completa (formulario + fotos
   + firma) en IndexedDB (soporta grandes volúmenes de datos).
   localStorage guarda configuración, borrador y contadores.
   ============================================================ */
"use strict";

const DB = (() => {
  let _dbPromise = null;

  function open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB no disponible en este navegador."));
        return;
      }
      const req = indexedDB.open(CONF.db.name, CONF.db.version);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(CONF.db.store)) {
          db.createObjectStore(CONF.db.store, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(mode) {
    return open().then((db) =>
      db.transaction(CONF.db.store, mode).objectStore(CONF.db.store)
    );
  }

  async function put(record) {
    const store = await tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(id) {
    const store = await tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function del(id) {
    const store = await tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function all() {
    const store = await tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  return { open, put, get, del, all };
})();

/* ---------- Preferencias de usuario (localStorage) ---------- */
const Settings = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(CONF.storage.configKey) || "{}");
    } catch {
      return {};
    }
  },
  set(patch) {
    const next = Object.assign(this.get(), patch);
    next.configV = CONF.storage.configVersion;
    if (typeof patch.cloudUrl === "string") {
      const url = (patch.cloudUrl || "").trim();
      next.cloudUrl = url || CONF.cloud.defaultUrl || "";
      CONF.cloud.webAppUrl = next.cloudUrl;
    }
    localStorage.setItem(CONF.storage.configKey, JSON.stringify(next));
    return next;
  },
};

/* ---------- Borrador del formulario activo ---------- */
const Draft = {
  save(data) {
    try { localStorage.setItem(CONF.storage.draftKey, JSON.stringify(data)); }
    catch (e) { console.warn("No se pudo guardar el borrador", e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(CONF.storage.draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  clear() {
    localStorage.removeItem(CONF.storage.draftKey);
  },
};

/* ---------- Contador / utilidades ---------- */
const StoreUtils = {
  nextId() {
    return "htat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  },
  bumpCount(delta) {
    const c = parseInt(localStorage.getItem(CONF.storage.countKey) || "0", 10) || 0;
    const n = Math.max(0, c + delta);
    localStorage.setItem(CONF.storage.countKey, String(n));
    return n;
  },
  getCount() {
    return parseInt(localStorage.getItem(CONF.storage.countKey) || "0", 10) || 0;
  },
};

/* ---------- Registro de máquinas (cada máquina una sola vez, con su línea) ---------- */
const Maquinas = {
  all() {
    try {
      return JSON.parse(localStorage.getItem(CONF.storage.machinesKey) || "[]");
    } catch {
      return [];
    }
  },
  add(nombre, linea) {
    const n = (nombre || "").trim();
    if (!n) return this.all();
    const list = this.all();
    const idx = list.findIndex((m) => m.nombre.toUpperCase() === n.toUpperCase());
    if (idx >= 0) {
      list[idx].ultimoUso = new Date().toISOString();
    } else {
      list.unshift({ nombre: n, linea: (linea || "").trim(), agregada: new Date().toISOString() });
    }
    try {
      localStorage.setItem(CONF.storage.machinesKey, JSON.stringify(list));
    } catch (e) {
      console.warn("htat: no se pudo guardar la máquina", e);
    }
    return list;
  },
  find(nombre) {
    const n = (nombre || "").trim();
    if (!n) return null;
    return this.all().find((m) => m.nombre.toUpperCase() === n.toUpperCase()) || null;
  },
  remove(nombre) {
    const list = this.all().filter(
      (m) => m.nombre.toUpperCase() !== (nombre || "").trim().toUpperCase()
    );
    try {
      localStorage.setItem(CONF.storage.machinesKey, JSON.stringify(list));
    } catch (e) {
      console.warn("htat: no se pudo quitar la máquina", e);
    }
    return list;
  },
};

/* ---------- Utilidades de fecha ---------- */
const Fmt = {
  todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  },
  toISO(d) {
    if (!d) return "";
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  },
  pretty(iso, withTime) {
    if (!iso) return "";
    const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d)) return iso;
    const p = (n) => String(n).padStart(2, "0");
    let s = p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
    if (withTime) s += " " + p(d.getHours()) + ":" + p(d.getMinutes());
    return s;
  },
  nowLong() {
    return new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  },
  hora(iso) {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getHours()) + ":" + p(d.getMinutes());
  },
};