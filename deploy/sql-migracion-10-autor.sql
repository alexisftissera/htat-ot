-- HTAT · Migración 10: autor de la OT (quién la cargó)
-- Pegar en: Cloudflare > D1 > base "htat" > pestaña "Console"
-- Solo agrega la columna; no toca ningún dato existente.
ALTER TABLE ots ADD COLUMN autor TEXT;
-- Verificación (debe listar una fila con name = 'autor'):
SELECT name FROM pragma_table_info('ots') WHERE name = 'autor';
