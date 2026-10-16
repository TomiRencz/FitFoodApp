// Comprime la foto en el celu antes de mandarla: más rápido, menos datos
// y entra cómodo en el free tier de Supabase Storage.

export async function compressImage(file, maxSide = 1024, quality = 0.8) {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);

  const outUrl = canvas.toDataURL('image/jpeg', quality);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return { dataUrl: outUrl, base64: outUrl.split(',')[1], blob };
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}
