import { Invoice, ShopProfile, BillingSettings, PrintSettings } from '../types';
import { openWhatsAppReceipt } from './print';
import { generateInvoicePdfBlob, generateInvoiceImageBlob } from './receiptMediaGenerator';

export interface WhatsAppDispatchOptions {
  invoice: Invoice;
  shop: ShopProfile;
  settings?: BillingSettings;
  printSettings?: PrintSettings;
  onToast?: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

/**
 * Dispatches an invoice via WhatsApp based on the user's preferred format:
 * - 'text' : Standard itemized text summary directly in customer chat via wa.me URL
 * - 'pdf'  : High-resolution official PDF document (A5 or 80mm) via Web Share API or download+chat
 * - 'image': Crisp receipt PNG snapshot via Web Share API or clipboard/download+chat
 */
export async function dispatchWhatsAppReceipt({
  invoice,
  shop,
  settings,
  printSettings,
  onToast
}: WhatsAppDispatchOptions): Promise<{ success: boolean; method: 'text' | 'share_api' | 'download_chat'; error?: string }> {
  const cleanPhone = (invoice.customerMobile || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    onToast?.('info', 'Missing Mobile Number', 'Please enter a valid 10-digit customer mobile number to send via WhatsApp.');
    return { success: false, method: 'text', error: 'invalid_mobile' };
  }

  const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const format = settings?.whatsappFormat || 'text';
  const pdfStyle = settings?.whatsappPdfStyle || 'a5';

  // 1. Text Message Format (Instant URL launch)
  if (format === 'text') {
    openWhatsAppReceipt(invoice, shop);
    onToast?.('success', `Bill #${invoice.invoiceNumber} Ready!`, 'WhatsApp opened with bill text.');
    return { success: true, method: 'text' };
  }

  // 2. Binary Format (PDF or Image)
  const isPdf = format === 'pdf';
  const fileTypeLabel = isPdf ? 'PDF Invoice' : 'Receipt Image';

  try {
    onToast?.('info', `Preparing ${fileTypeLabel}...`, 'Generating receipt file...');

    const fileBlob = isPdf
      ? await generateInvoicePdfBlob(invoice, shop, pdfStyle, printSettings)
      : await generateInvoiceImageBlob(invoice, shop, pdfStyle, printSettings);

    const safeInvNo = (invoice.invoiceNumber || 'BILL').replace(/[^a-zA-Z0-9-_]/g, '_');
    const ext = isPdf ? 'pdf' : 'png';
    const mimeType = isPdf ? 'application/pdf' : 'image/png';
    const fileName = `Invoice_${safeInvNo}.${ext}`;
    const file = new File([fileBlob], fileName, { type: mimeType });

    // Method A: Mobile Web Share API Level 2 (files sharing)
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${shop.shopName || 'Invoice'} #${invoice.invoiceNumber}`,
          text: `Tax Invoice #${invoice.invoiceNumber} from ${shop.shopName || 'Retail Shop'}. Net Total: ₹${invoice.netPayable.toFixed(2)}`
        });
        onToast?.('success', `${fileTypeLabel} Shared!`, `Receipt file sent to ${invoice.customerName || 'customer'}.`);
        return { success: true, method: 'share_api' };
      } catch (shareErr: any) {
        if (shareErr.name === 'AbortError') {
          // User cancelled the share dialog
          return { success: true, method: 'share_api' };
        }
        console.warn('[WhatsApp Dispatch] Native share failed, using fallback:', shareErr);
      }
    }

    // Method B: Desktop / Browser Fallback (Automatic file download + open WhatsApp chat)
    const fileUrl = URL.createObjectURL(fileBlob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(fileUrl), 10000);

    // If Image format, also copy to clipboard for 1-click Ctrl+V in WhatsApp Web
    if (!isPdf && typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': fileBlob })]);
      } catch (clipErr) {
        console.debug('Clipboard write skipped:', clipErr);
      }
    }

    // Open WhatsApp Web directly to customer's chat
    const customerGreeting = invoice.customerName && invoice.customerName.toLowerCase() !== 'cash customer'
      ? `Dear ${invoice.customerName}`
      : 'Dear Customer';

    const accompanyingMessage = isPdf
      ? `${customerGreeting}, please find attached your Tax Invoice #${invoice.invoiceNumber} from ${shop.shopName || 'our shop'}.\nTotal Amount: ₹${invoice.netPayable.toFixed(2)}\nThank you for shopping with us! 🙏`
      : `${customerGreeting}, here is your receipt for Bill #${invoice.invoiceNumber} from ${shop.shopName || 'our shop'}.\nTotal Amount: ₹${invoice.netPayable.toFixed(2)}\nThank you! 🙏`;

    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(accompanyingMessage)}`;
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank');
    }

    onToast?.(
      'info',
      `${fileTypeLabel} Downloaded`,
      isPdf
        ? 'PDF downloaded! Attach it in the opened WhatsApp chat to send.'
        : 'Image downloaded (and copied to clipboard)! Paste (Ctrl+V) or attach in WhatsApp.'
    );

    return { success: true, method: 'download_chat' };
  } catch (err: any) {
    console.error('[WhatsApp Dispatch] Error generating or sharing receipt:', err);
    // Graceful fallback to text message if PDF rendering fails
    openWhatsAppReceipt(invoice, shop);
    onToast?.(
      'info',
      'Sent as Text',
      'Could not generate PDF file; dispatched text bill summary via WhatsApp.'
    );
    return { success: false, method: 'text', error: err?.message };
  }
}
