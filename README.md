> Demo: https://htat-ot.htat.workers.dev/ · Autor: Alexis Fernando Tissera (Analista de Sistemas, Instituto Cervantes 2025, Córdoba) · Stack: JavaScript, PWA, IndexedDB, Cloudflare Workers, D1, R2, jsPDF

# HTAT · Orden de Trabajo


Aplicación web (PWA) para el registro de **Órdenes de Trabajo** de mantenimiento predictivo y preventivo de planta.


## Funcionalidades


- Formulario de OT en 7 secciones: identificación, tipo de plan/tareas, métricas operativas (consumo de energía y presión de gas), novedad de máquina, observaciones, evidencia fotográfica (hasta 9 fotos) y firma digital.
- Generación de **PDF** del reporte (A4, con membrete, métricas, fotos y firma).
- **Almacenamiento local** en IndexedDB: funciona sin conexión; las OTs quedan pendientes de sincronizar.
- **Historial compartido** en la nube (Cloudflare Workers + D1 + R2): las OTs se sincronizan automáticamente entre todos los dispositivos autorizados.
- Vista de Historial con filtros (solo hoy, búsqueda, por máquina), Máquinas registradas, Máquinas por mes y OTs con Novedad.
