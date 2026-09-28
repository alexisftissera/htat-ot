# HTAT · Orden de Trabajo

Aplicación web instalable (PWA) para el registro de **Órdenes de Trabajo** de mantenimiento predictivo y preventivo de planta.

> **Uso:** https://htat-ot.htat.workers.dev/ · Autor: Alexis Fernando Tissera · Stack: JavaScript, PWA, IndexedDB, Cloudflare Workers, D1, R2, jsPDF

## Funcionalidades

- Formulario de OT en 7 secciones: identificación, tipo de plan/tareas, métricas operativas (consumo de energía y presión de gas), novedad de máquina, observaciones, evidencia fotográfica (hasta 9 fotos) y firma digital.
- Reporte **PDF** en A4 con membrete, métricas, fotos, firma y quién registró/editó la OT.
- Funciona **sin conexión**: las OTs se guardan en el equipo y se suben solas al volver la red (chip "pendiente de subir").
- **Historial compartido** entre todos los dispositivos: filtros (solo hoy, búsqueda, por máquina, por línea en Novedades), Máquinas registradas, Máquinas por mes y OTs con Novedad.
- **Respaldo** del historial en Excel (CSV) y datos (JSON) desde Configuración.
- Sesión de Google de 24 h con renovación silenciosa.

## Acceso y roles

Acceso con cuenta de Google (sin contraseñas):

| Rol | Quién | Puede |
|---|---|---|
| **Lectura** | Cualquier cuenta de Google (se crea sola al entrar) | Ver el historial completo |
| **Edición** | Cuentas autorizadas por el administrador | Cargar, modificar y borrar OTs |
| **Admin** | Administrador principal | Todo + gestionar usuarios desde Configuración |

Cada OT guarda quién la registró y quién la editó por última vez.

## Estructura

```
index.html          Página principal
manifest.json       Configuración PWA
sw.js               Service worker (offline)
css/styles.css      Estilos
js/                 Lógica (conf, store, signature, photos, pdf, auth, cloud, app)
lib/                Librerías (jsPDF)
tests/              Suite de tests (node --test)
htat_api_worker.js  API del historial (Worker htat-api: D1 + R2)
auth-core.mjs       Núcleo de autenticación (compartido Worker/tests)
htat_api_schema.sql Esquema D1 para bases nuevas
deploy/             Migraciones D1 y guía de despliegue
assets/             Íconos
```

## Desarrollo y despliegue

- Tests: `node --test tests/api.test.mjs tests/auth-core.test.mjs` (46 casos).
- Despliegue: ver `deploy/LEEME-DEPLOY.md` (frontend `htat-ot` por wrangler assets, API `htat-api` con D1+R2).
