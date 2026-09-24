/* ============================================================
   htat · Orden de Trabajo — controlador principal
   ============================================================ */
"use strict";

(function () {
  loadConfig();

  /* ---------- Referencias a elementos ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    form: $("otForm"),
    fOt: $("fOt"),
    errOt: $("errOt"),
    fFecha: $("fFecha"),
    fLinea: $("fLinea"),
    fActivo: $("fActivo"),
    activoList: $("activoList"),
    fPlan: $("fPlan"),
    fParte: $("fParte"),
    fTarea: $("fTarea"),
    fEnergia: $("fEnergia"),
    fEnergiaU: $("fEnergiaU"),
    fPresion: $("fPresion"),
    fPresionU: $("fPresionU"),
    fObs: $("fObs"),
    fNovedadNo: $("fNovedadNo"),
    fNovedadSi: $("fNovedadSi"),
    fFirmaNombre: $("fFirmaNombre"),
    fFirmaFecha: $("fFirmaFecha"),
    errActivo: $("errActivo"),
    photoGrid: $("photoGrid"),
    photoCount: $("photoCount"),
    btnCamara: $("btnCamara"),
    btnGaleria: $("btnGalerium"),
    fileCamara: $("fileCamara"),
    fileGaleria: $("fileGaleria"),
    sigCanvas: $("sigCanvas"),
    btnClearSig: $("btnClearSig"),
    sigHint: $("sigHint"),
    btnDownloadPdf: $("btnDownloadPdf"),
    btnSave: $("btnSave"),
    btnNewForm: $("btnNewForm"),
    btnHistory: $("btnHistory"),
    btnConfig: $("btnConfig"),
    btnUser: $("btnUser"),
    userAvatar: $("userAvatar"),
    userName: $("userName"),
    userRole: $("userRole"),
    btnInstall: $("btnInstall"),
    modalInstall: $("modalInstall"),
    btnInstallClose: $("btnInstallClose"),
    btnInstallDone: $("btnInstallDone"),
    footCount: $("footCount"),
    offlineBanner: $("offlineBanner"),
    lecturaBanner: $("lecturaBanner"),
    toasts: $("toasts"),
    // modales
    modalPreview: $("modalPreview"),
    previewImg: $("previewImg"),
    btnPreviewClose: $("btnPreviewClose"),
    btnPreviewDelete: $("btnPreviewDelete"),
    modalHistory: $("modalHistory"),
    histSearch: $("histSearch"),
    btnHistSearch: $("btnHistSearch"),
    histHoy: $("histHoy"),
    histMaqTitle: $("histMaqTitle"),
    btnHistLimpiar: $("btnHistLimpiar"),
    histList: $("histList"),
    histEmpty: $("histEmpty"),
    histCount: $("histCount"),
    btnHistClose: $("btnHistClose"),
    btnNovedades: $("btnNovedades"),
    modalNovedades: $("modalNovedades"),
    novList: $("novList"),
    novEmpty: $("novEmpty"),
    novCount: $("novCount"),
    btnNovedadesClose: $("btnNovedadesClose"),
    btnMaquinas: $("btnMaquinas"),
    modalMaquinas: $("modalMaquinas"),
    maqList: $("maqList"),
    maqEmpty: $("maqEmpty"),
    btnMaqClose: $("btnMaqClose"),
    btnResumen: $("btnResumen"),
    modalResumen: $("modalResumen"),
    resumenList: $("resumenList"),
    resumenEmpty: $("resumenEmpty"),
    resumenMes: $("resumenMes"),
    resumenLinea: $("resumenLinea"),
    btnResumenLimpiar: $("btnResumenLimpiar"),
    btnResumenClose: $("btnResumenClose"),
    modalConfig: $("modalConfig"),
    cfgCloudBadge: $("cfgCloudBadge"),
    cfgInfoBase: $("cfgInfoBase"),
    cfgInfoNube: $("cfgInfoNube"),
    cfgInfoLocal: $("cfgInfoLocal"),
    cfgInfoPend: $("cfgInfoPend"),
    cfgInfoFotos: $("cfgInfoFotos"),
    cfgInfoSync: $("cfgInfoSync"),
    cfgInfoVersion: $("cfgInfoVersion"),
    cfgInfoUsuario: $("cfgInfoUsuario"),
    btnCfgLogout: $("btnCfgLogout"),
    cfgUsuariosWrap: $("cfgUsuariosWrap"),
    cfgUsuariosList: $("cfgUsuariosList"),
    cfgUsuarioEmail: $("cfgUsuarioEmail"),
    btnCfgUsuarioAdd: $("btnCfgUsuarioAdd"),
    btnCfgSync: $("btnCfgSync"),
    btnCfgUpdate: $("btnCfgUpdate"),
    btnCfgClose: $("btnCfgClose"),
  };

  /* Imagen mínima mientras bajan las fotos del historial compartido. */
  const PH_EMPTY = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  const state = {
    fotos: [],
    editId: null,
    viewing: null,        // id de foto en preview
    editIndex: -1,
    sigPad: null,
    histOpen: false,
    histMaqFiltro: "",   // máquina seleccionada como filtro del historial
    histBusqueda: "",    // texto de búsqueda activo (se aplica solo al tocar la lupa)
  };

  /* ---------- Modo de acceso ----------
     "lectura": cualquier cuenta de Google puede VER el historial pero
     no cargar/modificar OTs. Las cuentas de la lista permitida (y el
     admin) son las únicas con permisos de edición. */
  function modoLectura() { return !Auth.esEditor(); }

  /* Activa/desactiva todo lo que NO debe estar disponible para quien
     solo lee (formulario, fotos, firma, edición/borrado del historial). */
  function actualizarModoUI() {
    const ro = modoLectura();
    if (els.lecturaBanner) els.lecturaBanner.hidden = !ro;
    [els.btnSave, els.btnDownloadPdf, els.btnNewForm, els.btnCamara,
     els.btnGaleria, els.btnClearSig].forEach((b) => { if (b) b.disabled = ro; });
    if (els.btnDownloadPdf) els.btnDownloadPdf.title = ro
      ? "Solo lectura: la cuenta actual no puede cargar ni modificar OTs"
      : "";
    /* Al quedar en modo lectura, se limpia cualquier formulario a medio
       editar para que nadie que solo lee deje cambios locales. */
    if (ro && state && state.editId) resetForm();
  }

  /* ---------- Toasts ---------- */
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    els.toasts.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .25s";
      setTimeout(() => t.remove(), 260);
    }, 3200);
  }
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle("busy", busy);
  }

  /* ---------- Serialización / populares ---------- */
  function serializeValues() {
    return {
      ot: els.fOt.value,
      fecha: els.fFecha.value,
      linea: els.fLinea.value,
      activo: els.fActivo.value,
      plan: els.fPlan.value,
      parte: els.fParte.value,
      tarea: els.fTarea.value,
      energia: els.fEnergia.value,
      energiaU: els.fEnergiaU.value,
      presion: els.fPresion.value,
      presionU: els.fPresionU.value,
      obs: els.fObs.value,
      firmaNombre: els.fFirmaNombre.value,
      firmaFecha: els.fFirmaFecha.value,
    };
  }
  function applyValues(v) {
    els.fOt.value = v.ot || "";
    els.fFecha.value = v.fecha || Fmt.todayISO();
    els.fLinea.value = v.linea || "";
    if (v.linea && els.fLinea.value !== v.linea) {
      lineasExtra.push(v.linea);
      renderLineas(v.linea);
    }
    els.fActivo.value = v.activo || "";
    els.fPlan.value = v.plan || "";
    els.fParte.value = v.parte || "";
    els.fTarea.value = v.tarea || "";
    els.fEnergia.value = v.energia || "";
    els.fEnergiaU.value = v.energiaU || "A";
    els.fPresion.value = v.presion || "";
    els.fPresionU.value = v.presionU || "PSI";
    els.fObs.value = v.obs || "";
    els.fNovedadSi.checked = !!v.novedad;
    els.fNovedadNo.checked = !v.novedad;
    els.fFirmaNombre.value = v.firmaNombre || "Tissera Hector";
    if (!els.fFirmaNombre.querySelector(`option[value="${els.fFirmaNombre.value}"]`)) {
      els.fFirmaNombre.value = "Tissera Hector";
    }
    els.fFirmaFecha.value = v.firmaFecha || Fmt.todayISO();
  }
  /* Opciones para el plan PREDICTIVOS: los campos pasan a ser select.
   Con los demás planes son texto libre. */
  const PART_PREDICTIVA = ["Sistema de refrigeración principal", "Sistema de refrigeración secundario"];
  const TAREA_PREDICTIVA = ["Medición de corriente equipo de refrigeración principal", "Medición de corriente equipo de refrigeración secundario"];

  function buildSelect(id, name, options, current) {
    const sel = document.createElement("select");
    sel.id = id;
    sel.name = name;
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— Seleccionar —";
    sel.appendChild(ph);
    options.forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    if (current && !options.includes(current)) {
      const oc = document.createElement("option");
      oc.value = current;
      oc.textContent = current;
      sel.appendChild(oc);
    }
    sel.value = current || "";
    return sel;
  }

  function buildInput(id, name, current, placeholder) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.id = id;
    inp.name = name;
    inp.placeholder = placeholder;
    inp.autocomplete = "off";
    inp.value = current || "";
    return inp;
  }

  function actualizarTareasPredictivo() {
    const esPred = els.fPlan.value === "PREDICTIVOS";
    const curParte = els.fParte.value;
    const curTarea = els.fTarea.value;
    if (esPred) {
      const s1 = buildSelect("fParte", "parte", PART_PREDICTIVA, curParte);
      els.fParte.replaceWith(s1);
      els.fParte = s1;
      const s2 = buildSelect("fTarea", "tarea", TAREA_PREDICTIVA, curTarea);
      els.fTarea.replaceWith(s2);
      els.fTarea = s2;
    } else {
      const i1 = buildInput("fParte", "parte", curParte, "Sistema de refrigeración principal");
      els.fParte.replaceWith(i1);
      els.fParte = i1;
      const i2 = buildInput("fTarea", "tarea", curTarea, "Medición de corriente equipo de refrigeración principal");
      els.fTarea.replaceWith(i2);
      els.fTarea = i2;
    }
  }

  function bindInputs() {
    actualizarTareasPredictivo();
    els.fPlan.addEventListener("change", () => {
      els.fParte.value = "";
      els.fTarea.value = "";
      actualizarTareasPredictivo();
    });
    els.fActivo.addEventListener("input", () => {
      const v = els.fActivo.value.trim();
      if (v && tPrimera(v) !== "P") {
        els.errActivo.textContent = "El activo debe comenzar con la letra P.";
        els.form.querySelector(".field").classList.add("invalid");
      } else {
        els.errActivo.textContent = "";
      }
      autocompletarLinea(v);
    });
    els.fActivo.addEventListener("click", () => { els.activoList.hidden = !els.activoList.hidden; });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#fActivo") && !e.target.closest("#activoList")) els.activoList.hidden = true;
    });
  }
  function tPrimera(s) { return s.trim().charAt(0).toUpperCase(); }

  /* ---------- Fotos ---------- */
  function renderPhotos() {
    els.photoGrid.innerHTML = "";
    const n = state.fotos.length;
    els.photoCount.textContent = n + "/" + CONF.limits.maxFotos;
    state.fotos.forEach((f, i) => {
      const li = document.createElement("li");
      li.className = "photo-cell";
      const vw = document.createElement("button");
      vw.type = "button";
      vw.className = "ph-view";
      vw.setAttribute("aria-label", "Ver foto " + (i + 1));
      vw.addEventListener("click", () => openPreview(i));
      const img = document.createElement("img");
      img.alt = "Foto " + (i + 1);
      img.src = f.dataUrl || PH_EMPTY;
      if (!f.dataUrl) img.className = "ph-cargando";
      const tag = document.createElement("span");
      tag.className = "ph-tag";
      tag.textContent = "Foto " + (i + 1);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ph-del";
      del.setAttribute("aria-label", "Quitar foto " + (i + 1));
      del.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.addEventListener("click", () => {
        state.fotos.splice(i, 1);
        renderPhotos();
      });
      li.appendChild(vw);
      li.appendChild(img);
      li.appendChild(tag);
      li.appendChild(del);
      els.photoGrid.appendChild(li);
    });
  }
  function openPreview(i) {
    state.editIndex = i;
    els.previewImg.src = state.fotos[i].dataUrl || PH_EMPTY;
    els.modalPreview.hidden = false;
  }
  els.btnPreviewClose.addEventListener("click", () => { els.modalPreview.hidden = true; });
  els.btnPreviewDelete.addEventListener("click", () => {
    if (state.editIndex >= 0) state.fotos.splice(state.editIndex, 1);
    els.modalPreview.hidden = true;
    renderPhotos();
  });
  els.modalPreview.addEventListener("click", (e) => { if (e.target === els.modalPreview) els.modalPreview.hidden = true; });

  els.btnCamara.addEventListener("click", () => els.fileCamara.click());
  els.btnGaleria.addEventListener("click", () => els.fileGaleria.click());
  els.fileCamara.addEventListener("change", () => addPhotos(els.fileCamara.files, () => (els.fileCamara.value = "")));
  els.fileGaleria.addEventListener("change", () => addPhotos(els.fileGaleria.files, () => (els.fileGaleria.value = "")));

  async function addPhotos(files, after) {
    try {
      const added = await Photos.addFromFiles(files, state.fotos.length);
      if (added.length) {
        state.fotos.push(...added);
        renderPhotos();
        toast("Fotos agregadas: " + added.length, "ok");
      }
    } catch (e) {
      toast(e.message || "No se pudieron agregar las fotos.", "err");
    } finally {
      after && after();
    }
  }

  /* ---------- Firma ---------- */
  function initSignature() {
    const pad = new SignaturePad(els.sigCanvas, { color: "#15243a", lineWidth: 2.6 });
    state.sigPad = pad;
    els.btnClearSig.addEventListener("click", () => {
      pad.clear();
      toast("Firma limpiada");
    });
    const sync = () => {
      const done = !pad.isEmpty();
      els.sigCanvas.closest(".signature-wrap").classList.toggle("sig-filled", done);
      els.sigHint.textContent = done
        ? "Firma registrada."
        : "Firme sobre el recuadro con el dedo o el mouse (firma obligatoria para cerrar).";
    };
    els.sigCanvas.addEventListener("sigend", sync);
    els.sigCanvas.addEventListener("sigclear", sync);
    els.sigCanvas.addEventListener("sigrestore", sync);
  }

  /* ---------- Validación y recolección ---------- */
  function validate() {
    const errs = [];
    const fields = [els.fOt, els.fFecha, els.fLinea, els.fActivo, els.fPlan, els.fFirmaNombre, els.fFirmaFecha];
    fields.forEach((f) => { const c = f.closest(".field"); if (c) c.classList.remove("invalid"); });
    els.errOt.textContent = "";
    const mark = (field, msg) => {
      errs.push(msg);
      const c = field.closest(".field");
      if (c) c.classList.add("invalid");
    };

    if (!els.fOt.value || parseInt(els.fOt.value, 10) < 1) {
      mark(els.fOt, "Ingrese un Nº de OT válido.");
      els.errOt.textContent = "Ingrese un Nº de OT válido.";
    }
    if (!els.fFecha.value) mark(els.fFecha, "Ingrese la fecha de trabajo.");
    if (!els.fLinea.value.trim()) mark(els.fLinea, "Ingrese la línea.");
    const activo = els.fActivo.value.trim();
    if (!activo) {
      mark(els.fActivo, "Ingrese el activo / máquina.");
      els.errActivo.textContent = "Campo obligatorio.";
    } else if (tPrimera(activo) !== "P") {
      mark(els.fActivo, "El activo debe comenzar con la letra P.");
      els.errActivo.textContent = "El activo debe comenzar con la letra P.";
    } else {
      els.errActivo.textContent = "";
    }
    if (!els.fPlan.value) mark(els.fPlan, "Seleccione el tipo de plan.");

    if (state.sigPad.isEmpty()) errs.push("Firme el trabajo en el panel de firma digital.");
    if (!els.fFirmaFecha.value) mark(els.fFirmaFecha, "Ingrese la fecha de la firma.");

    return { ok: errs.length === 0, errs, activo };
  }

  function normalizeActivo(v) {
    const s = v.trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ¿Ya existe una OT con ese número? Busca en este equipo y en la copia
     de la base compartida (sin esperar a la red, para que sea instantáneo). */
  async function otRepetida(ot, idExcluir) {
    const num = parseInt(ot, 10);
    if (!num) return null;
    let items = [];
    try { items = await Cloud.mergedFast(); }
    catch (e) { items = await DB.all().catch(() => []); }
    return items.find((r) => r && r.id !== idExcluir && parseInt(r.ot, 10) === num) || null;
  }

  /* Marca el campo y avisa que el Nº de OT ya existe. */
  function avisarOtRepetida(rec, dup) {
    const c = els.fOt.closest(".field");
    if (c) c.classList.add("invalid");
    els.errOt.textContent = "La OT " + rec.ot + " ya está cargada" + (dup.activo ? " (" + dup.activo + ")" : "") + ".";
    els.fOt.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("La OT " + rec.ot + " ya está cargada. No se puede repetir.", "err");
  }

  function collectRecord() {
    const res = validate();
    if (!res.ok) {
      const first = [els.fOt, els.fFecha, els.fLinea, els.fActivo, els.fPlan, els.fFirmaNombre, els.fFirmaFecha].find(
        (el) => el.closest(".field") && el.closest(".field").classList.contains("invalid")
      );
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("Complete los datos requeridos: " + res.errs[0], "err");
      return null;
    }
    const now = new Date().toISOString();
    const readMetric = (v, u) => {
      if (v === "") return null;
      return { valor: String(v), unidad: u };
    };
    const rec = {
      id: state.editId || StoreUtils.nextId(),
      ot: parseInt(els.fOt.value, 10),
      fechaEmision: els.fFecha.value,
      linea: els.fLinea.value.trim(),
      activo: normalizeActivo(res.activo),
      tipoPlan: els.fPlan.value,
      parteSistema: els.fParte.value.trim(),
      tareaEspecifica: els.fTarea.value.trim(),
      consumoEnergia: readMetric(els.fEnergia.value, els.fEnergiaU.value),
      presionGas: readMetric(els.fPresion.value, els.fPresionU.value),
      observaciones: els.fObs.value.trim(),
      novedad: els.fNovedadSi.checked,
      fotos: state.fotos.slice(),
      firma: {
        dataUrl: state.sigPad.toDataURL(),
        nombre: els.fFirmaNombre.value,
        fecha: els.fFirmaFecha.value,
      },
      actualizadoEn: now,
      creadoEn: now,
    };
    return rec;
  }

  async function persistSilently(rec) {
    const existing = rec.id ? await DB.get(rec.id) : null;
    if (existing) {
      rec.creadoEn = existing.creadoEn || undefined;
      rec.sincronizadoEn = existing.sincronizadoEn || undefined;
    }
    rec.sincronizado = false;   // queda pendiente de subir en segundo plano
    await DB.put(rec);
  }

  /* El número de máquina queda guardado una sola vez con su línea,
     y se autocompleta la línea del formulario al elegir la máquina. */
  function registrarMaquina(activo, linea) {
    Maquinas.add(activo, linea);
    fillMaquinasDatalist();
  }

  function autocompletarLinea(activo) {
    const m = Maquinas.find(activo);
    if (m && m.linea) els.fLinea.value = m.linea;
  }

  function fileNameFor(rec) {
    const d = (rec.fechaEmision || "").replace(/-/g, "");
    return "OT-" + rec.ot + (d ? "_" + d : "") + "_HTAT.pdf";
  }

  /* ---------- Acción: PDF ---------- */
  els.btnDownloadPdf.addEventListener("click", async () => {
    const rec = collectRecord();
    if (!rec) return;
    const dup = await otRepetida(rec.ot, rec.id);
    if (dup) { avisarOtRepetida(rec, dup); return; }
    setBusy(els.btnDownloadPdf, true);
    try {
      await persistSilently(rec);
      registrarMaquina(rec.activo, rec.linea);
      programarSync();
      const doc = await HTAT_PDF.build(rec);
      doc.save(fileNameFor(rec));
      state.editId = rec.id;
      Draft.clear();
      refreshCount();
      refrescarEnVivo();
      toast("PDF generado y descargado", "ok");
    } catch (e) {
      console.error(e);
      toast("No se pudo generar el PDF: " + (e.message || "error desconocido"), "err");
    } finally {
      setBusy(els.btnDownloadPdf, false);
    }
  });

  /* ---------- Sincronización en segundo plano ----------
     El guardado local es instantáneo; la subida a la base compartida
     ocurre por detrás, una fila por vez, con reintentos automáticos
     (cada 8 s, al volver la conexión o tras guardar). */
  let syncOcupado = false;
  let syncPendiente = false;
  async function sincronizarPendientes() {
    if (syncOcupado) { syncPendiente = true; return; }
    if (!Cloud.isConfigured() || navigator.onLine === false) return;
    syncOcupado = true;
    try {
      const local = await DB.all().catch(() => []);
      const pendientes = local.filter((r) => r && r.id && r.sincronizado !== true);
      for (const rec of pendientes) {
        const actual = await DB.get(rec.id);
        if (!actual || actual.sincronizado === true) continue;  // borrada o ya sincronizada
        try {
          await Cloud.push(actual);
          const nue = await DB.get(actual.id);
          if (nue && nue.actualizadoEn === actual.actualizadoEn) {
            nue.sincronizado = true;
            nue.sincronizadoEn = new Date().toISOString();
            await DB.put(nue);
          }
          /* si cambió mientras tanto, se reintentará en el próximo ciclo */
        } catch (e) {
          console.warn("htat: pendiente de sincronizar", actual.id, e);
          break;   // se reintenta en el próximo ciclo
        }
      }
    } finally {
      syncOcupado = false;
      if (syncPendiente) {
        syncPendiente = false;
        sincronizarPendientes();
      }
    }
  }
  function programarSync() { sincronizarPendientes(); }
  setInterval(() => { sincronizarPendientes(); }, 8000);

  /* ---------- Guardar sin descargar (queda registrado en el historial) ---------- */
  els.btnSave.addEventListener("click", async () => {
    const rec = collectRecord();
    if (!rec) return;
    const dup = await otRepetida(rec.ot, rec.id);
    if (dup) { avisarOtRepetida(rec, dup); return; }
    setBusy(els.btnSave, true);
    try {
      await persistSilently(rec);
      registrarMaquina(rec.activo, rec.linea);
      programarSync();
      state.editId = rec.id;
      Draft.clear();
      refreshCount();
      toast(Cloud.isConfigured()
        ? "OT " + rec.ot + " guardada — se sincroniza sola con la base"
        : "OT " + rec.ot + " guardada en este dispositivo", "ok");
      refrescarEnVivo();
    } catch (e) {
      console.error(e);
      toast("No se pudo guardar: " + (e.message || "error desconocido"), "err");
    } finally {
      setBusy(els.btnSave, false);
    }
  });

  /* ---------- Nuevo registro ---------- */
  els.btnNewForm.addEventListener("click", resetForm);
  function resetForm() {
    if (hasUnsavedData() && !confirm("Hay datos sin guardar. ¿Crear un registro nuevo de todos modos?")) return;
    els.form.reset();
    applyValues({});
    actualizarTareasPredictivo();
    state.fotos = [];
    state.editId = null;
    state.sigPad.clear();
    renderPhotos();
    els.fFecha.value = Fmt.todayISO();
    els.fFirmaFecha.value = Fmt.todayISO();
    Draft.clear();
    els.form.scrollIntoView();
    toast("Formulario nuevo");
  }
  function hasUnsavedData() {
    const v = serializeValues();
    const keys = Object.keys(v).filter((k) => k !== "fecha" && k !== "firmaFecha" && k !== "firmaNombre");
    if (keys.some((k) => String(v[k]).trim() !== "")) return true;
    if (state.fotos.length > 0) return true;
    if (state.sigPad && !state.sigPad.isEmpty()) return true;
    return false;
  }

  /* ---------- Historial ---------- */
  async function openHistory() {
    /* Al abrir: solo se muestran los cargados en el día, y se limpia
       cualquier búsqueda/filtro anterior. */
    els.modalHistory.hidden = false;
    els.histOpen = true;
    els.histSearch.value = "";
    state.histBusqueda = "";
    state.histMaqFiltro = "";
    els.histHoy.checked = true;
    await renderHistory("");
  }
  els.btnHistory.addEventListener("click", openHistory);
  els.btnHistClose.addEventListener("click", () => { els.modalHistory.hidden = true; els.histOpen = false; });
  els.modalHistory.addEventListener("click", (e) => { if (e.target === els.modalHistory) { els.modalHistory.hidden = true; els.histOpen = false; } });
  els.btnHistSearch.addEventListener("click", () => {
    state.histBusqueda = els.histSearch.value.trim();
    renderHistory(state.histBusqueda);
  });
  els.histHoy.addEventListener("change", () => renderHistory(state.histBusqueda));
  els.btnHistLimpiar.addEventListener("click", () => {
    state.histMaqFiltro = "";
    renderHistory(state.histBusqueda);
  });

  /* ---------- Máquinas ---------- */
  function fillMaquinasDatalist() {
    const mapa = new Map();
    Maquinas.all().forEach((m) => mapa.set(m.nombre.toUpperCase(), m));
    const usadas = new Set(mapa.keys());
    DB.all()
      .then((recs) => {
        recs.forEach((r) => {
          const n = (r.activo || "").trim();
          if (n && !usadas.has(n.toUpperCase())) {
            const m = { nombre: n, linea: (r.linea || "").trim() };
            mapa.set(n.toUpperCase(), m);
            usadas.add(n.toUpperCase());
            Maquinas.add(n, m.linea);
          }
        });
      })
      .catch(() => {});
    els.activoList.innerHTML = "";
    Array.from(mapa.values())
      .sort((a, b) => (a.linea || "").localeCompare(b.linea || "") || a.nombre.localeCompare(b.nombre))
      .forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        const txt = document.createElement("span");
        txt.textContent = m.nombre;
        b.appendChild(txt);
        if (m.linea) {
          const l = document.createElement("span");
          l.className = "combo-linea";
          l.textContent = m.linea;
          b.appendChild(l);
        }
        b.addEventListener("click", () => {
          els.fActivo.value = m.nombre;
          els.errActivo.textContent = "";
          autocompletarLinea(m.nombre);
          els.activoList.hidden = true;
        });
        els.activoList.appendChild(b);
      });
  }

  /* ---------- Líneas de producción (compartidas) ---------- */
  const LINEAS_BASE = ["SOPORTE", "CARRIER", "CARRIER FORD", "ATTACHMENT", "KNUCKLE"];
  let lineasExtra = [];

  function renderLineas(seleccion) {
    const actual = (seleccion !== undefined ? seleccion : els.fLinea.value) || "";
    const todas = Array.from(new Set(
      LINEAS_BASE.concat(lineasExtra)
        .map((s) => String(s || "").trim().toUpperCase())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
    els.fLinea.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— Seleccionar —";
    els.fLinea.appendChild(ph);
    todas.forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = l;
      els.fLinea.appendChild(o);
    });
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    els.fLinea.appendChild(sep);
    if (Auth.esEditor()) {
      const add = document.createElement("option");
      add.value = "__nueva__";
      add.textContent = "+ Agregar línea…";
      els.fLinea.appendChild(add);
    }
    if (todas.includes(actual)) els.fLinea.value = actual;
  }

  els.fLinea.addEventListener("change", async () => {
    if (els.fLinea.value !== "__nueva__") return;
    const nombre = (window.prompt("Nombre de la nueva línea:") || "").trim().toUpperCase();
    if (!nombre) { els.fLinea.value = ""; return; }
    try {
      await Cloud.agregarLinea(nombre);
      if (!lineasExtra.includes(nombre)) lineasExtra.push(nombre);
      renderLineas(nombre);
      toast('Línea "' + nombre + '" agregada', "ok");
    } catch (e) {
      toast("No se pudo guardar la línea (revisá la conexión)", "err");
      renderLineas("");
    }
  });

  async function cargarLineas() {
    try {
      lineasExtra = await Cloud.lineas();
      renderLineas();
    } catch (e) { /* sin conexión: quedan las líneas base */ }
  }

  async function renderMaquinas() {
    const items = await Cloud.mergedFast();
    const porMaq = new Map();
    items.forEach((r) => {
      const n = (r.activo || "").trim() || "(sin máquina)";
      if (!porMaq.has(n)) porMaq.set(n, []);
      porMaq.get(n).push(r);
    });
    els.maqList.innerHTML = "";
    els.maqEmpty.hidden = porMaq.size > 0;
    const orden = Array.from(porMaq.keys()).sort((a, b) => a.localeCompare(b));
    const conNov = [];
    const sinNov = [];
    orden.forEach((nombre) => {
      const ultimo = porMaq.get(nombre)
        .slice()
        .sort((a, b) => (b.fechaEmision || b.creadoEn || "").localeCompare(a.fechaEmision || a.creadoEn || "")
          || (b.creadoEn || "").localeCompare(a.creadoEn || ""))[0];
      if (ultimo && ultimo.novedad) conNov.push(nombre);
      else sinNov.push(nombre);
    });
    const grupo = (label, lista) => {
      const g = document.createElement("div");
      g.className = "history-group-head";
      const t = document.createElement("span");
      t.className = "history-group-title";
      t.textContent = label;
      const c = document.createElement("span");
      c.className = "history-group-count";
      c.textContent = lista.length;
      g.append(t, c);
      els.maqList.appendChild(g);
      lista.forEach(pintar);
    };
    const pintar = (nombre) => {
      const recs = porMaq.get(nombre)
        .slice()
        .sort((a, b) => (b.fechaEmision || b.creadoEn || "").localeCompare(a.fechaEmision || a.creadoEn || "")
          || (b.creadoEn || "").localeCompare(a.creadoEn || ""));
      const card = document.createElement("div");
      card.className = "history-item";
      if (recs[0] && recs[0].novedad) card.classList.add("has-novedad");
      const top = document.createElement("div");
      top.className = "history-item-top";
      const nombreEl = document.createElement("span");
      nombreEl.className = "ot-no";
      nombreEl.textContent = nombre;
      const count = document.createElement("span");
      count.className = "ot-meta";
      count.textContent = recs.length + (recs.length === 1 ? " OT" : " OTs");
      const ultima = document.createElement("span");
      ultima.className = "ot-meta";
      ultima.textContent = "Última: " + Fmt.pretty(recs[0].fechaEmision || recs[0].creadoEn, false);
      top.append(nombreEl, count, ultima);
      if (recs[0] && recs[0].novedad) {
        const nov = document.createElement("span");
        nov.className = "chip chip-novedad";
        nov.textContent = "NOVEDAD";
        top.append(nov);
      }
      const lineas = [...new Set(recs.map((r) => (r.linea || "").trim()).filter(Boolean))];
      const plans = [...new Set(recs.map((r) => r.tipoPlan || "").filter(Boolean))];
      const meta = document.createElement("p");
      meta.className = "ot-desc ot-desc-muted";
      meta.textContent = [
        "Línea(s): " + (lineas.join(", ") || "—"),
        "Trabajo(s): " + (plans.join(", ") || "—"),
      ].join("  ·  ");
      const acts = document.createElement("div");
      acts.className = "history-item-actions";
      const bVer = mkActBtn("Ver todas las OT", async () => {
        els.modalMaquinas.hidden = true;
        els.histSearch.value = "";
        state.histBusqueda = "";
        els.histHoy.checked = false;
        state.histMaqFiltro = nombre;
        els.modalHistory.hidden = false;
        els.histOpen = true;
        await renderHistory("");
      });
      acts.append(bVer);
      card.append(top, meta, acts);
      card.style.cursor = "pointer";
      card.addEventListener("click", async (ev) => {
        if (ev.target.closest("button")) return;
        els.modalMaquinas.hidden = true;
        els.histSearch.value = "";
        state.histBusqueda = "";
        els.histHoy.checked = false;
        state.histMaqFiltro = nombre;
        els.modalHistory.hidden = false;
        els.histOpen = true;
        await renderHistory("");
      });
      els.maqList.appendChild(card);
    };
    if (conNov.length) grupo("Con novedad", conNov);
    if (sinNov.length) grupo("Sin novedad", sinNov);
    Cloud.warm(() => {
      if (!els.modalMaquinas.hidden && Cloud.isFresh()) renderMaquinas();
    });
  }
  els.btnMaquinas.addEventListener("click", async () => {
    els.modalMaquinas.hidden = false;
    await renderMaquinas();
  });
  els.btnMaqClose.addEventListener("click", () => { els.modalMaquinas.hidden = true; });
  els.modalMaquinas.addEventListener("click", (e) => { if (e.target === els.modalMaquinas) els.modalMaquinas.hidden = true; });

  async function renderResumen() {
    const items = await Cloud.mergedFast();
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const mesKey = (r) => {
      const iso = r.fechaEmision || r.creadoEn || "";
      const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
      return isNaN(d) ? "0000-00" : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    };
    const mesTitulo = (key) => {
      const [yr, mo] = key.split("-");
      return yr === "0000" ? "Sin fecha" : meses[+mo - 1] + " " + yr;
    };

    /* Opciones de los filtros (desde todos los registros) */
    const mesesDisponibles = [...new Set(items.map(mesKey))].sort().reverse();
    const lineasDisponibles = [...new Set(items.map((r) => (r.linea || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const mesSel = els.resumenMes.value;
    const lineaSel = els.resumenLinea.value;

    els.resumenMes.innerHTML = "";
    const optTodoMes = document.createElement("option");
    optTodoMes.value = "";
    optTodoMes.textContent = "Todos los meses";
    els.resumenMes.appendChild(optTodoMes);
    mesesDisponibles.forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = mesTitulo(k);
      els.resumenMes.appendChild(o);
    });
    els.resumenMes.value = mesesDisponibles.includes(mesSel) ? mesSel : "";

    els.resumenLinea.innerHTML = "";
    const optTodoLin = document.createElement("option");
    optTodoLin.value = "";
    optTodoLin.textContent = "Todas las líneas";
    els.resumenLinea.appendChild(optTodoLin);
    lineasDisponibles.forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = l;
      els.resumenLinea.appendChild(o);
    });
    els.resumenLinea.value = lineasDisponibles.includes(lineaSel) ? lineaSel : "";

    /* Aplico filtros y agrupo por mes (mantiene el contador por mes) */
    const fMes = els.resumenMes.value;
    const fLin = els.resumenLinea.value;
    const filtrados = items.filter((r) => {
      if (fMes && mesKey(r) !== fMes) return false;
      if (fLin && (r.linea || "").trim() !== fLin) return false;
      return true;
    });

    const groups = new Map();
    filtrados.forEach((r) => {
      const key = mesKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const claves = [...groups.keys()].sort().reverse();

    els.resumenList.innerHTML = "";
    els.resumenEmpty.hidden = claves.length > 0;
    claves.forEach((key) => {
      const recs = groups.get(key)
        .slice()
        .sort((a, b) => (a.fechaEmision || "").localeCompare(b.fechaEmision || ""));
      const card = document.createElement("div");
      card.className = "resumen-month";
      const top = document.createElement("div");
      top.className = "history-item-top";
      const titulo = document.createElement("span");
      titulo.className = "resumen-title";
      titulo.textContent = mesTitulo(key);
      const count = document.createElement("span");
      count.className = "resumen-count";
      count.textContent = recs.length + (recs.length === 1 ? " máquina" : " máquinas");
      top.append(titulo, count);
      const list = document.createElement("ul");
      list.className = "resumen-ots";
      recs.forEach((r) => {
        const li = document.createElement("li");
        const ot = document.createElement("span");
        ot.className = "ot-plate-light";
        ot.textContent = "OT " + r.ot;
        const act = document.createElement("span");
        act.className = "ot-activo";
        act.textContent = r.activo || "—";
        const det = document.createElement("span");
        det.className = "ot-detalle";
        det.textContent = [r.linea, r.tipoPlan].filter(Boolean).join(" · ");
        li.append(ot, act, det);
        list.appendChild(li);
      });
      card.append(top, list);
      els.resumenList.appendChild(card);
    });
    Cloud.warm(() => {
      if (!els.modalResumen.hidden && Cloud.isFresh()) renderResumen();
    });
  }
  els.btnResumen.addEventListener("click", async () => {
    els.modalResumen.hidden = false;
    await renderResumen();
  });
  els.btnResumenClose.addEventListener("click", () => { els.modalResumen.hidden = true; });
  els.modalResumen.addEventListener("click", (e) => { if (e.target === els.modalResumen) els.modalResumen.hidden = true; });
  els.resumenMes.addEventListener("change", renderResumen);
  els.resumenLinea.addEventListener("change", renderResumen);
  els.btnResumenLimpiar.addEventListener("click", () => {
    els.resumenMes.value = "";
    els.resumenLinea.value = "";
    renderResumen();
  });

  /* ---------- Novedades ---------- */
  async function renderNovedades() {
    const items = await Cloud.mergedFast();
    const con = items
      .filter((r) => r.novedad)
      .sort((a, b) => (b.fechaEmision || b.creadoEn || "").localeCompare(a.fechaEmision || a.creadoEn || ""));
    els.novList.innerHTML = "";
    els.novEmpty.hidden = con.length > 0;
    els.novCount.textContent = con.length;
    con.forEach((r) => {
      const item = document.createElement("div");
      item.className = "history-item has-novedad";
      const top = document.createElement("div");
      top.className = "history-item-top";
      const otNo = document.createElement("span");
      otNo.className = "ot-plate";
      otNo.textContent = "OT " + r.ot;
      const nov = document.createElement("span");
      nov.className = "ot-novedad-plate";
      nov.textContent = "NOVEDAD";
      const act = document.createElement("span");
      act.className = "ot-formal-activo";
      act.textContent = r.activo || "—";
      const meta = document.createElement("span");
      meta.className = "ot-meta";
      const fec = Fmt.pretty(r.fechaEmision || r.creadoEn, false);
      const editada = r.actualizadoEn && r.creadoEn && r.actualizadoEn !== r.creadoEn;
      const hora = Fmt.hora(r.actualizadoEn || r.creadoEn);
      meta.textContent = fec + (hora ? " · " + hora : "") + (editada ? " · editada" : "");
      top.append(otNo, nov, act, meta);
      const p = document.createElement("p");
      p.className = "ot-desc";
      if (r.tipoPlan) {
        const c = document.createElement("span");
        c.className = "chip chip-plan";
        c.textContent = String(r.tipoPlan).toUpperCase();
        p.appendChild(c);
      }
      if (r.linea) {
        const c = document.createElement("span");
        c.className = "chip chip-linea";
        c.textContent = String(r.linea).toUpperCase();
        p.appendChild(c);
      }
      if (r.tareaEspecifica) {
        const t = document.createElement("span");
        t.className = "ot-desc-task";
        t.textContent = r.tareaEspecifica;
        p.appendChild(t);
      }
      const acts = document.createElement("div");
      acts.className = "history-item-actions";
      const bPdf = mkActBtn("Descargar PDF", async () => {
        const doc = await HTAT_PDF.build(r);
        doc.save(fileNameFor(r));
        toast("PDF descargado", "ok");
      });
      acts.append(bPdf);
      if (Auth.esEditor()) {
        acts.prepend(mkActBtn("Editar", () => loadRecord(r)));
      }
      item.append(top, p, acts);
      els.novList.appendChild(item);
    });
    Cloud.warm(() => {
      if (!els.modalNovedades.hidden && Cloud.isFresh()) renderNovedades();
    });
  }
  els.btnNovedades.addEventListener("click", async () => {
    els.modalNovedades.hidden = false;
    await renderNovedades();
  });
  els.btnNovedadesClose.addEventListener("click", () => { els.modalNovedades.hidden = true; });
  els.modalNovedades.addEventListener("click", (e) => { if (e.target === els.modalNovedades) els.modalNovedades.hidden = true; });

  async function renderHistory(q) {
    const items = await Cloud.mergedFast();
    const maq = state.histMaqFiltro;
    /* Cuando el historial está filtrado por máquina se muestra la máquina
       en el título; el historial siempre usa la pantalla grande. */
    els.histMaqTitle.hidden = !maq;
    els.histMaqTitle.textContent = maq ? "Máquina: " + maq : "";
    els.btnHistLimpiar.hidden = !maq;
    const hoy = els.histHoy.checked && !q;   // al buscar, se ignoran "solo hoy"
    const hoyISO = Fmt.todayISO();
    const hayBtn = (r) => {
      const iso = (r.fechaEmision || r.creadoEn || "").slice(0, 10);
      const dd = Number(iso.slice(8, 10));
      const mm = Number(iso.slice(5, 7));
      const yyyy = iso.slice(0, 4);
      const fechas = [iso, iso.replace(/-/g, "")];
      if (!isNaN(dd) && !isNaN(mm) && yyyy.length === 4 && dd > 0 && mm > 0) {
        fechas.push(dd + "/" + mm + "/" + yyyy);
        fechas.push(mm + "/" + yyyy);
        fechas.push(yyyy + "," + String(mm).padStart(2, "0") + "," + String(dd).padStart(2, "0"));
        fechas.push(String(dd).padStart(2, "0") + "/" + String(mm).padStart(2, "0") + "/" + String(yyyy).slice(2));
      }
      return [
        "OT " + r.ot,
        r.ot,
        r.activo,
        r.linea,
        r.tipoPlan,
        Fmt.pretty(iso, false),
        iso,
        fechas.join(" "),
      ].join(" ").toLowerCase();
    };
    const sorted = items
      .filter((r) => {
        if (maq && !(r.activo || "").trim().toUpperCase().includes(maq.toUpperCase())) return false;
        if (hoy && ((r.fechaEmision || r.creadoEn || "").slice(0, 10)) !== hoyISO) return false;
        if (q && !hayBtn(r).includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || ""));
    els.histList.innerHTML = "";
    els.histEmpty.hidden = sorted.length > 0;
    els.histCount.textContent = sorted.length;
    const conNovedad = sorted.filter((r) => r.novedad);
    const sinNovedad = sorted.filter((r) => !r.novedad);
    const grupo = (label, lista) => {
      const g = document.createElement("div");
      g.className = "history-group-head";
      const t = document.createElement("span");
      t.className = "history-group-title";
      t.textContent = label;
      const c = document.createElement("span");
      c.className = "history-group-count";
      c.textContent = lista.length;
      g.append(t, c);
      els.histList.appendChild(g);
      lista.forEach(pintar);
    };
    const pintar = (r) => {
      const item = document.createElement("div");
      item.className = "history-item";
      if (r.novedad) item.classList.add("has-novedad");
      const top = document.createElement("div");
      top.className = "history-item-top";
      const otNo = document.createElement("span");
      otNo.className = "ot-plate";
      otNo.textContent = "OT " + r.ot;
      const act = document.createElement("button");
      act.type = "button";
      act.className = "ot-maquina-btn";
      act.title = "Ver todas las OTs de esta máquina";
      act.textContent = r.activo || "—";
      act.addEventListener("click", async () => {
        els.histHoy.checked = false;
        state.histMaqFiltro = (r.activo || "").trim();
        await renderHistory(state.histBusqueda);
      });
      const meta = document.createElement("span");
      meta.className = "ot-meta";
      const fechaTrabajo = Fmt.pretty(r.fechaEmision || r.creadoEn, false);
      const editada = r.actualizadoEn && r.creadoEn && r.actualizadoEn !== r.creadoEn;
      const horaReg = Fmt.hora(r.actualizadoEn || r.creadoEn);
      meta.textContent = fechaTrabajo + (horaReg ? " · " + horaReg : "") + (editada ? " · editada" : "");
      const syn = document.createElement("span");
      syn.className = r.sincronizado ? "synced-ok" : "synced-no";
      syn.textContent = r.sincronizado ? "✓ compartido" : "solo local";
      syn.title = r.sincronizado
        ? "Visible para todas las personas en la base compartida"
        : "Todavía no se subió: solo está en este equipo";
      top.append(otNo);
      if (r.novedad) {
        const nov = document.createElement("span");
        nov.className = "ot-novedad-plate";
        nov.textContent = "NOVEDAD";
        top.append(nov);
      }
      top.append(act, meta, syn);
      const p = document.createElement("p");
      p.className = "ot-desc";
      if (r.tipoPlan) {
        const c = document.createElement("span");
        c.className = "chip chip-plan";
        c.textContent = String(r.tipoPlan).toUpperCase();
        p.appendChild(c);
      }
      if (r.linea) {
        const c = document.createElement("span");
        c.className = "chip chip-linea";
        c.textContent = String(r.linea).toUpperCase();
        p.appendChild(c);
      }
      if (r.tareaEspecifica) {
        const t = document.createElement("span");
        t.className = "ot-desc-task";
        t.textContent = r.tareaEspecifica;
        p.appendChild(t);
      }
      const acts = document.createElement("div");
      acts.className = "history-item-actions";
      const bPdf = mkActBtn("Descargar PDF", async () => {
        const doc = await HTAT_PDF.build(r);
        doc.save(fileNameFor(r));
        toast("PDF descargado", "ok");
      });
      const bView = mkActBtn("Mostrar PDF", async () => {
        const doc = await HTAT_PDF.build(r);
        const url = doc.output("bloburl");
        window.open(url, "_blank");
        toast("Mostrando PDF", "ok");
      });
      acts.append(bPdf, bView);
      if (Auth.esEditor()) {
        const bLoad = mkActBtn("Editar", () => loadRecord(r));
        const bDel = document.createElement("button");
        bDel.type = "button";
        bDel.className = "btn btn-danger";
        bDel.textContent = "Eliminar";
        bDel.addEventListener("click", async () => {
          const msg = r.hub
            ? "¿Eliminar la OT " + r.ot + " del historial compartido y de este dispositivo?"
            : "¿Eliminar la OT " + r.ot + " de este dispositivo?";
          if (!confirm(msg)) return;
          await DB.del(r.id);
          if (r.hub) { try { await Cloud.del(r.id); } catch (e) { console.warn(e); } }
          await renderHistory(state.histBusqueda);
          refreshCount();
          toast("Registro eliminado");
          refrescarEnVivo();
        });
        acts.append(bLoad, bDel);
      }
      item.append(top, p, acts);
      els.histList.appendChild(item);
    };
    if (sinNovedad.length) grupo("Sin novedad", sinNovedad);
    if (conNovedad.length) grupo("Con novedad", conNovedad);
    Cloud.warm(() => {
      if (els.histOpen && Cloud.isFresh()) renderHistory(q);
    });
  }
  function mkActBtn(label, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-secondary";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }

  function recordToFormValues(r) {
    return {
      ot: r.ot || "",
      fecha: r.fechaEmision || "",
      linea: r.linea || "",
      activo: r.activo || "",
      plan: r.tipoPlan || "",
      parte: r.parteSistema || "",
      tarea: r.tareaEspecifica || "",
      energia: (r.consumoEnergia && r.consumoEnergia.valor) || "",
      energiaU: (r.consumoEnergia && r.consumoEnergia.unidad) || "A",
      presion: (r.presionGas && r.presionGas.valor) || "",
      presionU: (r.presionGas && r.presionGas.unidad) || "PSI",
      obs: r.observaciones || "",
      novedad: !!r.novedad,
      firmaNombre: (r.firma && r.firma.nombre) || "",
      firmaFecha: (r.firma && r.firma.fecha) || "",
    };
  }

  function loadRecord(r) {
    els.modalHistory.hidden = true;
    els.histOpen = false;
    els.modalNovedades.hidden = true;
    applyValues(recordToFormValues(r));
    actualizarTareasPredictivo();
    state.fotos = (r.fotos || []).slice();
    state.editId = r.id;
    renderPhotos();
    if (r.firma && r.firma.dataUrl) state.sigPad.restore(r.firma.dataUrl);
    els.fFirmaFecha.value = Fmt.todayISO();
    registrarMaquina(r.activo, r.linea);
    els.form.scrollIntoView();

    /* Las OT del historial compartido traen solo la referencia a las
       imágenes (bucket): se descargan por detrás y se muestran. */
    const faltanImg = (r.fotos || []).some((f) => f && f.fileId && !f.dataUrl) ||
      !!(r.firma && r.firma.fileId && !r.firma.dataUrl);
    if (faltanImg) {
      toast("Descargando fotos y firma del historial…");
      Cloud.imagenesDe(r)
        .then(() => {
          if (state.editId !== r.id) return;   // cambió de OT mientras bajaba
          renderPhotos();
          if (r.firma && r.firma.dataUrl) state.sigPad.restore(r.firma.dataUrl);
        })
        .catch((e) => console.warn("htat: no se pudieron bajar las imágenes", e));
    }
    toast("OT " + r.ot + " cargada para edición");
  }

  /* ---------- Configuración ---------- */
  els.btnConfig.addEventListener("click", () => {
    els.modalConfig.hidden = false;
    actualizarBadgeCloud(true);
    renderInfoConfig();
  });
  els.btnCfgClose.addEventListener("click", () => { els.modalConfig.hidden = true; });
  els.modalConfig.addEventListener("click", (e) => { if (e.target === els.modalConfig) els.modalConfig.hidden = true; });

  els.btnCfgSync.addEventListener("click", async () => {
    setBusy(els.btnCfgSync, true);
    try {
      await Cloud.pullAll(true).catch(() => []);
      await sincronizarPendientes();
      if (els.histOpen) await renderHistory(state.histBusqueda);
      toast("Historial actualizado", "ok");
    } catch (e) {
      toast("Sin conexión con la base", "err");
    } finally {
      setBusy(els.btnCfgSync, false);
      renderInfoConfig();
    }
  });

  els.btnCfgUpdate.addEventListener("click", async () => {
    setBusy(els.btnCfgUpdate, true);
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.update) await reg.update();
    } catch (e) { /* sin service worker: recarga igual */ }
    location.reload();
  });

  /* Cartel de conexión con la base compartida. Con conPrueba=true
     verifica la conexión automáticamente y muestra el resultado. */
  async function actualizarBadgeCloud(conPrueba) {
    const el = els.cfgCloudBadge;
    if (!Cloud.isConfigured()) {
      el.className = "cloud-badge off";
      el.textContent = "Historial compartido: LOCAL (solo este equipo)";
      return;
    }
    if (!conPrueba) {
      el.className = "cloud-badge ok";
      el.textContent = "Historial compartido: conectado";
      return;
    }
    el.className = "cloud-badge checking";
    el.textContent = "Comprobando conexión con la base…";
    const r = await Cloud.probar();
    if (r.ok) {
      el.className = "cloud-badge ok";
      el.textContent = "Historial compartido: conectado";
    } else {
      el.className = "cloud-badge err";
      el.textContent = "Historial compartido: falló la conexión · " + r.msg;
    }
  }

  /* Panel de información del estado (solo lectura). */
  async function renderInfoConfig() {
    const base = (CONF.cloud.webAppUrl || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    els.cfgInfoBase.textContent = base || "—";
    els.cfgInfoVersion.textContent = CONF.version || "—";
    els.cfgInfoSync.textContent = "";

    let local = [];
    try { local = await DB.all(); } catch (e) { local = []; }
    const pend = local.filter((r) => r && r.id && r.sincronizado !== true).length;
    const fotos = local.reduce((n, r) => n + ((r.fotos || []).length), 0);
    els.cfgInfoLocal.textContent = local.length + (local.length === 1 ? " OT" : " OTs");
    els.cfgInfoPend.textContent = pend === 0
      ? "Ninguna (todo subido)"
      : pend + (pend === 1 ? " OT pendiente" : " OTs pendientes");
    els.cfgInfoFotos.textContent = String(fotos);

    const t = (Cloud.lastSync && Cloud.lastSync()) || 0;
    els.cfgInfoSync.textContent = t ? Fmt.hora(new Date(t).toISOString()) : "—";

    els.cfgInfoNube.textContent = "Consultando…";
    try {
      const filas = await Cloud.pullAll(true);
      const n = Array.isArray(filas) ? filas.length : 0;
      els.cfgInfoNube.textContent = n + (n === 1 ? " OT" : " OTs");
      const t2 = (Cloud.lastSync && Cloud.lastSync()) || 0;
      if (t2) els.cfgInfoSync.textContent = Fmt.hora(new Date(t2).toISOString());
    } catch (e) {
      els.cfgInfoNube.textContent = "sin conexión";
    }

    mostrarSesion();
    if (!els.cfgUsuariosWrap.hidden || Auth.esAdmin()) {
      await renderUsuariosConfig().catch(() => {});
    }
  }

  /* ---------- Actualización en vivo del historial ----------
     Consulta la base compartida cada 5 s mientras el historial o la
     configuración está abierto y re-renderiza sin recargar la página.
     También se refresca al instante cuando la app vuelve a primer plano.
     Las operaciones locales (guardar/eliminar) mantienen el caché al día
     y disparan una verificación para enterarse enseguida de lo que
     cambiaron otros dispositivos. */
  let refrescandoEnVivo = false;
  let refrescoPendiente = false;
  async function refrescarEnVivo() {
    if (!Cloud.isConfigured() || navigator.onLine === false) return;
    if (refrescandoEnVivo) { refrescoPendiente = true; return; }
    refrescandoEnVivo = true;
    try {
      await Cloud.pullAll(true);
      if (els.histOpen) await renderHistory(state.histBusqueda);
      if (!els.modalConfig.hidden) renderInfoConfig();
    } catch (e) {
      /* sin conexión con la base: se espera al próximo ciclo */
    } finally {
      refrescandoEnVivo = false;
      if (refrescoPendiente) {
        refrescoPendiente = false;
        refrescarEnVivo();
      }
    }
  }
  setInterval(() => {
    if (els.histOpen || !els.modalConfig.hidden) refrescarEnVivo();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (els.histOpen || !els.modalConfig.hidden)) refrescarEnVivo();
  });
  window.addEventListener("focus", () => {
    if (els.histOpen || !els.modalConfig.hidden) refrescarEnVivo();
  });

  /* ---------- Sesión de Google ---------- */
  function inicialUsuario() {
    const u = Auth.usuario();
    const base = (u && (u.nombre || u.email || "")) || "U";
    return base.charAt(0).toUpperCase();
  }
  function mostrarSesion() {
    const u = Auth.usuario();
    if (!u) {
      els.btnUser.hidden = true;
      els.cfgInfoUsuario.textContent = "—";
      return;
    }
    els.btnUser.hidden = false;
    els.userAvatar.textContent = inicialUsuario();
    els.userName.textContent = u.nombre || u.email || "Cuenta";
    if (els.userRole) {
      els.userRole.hidden = Auth.esEditor();
      els.userRole.textContent = "solo lectura";
    }
    const rol = Auth.esAdmin() ? " · administrador"
      : Auth.esEditor() ? " · edición"
      : " · solo lectura";
    els.cfgInfoUsuario.textContent = u.email + (u.nombre ? " (" + u.nombre + ")" : "") + rol;
  }
  els.btnUser.addEventListener("click", () => {
    els.modalConfig.hidden = false;
    renderInfoConfig();
  });
  els.btnCfgLogout.addEventListener("click", () => {
    if (!confirm("¿Cerrar la sesión actual? Para volver a usar la app tendrás que iniciar sesión con Google.")) return;
    Auth.salir();
  });

  /* Pide a la base el nivel real de la cuenta (lectura/usuario/admin).
     Si la base no responde (offline) conserva el nivel guardado de la
     última sesión; sin dato previo queda en "lectura" (nunca se asume
     permiso de edición sin confirmación del administrador). */
  async function aplicarModoAcceso() {
    try {
      const perfil = await Cloud.quienSoy();
      if (perfil && perfil.email) {
        Auth.setNivel(perfil.nivel || "lectura");
      }
    } catch (e) {
      /* sin conexión con la base: se mantiene el nivel guardado */
    }
    mostrarSesion();
    actualizarModoUI();
  }

  /* Administración de usuarios permitidos (solo visible para admins). */
  async function renderUsuariosConfig() {
    if (!Auth.esAdmin()) { els.cfgUsuariosWrap.hidden = true; return; }
    els.cfgUsuariosWrap.hidden = false;
    try {
      const lista = await Cloud.usuariosPermitidos();
      els.cfgUsuariosList.innerHTML = "";
      lista.forEach((u) => {
        const item = document.createElement("div");
        item.className = "users-item";
        const info = document.createElement("div");
        info.className = "users-info";
        const mail = document.createElement("span");
        mail.className = "users-mail";
        mail.textContent = u.email;
        const det = document.createElement("span");
        det.className = "users-det";
        det.textContent = [u.nombre || "sin nombre", u.nivel === "admin" ? "administrador" : "usuario"]
          .filter(Boolean).join(" · ");
        info.append(mail, det);
        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.className = "btn btn-danger btn-sm";
        quitar.textContent = "Quitar";
        quitar.addEventListener("click", async () => {
          if (!confirm("¿Quitar a " + u.email + " del historial compartido?")) return;
          try {
            await Cloud.usuariosBorrar(u.email);
            toast("Usuario quitado", "ok");
            renderUsuariosConfig();
          } catch (e) {
            toast(e.message || "No se pudo quitar el usuario", "err");
          }
        });
        item.append(info, quitar);
        els.cfgUsuariosList.appendChild(item);
      });
    } catch (e) {
      console.warn("htat: no se pudo leer la lista de usuarios", e);
      els.cfgUsuariosWrap.hidden = true;
    }
  }
  els.btnCfgUsuarioAdd.addEventListener("click", async () => {
    const email = String(els.cfgUsuarioEmail.value || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast("Ingrese un email válido.", "err");
      return;
    }
    setBusy(els.btnCfgUsuarioAdd, true);
    try {
      await Cloud.usuariosAgregar(email, "");
      els.cfgUsuarioEmail.value = "";
      toast("Usuario agregado: " + email, "ok");
      await renderUsuariosConfig();
    } catch (e) {
      toast((e && e.message) || "No se pudo agregar el usuario", "err");
    } finally {
      setBusy(els.btnCfgUsuarioAdd, false);
    }
  });

  /* ---------- Instalación PWA ---------- */
  let deferredPrompt = null;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;
  /* El botón de instalar queda siempre visible (salvo que la app ya esté
     instalada o abierta standalone). Al tocarlo se ejecuta la instalación
     DIRECTA con el diálogo nativo del navegador (Android/Chrome/desktop).
     Solo en navegadores que no permiten instalación automática (ej. iPhone /
     Safari) se abre una guía breve con los pasos exactos. */
  const INSTALL_FLAG_KEY = "htat.install";
  function installFlag() { try { return localStorage.getItem(INSTALL_FLAG_KEY) || ""; } catch { return ""; } }
  function setInstallFlag(v) { try { localStorage.setItem(INSTALL_FLAG_KEY, v); } catch { /* noop */ } }
  function puedeInstalar() {
    return !isStandalone() && installFlag() !== "asked" && installFlag() !== "installed";
  }
  function actualizarBotonInstalar() {
    els.btnInstall.hidden = !puedeInstalar();
  }
  els.btnInstall.addEventListener("click", async () => {
    if (!puedeInstalar()) { actualizarBotonInstalar(); return; }
    if (deferredPrompt) {
      /* Instalación directa: se abre el diálogo nativo en el acto. */
      const p = deferredPrompt;
      deferredPrompt = null;
      try {
        p.prompt();
        const choice = await p.userChoice;
        setInstallFlag(choice && choice.outcome === "accepted" ? "asked" : "");
      } catch (e) {
        setInstallFlag("");
      }
      actualizarBotonInstalar();
      return;
    }
    /* Sin diálogo nativo disponible (ej. iOS): guía breve con los pasos. */
    els.modalInstall.hidden = false;
  });
  els.btnInstallClose.addEventListener("click", () => { els.modalInstall.hidden = true; });
  els.btnInstallDone.addEventListener("click", () => { els.modalInstall.hidden = true; });
  els.modalInstall.addEventListener("click", (e) => { if (e.target === els.modalInstall) els.modalInstall.hidden = true; });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    actualizarBotonInstalar();
  });
  window.addEventListener("appinstalled", () => {
    setInstallFlag("installed");
    actualizarBotonInstalar();
    toast("Aplicación instalada", "ok");
  });

  /* ---------- Conectividad ---------- */
  function updateOnline() {
    const on = navigator.onLine !== false;
    els.offlineBanner.hidden = on;
  }
  window.addEventListener("online", () => { updateOnline(); programarSync(); });
  window.addEventListener("offline", updateOnline);

  /* ---------- Botón atrás (Android) ----------
     Evita que "atrás" cierre la app: si hay una ventana abierta la cierra;
     si no hay ninguna abierta, el siguiente "atrás" sale de la app. */
  function modalAbierto() {
    const visibles = [
      els.modalHistory, els.modalConfig, els.modalInstall,
      els.modalNovedades, els.modalMaquinas, els.modalResumen, els.modalPreview,
    ];
    for (const m of visibles) { if (m && !m.hidden) return m; }
    return null;
  }
  /* Mientras hay una ventana abierta, se bloquea el scroll del fondo. */
  function actualizarBloqueoScroll() {
    document.body.classList.toggle("modal-open", !!modalAbierto());
  }
  const observadorModales = new MutationObserver(actualizarBloqueoScroll);
  [els.modalHistory, els.modalConfig, els.modalInstall, els.modalNovedades,
    els.modalMaquinas, els.modalResumen, els.modalPreview].forEach((m) => {
    if (m) observadorModales.observe(m, { attributes: true, attributeFilter: ["hidden"] });
  });
  window.addEventListener("popstate", () => {
    const m = modalAbierto();
    if (m) {
      m.hidden = true;
      if (m === els.modalHistory) els.histOpen = false;
      /* se vuelve a anclar un estado para que "atrás" cierre también la próxima */
      history.pushState({ htat: 1 }, null, location.href);
    }
  });
  history.pushState({ htat: 1 }, null, location.href);

  /* ---------- Recuento ---------- */
  async function refreshCount() {
    try {
      const items = await Cloud.mergedFast().catch(() => []);
      els.footCount.textContent = String(items.length);
    } catch { els.footCount.textContent = "-"; }
  }

  /* ---------- Service worker (PWA offline) ---------- */
  function registerSW() {
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("htat: SW no disponible", e));
    }
  }

  /* ---------- Inicio ---------- */
  async function init() {
    initSignature();
    bindInputs();
    Draft.clear();
    applyValues({});
    state.fotos = [];
    state.editId = null;
    renderPhotos();
    updateOnline();

    /* Puerta de acceso: sin sesión de Google la app no arranca. */
    await Auth.asegurarLogueado();

    /* Confirma el nivel (lectura/usuario/admin) contra la base y ajusta
       la interfaz a los permisos de la cuenta. */
    await aplicarModoAcceso();

    refreshCount();
    fillMaquinasDatalist();
    renderLineas();
    cargarLineas();
    registerSW();
    actualizarBotonInstalar();
    Cloud.warm(() => { refreshCount(); });   // descarga en segundo plano el historial compartido (automático)
    programarSync();                       // sube en segundo plano lo pendiente de sincronizar
    document.body.setAttribute("data-htat", "ready");
  }

  /* ---------- Aviso al recargar/cerrar con datos sin guardar ---------- */
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedData()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  init();
})();