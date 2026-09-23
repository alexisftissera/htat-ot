/* ============================================================
   htat · Evidencia fotográfica
   Lectura, orientación correcta, redimensionado y compresión
   a JPEG para ocupar poco espacio en IndexedDB.
   ============================================================ */
"use strict";

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/* Corrige orientación EXIF usando createImageBitmap cuando está disponible. */
function decodeOriented(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file, {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
    }).catch(() => loadImageFromFile(file));
  }
  return loadImageFromFile(file);
}

/* Redimensiona y convierte a JPEG (dataURL). Optimizado para caber en DB. */
async function compressImage(source, maxPx, quality, maxBytes) {
  let img = source;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    img = source;
  }
  let { width: w, height: h } = img;
  const ratio = Math.min(1, maxPx / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * ratio));
  const nh = Math.max(1, Math.round(h * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, nw, nh);
  ctx.drawImage(img, 0, 0, nw, nh);

  // Reducción progresiva de calidad si el archivo resultante es muy grande.
  let q = quality;
  let url = canvas.toDataURL("image/jpeg", q);
  if (maxBytes && url.length > maxBytes && q > 0.3) {
    for (let i = 0; i < 3; i++) {
      q = Math.max(0.3, q - 0.12);
      const next = canvas.toDataURL("image/jpeg", q);
      if (next.length <= maxBytes) { url = next; break; }
      url = next;
    }
  }
  return url;
}

async function fileToPhoto(file, index) {
  const decoded = await decodeOriented(file);
  const dataUrl = await compressImage(
    decoded,
    CONF.limits.maxFotoPx,
    CONF.limits.fotoCalidad,
    900 * 1024 // ~900 KB tope por foto
  );
  if ("close" in decoded && typeof decoded.close === "function") decoded.close();
  return {
    id: StoreUtils.nextId(),
    nombre: file.name || "foto-" + (index + 1),
    dataUrl,
    peso: Math.round(file.size / 1024),
  };
}

const Photos = {
  async addFromFiles(files, currentCount) {
    const max = CONF.limits.maxFotos;
    const room = max - currentCount;
    if (room <= 0) throw new Error("Límite de " + max + " fotos alcanzado. Quite alguna para agregar otra.");
    const list = Array.from(files).slice(0, room);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const photo = await fileToPhoto(list[i], i);
        out.push(photo);
      } catch (e) {
        console.warn("htat: no se pudo procesar la foto", list[i].name, e);
      }
    }
    if (out.length < list.length && out.length === 0) {
      throw new Error("No se pudieron procesar las imágenes seleccionadas.");
    }
    return out;
  },
};