import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Invoice, ShopProfile, PrintSettings, WhatsAppPdfStyle } from '../types';
import { generateA5ReceiptHtml, generate80mmReceiptHtml } from './print';

/**
 * Renders an isolated HTML document string into an HTML5 Canvas using html2canvas.
 * Strips script tags to prevent auto-print dialog triggers.
 */
async function renderHtmlToCanvas(html: string, targetWidthPx: number): Promise<HTMLCanvasElement> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-12000px';
  container.style.top = '0';
  container.style.width = `${targetWidthPx}px`;
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '-9999';
  container.style.overflow = 'visible';
  container.setAttribute('aria-hidden', 'true');

  // Strip auto-print scripts
  const sanitizedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  container.innerHTML = sanitizedHtml;
  document.body.appendChild(container);

  try {
    // Small delay to allow CSS & fonts to settle
    await new Promise((resolve) => setTimeout(resolve, 120));

    const canvas = await html2canvas(container, {
      scale: 2, // 2x retina sharpness for thermal and A5 text
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: targetWidthPx
    });
    return canvas;
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Generates an official PDF Blob from an invoice and shop profile.
 * Supports A5 portrait (ISO 216) and 80mm thermal roll formats.
 */
export async function generateInvoicePdfBlob(
  invoice: Invoice,
  shop: ShopProfile,
  style: WhatsAppPdfStyle = 'a5',
  printSettings?: PrintSettings
): Promise<Blob> {
  const isA5 = style === 'a5';
  const html = isA5
    ? generateA5ReceiptHtml(invoice, shop, printSettings)
    : generate80mmReceiptHtml(invoice, shop, printSettings);

  const targetWidthPx = isA5 ? 620 : 380;
  const canvas = await renderHtmlToCanvas(html, targetWidthPx);

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdfWidthMm = isA5 ? 148 : 80;
  const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isA5 ? 'a5' : [pdfWidthMm, Math.max(80, pdfHeightMm)]
  });

  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
  return pdf.output('blob');
}

/**
 * Generates a high-resolution PNG image Blob of the receipt.
 */
export async function generateInvoiceImageBlob(
  invoice: Invoice,
  shop: ShopProfile,
  style: WhatsAppPdfStyle = 'a5',
  printSettings?: PrintSettings
): Promise<Blob> {
  const isA5 = style === 'a5';
  const html = isA5
    ? generateA5ReceiptHtml(invoice, shop, printSettings)
    : generate80mmReceiptHtml(invoice, shop, printSettings);

  const targetWidthPx = isA5 ? 620 : 380;
  const canvas = await renderHtmlToCanvas(html, targetWidthPx);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert receipt canvas to PNG blob'));
    }, 'image/png', 0.95);
  });
}

