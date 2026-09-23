/* ============================================================
   htat · Firma Digital (panel táctil sobre canvas)
   Dibuja con mouse, dedo o stylus usando Pointer Events;
   exporta PNG con fondo blanco para el reporte PDF.
   ============================================================ */
"use strict";

class SignaturePad {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.color = opts.color || "#15243a";
    this.lineWidth = opts.lineWidth || 2.6;
    this.lineCap = "round";
    this.lineJoin = "round";
    this._drawing = false;
    this._isEmpty = true;

    this._resize = this._resize.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onLeave = this._onLeave.bind(this);

    window.addEventListener("resize", this._resize);
    canvas.addEventListener("pointerdown", this._onDown);
    canvas.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    canvas.addEventListener("pointercancel", this._onUp);
    canvas.addEventListener("pointerleave", this._onLeave);

    // Garantía para navegadores sin Pointer Events completos
    if (!window.PointerEvent) {
      canvas.addEventListener("mousedown", this._onDown);
      canvas.addEventListener("mousemove", this._onMove);
      window.addEventListener("mouseup", this._onUp);
      canvas.addEventListener("touchstart", this._onDownT, { passive: false });
      canvas.addEventListener("touchmove", this._onMoveT, { passive: false });
      window.addEventListener("touchend", this._onUpT);
    }

    this.clear();
    requestAnimationFrame(() => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width === w && this.canvas.height === h) {
      this._redrawStored();
      return;
    }
    const stored = this._drawing ? null : this.isEmpty() ? null : this.toDataURL();
    this.canvas.width = w;
    this.canvas.height = h;
    this._scale = dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, w, h);
    if (stored) {
      const img = new Image();
      img.onload = () => this.ctx.drawImage(img, 0, 0, w, h);
      img.src = stored;
    } else {
      this._isEmpty = true;
    }
  }

  _redrawStored() {
    const stored = this.toDataURL();
    if (!stored) return;
    const img = new Image();
    img.onload = () => {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    };
    img.src = stored;
  }

  _pos(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (ev.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  _onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this._drawing = true;
    if (typeof this.canvas.setPointerCapture === "function") {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    const p = this._pos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.canvas.dispatchEvent(new CustomEvent("sigstart"));
  }

  _onMove(e) {
    if (!this._drawing) return;
    e.preventDefault && e.preventDefault();
    const p = this._pos(e);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = this.lineCap;
    this.ctx.lineJoin = this.lineJoin;
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this._isEmpty = false;
  }

  _onUp() {
    if (this._drawing) {
      this._drawing = false;
      this.canvas.dispatchEvent(new CustomEvent("sigend"));
    }
  }

  _onLeave(e) {
    if (this._drawing && e.pointerType === "mouse") this._drawing = false;
  }

  /* Fallbacks táctiles sin Pointer Events */
  _touchPos(ev) {
    const t = ev.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (t.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (t.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }
  _onDownT(e) {
    e.preventDefault();
    this._drawing = true;
    const p = this._touchPos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
  }
  _onMoveT(e) {
    e.preventDefault();
    if (!this._drawing) return;
    const p = this._touchPos(e);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this._isEmpty = false;
  }
  _onUpT() {
    if (this._drawing) { this._drawing = false; this.canvas.dispatchEvent(new CustomEvent("sigend")); }
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, this.canvas.width || 1, this.canvas.height || 1);
    this._isEmpty = true;
    this._drawing = false;
    this.canvas.dispatchEvent(new CustomEvent("sigclear"));
  }

  isEmpty() { return this._isEmpty; }

  restore(dataUrl) {
    if (!dataUrl) { this.clear(); return; }
    const img = new Image();
    img.onload = () => {
      const w = this.canvas.width, h = this.canvas.height;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, w, h);
      // Dibujar cubriendo el área sin distorsión
      const r = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
      this.ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      this._isEmpty = false;
      this.canvas.dispatchEvent(new CustomEvent("sigrestore"));
    };
    img.src = dataUrl;
  }

  toDataURL() {
    if (this.isEmpty()) return null;
    return this.canvas.toDataURL("image/png");
  }
}