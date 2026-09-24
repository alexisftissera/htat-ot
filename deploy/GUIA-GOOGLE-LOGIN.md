# 🔐 Login con Google — Guía para crear el "OAuth Client ID"

Desde la **v3**, la app exige iniciar sesión con una cuenta de Google **permitida**
para poder usarla (login obligatorio para todo). Para que funcione el botón
"Continuar con Google" hace falta crear **un** dato en Google Cloud Console:
el **OAuth Client ID** (una credencial pública y gratis). Es la **única tarea
manual** — el resto ya está programado y desplegado con wrangler.

---

## ¿Qué es el Client ID?

Es un identificador público de tu aplicación dentro de Google. **No es una
contraseña**: se puede ver en el código del navegador y eso no es un problema.
Google lo usa para saber que el botón de login de tu página es legítimo y para
emitir un "ID token" (una credencial firmada criptográficamente) que nuestro
Worker valida. Sin él, Google no habilita el botón.

Necesitás **una sola cuenta de Google** para hacer esto (la tuya, p. ej.
`alexistissera1@gmail.com`). Después, esa cuenta entra como **administrador** de
la app y puede agregar/quitar los emails permitidos desde la misma app.

---

## Paso a paso (5-10 minutos)

1. Entrá a **https://console.cloud.google.com/** con la cuenta de Google con la
   que querés administrar la app.
2. Arriba a la izquierda, en **"Seleccionar un proyecto"** → **Nuevo proyecto**.
   - Nombre: `HTAT` (o el que quieras). Crear.
3. Con el proyecto seleccionado, andá al menú ☰ → **APIs y servicios** →
   **Pantalla de consentimiento de OAuth**.
   - Tipo de usuario: **Externo** → Crear.
   - Completá el **nombre de la app** (ej. `OT Planta`) y el **email de
     soporte/correo para desarrollador** (tu email) → Guardar.
   - No hace falta agregar *scopes* → Guardar.
   - En **Usuarios de prueba** no hace falta agregar a nadie si vas a *publicar*
     la app (paso 5). → Guardar.
4. Menú ☰ → **APIs y servicios** → **Credenciales** → botón
   **+ Crear credenciales** → **ID de cliente de OAuth**.
   - **Tipo de aplicación**: `Aplicación web`.
   - **Nombre**: `htat web`.
   - **Orígenes autorizados de JavaScript** → **+ Agregar URI**:
     - `https://htat-ot.htat.workers.dev`   ← la app en producción
     - `http://localhost:8080`              ← pruebas locales (servir.ps1)
   - No hace falta **URIs de redireccionamiento** (Sign in with Google no las usa).
   - **Crear**.
5. Aparece el **ID de cliente** (algo así:
   `xxxxxxxxxxxxxxxx.apps.googleusercontent.com`). **Guardalo** — es lo único
   que después hay que cargar en 2 lugares:
   - `js/conf.js` → `CONF.auth.clientId = "…"`
   - Worker `htat-api` → variable de entorno `GOOGLE_CLIENT_ID`
6. **Publicar la app** (para que cualquier cuenta permitida entre sin ser
   "usuario de prueba"): Menú ☰ → **APIs y servicios** → **Pantalla de
   consentimiento de OAuth** → botón **Publicar aplicación** → Confirmar.
   - Como el botón de Google solo usa datos básicos (email/nombre/foto), **no
     requiere verificación de Google**. Se mostrará un aviso "Aplicación sin
     verificar" solo si usas scopes sensibles (no es el caso).

---

## Después de tener el Client ID

1. Pasámelo (o cargalo vos) en los 2 lugares de arriba.
2. Migración D1 (una vez): `deploy/sql-migracion-login.sql` (crea la tabla
   `usuarios`).
3. Despliegue: Worker `htat-api` con las variables
   `GOOGLE_CLIENT_ID` y `HTAT_ADMIN` (tu email), y frontend `htat-ot`
   (ver `LEEME-DEPLOY.md`).

## Cómo funciona después de desplegar

- **Login obligatorio**: al abrir la app aparece el botón "Continuar con Google".
  Sin iniciar sesión, la app no arranca.
- **Lista de permitidos**: solo los emails de la tabla `usuarios` entran. El
  email de `HTAT_ADMIN` entra siempre (respaldo de emergencia).
- **Administración**: con tu cuenta (admin) entrás a app → **Configuración** →
  **Usuarios permitidos** → agregás/quítás emails. Los operarios necesitan una
  cuenta de Google (Gmail) y estar en esa lista.
- **Sesión**: queda guardada en el dispositivo; no hace falta re-loguear en cada
  apertura. Si la sesión vence (≈1 hora), la app pide iniciar sesión de nuevo.
- **Offline**: después del primer login, los datos locales siguen funcionando
  sin conexión.
- **Cerrar sesión**: app → Configuración → botón **Cerrar sesión**.

> Los tokens de Google duran ~1 hora. Solo se guarda el token de identidad
> (ID token, sin permisos de tu cuenta de Google) en el navegador del
> dispositivo que usa la app.