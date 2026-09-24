/* ============================================================
   HTAT · Migración D1 — fotos de 5 a 9 (base ya existente)
   Pegar en: Dashboard → Workers & Pages → htat-api → D1 → htat → Consola
   O ejecutar con wrangler:
     wrangler d1 execute htat --remote --file deploy/sql-migracion-9-fotos.sql

   ⚠️ IMPORTANTE: ejecutar ESTA migración ANTES de desplegar el
   nuevo Worker (htat_api_worker.js). Si el Worker se despliega sin
   las columnas, los INSERT fallan con "no such column: foto6".

   NOTA: Cloudflare D1 NO admite "ADD COLUMN IF NOT EXISTS"
   (falla con "near EXISTS: syntax error"). Por eso van los ALTER
   directos: si la migración ya se corrió una vez, NO volver a
   ejecutarla (daría "duplicate column name").

   Para una base NUEVA no hace falta esta migración: el esquema
   completo está en htat_api_schema.sql (ya incluye foto1..foto9).

   La verificación final debe devolver foto1..foto9 (9 filas).
   ============================================================ */

ALTER TABLE ots ADD COLUMN foto6 TEXT;
ALTER TABLE ots ADD COLUMN foto7 TEXT;
ALTER TABLE ots ADD COLUMN foto8 TEXT;
ALTER TABLE ots ADD COLUMN foto9 TEXT;

SELECT name FROM pragma_table_info('ots') WHERE name LIKE 'foto%' ORDER BY name;