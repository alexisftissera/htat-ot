-- HTAT · Migración 11: quién editó la OT por última vez
-- Pegar en: Cloudflare > D1 > base "htat" > pestaña "Console"
-- Solo agrega la columna; no toca ningún dato existente.
ALTER TABLE ots ADD COLUMN editadoPor TEXT;
-- Verificación (debe listar una fila con name = 'editadoPor'):
SELECT name FROM pragma_table_info('ots') WHERE name = 'editadoPor';
