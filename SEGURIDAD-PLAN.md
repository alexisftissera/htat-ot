# 🔒 Plan de seguridad — HTAT (login propio: usuario y contraseña)

Estado: implementado y probado en local (13/13 pruebas OK). **NO se borró ni modificó ninguna OT.**

## Problema
- `GET https://htat-api.htat.workers.dev/` devolvía el historial completo a cualquiera, sin login.
- La API aceptaba `POST` (guardar/borrar) sin identificar quién era.
- Fotos y firmas (`?img=`) sin protección.
- El plan anterior (Cloudflare Access con email + código OTP) funcionaba pero resultaba tedioso: había que entrar por email/código cada 24 h y en dos dominios.

## Solución final: login propio en la D1
- La app muestra una pantalla **usuario + contraseña**.
- La **API exige un token** (`Authorization: Bearer ...`) en todas las operaciones de datos → el robo de datos queda bloqueado igual que con Access, pero sin OTP.
- La contraseña se guarda **encriptada** (hash PBKDF2-SHA256, 120 000 iteraciones; nunca en texto plano).
- La sesión dura **7 días** en el mismo navegador (se puede cambiar en `worker-htat-api-login.js`, constante `DIAS_SESION`).
- Sin conexión la app sigue funcionando en modo local (el login solo se exige en línea).

---

## Pasos de despliegue

### Paso 1 — Worker de la API (`worker-htat-api-login.js`)
1. Dashboard → **Workers & Pages → htat-api → Editar código**.
2. Reemplazar TODO el contenido por el de **`htat-ot/worker-htat-api-login.js`**. *(Es el código con login; mantiene intactos los endpoints de datos y los bindings D1/R2.)*
3. **Guardar / Implementar**.
4. Verificar que siga con los bindings `DB` (D1) y `BUCKET` (R2).

### Paso 2 — Tablas nuevas en la D1 (no tocan `ots`)
1. Dashboard → **Workers & Pages → D1 → `htat` → Consola**.
2. Pegar el contenido de **`htat-ot/sql-crear-tablas-login.sql`** y ejecutar.
3. Debe listar 3 tablas: `usuarios`, `sesiones`, `ots`.

### Paso 3 — App (frontend) actualizada
1. Dashboard → **Workers & Pages → htat-ot → Nueva implementación**.
2. Arrastrar el ZIP **`htat-ot-app-v2.1.zip`** (o la carpeta `htat-ot-deploy/`) al área de subida.
3. Confirmar el despliegue (implica: index.html, sw.js, js/auth.js nuevo, js/cloud.js, js/app.js, conf.js, styles.css).

### Paso 4 — Crear el primer usuario (una sola vez)
1. Abrir `https://htat-ot.htat.workers.dev/`.
2. La pantalla de login detectará que **no hay usuarios** y ofrecerá **"Crear primer usuario"** (ese queda como administrador).
3. Completar usuario + contraseña (mínimo 6 caracteres) + nombre opcional.

### Paso 5 — Probar el flujo completo
1. Cerrar sesión (Configuración → Cerrar sesión) y volver a entrar con usuario/contraseña.
2. Abrir **Historial**: deben seguir apareciendo las **18 OTs**.
3. Probar **Descargar PDF** y **Sincronizar ahora**.
4. Desde la Configuración: entrado = "Historial compartido: conectado".

### Paso 6 — Quitar Cloudflare Access (cuando todo funcione)
- **Zero Trust → Access → Applications**: eliminar las dos aplicaciones
  (`htat-api.htat.workers.dev` y `htat-ot.htat.workers.dev`).
- Desde ese momento el acceso queda 100% a cargo del login propio (la app sigue bloqueando, y la API responde 401 sin token a cualquiera).

---

## Agregar más personal (después)
Cada persona nueva necesita su propio usuario. Como administrador, ejecutar (desde la consola del navegador estando logueado en la app, o con un script):

```js
// En la consola del navegador de la app (estando con sesión iniciada):
fetch(CONF.cloud.webAppUrl, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "text/plain;charset=utf-8", Authorization: "Bearer " + Auth.token() },
  body: JSON.stringify({ accion: "agregar-usuario", usuario: "hector", password: "claveSecreta", nombre: "Tissera Hector" }),
});
```

> La contraseña viaja encriptada por HTTPS y se guarda hasheada. Idealmente cada persona elige la suya; se puede hacer un pequeño panel de "Usuarios" más adelante.

---

## Verificar que quedó protegido
- `curl https://htat-api.htat.workers.dev/` (sin token) → **401** `{"ok":false,"error":"Sesión requerida..."}`.
- `curl https://htat-api.htat.workers.dev/?estado=1` → `{"ok":true,"loginCreado":true}` (no revela datos).
- Cualquier Origin distinto al de la app → **403**.

## Notas de seguridad
- Las contraseñas se guardan como hash PBKDF2 (nunca texto plano). El login incluye una pequeña espera fija para frenar fuerza bruta.
- El token de sesión es aleatorio (32 bytes) y expira en 7 días; se borra al cerrar sesión o al expirar.
- Recomendado a futuro: pantalla de "Cambiar contraseña" y bloqueo por varios intentos fallidos.

## Pendientes (sin relación con la seguridad)
- Bug fotos **5 vs 9** (la app permite 9 fotos, la nube guarda/lee solo 5) — ver `cloud.js` `toRecord` y `guardar`.
- Código muerto `Draft.save()` / `Draft.load()` en `store.js`.