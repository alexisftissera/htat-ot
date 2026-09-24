-- HTAT · Tabla del historial compartido (Cloudflare D1)
-- Pegar en: Cloudflare > D1 > base "htat" > pestaña "Console"

CREATE TABLE IF NOT EXISTS ots (
  id                TEXT PRIMARY KEY,
  ot                INTEGER,
  fechaEmision      TEXT,
  linea             TEXT,
  activo            TEXT,
  tipoPlan          TEXT,
  parteSistema      TEXT,
  tareaEspecifica   TEXT,
  consumoEnergia    TEXT,
  presionGas        TEXT,
  observaciones     TEXT,
  firmaNombre       TEXT,
  firmaFecha        TEXT,
  creadoEn          TEXT,
  actualizadoEn     TEXT,
  foto1             TEXT,
  foto2             TEXT,
  foto3             TEXT,
  foto4             TEXT,
  foto5             TEXT,
  foto6             TEXT,
  foto7             TEXT,
  foto8             TEXT,
  foto9             TEXT,
  firmaImg          TEXT,
  novedad           INTEGER DEFAULT 0
);

-- Líneas de producción (se cargan desde la app y se comparten).
CREATE TABLE IF NOT EXISTS lineas (
  nombre    TEXT PRIMARY KEY,
  creadoEn  TEXT
);

-- Usuarios permitidos (login con Google obligatorio desde v3).
-- El administrador principal se define con la variable HTAT_ADMIN
-- del Worker y siempre tiene acceso aunque no esté en esta tabla.
CREATE TABLE IF NOT EXISTS usuarios (
  email     TEXT PRIMARY KEY,
  nombre    TEXT,
  nivel     TEXT DEFAULT 'usuario',   -- 'admin' | 'usuario'
  creadoEn  TEXT
);
