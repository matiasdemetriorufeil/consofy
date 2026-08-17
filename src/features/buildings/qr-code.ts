import "server-only";

import QRCode from "qrcode";

// Nivel de corrección de errores alto ('H', tolera hasta ~30% del código
// dañado): el administrador va a imprimir esto y pegarlo en un hall o un
// ascensor -- superficie expuesta a manchas, dobleces o un pedacito
// arrancado con cinta vieja. Con el nivel default ('M', ~15%) alcanza para
// una pantalla, no para un cartel de pasillo.
const QR_OPTIONS = {
  errorCorrectionLevel: "H",
  margin: 2,
} as const;

// Vista previa embebida en la pantalla (paso 4.6): SVG como data URL, no
// PNG. Un <img src="data:image/svg+xml..."> escala sin perder nitidez sin
// importar el zoom o el tamaño de pantalla -- para la descarga (que sí es
// para imprimir) se usa un PNG en alta resolución aparte, ver
// generateQrPngBuffer() más abajo.
export async function generateQrSvgDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { ...QR_OPTIONS, type: "svg" });
  const base64 = Buffer.from(svg, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

// PNG de descarga: 1024px de lado. El QR se imprime a tamaño de cartel de
// pasillo (no un ícono en pantalla), y un PNG de baja resolución escalado
// hacia arriba en la impresora sale borroso y deja de escanear bien desde
// lejos -- 1024px da margen para imprimirlo grande sin pixelarse.
export async function generateQrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...QR_OPTIONS, type: "png", width: 1024 });
}
