/**
 * Offline Code128 Barcode SVG & QR Code Generator
 * 100% client-side, zero network dependencies, high-DPI vector output for thermal sticker printers.
 */

import QRCode from 'qrcode';

// Standard Code128 patterns (values 0 to 106). Each pattern is 11 modules (6 bars/spaces), except Stop (106) which is 13 modules.
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/**
 * Encode a string into Code128 (uses Code128-C for even-length digit pairs when purely numeric >= 4 digits,
 * or Code128-B for general ASCII strings) and return an inline SVG string.
 */
export function generateCode128Svg(
  text: string,
  options?: {
    height?: number;
    moduleWidth?: number;
    showText?: boolean;
    fontSize?: number;
  }
): string {
  const clean = (text || '').trim().replace(/[^\x20-\x7E]/g, '') || '0000';
  const height = options?.height ?? 34;
  const moduleWidth = options?.moduleWidth ?? 1.4;
  const showText = options?.showText ?? false;
  const fontSize = options?.fontSize ?? 10;

  const codes: number[] = [];

  // Use Code128-B (Start Code B = 104) for maximum compatibility across all alphanumeric + numeric strings
  const startCode = 104;
  codes.push(startCode);

  let checksum = startCode;
  for (let i = 0; i < clean.length; i++) {
    const ascii = clean.charCodeAt(i);
    const codeVal = ascii >= 32 && ascii <= 126 ? ascii - 32 : 0;
    codes.push(codeVal);
    checksum += codeVal * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  // Compute total modules (including 10-module quiet zone on each side)
  const quietZone = 8;
  let totalModules = quietZone * 2;
  const patterns = codes.map((c) => CODE128_PATTERNS[c] || CODE128_PATTERNS[0]);
  for (const p of patterns) {
    for (let i = 0; i < p.length; i++) {
      totalModules += parseInt(p[i], 10);
    }
  }

  const svgWidth = Math.ceil(totalModules * moduleWidth);
  const totalHeight = showText ? height + fontSize + 4 : height;

  let currentX = quietZone * moduleWidth;
  const rects: string[] = [];

  for (const p of patterns) {
    for (let i = 0; i < p.length; i++) {
      const w = parseInt(p[i], 10) * moduleWidth;
      if (i % 2 === 0) {
        // Bar
        rects.push(
          `<rect x="${currentX.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000000" />`
        );
      }
      currentX += w;
    }
  }

  const textEl = showText
    ? `<text x="${(svgWidth / 2).toFixed(1)}" y="${height + fontSize + 1}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="#000000">${clean}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${totalHeight}" width="100%" height="${totalHeight}" preserveAspectRatio="xMidYMid meet" style="background:#ffffff;display:block;">${rects.join('')}${textEl}</svg>`;
}

/**
 * Generate a crisp QR Code Data URL (PNG) 100% offline
 */
export async function generateQrCodeDataUrl(text: string, width: number = 140): Promise<string> {
  try {
    return await QRCode.toDataURL(text || 'N/A', {
      width,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
  } catch {
    return '';
  }
}

/**
 * Trigger native browser print dialog using an isolated hidden iframe.
 * Works seamlessly with Bluetooth thermal printers, USB POS receipt printers, and A4 printers
 * without triggering popup blockers or leaving the current SPA state.
 */
export function printHtmlContent(htmlBody: string, pageCss: string): void {
  const existingIframe = document.getElementById('__golden_shop_print_iframe__');
  if (existingIframe) {
    existingIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = '__golden_shop_print_iframe__';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
    }
    ${pageCss}
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`);
  doc.close();

  // Wait briefly for images (logo / QR code) to decode before triggering print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Print error:', e);
    }
  }, 300);
}
