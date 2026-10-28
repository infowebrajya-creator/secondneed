import { Invoice, ShopProfile, PrintSettings } from '../types';
import { numberToWordsIndian } from '../utils/numberToWords';
import { printInvoiceSilentUsb, isUsbPrinterConnected } from './usbPrinter';
import { printInvoiceSilentBluetooth, isBluetoothPrinterConnected } from './bluetoothPrinter';

export { numberToWordsIndian };

function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return dateStr;
}

export async function triggerInvoicePrint(invoice: Invoice, shop: ShopProfile, printSettings?: PrintSettings) {
  if (printSettings?.paperSize === '58mm') {
    return await trigger58mmPrint(invoice, shop, printSettings);
  }
  if (printSettings?.paperSize === '80mm' || printSettings?.paperSize === 'Thermal') {
    return await trigger80mmPrint(invoice, shop, printSettings);
  }
  return triggerA5Print(invoice, shop, printSettings);
}

export function triggerA5Print(invoice: Invoice, shop: ShopProfile, printSettings?: PrintSettings) {
  if (printSettings?.paperSize === '58mm') {
    return trigger58mmPrint(invoice, shop, printSettings);
  }
  if (printSettings?.paperSize === '80mm' || printSettings?.paperSize === 'Thermal') {
    return trigger80mmPrint(invoice, shop, printSettings);
  }
  const isGstInvoice = invoice.invoiceType === 'gst';
  const isQuotation = invoice.invoiceType === 'quotation';
  const docTitle = isQuotation ? 'QUOTATION / PROFORMA' : isGstInvoice ? 'TAX INVOICE' : 'CREDIT ESTIMATE';
  const docNoLabel = isQuotation ? 'Quotation No.' : isGstInvoice ? 'Invoice No.' : 'Estimate No.';
  const formattedDate = formatDateDDMMYYYY(invoice.date);

  const isA4 = printSettings?.paperSize === 'A4';
  const items = invoice.items || [];
  const minRows = isA4 ? 32 : 24;
  const paddingRowsCount = Math.max(0, minRows - items.length);

  const itemsHtml = items.map((item, index) => {
    const remarkText = item.remark || item.pack || (item.hsnCode ? `HSN:${item.hsnCode}` : '');
    const itemTotal = item.totalAmount || (item.unitRate * item.qty * (1 - (item.discountPct || 0) / 100));
    return `
      <tr class="item-row">
        <td style="text-align: center; border-right: 1px solid #000; font-family: monospace;">${index + 1}</td>
        <td style="border-right: 1px solid #000; padding: 1px 3px; font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.productName}</td>
        <td style="text-align: center; border-right: 1px solid #000; font-size: 7.5px; text-transform: uppercase;">${remarkText || ''}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding-right: 2px; font-family: monospace;">${item.qty.toFixed(2)}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding-right: 2px; font-family: monospace;">${(item.freeQty || 0).toFixed(2)}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding-right: 2px; font-family: monospace;">${item.unitRate.toFixed(2)}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding-right: 2px; font-family: monospace;">${item.mrp.toFixed(2)}</td>
        <td style="text-align: right; border-right: 1px solid #000; padding-right: 2px; font-family: monospace;">${(item.discountPct || 0).toFixed(2)}</td>
        <td style="text-align: right; padding-right: 3px; font-family: monospace; font-weight: 700;">${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const paddingHtml = Array.from({ length: paddingRowsCount }).map(() => `
    <tr class="item-row pad-row">
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td style="border-right: 1px solid #000;">&nbsp;</td>
      <td>&nbsp;</td>
    </tr>
  `).join('');

  const termsList = shop.termsAndConditions
    ? shop.termsAndConditions.split('\n').filter(t => t.trim() !== '')
    : ['Goods once sold will not be taken back or exchanged.', 'All disputes subject to Jurisdiction only.'];

  const grossSubtotal = invoice.subtotal + (invoice.totalDiscount || 0);

  // Determine header party text
  const isPartyGiven = invoice.customerName && invoice.customerName.trim().toLowerCase() !== 'cash customer';
  const partyLine1 = isPartyGiven ? `M/s ${invoice.customerName.trim().toUpperCase()}` : `M/s ${shop.shopName || 'Retail Store'}`;
  const partyLine2 = isPartyGiven
    ? (invoice.customerAddress ? invoice.customerAddress.trim().toUpperCase() : '')
    : (shop.address || '');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${docTitle} - ${invoice.invoiceNumber}</title>
        <style>
          @page {
            size: ${isA4 ? 'A4 portrait' : 'A5 portrait'};
            margin: ${isA4 ? '5mm 6mm 4mm 6mm' : '3mm 4mm 2mm 4mm'};
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff;
            color: #000000;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: ${isA4 ? '10.5px' : '8.5px'};
            line-height: 1.15;
            -webkit-font-smoothing: antialiased;
          }
          .outer-frame {
            border: 1px solid #000000;
            width: ${isA4 ? '198mm' : '140mm'};
            height: ${isA4 ? '285mm' : '202mm'};
            max-height: ${isA4 ? '285mm' : '202mm'};
            box-sizing: border-box;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            page-break-inside: avoid;
            background: #ffffff;
          }
          
          /* 1. TOP HEADER (EXACT MARG 3-COLUMN COMPACT LAYOUT) */
          .header-block {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 3px 5px 2px 5px;
            border-bottom: 1px solid #000000;
            flex-shrink: 0;
            font-family: Arial, sans-serif;
          }
          .header-left {
            width: 42%;
            line-height: 1.2;
          }
          .header-left .party-title {
            font-weight: 800;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.2px;
          }
          .header-left .party-sub {
            font-size: 8.5px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .header-left .party-meta {
            font-size: 8px;
            color: #222;
          }

          .header-center {
            width: 28%;
            text-align: center;
          }
          .header-center .doc-title {
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            text-decoration: underline;
            padding-top: 1px;
          }
          .header-center .shop-tag {
            font-size: 7.5px;
            font-weight: bold;
            color: #444;
            text-transform: uppercase;
            margin-top: 1px;
          }

          .header-right {
            width: 30%;
            text-align: right;
            font-family: monospace;
            font-size: 9.5px;
            line-height: 1.25;
          }
          .meta-row {
            display: flex;
            justify-content: flex-end;
            gap: 2px;
          }
          .meta-lbl {
            font-weight: bold;
          }
          .meta-val {
            font-weight: bold;
          }

          /* 2. TABLE LAYOUT (9 COLUMNS, BORDER GRID) */
          .table-container {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            min-height: 0;
            width: 100%;
          }
          table.items-table {
            width: 100%;
            height: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            flex: 1 1 auto;
          }
          table.items-table thead {
            display: table-header-group;
          }
          table.items-table th {
            background-color: transparent !important;
            color: #000000;
            font-weight: 800;
            font-size: 8.5px;
            padding: 2px 2px;
            border-bottom: 1px solid #000000;
            border-right: 1px solid #000000;
            line-height: 1.1;
          }
          table.items-table th:last-child {
            border-right: none;
          }
          tr.item-row {
            height: 13.5px;
            max-height: 13.5px;
            page-break-inside: avoid;
          }
          tr.item-row td {
            font-size: 8px;
            padding: 1px 2px;
            border-right: 1px solid #000000;
            vertical-align: middle;
            line-height: 1.1;
          }
          tr.item-row td:last-child {
            border-right: none;
          }
          tr.spacer-row td {
            height: 100%;
            border-right: 1px solid #000000;
          }
          tr.spacer-row td:last-child {
            border-right: none;
          }

          /* 3. FOOTER (MARG EXACT 2-COLUMN SPLIT) */
          .footer-block {
            flex-shrink: 0;
            border-top: 1px solid #000000;
            display: flex;
            width: 100%;
            box-sizing: border-box;
            background: #ffffff;
            page-break-inside: avoid;
          }
          .footer-left {
            width: 61%;
            border-right: 1px solid #000000;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          .words-row {
            padding: 2.5px 5px;
            font-size: 8.5px;
            font-weight: bold;
            line-height: 1.2;
          }
          .remark-box {
            border-top: 1px solid #000000;
            border-bottom: 1px solid #000000;
            padding: 2px 5px;
            font-size: 9px;
            font-weight: 800;
            font-family: Arial, monospace, sans-serif;
            background: #fafafa;
          }
          .terms-box {
            padding: 3px 5px 3px 5px;
            font-size: 7.5px;
            line-height: 1.25;
          }
          .terms-header {
            text-decoration: underline;
            font-weight: 800;
            font-size: 8px;
            text-transform: uppercase;
            margin-bottom: 1px;
          }

          .footer-right {
            width: 39%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            font-family: monospace;
          }
          .totals-table {
            padding: 2.5px 5px;
            font-size: 10px;
            border-bottom: 1px solid #000000;
          }
          .tot-row {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            margin-bottom: 1px;
          }
          .tot-grand {
            border-top: 1.5px solid #000000;
            padding-top: 2px;
            margin-top: 1.5px;
            font-size: 11px;
            font-weight: 900;
          }
          .signatory-area {
            padding: 12px 6px 3px 6px;
            text-align: right;
            font-size: 8.5px;
            font-weight: 800;
            font-family: Arial, sans-serif;
          }

          /* Bottom software micro-line */
          .sub-footer-text {
            font-size: 7px;
            color: #444;
            text-align: center;
            width: 140mm;
            margin: 1.5px auto 0 auto;
            letter-spacing: 0.1px;
          }
        </style>
      </head>
      <body>
        <div class="outer-frame">
          <!-- TOP HEADER -->
          <div class="header-block">
            <div class="header-left">
              <div class="party-title">${partyLine1}</div>
              <div class="party-sub">${partyLine2}</div>
              ${isPartyGiven && invoice.customerMobile ? `<div class="party-meta">Ph: ${invoice.customerMobile}</div>` : ''}
              ${isPartyGiven && invoice.customerGstin ? `<div class="party-meta">GSTIN: ${invoice.customerGstin}</div>` : ''}
            </div>

            <div class="header-center">
              <div class="doc-title">${docTitle}</div>
              ${isPartyGiven ? `<div class="shop-tag">M/s ${shop.shopName || 'Retail Store'}</div>` : ''}
            </div>

            <div class="header-right">
              <div class="meta-row">
                <span class="meta-lbl">${docNoLabel} :</span>
                <span class="meta-val">${invoice.invoiceNumber}</span>
              </div>
              <div class="meta-row">
                <span class="meta-lbl">Date :</span>
                <span class="meta-val">${formattedDate}</span>
              </div>
              ${invoice.time ? `
                <div class="meta-row" style="font-size: 8px; color: #333;">
                  <span>Time :</span>
                  <span>${invoice.time}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- TABLE -->
          <div class="table-container">
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 4%; text-align: center;">S.</th>
                  <th style="width: 44%; text-align: left; padding-left: 3px;">Item Description</th>
                  <th style="width: 7%; text-align: center;">REMARK</th>
                  <th style="width: 7%; text-align: right; padding-right: 2px;">Qty.</th>
                  <th style="width: 6%; text-align: right; padding-right: 2px;">FREE</th>
                  <th style="width: 8%; text-align: right; padding-right: 2px;">Rate</th>
                  <th style="width: 8%; text-align: right; padding-right: 2px;">MRP</th>
                  <th style="width: 6%; text-align: right; padding-right: 2px;">DIS%</th>
                  <th style="width: 10%; text-align: right; padding-right: 3px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                ${paddingHtml}
                <tr class="spacer-row" style="height: 100%;">
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td style="border-right: 1px solid #000;">&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- FOOTER -->
          <div class="footer-block">
            <div class="footer-left">
              <div class="words-row">
                Rs. <span style="text-transform: capitalize;">${numberToWordsIndian(invoice.netPayable)}</span> only
              </div>

              <div class="remark-box">
                Remark : ${invoice.notes || ''}
              </div>

              <div class="terms-box">
                <div class="terms-header">Terms & Conditions</div>
                ${termsList.map(t => `<div>${t}</div>`).join('')}
              </div>
            </div>

            <div class="footer-right">
              <div class="totals-table">
                <div class="tot-row">
                  <span>SUB TOTAL</span>
                  <span>${grossSubtotal.toFixed(2)}</span>
                </div>
                ${invoice.totalDiscount > 0 ? `
                  <div class="tot-row">
                    <span>DISCOUNT</span>
                    <span>${invoice.totalDiscount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${invoice.freightAmount > 0 ? `
                  <div class="tot-row">
                    <span>FRIGHT</span>
                    <span>${invoice.freightAmount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${isGstInvoice && invoice.totalGst > 0 ? `
                  <div class="tot-row">
                    <span>GST TAX</span>
                    <span>${invoice.totalGst.toFixed(2)}</span>
                  </div>
                ` : ''}
                <div class="tot-row tot-grand">
                  <span>GRAND TOTAL</span>
                  <span>${invoice.netPayable.toFixed(2)}</span>
                </div>
              </div>

              <div class="signatory-area">
                Authorised signatory
              </div>
            </div>
          </div>
        </div>

        <div class="sub-footer-text">
          ${shop.shopName ? shop.shopName.toUpperCase() : 'WEBRAJYA POS'} | POS SOFTWARE PRINT ENGINE
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          }
        </script>
      </body>
    </html>
  `;

  executeBrowserPrint(html, isA4 ? 900 : 800, 950);
}

function executeBrowserPrint(html: string, popupWidth = 800, popupHeight = 950, is80mm = false) {
  // If running inside native Windows Electron App: use 100% native silent printing
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    const savedPrinter = localStorage.getItem('webrajya_electron_printer') || '';
    window.electronAPI.printSilent({
      html,
      is80mm,
      deviceName: savedPrinter || undefined,
      printerName: savedPrinter || undefined,
      pageSize: is80mm ? { width: 80000, height: 297000 } : 'A5'
    }).catch(err => {
      console.warn('[Electron Native Print] Error, falling back to browser window:', err);
    });
    return;
  }

  try {
    const printWindow = window.open('', '_blank', `width=${popupWidth},height=${popupHeight}`);
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      return;
    }
  } catch (e) {
    console.warn('Popup blocked, falling back to hidden iframe printing:', e);
  }

  // Fallback: Invisible iframe printing so popups never block printing
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }, 400);
    }
  } catch (err) {
    console.error('All printing methods failed:', err);
  }
}

// -------------------------------------------------------------
// 80mm THERMAL / PLAIN POS RECEIPT PRINT ENGINE (3-INCH ROLL)
// -------------------------------------------------------------
export function generate80mmReceiptHtml(invoice: Invoice, shop: ShopProfile, printSettings?: PrintSettings): string {
  const isGstInvoice = invoice.invoiceType === 'gst';
  const docTitle = isGstInvoice ? 'TAX INVOICE' : 'RETAIL CASH MEMO';
  const formattedDate = formatDateDDMMYYYY(invoice.date);
  const items = invoice.items || [];
  const showGst = printSettings?.showGstBreakdown ?? true;
  const showBank = printSettings?.showBankDetails ?? true;
  const showTerms = printSettings?.showTerms ?? true;

  const itemsHtml = items.map((item, idx) => {
    const itemTotal = item.totalAmount || (item.unitRate * item.qty * (1 - (item.discountPct || 0) / 100));
    const metaDetails = [
      item.remark ? `"${item.remark}"` : '',
      item.pack ? item.pack : '',
      item.hsnCode ? `HSN:${item.hsnCode}` : '',
      item.discountPct ? `${item.discountPct}% Disc` : '',
      item.freeQty ? `+${item.freeQty} Free` : ''
    ].filter(Boolean).join(' | ');

    return `
      <tr style="border-bottom: 1px dashed #cbd5e1;">
        <td style="padding: 2.5px 0; vertical-align: top;">
          <div style="font-weight: 800; font-size: 10.5px; text-transform: uppercase; line-height: 1.2;">
            ${idx + 1}. ${item.productName}
          </div>
          ${metaDetails ? `<div style="font-size: 8.5px; color: #475569; margin-top: 1px;">${metaDetails}</div>` : ''}
        </td>
        <td style="padding: 2.5px 2px; text-align: right; vertical-align: top; font-family: monospace; font-size: 10.5px;">
          ${item.qty}
        </td>
        <td style="padding: 2.5px 2px; text-align: right; vertical-align: top; font-family: monospace; font-size: 10.5px;">
          ${item.unitRate.toFixed(2)}
        </td>
        <td style="padding: 2.5px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 800; font-size: 10.5px;">
          ${itemTotal.toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');

  const termsList = shop.termsAndConditions
    ? shop.termsAndConditions.split('\n').filter(t => t.trim() !== '')
    : ['Goods once sold will not be taken back without bill.', 'All disputes subject to jurisdiction only.'];

  const grossSubtotal = invoice.subtotal + (invoice.totalDiscount || 0);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt_${invoice.invoiceNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 2mm 3mm 4mm 3mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff;
            color: #000000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace, Arial, sans-serif;
            font-size: 10.5px;
            line-height: 1.2;
            -webkit-font-smoothing: antialiased;
          }
          .receipt-container {
            width: 74mm;
            margin: 0 auto;
            padding: 1mm 1mm;
          }
          .dashed-divider {
            border-top: 1px dashed #000000;
            margin: 3.5px 0;
          }
          .center {
            text-align: center;
          }
          .shop-title {
            font-size: 14px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            line-height: 1.15;
          }
          .shop-sub {
            font-size: 9.5px;
            font-weight: 700;
            color: #222;
            margin-top: 1px;
          }
          .shop-meta {
            font-size: 8.5px;
            color: #111;
            line-height: 1.25;
            margin-top: 1.5px;
          }
          .doc-type-badge {
            display: inline-block;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 1.5px 6px;
            border: 1px solid #000;
            margin: 3px 0 1px 0;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            font-size: 9.5px;
            line-height: 1.3;
          }
          .tot-row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            margin-bottom: 1.5px;
          }
          .tot-grand {
            display: flex;
            justify-content: space-between;
            font-size: 13.5px;
            font-weight: 900;
            padding: 3px 0;
            border-top: 1.5px solid #000;
            border-bottom: 1.5px solid #000;
            margin: 3.5px 0;
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <!-- 1. Header Details -->
          <div class="center">
            <div class="shop-title">${shop.shopName || 'Retail Store'}</div>
            ${shop.tagline ? `<div class="shop-sub">${shop.tagline}</div>` : ''}
            <div class="shop-meta">
              ${shop.address ? `${shop.address}<br />` : ''}
              ${shop.phone ? `Ph: ${shop.phone} ` : ''}
              ${shop.gstin ? `| GSTIN: <strong>${shop.gstin}</strong>` : ''}
              ${shop.state ? `<br />State: ${shop.state}` : ''}
            </div>
            <div>
              <span class="doc-type-badge">${docTitle}</span>
            </div>
          </div>

          <div class="dashed-divider"></div>

          <!-- 2. Invoice & Customer Meta -->
          <div class="meta-row">
            <span>Bill No: <strong>#${invoice.invoiceNumber}</strong></span>
            <span>Date: <strong>${formattedDate}</strong></span>
          </div>
          <div class="meta-row">
            <span>Time: ${invoice.time || ''}</span>
            <span>Mode: <strong>${invoice.paymentMode.toUpperCase()}</strong></span>
          </div>

          ${invoice.customerName && invoice.customerName.toLowerCase() !== 'cash customer' ? `
            <div class="dashed-divider"></div>
            <div style="font-size: 9.5px; line-height: 1.25;">
              <div>Party: <strong>${invoice.customerName.toUpperCase()}</strong></div>
              ${invoice.customerMobile ? `<div>Mobile: ${invoice.customerMobile}</div>` : ''}
              ${invoice.customerGstin ? `<div>GSTIN: <strong>${invoice.customerGstin}</strong></div>` : ''}
              ${invoice.customerAddress ? `<div>Address: ${invoice.customerAddress}</div>` : ''}
            </div>
          ` : ''}

          <div class="dashed-divider"></div>

          <!-- 3. Items Table -->
          <table style="width: 100%; border-collapse: collapse; margin: 2px 0;">
            <thead>
              <tr style="border-bottom: 1px dashed #000; font-size: 9.5px; font-weight: 800;">
                <th style="width: 50%; text-align: left; padding-bottom: 2px;">Item</th>
                <th style="width: 14%; text-align: right; padding-bottom: 2px;">Qty</th>
                <th style="width: 16%; text-align: right; padding-bottom: 2px;">Rate</th>
                <th style="width: 20%; text-align: right; padding-bottom: 2px;">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="dashed-divider"></div>

          <!-- 4. Totals Breakdown -->
          <div>
            <div class="tot-row">
              <span>Items Total (${items.length}):</span>
              <span style="font-family: monospace;">₹${grossSubtotal.toFixed(2)}</span>
            </div>
            ${invoice.totalDiscount > 0 ? `
              <div class="tot-row">
                <span>Discount:</span>
                <span style="font-family: monospace;">-₹${invoice.totalDiscount.toFixed(2)}</span>
              </div>
            ` : ''}
            ${invoice.freightAmount > 0 ? `
              <div class="tot-row">
                <span>Freight / Delivery:</span>
                <span style="font-family: monospace;">₹${invoice.freightAmount.toFixed(2)}</span>
              </div>
            ` : ''}
            ${isGstInvoice && showGst && invoice.totalGst > 0 ? `
              ${invoice.cgstTotal > 0 ? `
                <div class="tot-row" style="font-size: 9px; color: #333;">
                  <span>&nbsp;&nbsp;CGST:</span>
                  <span style="font-family: monospace;">₹${invoice.cgstTotal.toFixed(2)}</span>
                </div>
              ` : ''}
              ${invoice.sgstTotal > 0 ? `
                <div class="tot-row" style="font-size: 9px; color: #333;">
                  <span>&nbsp;&nbsp;SGST:</span>
                  <span style="font-family: monospace;">₹${invoice.sgstTotal.toFixed(2)}</span>
                </div>
              ` : ''}
              ${invoice.igstTotal > 0 ? `
                <div class="tot-row" style="font-size: 9px; color: #333;">
                  <span>&nbsp;&nbsp;IGST:</span>
                  <span style="font-family: monospace;">₹${invoice.igstTotal.toFixed(2)}</span>
                </div>
              ` : ''}
            ` : ''}
            ${invoice.roundOff !== 0 ? `
              <div class="tot-row" style="font-size: 9px; color: #444;">
                <span>Round Off:</span>
                <span style="font-family: monospace;">${invoice.roundOff > 0 ? '+' : ''}${invoice.roundOff.toFixed(2)}</span>
              </div>
            ` : ''}

            <!-- Grand Total Highlight -->
            <div class="tot-grand">
              <span>NET PAYABLE:</span>
              <span style="font-family: monospace;">₹${invoice.netPayable.toFixed(2)}</span>
            </div>

            <!-- Tender & Payment Details -->
            <div class="tot-row" style="font-weight: bold;">
              <span>Paid (${invoice.paymentMode.toUpperCase()}):</span>
              <span style="font-family: monospace;">₹${(invoice.paidAmount || invoice.netPayable).toFixed(2)}</span>
            </div>
            ${invoice.balanceAmount > 0 ? `
              <div class="tot-row" style="font-weight: 900; color: #b91c1c;">
                <span>BALANCE DUE (KHATA):</span>
                <span style="font-family: monospace;">₹${invoice.balanceAmount.toFixed(2)}</span>
              </div>
            ` : ''}
            ${invoice.transactionRef || invoice.upiReference ? `
              <div class="tot-row" style="font-size: 8.5px; color: #333;">
                <span>Ref / UTR:</span>
                <span style="font-family: monospace;">${invoice.transactionRef || invoice.upiReference}</span>
              </div>
            ` : ''}
          </div>

          <div style="font-size: 8.5px; margin-top: 1.5px; text-transform: capitalize;">
            Rs. <span style="font-weight: bold;">${numberToWordsIndian(invoice.netPayable)}</span> only
          </div>

          <!-- Bank & UPI Payment info if enabled -->
          ${showBank && shop.upiId ? `
            <div class="dashed-divider"></div>
            <div class="center" style="font-size: 9px; line-height: 1.3;">
              <div>UPI Pay ID: <strong>${shop.upiId}</strong></div>
              ${shop.bankName && shop.accountNo ? `
                <div style="font-size: 8px; color: #333;">
                  ${shop.bankName} | A/C: ${shop.accountNo} | IFSC: ${shop.ifscCode}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Terms & Conditions if enabled -->
          ${showTerms && termsList.length > 0 ? `
            <div class="dashed-divider"></div>
            <div style="font-size: 7.5px; color: #444; line-height: 1.25;">
              <strong>Terms & Conditions:</strong>
              ${termsList.map(t => `<div>• ${t}</div>`).join('')}
            </div>
          ` : ''}

          <div class="dashed-divider"></div>
          <div class="center" style="font-size: 8.5px; margin-top: 3px;">
            <div style="font-weight: 900; letter-spacing: 0.3px;">*** THANK YOU! VISIT AGAIN ***</div>
            <div style="font-size: 7px; color: #666; margin-top: 1px;">
              Powered by WebRajya Invoice
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 200);
          }
        </script>
      </body>
    </html>
  `;
}

export async function trigger80mmPrint(invoice: Invoice, shop: ShopProfile, printSettings?: PrintSettings) {
  // Check if Web Bluetooth printing should be attempted (mobile / wireless)
  const shouldTryBluetooth = printSettings?.printEngine === 'bluetooth' || (printSettings?.printEngine === 'auto' && isBluetoothPrinterConnected());
  if (shouldTryBluetooth) {
    try {
      const btRes = await printInvoiceSilentBluetooth(invoice, shop, printSettings);
      if (btRes.success) {
        return { success: true, method: 'bluetooth' as const };
      }
      console.warn('[Print] Bluetooth print error, falling back:', btRes.error);
    } catch (err) {
      console.warn('[Print] Bluetooth exception, falling back:', err);
    }
  }

  // Check if WebUSB silent printing should be attempted
  const shouldTryUsb = printSettings?.printEngine === 'usb' || (printSettings?.printEngine === 'auto' && isUsbPrinterConnected());
  if (shouldTryUsb) {
    try {
      const usbRes = await printInvoiceSilentUsb(invoice, shop, printSettings);
      if (usbRes.success) {
        return { success: true, method: 'usb' as const };
      }
      console.warn('[Print] USB print error, falling back to browser print:', usbRes.error);
    } catch (err) {
      console.warn('[Print] USB exception, falling back to browser print:', err);
    }
  }

  // Fallback to browser print (which is silent when Chrome --kiosk-printing or Electron is active)
  const html = generate80mmReceiptHtml(invoice, shop, printSettings);
  executeBrowserPrint(html, 420, 720, true);
  return { success: true, method: (typeof window !== 'undefined' && window.electronAPI?.isElectron) ? ('electron' as const) : ('browser' as const) };
}

export function generate58mmReceiptHtml(invoice: Invoice, shop: ShopProfile, printSettings?: PrintSettings): string {
  const isGstInvoice = invoice.invoiceType === 'gst';
  const isQuotation = invoice.invoiceType === 'quotation';
  const docTitle = isQuotation ? 'QUOTATION' : isGstInvoice ? 'TAX INVOICE' : 'CASH MEMO';
  const formattedDate = formatDateDDMMYYYY(invoice.date);
  const items = invoice.items || [];

  const itemsHtml = items.map((item) => `
    <div style="margin-bottom: 2px;">
      <div style="font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.productName}</div>
      <div style="display: flex; justify-content: space-between; font-size: 8px;">
        <span>${item.qty} ${item.unit || 'Pcs'} x ₹${item.unitRate.toFixed(2)}</span>
        <span style="font-weight: bold;">₹${item.totalAmount.toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${docTitle} - ${invoice.invoiceNumber}</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; margin: 0; padding: 0; }
          body {
            font-family: monospace, -apple-system, sans-serif;
            font-size: 8.5px;
            line-height: 1.2;
            width: 50mm;
            padding: 3mm 2mm;
            color: #000;
            background: #fff;
          }
          .c { text-align: center; }
          .b { font-weight: bold; }
          .d { border-top: 1px dashed #000; margin: 2px 0; }
          .r { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="c b" style="font-size: 11px;">${shop.shopName || 'Retail Store'}</div>
        <div class="c" style="font-size: 7.5px;">
          ${shop.address ? `<div>${shop.address}</div>` : ''}
          ${shop.phone ? `<div>Ph: ${shop.phone}</div>` : ''}
          ${shop.gstin ? `<div>GSTIN: ${shop.gstin}</div>` : ''}
        </div>
        <div class="c" style="margin: 2px 0;"><span style="border: 1px solid #000; padding: 0 3px; font-weight: 800; font-size: 8px;">${docTitle}</span></div>
        <div class="d"></div>
        <div class="r"><span>Bill: #${invoice.invoiceNumber}</span><span>${formattedDate}</span></div>
        <div class="r"><span>Mode: ${invoice.paymentMode.toUpperCase()}</span><span>${invoice.time || ''}</span></div>
        ${invoice.customerName && invoice.customerName.toLowerCase() !== 'cash customer' ? `<div>Party: <b>${invoice.customerName}</b></div>` : ''}
        <div class="d"></div>
        ${itemsHtml}
        <div class="d"></div>
        <div class="r"><span>Subtotal:</span><span>₹${invoice.subtotal.toFixed(2)}</span></div>
        ${invoice.totalDiscount > 0 ? `<div class="r"><span>Discount:</span><span>-₹${invoice.totalDiscount.toFixed(2)}</span></div>` : ''}
        ${isGstInvoice && invoice.totalGst > 0 ? `<div class="r"><span>GST:</span><span>+₹${invoice.totalGst.toFixed(2)}</span></div>` : ''}
        <div class="r b" style="font-size: 10px; border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>NET PAYABLE:</span><span>₹${invoice.netPayable.toFixed(2)}</span>
        </div>
        ${invoice.balanceAmount > 0 ? `<div class="r b" style="color: #000;"><span>Balance Due:</span><span>₹${invoice.balanceAmount.toFixed(2)}</span></div>` : ''}
        <div class="d"></div>
        <div class="c" style="font-size: 7.5px; margin-top: 3px;">
          ${shop.upiId ? `<div>Pay UPI: ${shop.upiId}</div>` : ''}
          <div>Thank you! Visit again.</div>
        </div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 200); };
        </script>
      </body>
    </html>
  `;
}

export async function trigger58mmPrint(invoice: Invoice, shop: ShopProfile, printSettings?: PrintSettings) {
  // Check if Web Bluetooth printing should be attempted (portable mini 58mm POS printers)
  const shouldTryBluetooth = printSettings?.printEngine === 'bluetooth' || (printSettings?.printEngine === 'auto' && isBluetoothPrinterConnected());
  if (shouldTryBluetooth) {
    try {
      const btRes = await printInvoiceSilentBluetooth(invoice, shop, printSettings);
      if (btRes.success) {
        return { success: true, method: 'bluetooth' as const };
      }
      console.warn('[Print 58mm] Bluetooth print error, falling back:', btRes.error);
    } catch (err) {
      console.warn('[Print 58mm] Bluetooth exception, falling back:', err);
    }
  }

  // Check if WebUSB silent printing should be attempted
  const shouldTryUsb = printSettings?.printEngine === 'usb' || (printSettings?.printEngine === 'auto' && isUsbPrinterConnected());
  if (shouldTryUsb) {
    try {
      const usbRes = await printInvoiceSilentUsb(invoice, shop, printSettings);
      if (usbRes.success) {
        return { success: true, method: 'usb' as const };
      }
      console.warn('[Print 58mm] USB print error, falling back:', usbRes.error);
    } catch (err) {
      console.warn('[Print 58mm] USB exception, falling back:', err);
    }
  }

  const html = generate58mmReceiptHtml(invoice, shop, printSettings);
  executeBrowserPrint(html, 320, 600, true);
  return { success: true, method: (typeof window !== 'undefined' && window.electronAPI?.isElectron) ? ('electron' as const) : ('browser' as const) };
}

