# HTAT · Orden de Trabajo

Aplicación web (PWA) para el registro de **Órdenes de Trabajo** de mantenimiento predictivo y preventivo de planta.

## Funcionalidades

- Formulario de OT en 7 secciones: identificación, tipo de plan/tareas, métricas operativas (consumo de energía y presión de gas), novedad de máquina, observaciones, evidencia fotográfica (hasta 9 fotos) y firma digital.
- Generación de **PDF** del reporte (A4, con membrete, métricas, fotos y firma).
- **Almacenamiento local** en IndexedDB: funciona sin conexión; las OTs quedan pendientes de sincronizar.
- **Historial compartido** en la nube (Cloudflare Workers + D1 + R2): las OTs se sincronizan automáticamente entre todos los dispositivos autorizados.
- Vista de Historial con filtros (solo hoy, búsqueda, por máquina), Máquinas registradas, Máquinas por mes y OTs con Novedad.
- Instalable como aplicación (PWA) con service worker para modo offline.

## Arquitectura

```
htat-ot (frontend, este repo)
  └── llama a htat-api (Cloudflare Worker + D1 + R2) para el historial compartido
```

## Despliegue

Frontend publicado en Cloudflare Workers. El historial compartido se conecta por defecto a la base del taller definida en `js/conf.js` (`CONF.cloud`).

## Estructura

```
index.html          Página principal (formulario de OT)
manifest.json       Configuración PWA
sw.js               Service worker (offline)
css/styles.css      Estilos
js/                 Lógica (conf, auth, store, signature, photos, pdf, cloud, app)
lib/                Librerías (jsPDF)
assets/             Íconos
```

## Seguridad

El historial compartido usa **login propio con usuario y contraseña** (ver `SEGURIDAD-PLAN.md`):
- La API (`htat-api`) exige un **token de sesión** (`Authorization: Bearer ...`) en todas las operaciones. Sin sesión responde **401**.
- Las contraseñas se guardan **encriptadas** (PBKDF2-SHA256) en la D1, nunca en texto plano.
- La sesión dura **7 días** por navegador; sin conexión la app funciona en modo local.
- El primer usuario se crea desde la propia pantalla de login ("Crear primer usuario"); después se agregan más con `accion: "agregar-usuario"`.

Archivos clave de seguridad:
- `worker-htat-api-login.js` — Worker de la API con login (pegar en htat-api).
- `sql-crear-tablas-login.sql` — tablas `usuarios` y `sesiones` (Correr en la D1).
- `js/auth.js` — pantalla de login de la app + manejo del token.