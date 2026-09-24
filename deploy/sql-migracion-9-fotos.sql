/* ============================================================
   HTAT · Migración D1 — fotos de 5 a 9 (base ya existente)
   Pegar en: Dashboard → Workers & Pages → htat-api → D1 → htat → Consola

   ⚠️ IMPORTANTE: ejecutar ESTA migración ANTES de desplegar el
   nuevo Worker (htat_api_worker.js). Si el Worker se despliega sin
   las columnas, los INSERT fallan con "no such column: foto6".

   Para una base NUEVA no hace falta esta migración: el esquema
   completo está en htat_api_schema.sql (ya incluye foto1..foto9).

   Es idempotente: si ya se corrió, no rompe nada y la verificación
   final devuelve las 9 columnas foto1..foto9.
   ============================================================ */

ALTER TABLE ots ADD COLUMN IF NOT EXISTS foto6 TEXT;
ALTER TABLE ots ADD COLUMN IF NOT EXISTS foto7 TEXT;
ALTER TABLE ots ADD COLUMN IF NOT EXISTS foto8 TEXT;
ALTER TABLE ots ADD COLUMN IF NOT EXISTS foto9 TEXT;

/* Verificación opcional: debe devolver foto1..foto9 (9 filas). */
SELECT name FROM pragma_table_info('ots') WHERE name LIKE 'foto%' ORDER BY name;