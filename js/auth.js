/* ============================================================
   htat · Sesión de Google (Sign in with Google)
   Desde v3 el acceso es OBLIGATORIO: la app no arranca sin una
   cuenta de Google autorizada. El ID token viaja en cada llamada
   a la base compartida (cabecera "Authorization: Bearer") y el
   Worker lo valida contra Google y contra la lista de usuarios
   permitidos. Se guarda en localStorage para que la sesión dure
   entre aperturas (incluso sin conexión).
   ============================================================ */
"use strict";

const Auth = (() => {
  const GIS_URL = "https://accounts.google.com/gsi/client";
  let credencial = null;   // { token, perfil, nivel } o null
  let resolvers = [];      // promesas esperando una sesión
  let oyentes = [];        // callbacks de cambio de sesión
  let gisPromise = null;
  let leyendo = false;

  const $ = (id) => document.getElementById(id);

  function leer() {
    try { return JSON.parse(localStorage.getItem(CONF.auth.sessionKey) || "null"); }
    catch (e) { return null; }
  }
  function guardar(c) {
    try {
      if (c) localStorage.setItem(CONF.auth.sessionKey, JSON.stringify(c));
      else localStorage.removeItem(CONF.auth.sessionKey);
    } catch (e) { console.warn("htat: no se pudo guardar la sesión", e); }
  }

  /* Email/nombre/foto desde el ID token (JWT). La verificación real
     la hace el Worker: acá solo se leen datos para mostrar la UI. */
  function perfilDeToken(token) {
    try {
      const p = String(token).split(".")[1];
      const b64 = (p || "").replace(/-/g, "+").replace(/_/g, "/");
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      const json = decodeURIComponent(escape(atob(b64 + pad)));
      const d = JSON.parse(json);
      return {
        email: String(d.email || "").trim().toLowerCase(),
        nombre: d.name || "",
        foto: d.picture || "",
      };
    } catch (e) { return null; }
  }

  /* ---------- estado de la sesión ---------- */
  function haySesion() { return !!(credencial && credencial.token); }
  function token() { return credencial ? (credencial.token || "") : ""; }
  function usuario() { return credencial ? credencial.perfil : null; }
  /* Nivel de permiso: "admin" / "usuario" (editan) o "lectura" (solo ven). */
  function nivel() {
    if (!credencial) return "lectura";
    return credencial.nivel && credencial.nivel !== "null" ? credencial.nivel : "lectura";
  }
  function esAdmin() { return nivel() === "admin"; }
  function esEditor() { return nivel() !== "lectura"; }
  function setNivel(nivel) {
    if (credencial) { credencial.nivel = nivel; guardar(credencial); }
  }

  /* ---------- GIS (Google Identity Services) ---------- */
  function cargarGIS() {
    if (typeof google !== "undefined" && google.accounts && google.accounts.id) {
      return Promise.resolve();
    }
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_URL;
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => {
        gisPromise = null;
        reject(new Error("No se pudo cargar Google Sign-In (¿sin conexión?)."));
      };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  function alRecibirCredencial(resp) {
    if (!resp || !resp.credential) return;
    const perfil = perfilDeToken(resp.credential);
    if (!perfil || !perfil.email) return;
    credencial = { token: resp.credential, perfil, nivel: null };
    guardar(credencial);
    notificar();
  }

  function configurarGIS() {
    google.accounts.id.initialize({
      client_id: CONF.auth.clientId,
      callback: alRecibirCredencial,
      auto_select: false,
    });
  }

  function renderizarBoton(contenedor, ancho) {
    /* Evita duplicar el iframe si la pantalla de login se vuelve a renderizar. */
    contenedor.innerHTML = "";
    google.accounts.id.renderButton(contenedor, {
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      logo_alignment: "left",
      width: ancho || 280,
    });
  }

  /* ---------- pantalla de login ---------- */
  function mostrarLogin(mensaje) {
    const s = $("loginScreen");
    if (s) s.hidden = false;
    const err = $("loginErr");
    if (err) { err.textContent = mensaje || ""; err.hidden = !mensaje; }
    document.body.classList.add("login-abierto");
  }
  function ocultarLogin() {
    const s = $("loginScreen");
    if (s) s.hidden = true;
    document.body.classList.remove("login-abierto");
  }
  function prepararPantallaLogin() {
    const cont = $("loginGoogleBtn");
    const load = $("loginLoading");
    if (!cont) return;
    cargarGIS()
      .then(() => {
        if (load) load.hidden = true;
        configurarGIS();
        renderizarBoton(cont, Math.min(300, (window.innerWidth || 360) - 64));
      })
      .catch((e) => {
        if (load) load.hidden = true;
        const err = $("loginErr");
        if (err) {
          err.textContent = e.message || "No se pudo cargar Google Sign-In.";
          err.hidden = false;
        }
      });
  }

  /* ---------- espera de credencial ---------- */
  function notificar() {
    const res = resolvers.splice(0);
    res.forEach((r) => { try { r(usuario()); } catch (e) {} });
    oyentes.splice(0).forEach((fn) => { try { fn(usuario()); } catch (e) {} });
  }
  function onCambio(fn) { oyentes.push(fn); }
  function esperarCredencial() {
    if (haySesion()) return Promise.resolve(usuario());
    return new Promise((resolve) => resolvers.push(resolve));
  }

  /* Puerta principal: con sesión guardada entra directo; si no,
     muestra el login y espera a la autenticación con Google. */
  async function asegurarLogueado() {
    if (!leyendo) { leyendo = true; credencial = leer(); }
    if (haySesion()) { ocultarLogin(); return usuario(); }
    mostrarLogin("");
    prepararPantallaLogin();
    return esperarCredencial().then((u) => { ocultarLogin(); return u; });
  }

  /* La base respondió 401: la sesión no sirve (venció o fue revocada).
     Se limpia, se intenta renovar en silencio (One Tap) y, si Google
     no la renueva, queda el botón para iniciar sesión de nuevo. */
  async function sesionInvalida() {
    const tenia = haySesion();
    credencial = null;
    guardar(null);
    mostrarLogin(tenia
      ? "Tu sesión de Google venció. Iniciá sesión de nuevo para continuar."
      : "");
    prepararPantallaLogin();
    if (tenia && navigator.onLine !== false) {
      cargarGIS()
        .then(() => {
          configurarGIS();
          try { google.accounts.id.prompt(); } catch (e) { /* no siempre permitido */ }
        })
        .catch(() => {});
    }
    return esperarCredencial().then((u) => { ocultarLogin(); return u; });
  }

  function salir() {
    credencial = null;
    guardar(null);
    location.reload();   // vuelve limpia a la pantalla de login
  }

  return {
    asegurarLogueado,
    sesionInvalida,
    haySesion,
    token,
    usuario,
    nivel,
    esAdmin,
    esEditor,
    setNivel,
    salir,
    onCambio,
  };
})();