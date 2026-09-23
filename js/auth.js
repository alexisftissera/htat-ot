/* ============================================================
   htat · Autenticación (usuario y contraseña)
   Guarda el token de sesión en localStorage y muestra la pantalla
   de inicio de sesión cuando hace falta. Sin conexión, la app
   sigue usable en modo local (el login solo se exige en línea).
   ============================================================ */
"use strict";

const Auth = (() => {
  const TK = "htat.token";
  const US = "htat.user";
  const NM = "htat.nombre";

  let overlay = null;        // div de la pantalla de login
  let visible = false;       // ¿la pantalla está a la vista?
  let formMode = "login";    // "login" | "crear"
  let silenciadoHasta = 0;   // tras "Continuar sin conexión": no re-mostrar por unos minutos

  function leer(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function escribir(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* noop */ } }

  function token() { return leer(TK); }
  function usuario() { return leer(US); }
  function nombre() { return leer(NM); }
  function estaLogueado() { return !!token(); }

  function guardarSesion(tok, usr, nm) {
    escribir(TK, tok);
    escribir(US, usr || "");
    escribir(NM, nm || "");
  }
  function limpiarSesion() {
    escribir(TK, "");
    escribir(US, "");
    escribir(NM, "");
  }

  /* Cabeceras que se adjuntan a cada llamada a la base. */
  function headersBase(extra) {
    const h = Object.assign({}, extra || {});
    const t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  async function api(method, ruta, cuerpo) {
    const opts = { method, credentials: "include", headers: headersBase({ "Content-Type": "text/plain;charset=utf-8" }) };
    if (cuerpo !== undefined) opts.body = JSON.stringify(cuerpo);
    return fetch(CONF.cloud.webAppUrl + (ruta || ""), opts);
  }

  async function login(usr, pwd) {
    const res = await api("POST", "", { accion: "login", usuario: usr, password: pwd });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      const e = new Error(
        data && data.error
          ? data.error
          : "No se pudo contactar la base. Reintentá en unos segundos."
      );
      e.code = data && data.code, e.status = res.status;
      throw e;
    }
    guardarSesion(data.token, data.usuario, data.nombre);
    return data;
  }

  async function logout() {
    try { await api("POST", "", { accion: "logout" }); } catch (e) { /* igual se cierra en local */ }
    limpiarSesion();
  }

  async function validar() {
    /* GET /?me=1 — confirma que el token guardado sigue válido. */
    const t = token();
    if (!t) return { ok: false, error: "sin_sesion" };
    try {
      const res = await fetch(CONF.cloud.webAppUrl + "?me=1", {
        method: "GET", cache: "no-store", credentials: "include",
        headers: { Authorization: "Bearer " + t },
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401 || (data && data.code === "SESION_REQUERIDA")) return { ok: false, error: "expirada" };
      if (res.ok && data && data.ok) {
        if (data.nombre) escribir(NM, data.nombre);
        return { ok: true, data };
      }
      return { ok: false, error: "red" };
    } catch (e) {
      return { ok: false, error: "red" };   // sin conexión: se sigue local
    }
  }

  /* ¿ya existe un usuario registrado? (para ofrecer la creación del primero) */
  async function estado() {
    try {
      const res = await fetch(CONF.cloud.webAppUrl + "?estado=1", {
        method: "GET", cache: "no-store", credentials: "include",
      });
      const data = await res.json().catch(() => null);
      return res.ok && data && data.ok ? data : null;
    } catch (e) {
      return null;
    }
  }

  async function crearPrimerUsuario(usr, pwd, nm) {
    const res = await api("POST", "", { accion: "primer-usuario", usuario: usr, password: pwd, nombre: nm });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "No se pudo crear el usuario.");
    guardarSesion(data.token, data.usuario, data.nombre);
    return data;
  }

  /* ---------------- pantalla de inicio de sesión ---------------- */

  function crearOverlay() {
    const div = document.createElement("div");
    div.className = "auth-overlay";
    div.id = "authOverlay";
    div.setAttribute("role", "dialog");
    div.setAttribute("aria-modal", "true");
    div.innerHTML = '' +
      '<div class="auth-card">' +
      '  <div class="auth-brand">' +
      '    <span class="auth-logo">HTAT</span>' +
      '    <h1>Orden de Trabajo</h1>' +
      '    <p>Ingresá para conectar el historial compartido.</p>' +
      '  </div>' +
      '  <form class="auth-form" id="authForm" autocomplete="on">' +
      '    <input type="hidden" name="mode" value="login" />' +
      '    <div class="auth-field" id="authNombreWrap" hidden>' +
      '      <label for="authNombre">Nombre (opcional)</label>' +
      '      <input type="text" name="nombre" id="authNombre" autocomplete="off" placeholder="Ej.: Tissera Alexis" />' +
      '    </div>' +
      '    <div class="auth-field">' +
      '      <label for="authUsuario">Usuario</label>' +
      '      <input type="text" name="usuario" id="authUsuario" autocomplete="username" placeholder="tu_usuario" required />' +
      '    </div>' +
      '    <div class="auth-field">' +
      '      <label for="authPassword">Contraseña</label>' +
      '      <input type="password" name="password" id="authPassword" autocomplete="current-password" placeholder="••••••••" required />' +
      '    </div>' +
      '    <div class="auth-err" id="authErr" hidden></div>' +
      '    <button type="submit" class="btn btn-primary auth-submit" id="authSubmit">Entrar</button>' +
      '    <button type="button" class="linklike auth-offline" id="authOffline">Continuar sin conexión (solo este equipo)</button>' +
      '  </form>' +
      '  <p class="auth-hint" id="authHint">La sesión dura 7 días en este navegador.</p>' +
      '</div>';
    document.body.appendChild(div);

    const form = div.querySelector("#authForm");
    const btn = div.querySelector("#authSubmit");
    const err = div.querySelector("#authErr");
    const nombreWrap = div.querySelector("#authNombreWrap");

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      btn.disabled = true;
      btn.classList.add("busy");
      const usr = div.querySelector("#authUsuario").value.trim();
      const pwd = div.querySelector("#authPassword").value;
      const nm = div.querySelector("#authNombre").value.trim();
      try {
        if (formMode === "crear") {
          await crearPrimerUsuario(usr, pwd, nm);
        } else {
          await login(usr, pwd);
        }
        ocultar();
        if (window.AuthCallback) window.AuthCallback("ok", formMode === "crear" ? "primer_usuario" : undefined);
      } catch (e) {
        err.textContent = e.message || "No se pudo entrar.";
        err.hidden = false;
      } finally {
        btn.disabled = false;
        btn.classList.remove("busy");
      }
    });

    div.querySelector("#authOffline").addEventListener("click", () => {
      ocultar();
      silenciadoHasta = Date.now() + 5 * 60 * 1000;   // no re-mostrar enseguida
      if (window.AuthCallback) window.AuthCallback("offline");
    });

    /* Modo creación de primer usuario (se detecta solo). */
    async function detectarModo() {
      const e = await estado();
      if (e === null) {
        /* sin respuesta (sin conexión / Access exigiendo login): no forzamos */
        if (!e && !navigator.onLine) ocultar();
        return;
      }
      if (!e.loginCreado) {
        formMode = "crear";
        div.querySelector('input[name="mode"]').value = "crear";
        nombreWrap.hidden = false;
        div.querySelector("#authNombre").required = false;
        div.querySelector("#authSubmit").textContent = "Crear primer usuario";
        div.querySelector("#authPassword").autocomplete = "new-password";
        div.querySelector(".auth-brand p").textContent =
          "Todavía no hay usuarios. Creá el primero (será administrador).";
        div.querySelector("#authHint").textContent =
          "Con este usuario se entra a la base compartida. La contraseña se guarda encriptada.";
      }
    }
    if (formMode === "login") detectarModo();

    return div;
  }

  function mostrar(motivo) {
    if (visible) return;
    silenciadoHasta = 0;   // una llamada explícita levanta el silencio
    if (!overlay || !document.body.contains(overlay)) overlay = crearOverlay();
    /* guardamos el motivo (ej. "sesión expirada") para mostrarlo */
    const brand = overlay.querySelector(".auth-brand p");
    if (motivo && brand) brand.textContent = motivo;
    if (formMode !== "crear") {
      overlay.querySelector("#authNombreWrap").hidden = true;
    }
    overlay.hidden = false;
    visible = true;
    const usr = overlay.querySelector("#authUsuario");
    if (usr) { usr.focus(); }
    return overlay;
  }

  function ocultar() {
    if (overlay) overlay.hidden = true;
    visible = false;
  }

  /* Lo llama la nube cuando el servidor responde 401 (sesión vencida). */
  function expiro() {
    if (visible) return;                    // ya está la pantalla
    if (Date.now() < silenciadoHasta) return;  // el usuario eligió seguir sin conexión
    if (token()) {
      mostrar("Tu sesión venció. Ingresá de nuevo para conectar el historial.");
    } else {
      mostrar("Ingresá para conectar el historial compartido.");
    }
  }

  return {
    token, usuario, nombre, estaLogueado,
    login, logout, validar, estado, crearPrimerUsuario,
    mostrarLogin: mostrar, ocultar, expiro, headersBase,
  };
})();