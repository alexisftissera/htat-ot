/* ============================================================
   HTAT · Migración D1 — Login con Google (v3)
   Crea la tabla de USUARIOS PERMITIDOS en bases existentes.
   (Para bases nuevas no hace falta: htat_api_schema.sql ya la
   trae.)

   Correr con wrangler:
     wrangler d1 execute htat --remote --file deploy/sql-migracion-login.sql

   Nota: el administrador principal no se carga en SQL — se define
   con la variable de entorno HTAT_ADMIN del Worker y siempre tiene
   acceso. Los demás usuarios se agregan desde la app
   (Configuración → Usuarios permitidos, solo visible para admins).
   ============================================================ */

CREATE TABLE IF NOT EXISTS usuarios (
  email     TEXT PRIMARY KEY,
  nombre    TEXT,
  nivel     TEXT DEFAULT 'usuario',   -- 'admin' | 'usuario'
  creadoEn  TEXT
);

-- Verificación: debe devolver la tabla usuarios.
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;