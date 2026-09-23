/* ============================================================
   htat · Configuración global de la aplicación
   ============================================================ */
"use strict";

const CONF = {
  appName: "HTAT",
  tagline: "Orden de Trabajo · Mantenimiento Predictivo y Preventivo",
  plant: "Planta HTAT",
  version: "2.0",

  /* Claves de persistencia */
  storage: {
    configKey: "htat.config",   // localStorage: preferencias (client id, etc.)
    draftKey:  "htat.draft",    // localStorage: borrador del formulario activo
    countKey:  "htat.count",    // localStorage: contador de piezas guardadas
    machinesKey: "htat.machines", // localStorage: números de máquina registrados
    configVersion: 2,           // versión de la configuración guardada
  },

  /* IndexedDB */
  db: {
    name: "htat-db",
    version: 1,
    store: "ords",
  },

  /* Historial compartido (Cloudflare Worker + D1 + R2). webAppUrl se
     completa en pantalla "Configuración" y por defecto queda conectado a
     la base compartida del taller: se conecta automáticamente para
     cualquier persona que abra la página. */
  cloud: {
    defaultUrl: "https://htat-api.htat.workers.dev/",
    webAppUrl: "https://htat-api.htat.workers.dev/",
  },

  /* Límites */
  limits: {
    maxFotos: 9,
    maxFotoPx: 1400,      // lado mayor de la foto comprimida
    fotoCalidad: 0.72,    // calidad JPEG
    firmaPx: 1400,
    firmaCalidad: 0.92,
  },
};

/* Lectura de configuración guardada. Si no hay URL guardada (o quedó
   vacía, o es de una versión anterior de la app), se usa siempre la base
   compartida por defecto: el historial queda conectado automáticamente
   para cualquier persona. */
function loadConfig() {
  try {
    const raw = localStorage.getItem(CONF.storage.configKey);
    if (raw) {
      const saved = JSON.parse(raw);
      /* Configuración de versiones viejas apunta a otro backend: se ignora. */
      if (saved.cloudUrl && saved.configV === CONF.storage.configVersion) {
        CONF.cloud.webAppUrl = saved.cloudUrl;
      }
    }
  } catch (e) {
    console.warn("htat: no se pudo leer la configuración", e);
  }
  if (!/^https:\/\//.test(CONF.cloud.webAppUrl || "")) {
    CONF.cloud.webAppUrl = CONF.cloud.defaultUrl || "";
  }
  return CONF;
}