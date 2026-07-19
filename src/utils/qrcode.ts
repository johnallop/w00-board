import qrcode from 'qrcode-generator';

/**
 * Génère un QR Code au format SVG de manière locale et déterministe.
 * 
 * @param text Le texte/URL à encoder.
 * @param size Taille minimale souhaitée en pixels (défaut: 180).
 * @returns Une chaîne contenant le tag SVG complet.
 */
export function generateQrCodeSvg(text: string, size = 180): string {
  // Mode de détection automatique de version (0)
  // Niveau de correction M (15% de restauration, idéal pour les QR affichés)
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const modules = qr.getModuleCount();
  const margin = 2; // Marge externe de 2 modules
  const cellSize = Math.max(1, Math.round(size / (modules + margin * 2)));

  // Retourne le tag SVG brut
  return qr.createSvgTag(cellSize, margin);
}
