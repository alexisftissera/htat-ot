# 🔧 Despliegue — app HTAT

Guía de despliegue del repo. Contiene (1) el fix de fotos 5 → 9, (2) el login
obligatorio con Google (v3) y (3) el modelo de permisos **lectura abierta /
edición por lista** (v4).<br><br>

## Archivos

| Archivo | Qué es |
|---|---|
| `htat_api_worker.js` (raíz) | Worker de la API (`htat-api`): 9 fotos + **login Google** + **lectura abierta, edición por lista** |
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
Google (botón oficial "Continuar con Google"). El Worker valida el token contra
Google (JWKS + claims) y otorga permisos según la lista de usuarios permitidos
(tabla D1 `usuarios`).

> ⚠️ **El despliegue de la v3 depende de vos**: primero hay que crear el
> **OAuth Client ID** en Google Cloud Console. Seguí
> [`GUIA-GOOGLE-LOGIN.md`](GUIA-GOOGLE-LOGIN.md) y conseguí el ID antes de
> continuar.

---

# v4 · Permisos: lectura abierta + editores por lista

Modelo de permisos definitivo:

| Rol | Quién lo tiene | Puede hacer |
|---|---|---|
| **Lectura** | Cualquier cuenta de Google con token válido | Ver el historial completo, fotos, líneas, resumen, PDFs. No toca nada. |
| **Usuario (editor)** | Cuentas en la tabla D1 `usuarios` | Agregar, modificar y borrar OTs y líneas. |
| **Admin** | `HTAT_ADMIN` o nivel `admin` en `usuarios` | Todo lo anterior + administrar la lista de usuarios desde Configuración. |

La app detecta el rol en `/?yo=1`: muestra el banner "Modo lectura" y oculta
todo lo que no puede hacer (formulario, fotos, botones Editar/Eliminar, agregar
líneas). Los permisos se confirman contra la base en cada inicio y en cada
escritura (el Worker devuelve 403 si una cuenta de lectura intenta escribir).

**Pantalla principal:** al entrar se abre siempre el historial de OTs. Desde
ahí, el botón "Cargar nueva OT" (solo cuentas con edición) abre el formulario
de carga en blanco. Las cuentas de solo lectura ven únicamente el historial.

> ⚠️ **PUBLICAR la app OAuth en Google (paso obligatorio):** mientras el estado
> sea "Prueba", Google solo deja entrar a los usuarios de prueba. Como el modelo
> permite que **cualquier cuenta de Google vea** el historial, la app debe estar
> **En producción**:
> 1. Abrí [Público](https://console.cloud.google.com/auth/audience?project=htat-509623)
>    en un navegador normal (con el mouse real, no desde automatización).
> 2. Clic en **"Publicar app"** y confirmá el diálogo.
> 3. La página queda en "En producción". No hace falta verificación (solo usamos
>    scopes no sensibles: openid, email, profile).
> 4. Mientras tanto, para probar, se pueden agregar **usuarios de prueba** en la
>    misma página (hasta 100) para las cuentas de cada editor.

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
   "Continuar con Google".
2. Con una cuenta de Google **que no está en la lista** → entra en
   **modo lectura**: ve el historial, los botones de edición están
   ocultos/deshabilitados y aparece el banner "Modo lectura".
3. Con la cuenta admin (la de `HTAT_ADMIN`/primer usuario) → entra con
   permisos de edición.
4. Configuración → **Usuarios con permiso de edición** → agregá el email de
   cada operario (quedarán habilitados para cargar/modificar/borrar).
5. Probar desde otro dispositivo: la cuenta agregada edita; cualquier otra
   cuenta de Google solo ve.

## Variables de entorno del Worker `htat-api`

| Variable | Obligatoria | Qué es |
|---|---|---|
| `GOOGLE_CLIENT_ID` | sí | Client ID de OAuth creado en el Paso 1 |
| `HTAT_ADMIN` | sí | Email del administrador (siempre tiene acceso) |
| `HTAT_ORIGENES` | no | Orígenes extra permitidos por CORS (separados por coma) |

CORS permitido por defecto: `https://htat-ot.htat.workers.dev`,
`http://localhost:8080` y `https://localhost:8080`.

## Tests

Suite con `node --test` (Node ≥ 18). Cubre el núcleo JWT y el contrato de
la API completa con fakes en memoria (D1 y R2) y verificación de Google
inyectada:

```
node --test tests\auth-core.test.mjs tests\api.test.mjs
```

- `auth-core.test.mjs`: JWT, base64url, claims y extracción del Bearer.
- `api.test.mjs`: CORS, 401/403 por rol, lectura abierta, escritura de
  editores, administración de usuarios solo-admin, validaciones y
  subida/limpieza de fotos en R2 (28 casos).

## Sin el despliegue de la v3

Si todavía no está creado/desplegado el login, la app **sigue funcionando como
antes** (sin Google) **solo si no se toca la API**: el Worker viejo ignora las
nuevas exigencias. No mezclar: o se despliega la v3 completa, o se queda en la
versión anterior.