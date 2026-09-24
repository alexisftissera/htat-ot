# 🔧 Despliegue — Fix fotos 5 → 9

Guía para aplicar el arreglo del bug donde la app permitía **9 fotos** pero la
nube solo guardaba/leía **5** (el Worker descartaba en silencio las fotos 6 a 9).

## Archivos

| Archivo | Qué es |
|---|---|
| `htat_api_worker.js` (raíz) | Worker de la API (`htat-api`) actualizado a 9 fotos |
| `htat_api_schema.sql` (raíz) | Esquema D1 completo para **bases nuevas** (ya trae `foto1..foto9`) |
| `deploy/sql-migracion-9-fotos.sql` | Migración D1 para **bases existentes**: agrega `foto6..foto9` a la tabla `ots` |

## Orden de aplicación (NO cambiar el orden)

### Paso 1 · Migración D1 (primero sí o sí)
1. Dashboard de Cloudflare → **Workers & Pages** → `htat-api` → **Settings** → **D1** → tu base (p. ej. `htat`) → **Consola**.
2. Pegá el contenido de `deploy/sql-migracion-9-fotos.sql` y ejecutalo.
3. La verificación final debe mostrar las 9 columnas `foto1..foto9`.

> Si tu tabla `ots` todavía conserva las OTs migradas, la migración **no toca
> los datos**: solo agrega columnas nuevas (quedan vacías en los registros
> existentes).

### Paso 2 · Actualizar el Worker `htat-api`
1. Dashboard → **Workers & Pages** → `htat-api` → **Edit code**.
2. Reemplazá TODO el código por el de `htat_api_worker.js` (raíz) → **Save and deploy**.
3. Verificación rápida desde una terminal:
   ```
   curl https://htat-api.htat.workers.dev/
   ```
   Debe seguir devolviendo el historial (JSON), igual que antes.

> Si tu Worker desplegado tenía cambios propios (distintos a `htat_api_worker.js`),
> aplicá sobre tu copia estos tres cambios nada más:
> 1. Agregar `"foto6"…"foto9"` a `COLUMNAS`.
> 2. `slice(0, 5)` → `slice(0, 9)` y los `for` de fotos hasta 9.
> 3. En el SELECT de `conservarImagenes`, incluir `foto6..foto9`.

### Paso 3 · Actualizar el frontend (`htat-ot`)
1. Dashboard → **Workers & Pages** → `htat-ot` → **Edit code**.
2. Reemplazá `js/cloud.js` por la versión nueva de este repo (lee `foto1..foto9`,
   y ya **no** envía `credentials: "include"`).
3. Guardá y desplegá.

### Paso 4 · Probar
1. Abrí la app y guardá una OT con **7 a 9 fotos**.
2. Abrí el **Historial** → buscá esa OT → **Editar**.
   - Deben aparecer las mismas 7-9 fotos (antes solo aparecían 5).
3. Desde **otro dispositivo** (o incógnito), abrí el historial y editá la misma OT.
   - Deben verse las 9 fotos también ahí.

---

## Nota sobre `credentials: "include"` (plan de seguridad descartado)
El plan de seguridad (Cloudflare Access) está en pausa. La versión de `cloud.js`
que se había preparado enviaba `credentials: "include"` en todas las llamadas,
pero la API **todavía no está protegida con Access** y responde CORS
`Access-Control-Allow-Origin: *` (sin credenciales) → el navegador bloqueaba
leer las respuestas y la sincronización del historial quedaba rota.

Por eso esta versión de `cloud.js` **revierte ese cambio**: la app vuelve a
funcionar con la API actual. Si más adelante retomás el plan de seguridad,
hay que re-agregar `credentials: "include"` **y** cambiar el CORS del Worker
(credenciales + origen permitido), no una sola de las dos cosas.