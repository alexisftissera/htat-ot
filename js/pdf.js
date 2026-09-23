/* ============================================================
   htat · Generador de PDF — Orden de Trabajo
   Reporte en A4 con membrete htat, métricas, evidencia
   fotográfica y firma. Calidad de impresión.
   ============================================================ */
"use strict";

const HTAT_PDF = (() => {
  const M = 16;                 // margen lateral
  const W = 210 - M * 2;        // ancho de contenido (márgenes simétricos)
  const TOP = 40;               // primer contenido
  const BOTTOM = 292;           // pie de página
  const CONT_BOTTOM = 288;      // límite de contenido

  const C = {
    navy: [13, 43, 69],
    navy2: [18, 60, 95],
    ink: [28, 39, 51],
    muted: [100, 116, 139],
    slate: [112, 124, 138],
    line: [219, 226, 233],
    white: [255, 255, 255],
    brand: [30, 72, 108],
    alerta: [195, 48, 48],
    alertaFondo: [253, 247, 247],
  };

  function rgb(doc, arr) { doc.setDrawColor(arr[0], arr[1], arr[2]); doc.setTextColor(arr[0], arr[1], arr[2]); }
  function fill(doc, arr) { doc.setFillColor(arr[0], arr[1], arr[2]); }
  function bold(doc, s) { doc.setFont("helvetica", "bold"); doc.setFontSize(s); }
  function normal(doc, s) { doc.setFont("helvetica", "normal"); doc.setFontSize(s); }

  /* Limpia texto no imprimible en fuente latin-1 de jsPDF */
  function clean(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/[–—]/g, "-")
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/…/g, "...")
      .replace(/≈/g, "=")
      .replace(/°/g, "")
      .replace(/[^\x20-\xFF]/g, "")
      .trim();
  }

  function drawTopBand(doc, record, first) {
    if (first) {
      fill(doc, C.navy);
      doc.rect(0, 0, 210, 26, "F");
      // logo htat
      fill(doc, C.brand);
      doc.roundedRect(M, 6, 16, 16, 4, 4, "F");
      bold(doc, 11.5);
      rgb(doc, C.white);
      doc.text("HTAT", M + 8, 16.5, { align: "center" });
      // títulos
      bold(doc, 13.5);
      doc.text("ORDEN DE TRABAJO", M + 22, 12);
      normal(doc, 8.5);
      rgb(doc, [185, 202, 219]);
      doc.text("Mantenimiento Predictivo y Preventivo de Planta", M + 22, 18);
      // chip OT
      fill(doc, C.white);
      doc.roundedRect(210 - M - 40, 8, 40, 11, 3, 3, "F");
      bold(doc, 10.5);
      rgb(doc, C.navy);
      doc.text("OT " + clean(record.ot || ""), 210 - M - 20, 16, { align: "center" });
    } else {
      fill(doc, C.navy2);
      doc.rect(0, 0, 210, 8, "F");
      normal(doc, 7.5);
      rgb(doc, [185, 202, 219]);
      doc.text("HTAT · " + CONF.appName + " — OT Nº " + clean(record.ot || ""), M, 5.5);
      doc.line(M, 8, 210 - M, 8);
    }
  }

  function sectionTitle(doc, y, title) {
    fill(doc, [228, 236, 244]);
    doc.roundedRect(M, y, W, 6.4, 1.2, 1.2, "F");
    fill(doc, C.navy);
    doc.roundedRect(M, y, 2.6, 6.4, 1, 1, "F");
    bold(doc, 9.5);
    rgb(doc, C.navy);
    doc.text(title.toUpperCase(), M + 5, y + 4.7);
    return y + 11;
  }

  /* Capitaliza cada palabra de un texto. */
  function titulo(s) {
    return String(s).toLowerCase().split(" ").map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
  }

  /* Campo con label sobre valor y corte de línea automático. Devuelve la Y final. */
  function fieldBox(doc, y, x, w, key, value) {
    bold(doc, 9);
    rgb(doc, C.navy);
    doc.text(titulo(clean(key)), x, y);
    const lines = doc.splitTextToSize((clean(value) || "—").toUpperCase(), w);
    normal(doc, 11);
    rgb(doc, C.navy);
    doc.text(lines, x, y + 6);
    return y + 6 + (lines.length - 1) * 4.2 + 3.5;
  }

  /* Fila de dos campos alineados a la misma altura (crece según el más alto). */
  function row2(doc, y, lk, lv, rk, rv) {
    const y0 = y;
    const colW = (W - 6) / 2;
    const hL = fieldBox(doc, y0, M, colW, lk, lv) - y0;
    const hR = fieldBox(doc, y0, M + colW + 6, colW, rk, rv) - y0;
    return y0 + Math.max(hL, hR);
  }

  /* Campo a ancho completo. */
  function rowFull(doc, y, key, value) {
    return fieldBox(doc, y, M, W, key, value);
  }

  /* ---- Medición de imágenes ---- */
  function measure(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = url;
    });
  }

  function fit(w, h, maxW, maxH) {
    const r = Math.min(maxW / w, maxH / h, 1);
    return { w: w * r, h: h * r };
  }

  async function build(record) {
    const JsPDF = (typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF) ||
                  (typeof jsPDF !== "undefined" ? jsPDF : null);
    if (!JsPDF) throw new Error("La librería jsPDF no se cargó correctamente.");
    const doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
    doc.setLineCap("round");
    doc.setLineJoin("round");

    let y = TOP;
    drawTopBand(doc, record, true);

    // franja de referencia documental
    normal(doc, 7.5);
    rgb(doc, C.muted);
    doc.text("DOCUMENTO TECNICO DE MANTENIMIENTO", M, 34.5);
    doc.text("Generado: " + Fmt.pretty(new Date().toISOString(), false) + " " + Fmt.hora(new Date().toISOString()),
      210 - M, 34.5, { align: "right" });
    doc.setLineWidth(0.4);
    rgb(doc, C.slate);
    doc.line(M, 37.5, 210 - M, 37.5);

    const ensure = (h) => {
      if (y + h > CONT_BOTTOM) {
        doc.addPage();
        drawTopBand(doc, record, false);
        y = 18;
      }
    };

    /* ---------- 1) Datos de la OT ---------- */
    y = sectionTitle(doc, y, "Datos de la Orden de Trabajo");
    ensure(42);
    y = row2(doc, y, "Fecha de trabajo", Fmt.pretty(record.fechaEmision || ""), "Línea", record.linea || "");
    ensure(10);
    y += 5;
    y = row2(doc, y, "Activo / Máquina", record.activo || "", "Novedad", record.novedad ? "CON NOVEDAD" : "SIN NOVEDAD");
    ensure(10);
    y += 5;
    if (record.novedad) {
      ensure(22);
      fill(doc, C.alertaFondo);
      doc.roundedRect(M, y, W, 16, 2.5, 2.5, "F");
      rgb(doc, C.alerta);
      doc.setLineWidth(0.6);
      doc.roundedRect(M, y, W, 16, 2.5, 2.5, "S");
      fill(doc, C.alerta);
      doc.rect(M, y, 1.4, 16, "F");
      bold(doc, 9.5);
      rgb(doc, C.alerta);
      doc.text("ATENCION - MAQUINA CON NOVEDAD", M + 5, y + 6);
      normal(doc, 8.5);
      rgb(doc, C.ink);
      doc.text("Esta maquina quedo registrada con novedad. Realizar el seguimiento necesario y", M + 5, y + 11);
      doc.text("registrar la correccion en la proxima orden de trabajo.", M + 5, y + 15);
      y += 16 + 8;
    } else {
      y += 9;
    }

    /* ---------- 2) Plan ---------- */
    y = sectionTitle(doc, y, "Tipo de Plan y Tareas");
    ensure(42);
    y = row2(doc, y, "Tipo de plan", record.tipoPlan || "", "Tarea específica", record.tareaEspecifica || "");
    ensure(10);
    y += 5;
    y = rowFull(doc, y, "Parte / Sistema", record.parteSistema || "");
    y += 9;

    /* ---------- 3) Métricas ---------- */
    y = sectionTitle(doc, y, "Métricas Operativas del Equipo");
    ensure(22);
    const boxW = (W - 8) / 2;
    const drawMetric = (x, label, valor, unidad) => {
      fill(doc, [248, 250, 252]);
      doc.roundedRect(x, y, boxW, 15, 3, 3, "F");
      fill(doc, C.brand);
      doc.rect(x, y, 1.4, 15, "F");
      rgb(doc, C.slate);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, boxW, 15, 3, 3, "S");
      normal(doc, 6.8);
      rgb(doc, C.muted);
      doc.text(clean(label).toUpperCase(), x + 5, y + 4.6);
      bold(doc, 12);
      rgb(doc, C.navy);
      doc.text((clean(valor) || "—") + "  " + clean(unidad || ""), x + 5, y + 11.5);
    };
    drawMetric(M, "Consumo de Energía", record.consumoEnergia && record.consumoEnergia.valor, record.consumoEnergia && record.consumoEnergia.unidad);
    drawMetric(M + boxW + 8, "Presión de Gas", record.presionGas && record.presionGas.valor, record.presionGas && record.presionGas.unidad);
    y += 15 + 6;

    /* ---------- 4) Observaciones ---------- */
    y = sectionTitle(doc, y, "Observaciones");
    const obsLines = doc.splitTextToSize(clean(record.observaciones) || "—", W - 10);
    const obsH = Math.max(12, obsLines.length * 3.8 + 7);
    ensure(obsH + 3);
    fill(doc, [248, 250, 252]);
    doc.roundedRect(M, y, W, obsH, 3, 3, "F");
    rgb(doc, C.slate);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, W, obsH, 3, 3, "S");
    normal(doc, 9.5);
    rgb(doc, C.ink);
    doc.text(obsLines, M + 5, y + 6);
    y += obsH + 6;

    /* ---------- 5) Evidencia fotográfica ---------- */
    const fotos = record.fotos || [];
    y = sectionTitle(doc, y, "Evidencia Fotográfica");
    if (fotos.length) {
      const cw = (W - 6) / 2;
      const ch = 58;
      for (let i = 0; i < fotos.length; i += 2) {
        const ultimaSola = i + 1 === fotos.length;
        const nCeldas = ultimaSola ? 1 : 2;
        ensure(ch + 6);
        for (let ci = 0; ci < nCeldas; ci++) {
          const x = ultimaSola ? M + (W - cw) / 2 : M + ci * (cw + 6);
          fill(doc, [248, 250, 252]);
          doc.roundedRect(x, y, cw, ch, 3, 3, "F");
          rgb(doc, C.slate);
          doc.setLineWidth(0.4);
          doc.roundedRect(x, y, cw, ch, 3, 3, "S");
        }
        for (let ci = 0; ci < nCeldas; ci++) {
          const x = ultimaSola ? M + (W - cw) / 2 : M + ci * (cw + 6);
          const dim = await measure(fotos[i + ci].dataUrl);
          const f = fit(dim.w, dim.h, cw - 6, ch - 12);
          doc.addImage(fotos[i + ci].dataUrl, "JPEG", x + (cw - f.w) / 2, y + (ch - f.h) / 2, f.w, f.h);
          normal(doc, 6.8);
          rgb(doc, C.muted);
          doc.text("Foto " + (i + ci + 1), x + 4, y + ch - 2.5);
        }
        y += ch + 6;
      }
    } else {
      /* La OT no trae imágenes (p. ej. llegada desde el historial compartido,
         que no guarda fotos): se aclara en el impreso. */
      ensure(22);
      fill(doc, [248, 250, 252]);
      doc.roundedRect(M, y, W, 16, 3, 3, "F");
      rgb(doc, C.slate);
      doc.setLineWidth(0.4);
      doc.roundedRect(M, y, W, 16, 3, 3, "S");
      normal(doc, 8.5);
      rgb(doc, C.muted);
      doc.text("Sin evidencia fotográfica adjunta.", 105, y + 10.5, { align: "center" });
      y += 16 + 6;
    }

    /* ---------- 6) Firma Digital + nota al pie: ancladas al fondo de la última página ---------- */
    const nota =
      "Documento generado desde la aplicación " + CONF.appName + ". La evidencia fotográfica corresponde al " +
      "estado del equipo en el momento de la intervención.";
    const notaLines = doc.splitTextToSize(nota, W);
    const notaH = notaLines.length * 3.5;
    const sigNombre = (record.firma && record.firma.nombre) || "";
    const sigFecha = Fmt.pretty((record.firma && record.firma.fecha) || "");
    const colW = (W - 6) / 2;
    const nL = doc.splitTextToSize(clean(sigNombre) || "—", colW).length;
    const dL = doc.splitTextToSize(clean(sigFecha) || "—", colW).length;
    const sigRowH = 6 + (Math.max(nL, dL) - 1) * 4.2 + 3.5;
    const sigBlockH = 11 + 34 + 6 + sigRowH + 5;
    const totalBlockH = sigBlockH + notaH + 3;
    if (y + totalBlockH > CONT_BOTTOM) {
      doc.addPage();
      drawTopBand(doc, record, false);
      y = 18;
    }
    y = CONT_BOTTOM - totalBlockH;
    y = sectionTitle(doc, y, "Firma Digital");
    fill(doc, [255, 255, 255]);
    doc.roundedRect(M, y, W, 34, 3, 3, "F");
    rgb(doc, C.slate);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, W, 34, 3, 3, "S");
    if (record.firma && record.firma.dataUrl) {
      const dim = await measure(record.firma.dataUrl);
      const f = fit(dim.w, dim.h, 150, 28);
      doc.addImage(record.firma.dataUrl, "PNG", M + (W - f.w) / 2, y + (34 - f.h) / 2, f.w, f.h);
    } else {
      normal(doc, 8);
      rgb(doc, C.muted);
      doc.text("Sin firma registrada", 105, y + 17, { align: "center" });
    }
    y += 34 + 6;
    y = row2(doc, y, "Aclaración de firma", sigNombre, "Fecha de la firma", sigFecha);
    y += 5;

    /* ---------- Nota final: debajo del apartado de firma ---------- */
    normal(doc, 7.2);
    rgb(doc, C.muted);
    doc.text(notaLines, M, y);
    y += notaLines.length * 3.5 + 4;

    /* ---------- Pie de página en todas las páginas ---------- */
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      rgb(doc, C.slate);
      doc.setLineWidth(0.3);
      doc.line(M, BOTTOM - 5, 210 - M, BOTTOM - 5);
      normal(doc, 7);
      rgb(doc, C.muted);
      doc.text(CONF.appName + " · Orden de Trabajo · Generado " + Fmt.nowLong(), M, BOTTOM - 1.5);
      doc.text("Página " + p + " de " + total, 210 - M, BOTTOM - 1.5, { align: "right" });
    }

    return doc;
  }

  return { build };
})();