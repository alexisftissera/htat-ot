# HTAT · Guía de trabajo (para retomar en otra PC)

Documento de traspaso. Si llegás desde otra máquina, leelo entero antes de tocar nada.

---

## 1 · Qué es

App web instalable (PWA) para registrar **Órdenes de Trabajo** de mantenimiento
predictivo y preventivo de planta. Formulario de 7 secciones, hasta 9 fotos,
firma digital, PDF con membrete e historial compartido entre dispositivos.

---

## 2 · Requisitos en la PC nueva

| Necesario | Para qué |
|---|---|
| Node.js 18 o superior | correr los tests |
| Git | clonar el repo |
| Cuenta de GitHub con acceso a `alexisftissera/htat-ot` | traer los cambios |
| `wrangler` instalado (`npm i -g wrangler`) y logueado (`wrangler login`) | desplegar |
| Sesión de Google | probar el login |

Clonar:

```bash
git clone https://github.com/alexisftissera/htat-ot.git
cd htat-ot
```

---

## 3 · secretos (NO están en el repo)

El Worker `htat-api` usa dos secretos que solo existen en Cloudflare:

| Secreto | Qué es |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID de OAuth de Google (el mismo que está en `js/conf.js`, que sí es público) |
| `HTAT_ADMIN` | email del administrador: siempre tiene acceso, aunque no esté en la tabla `usuarios` |

Si se pierden, se recuperan en Cloudflare → Workers → `htat-api` → Settings →
Variables and Secrets. **Nunca** subirlos al repo.

---

## 4 · Desplegar

### API (`htat-api`) — desde la raíz del repo

```bash
wrangler deploy
```

Sube `htat_api_worker.js` + `auth-core.mjs` con los bindings de D1 y R2 que
declara `wrangler.toml`.

### Frontend (`htat-ot`) — necesita una carpeta de staging

El frontend es un Worker de **assets estáticos** (sin código de servidor) y en el
dashboard **no aparece botón "Edit code"** (se subido por wrangler, no desde la
web). La forma de trabajo probada:

1. Crear una carpeta aparte con los assets del frontend (por ejemplo
   `htat-deploy\app-htat-ot\`) y copiar dentro: `index.html`, `manifest.json`,
   `sw.js` y las carpetas `assets/`, `css/`, `js/`, `lib/`.
2. Crear `wrangler-htat-ot.toml` al lado:

```toml
name = "htat-ot"
compatibility_date = "2024-09-23"

[assets]
directory = "app-htat-ot"
```

3. Desplegar desde esa carpeta:

```bash
wrangler deploy -c wrangler-htat-ot.toml
```

> Verificá siempre que los archivos del staging sean **idénticos** a los del repo
> antes de desplegar (hash), y después compará el hash de lo servido en
> `https://htat-ot.htat.workers.dev/...` contra el archivo local.

> ⚠️ El staging en `%TEMP%` se borra solo. Si desaparece, reconstruirlo (es
> copiar y pegar, no hay nada tricky).

---

## 5 · Base de datos (D1)

Base `htat`. Tablas: `ots`, `lineas`, `usuarios`.

Migraciones en `deploy/` (aplicar en orden, ya aplicadas en producción):

| Archivo | Qué agrega |
|---|---|
| `sql-migracion-9-fotos.sql` | columnas `foto6..foto9` |
| `sql-migracion-login.sql` | tabla `usuarios` |
| `sql-migracion-10-autor.sql` | columna `autor` |
| `sql-migracion-11-editadopor.sql` | columna `editadoPor` |

Aplicar una migración a mano:

```bash
wrangler d1 execute htat --remote --command "ALTER TABLE ots ADD COLUMN autor TEXT"
wrangler d1 execute htat --remote --command "SELECT name FROM pragma_table_info('ots') WHERE name='autor'"
```

Conviene **revisar antes** si la columna ya existe (la segunda consulta).

---

## 6 · Tests

```bash
node --test tests/api.test.mjs tests/auth-core.test.mjs
```

61 casos. Cubren JWT de Google (con seam `__verificarGoogle`), CORS, roles
(lectura / editor / admin), escritura, fotos en R2 y los escudos de seguridad.

---

## 7 · Acceso y permisos

- El acceso es **con Google, sin contraseñas**. El Worker valida el token contra
  Google (JWKS) y devuelve el nivel: `lectura`, `usuario` o `admin`.
- Cualquier cuenta de Google válida entra en **lectura** automáticamente.
- Solo las cuentas de la tabla `usuarios` (o el admin) pueden escribir.
- El admin administra esa lista desde la app: Configuración → Usuarios.

---

## 8 · Seguridad (qué hay y qué no)

Implementado en el Worker:

- **Rate limiting** por IP: 600 lecturas / 120 escrituras / 900 imágenes por
  minuto. Ajustable con `RATE_LECTURA`, `RATE_ESCRITURA`, `RATE_IMAGENES`
  (0 = sin límite). Devuelve 429 con `Retry-After`.
- **Tope de cuerpo**: 25 MB por POST → 413 sin tocar la base.
- **SQL siempre parametrizado** (`?` + `.bind()`), sin concatenar datos del usuario.
- **Cabeceras** `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.

Los límites son altos a propósito: en planta todos los equipos comparten IP por
NAT y la app refresca el historial cada 5 s.

Nunca commitear: tokens de Cloudflare, secretos del Worker, claves privadas.

---

## 9 · Estado en producción

| Worker | Qué sirve |
|---|---|
| `htat-ot` | el frontend (assets) |
| `htat-api` | la API con D1 + R2 |

CORS: la API acepta `https://htat-ot.htat.workers.dev`, `localhost:8080` y
`HTAT_ORIGENES` (orígenes extra separados por coma).

---

## 10 · Pendientes / cosas a validar

- [ ] Probar el **borrado** de una OT en la app real (y que desaparezca en otro
      dispositivo). El test automatizado pasa, pero falta la prueba con sesión real.
- [ ] Confirmar que la sesión de Google dura lo esperado con la renovación
      silenciosa (reloj en `js/auth.js`).
- [ ] Revisar `SEGURIDAD-PLAN.md` si en algún momento se quiere cerrar más el
      acceso al historial.

---

## 11 · Cosas que confunden

- **El preview local no sirve para validar producción**: el service worker
  cachea el shell y sirve una versión vieja. Para sesión de 24 h, probar siempre
  en HTTPS real y **cerrar la app del todo** (sacar de recientes) antes de
  comprobar un cambio de CSS.
- **El Worker `htat-ot` no tiene "Edit code"** en el dashboard: es assets, se
  despliega con wrangler.
- **Cambios de CSS/JS en el celular**: cerrar la app por completo, no alcanza con
  recargar.
