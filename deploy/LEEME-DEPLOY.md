# 🔧 Despliegue — app HTAT

Guía de despliegue del repo. Contiene (1) el fix de fotos 5 → 9 y (2) el login
obligatorio con Google (v3).

## Archivos

| Archivo | Qué es |
|---|---|
| `htat_api_worker.js` (raíz) | Worker de la API (`htat-api`): 9 fotos + **login Google obligatorio** |
| `auth-core.mjs` (raíz) | Núcleo de autenticación (lo importa el Worker) |
| `htat_api_schema.sql` (raíz) | Esquema D1 completo para **bases nuevas** (9 fotos + tabla `usuarios`) |
| `deploy/sql-migracion-9-fotos.sql` | Migración D1 para **bases existentes**: agrega `foto6..foto9` |
| `deploy/sql-migracion-login.sql` | Migración D1 para **bases existentes**: crea la tabla `usuarios` |
| `deploy/GUIA-GOOGLE-LOGIN.md` | Paso a paso para crear el OAuth Client ID de Google |

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

---

# v3 · Login obligatorio con Google

Desde esta versión la app **no arranca sin iniciar sesión** con una cuenta de
Google permitida (botón oficial "Continuar con Google"). El Worker valida el
token contra Google y contra la lista de emails permitidos (tabla D1
`usuarios`).

> ⚠️ **El despliegue de la v3 depende de vos**: primero hay que crear el
> **OAuth Client ID** en Google Cloud Console. Seguí
> [`GUIA-GOOGLE-LOGIN.md`](GUIA-GOOGLE-LOGIN.md) y conseguí el ID antes de
> continuar.

## Orden de aplicación (NO cambiar el orden)

### Paso 1 · OAuth Client ID de Google
Ver `GUIA-GOOGLE-LOGIN.md`. Resultado: un ID tipo
`xxxxxxxx.apps.googleusercontent.com`.

### Paso 2 · Migración D1 — tabla `usuarios`
1. Dashboard Cloudflare → **Workers & Pages** → `htat-api` → **Settings** →
   **D1** → la base `htat` → **Consola**.
2. Pegá y ejecutá `deploy/sql-migracion-login.sql`.
3. La verificación debe listar la tabla `usuarios`.

### Paso 3 · Desplegar Worker `htat-api` (con wrangler, recomendado)
El Worker ahora tiene **dos archivos** (`htat_api_worker.js` + `auth-core.mjs`);
wrangler los empaqueta solo. Con la config de `wrangler.toml` (binding D1 + R2):

```
wrangler deploy htat_api_worker.js
wrangler secret put GOOGLE_CLIENT_ID   # o variable[GOOGLE_CLIENT_ID] en wrangler.toml
wrangler secret put HTAT_ADMIN         # tu email de Google
```

> Si querés seguir pegando código por el dashboard (worker de un solo archivo),
> generá el bundle una vez:
> `npx wrangler deploy --dry-run --outdir dist` y pegá el contenido de
> `dist/htat_api_worker.js` (el bundle incluye a `auth-core.mjs`).

### Paso 4 · Desplegar frontend `htat-ot`
1. En `js/conf.js` cargar `CONF.auth.clientId = "…"` (el ID del paso 1).
2. Subir los archivos nuevos: `js/auth.js` (y las versiones nuevas de
   `index.html`, `js/cloud.js`, `js/app.js`, `css/styles.css`, `sw.js`).

### Paso 5 · Probar
1. Abrí la app **sin** sesión guardada → debe aparecer el botón
   "Continuar con Google". Con una cuenta **no permitida** → la app muestra
   error y no entra. Con la cuenta admin (la de `HTAT_ADMIN`/primer usuario
   agregado) → entra.
2. Configuración → **Usuarios permitidos** → agregá el email de cada operario.
3. Agregar un email, esperar la lista, y probar entrar desde otro dispositivo.

## Variables de entorno del Worker `htat-api`

| Variable | Obligatoria | Qué es |
|---|---|---|
| `GOOGLE_CLIENT_ID` | sí | Client ID de OAuth creado en el Paso 1 |
| `HTAT_ADMIN` | sí | Email del administrador (siempre tiene acceso) |
| `HTAT_ORIGENES` | no | Orígenes extra permitidos por CORS (separados por coma) |

CORS permitido por defecto: `https://htat-ot.htat.workers.dev`,
`http://localhost:8080` y `https://localhost:8080`.

## Sin el despliegue de la v3

Si todavía no está creado/desplegado el login, la app **sigue funcionando como
antes** (sin Google) **solo si no se toca la API**: el Worker viejo ignora las
nuevas exigencias. No mezclar: o se despliega la v3 completa, o se queda en la
versión anterior.