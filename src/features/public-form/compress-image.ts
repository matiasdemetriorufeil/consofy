// Compresión de imágenes en el cliente ANTES de subir (paso 5.4) -- Canvas
// nativo del navegador, sin librería nueva (createImageBitmap + <canvas> +
// toBlob ya alcanzan, ver CLAUDE.md > Qué NO hacer: "no instalar
// dependencias nuevas sin avisar").
//
// Por qué es crítico: el free tier de Supabase Storage son 1 GB en total
// (dato del enunciado), y una foto de un celular moderno pesa entre 3 y
// 8 MB. Sin comprimir, ~150 reclamos con dos fotos cada uno llenarían la
// cuota entera -- un número real de reclamos para un consorcio en pocos
// meses, no un caso extremo.

// 1600px de lado más largo: encontrado por prueba real (ver el reporte de
// este paso, con una mancha de humedad y una factura sintéticas) -- por
// debajo de esto el texto chico de una factura empieza a perder nitidez;
// por encima, el tamaño de archivo crece sin que se note diferencia real
// en una pantalla de celular (que rara vez supera los ~1200px de ancho
// lógico). 1600px deja margen para hacer zoom moderado sin pixelarse.
export const COMPRESSION_MAX_DIMENSION = 1600;

// Calidad JPEG 0.75: probado contra 0.6 (se veía "lavado", los bordes de
// la mancha perdían definición) y 0.9 (casi el doble de bytes sin mejora
// visible perceptible en pantalla). 0.75 es el punto medio real, no un
// valor de manual -- ver comparación en el reporte.
export const COMPRESSION_JPEG_QUALITY = 0.75;

export class AttachmentUploadError extends Error {}

// Comprime UN archivo de imagen a JPEG, redimensionado al máximo de
// COMPRESSION_MAX_DIMENSION en su lado más largo. Reencodea SIEMPRE a JPEG
// (incluso si el original ya era JPEG) -- es el formato que mejor
// comprime fotos reales (a diferencia de PNG, sin pérdida y mucho más
// pesado para este tipo de contenido); un PNG de entrada (poco común
// viniendo de una cámara, pero posible) también se beneficia de este
// reencodeo.
//
// createImageBitmap()/.close() explícito, no <img> + URL.createObjectURL:
// un ImageBitmap se puede liberar de memoria de inmediato después de
// dibujarlo en el canvas, ANTES de procesar la siguiente foto de la cola --
// importante en el caso "celular viejo con poca memoria" (ver el reporte):
// procesar una foto a la vez, liberando cada bitmap apenas se usa, evita
// que 5 fotos de 12 MP cada una (~150 MB sin comprimir cada una, ya
// decodificadas a RGBA en memoria) queden todas cargadas al mismo tiempo.
export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AttachmentUploadError(
      "No pudimos abrir esa imagen. Probá con otra foto.",
    );
  }

  try {
    const scale = Math.min(
      1,
      COMPRESSION_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new AttachmentUploadError(
        "Tu navegador no puede procesar imágenes acá.",
      );
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", COMPRESSION_JPEG_QUALITY),
    );
    if (!blob) {
      throw new AttachmentUploadError("No pudimos comprimir esa imagen.");
    }

    // Salvaguarda: si por algún motivo la versión "comprimida" salió más
    // pesada que el original (puede pasar con una imagen ya muy chica o ya
    // muy comprimida de antes), se sube el original tal cual -- comprimir
    // nunca debería dejar un archivo más pesado que el que el vecino
    // seleccionó.
    return blob.size < file.size ? blob : file;
  } finally {
    bitmap.close();
  }
}
