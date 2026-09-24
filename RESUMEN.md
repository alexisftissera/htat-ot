# HTAT · Resumen del proyecto

App PWA para Órdenes de Trabajo de mantenimiento predictivo/preventivo de planta.
Formulario en 7 secciones, fotos, firma digital, PDF, historial local + compartido.

## Arquitectura

- **App (frontend):** Worker `htat-ot` → `https://htat-ot.htat.workers.dev/`
  Archivos: `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `lib/`, `assets/`.
- **API (historial compartido):** Worker `htat-api` → `https://htat-api.htat.workers.dev/`
  Código: `htat_api_worker.js` · Esquema D1: `htat_api_schema.sql`.
- **Datos:** D1 base `htat` (tabla `ots` + tabla `lineas`) · Imágenes en R2 (`BUCKET`).
- **Sin login:** no hay Cloudflare Access; la API responde a quien conozca la URL.

## Lo que se hizo

- Migración del historial a Cloudflare D1 + R2 (8 OTs reales migradas).
- Configuración blindada: sin campo de URL editable; muestra estado, base,
  OTs en nube/equipo, pendientes, fotos, última sincronización y versión.
  Botones: Sincronizar ahora / Buscar actualización.
- Líneas compartidas: opción «+ Agregar línea…» en el desplegable; se guardan
  en D1 y las ven todos los equipos.
- Historial con marca `✓ compartido` (verde) vs `solo local` (gris, pendiente).
- Error si el Nº de OT ya existe (busca en equipo + base); al editar se
  reemplaza el registro (mismo `id`), no se duplica.
- Service worker v41 network-first; jsPDF con carga diferida.
- Scroll del fondo bloqueado cuando hay un modal abierto.

## Desplegar la app (panel Cloudflare, worker `htat-ot`)

Subir solo: `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `lib/`, `assets/`.
NO subir: `.git`, `htat_api_worker.js`, `htat_api_schema.sql`, `servir.ps1`,
`README.md`, `SEGURIDAD-PLAN.md`, este archivo.

## Trabajar desde otra PC

```bash
git clone https://github.com/alexisftissera/htat-ot.git
```

Ramas: `master` (estable) · `login-propio` (experimento con login, sin terminar).
Probar local sin instalar nada: `powershell -ExecutionPolicy Bypass -File servir.ps1`
y abrir `http://localhost:8080/` (o la IP que muestra, para el celular en la misma Wi-Fi).
