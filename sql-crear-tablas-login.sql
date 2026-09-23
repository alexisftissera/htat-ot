/* ============================================================
   HTAT · Tablas del login propio (usuario y contraseña)
   Pegar en: Dashboard → Workers & Pages → D1 → htat → Consola
   Ejecutar tal cual (es idempotente: se puede volver a pegar).
   NO toca la tabla `ots` (los 18 registros quedan intactos).
   ============================================================ */

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

/* Verificación opcional: debe devolver 3 filas (una por tabla). */
SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('usuarios', 'sesiones', 'ots') ORDER BY name;