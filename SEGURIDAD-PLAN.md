# 🔒 Plan de seguridad — Protona HTAT (Cloudflare Access)

Estado: en preparación. **NO se borró ni modificó ninguna OT.**

## Problema confirmado
- `GET https://htat-api.htat.workers.dev/` devuelve el historial completo a cualquier persona, sin login.
- La API acepta `POST` (guardar/borrar) solo exigiendo un `id`, sin identificar quién es.
- Fotos y firmas (`?img=`) también están sin protección.

## Solución elegida: Cloudflare Access (Zero Trust)
Bloquea el acceso a nivel de red: solo entran los usuarios que autorices, con login (email/OTP/Google).

---

## Paso 1 — Crear las aplicaciones Access (en el dashboard)

1. Entrá a https://one.dash.cloudflare.com (o dash.cloudflare.com → **Zero Trust**).
2. Si te lo pide, elegí el equipo: **HTAT**.
3. Menú izquierdo → **Access → Applications → Add an application**.
4. Elegí tipo **Self-hosted**.
5. Creá **DOS aplicaciones**:

### Aplicación 1: la API (datos) — la más importante
| Campo | Valor |
|---|---|
| Application domain | `htat-api.htat.workers.dev` |
| Session duration | 1 hora (o la que prefieras) |

En **Policies → Add a policy**:
| Campo | Valor |
|---|---|
| Policy name | `Solo personal autorizado` |
| Action | **Allow** |
| Include → Select... | **Emails** → agregá los correos del personal (Tissera Hector, Tissera Alexis, etc.) |

### Aplicación 2: la app (opcional pero recomendado)
| Campo | Valor |
|---|---|
| Application domain | `htat-ot.htat.workers.dev` |
| Policy | Igual: solo emails autorizados |

> 💡 En **Settings → Authentication** podés activar **"One-time PIN"**, para que cada persona
> reciba un código por email y no necesite una cuenta de Google.
> La primera vez la app pedirá login; después queda la sesión activa según la duración elegida.

---

## Paso 2 — Actualizar la app (frontend) para usar la sesión

En el Worker `htat-ot` (dashboard → Workers & Pages → htat-ot → Edit code),
actualizá **`js/cloud.js`**: todas las llamadas `fetch(...)` deben llevar
**`credentials: "include"`** para que el navegador envíe la cookie de sesión de Access.

Ya dejé hecho este cambio en la copia local:
`C:\Users\Alex\Documents\Default Project\htat-ot\js\cloud.js`

Ejemplo del cambio (una de las 7 llamadas):
```js
// ANTES:
const res = await fetch(CONF.cloud.webAppUrl, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify(carga),
});
// DESPUÉS:
const res = await fetch(CONF.cloud.webAppUrl, {
  method: "POST",
  credentials: "include",          // ← agrega esta línea
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify(carga),
});
```

---

## Paso 3 — CORS con credenciales en `htat-api`

Con Access activo, el navegador envía la sesión en las peticiones a `htat-api`.
Para que el navegador **acepte leer la respuesta** (es un dominio distinto), el Worker
de la API debe responder CORS permitiendo credenciales, **solo para el origen de la app**:

```js
// En el Worker htat-api, dentro del fetch handler (adaptar a la estructura actual):
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://htat-ot.htat.workers.dev",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Si llega una petición OPTIONS (preflight), responder 204 con esos headers.
if (request.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: corsHeaders });
}
// Y en cada respuesta normal agregar los headers corsHeaders.
```

⚠️ **Importante:** para aplicar este paso con seguridad sobre tu código real,
necesito ver el Worker `htat-api`. No lo modifiques a ciegas si no estás seguro
de la estructura.

---

## Paso 4 — Probar

1. Abrí `https://htat-ot.htat.workers.dev/` en un navegador (debería pedir login).
2. Entrá con un correo autorizado (te llega un código por email si activaste OTP).
3. Abrí el **Historial** y verificá que se sigan viendo las 18 OTs.
4. Probá **Descargar PDF**.
5. Para verificar que quedó bloqueado, en otra ventana/incógnito o con `curl`:
   `curl https://htat-api.htat.workers.dev/` → debe devolver **401/403** (no los datos).

---

## Quedan pendientes (opcional, recomendado)
- Corregir el bug de **fotos 5 vs 9** (la app permite 9 fotos pero la nube guarda/lee solo 5).
- Activar la **verificación de dos pasos** en las cuentas del personal autorizado.
- Considerar **IP Access Rules** extra o **bot management** para capas adicionales.