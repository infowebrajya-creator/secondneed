import { Invoice, ShopProfile, PrintSettings } from '../types';

export class EscPosBuilder {
  private buffer: number[] = [];
  private width: number = 48; // standard 48 characters for 80mm thermal font A

  constructor(width: number = 48) {
    this.width = width;
    this.init();
  }

  init(): this {
    this.buffer.push(0x1B, 0x40); // ESC @ (Initialize)
    return this;
  }

  alignLeft(): this {
    this.buffer.push(0x1B, 0x61, 0x00);
    return this;
  }

  alignCenter(): this {
    this.buffer.push(0x1B, 0x61, 0x01);
    return this;
  }

  alignRight(): this {
    this.buffer.push(0x1B, 0x61, 0x02);
    return this;
  }

  bold(enabled: boolean = true): this {
    this.buffer.push(0x1B, 0x45, enabled ? 0x01 : 0x00);
    return this;
  }

  doubleSize(enabled: boolean = true): this {
    // GS ! n (0x11 = double height + width, 0x00 = normal)
    this.buffer.push(0x1D, 0x21, enabled ? 0x11 : 0x00);
    return this;
  }

  doubleHeight(enabled: boolean = true): this {
    this.buffer.push(0x1D, 0x21, enabled ? 0x01 : 0x00);
    return this;
  }

  text(str: string): this {
    if (!str) return this;
    const cleanStr = str.replace(/[^\x00-\x7F]/g, (char) => {
      // Replace Indian rupee symbol with Rs.
      if (char === '₹') return 'Rs.';
      return ' ';
    });
    for (let i = 0; i < cleanStr.length; i++) {
      this.buffer.push(cleanStr.charCodeAt(i));
    }
    return this;
  }

  line(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0A); // LF
    return this;
  }

  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  dashedLine(): this {
    return this.line('-'.repeat(this.width));
  }

  doubleLine(): this {
    return this.line('='.repeat(this.width));
  }

  twoColumn(left: string, right: string): this {
    const spaceCount = Math.max(1, this.width - left.length - right.length);
    return this.line(left + ' '.repeat(spaceCount) + right);
  }

  threeColumn(col1: string, col2: string, col3: string, w1: number = 24, w2: number = 10): this {
    const c1 = col1.slice(0, w1).padEnd(w1);
    const c2 = col2.slice(0, w2).padStart(w2);
    const w3 = this.width - w1 - w2;
    const c3 = col3.slice(0, w3).padStart(w3);
    return this.line(c1 + c2 + c3);
  }

  tableHeader(): this {
    // 48 columns: Name(24), Qty(6), Rate(8), Amt(10)
    const h1 = 'ITEM'.padEnd(24);
    const h2 = 'QTY'.padStart(6);
    const h3 = 'RATE'.padStart(8);
    const h4 = 'AMT'.padStart(10);
    return this.line(h1 + h2 + h3 + h4);
  }

  tableRow(name: string, qty: string, rate: string, amt: string): this {
    const c1 = name.slice(0, 24).padEnd(24);
    const c2 = qty.slice(0, 6).padStart(6);
    const c3 = rate.slice(0, 8).padStart(8);
    const c4 = amt.slice(0, 10).padStart(10);
    this.line(c1 + c2 + c3 + c4);
    
    // If name was longer than 24 chars, print remainder on next line
    if (name.length > 24) {
      this.line('  ' + name.slice(24, 46));
    }
    return this;
  }

  cutPaper(partial: boolean = true): this {
    this.feed(3);
    // GS V m (0x41 partial cut, 0x42 full cut)
    this.buffer.push(0x1D, 0x56, partial ? 0x41 : 0x00, 0x00);
    return this;
  }

  kickCashDrawer(): this {
    // ESC p 0 25 250 (generates 50ms pulse to drawer pin 2)
    this.buffer.push(0x1B, 0x70, 0x00, 0x19, 0xFA);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Builds an 80mm ESC/POS binary buffer from an Invoice & ShopProfile
 */
export function build80mmEscPos(
  invoice: Invoice,
  shop: ShopProfile,
  printSettings?: PrintSettings
): Uint8Array {
  const p = new EscPosBuilder(48);

  // Kick cash drawer if enabled in settings
  if (printSettings?.openCashDrawer || invoice.paymentMode === 'cash') {
    p.kickCashDrawer();
  }

  const isGstInvoice = invoice.invoiceType === 'gst';
  const docTitle = isGstInvoice ? 'TAX INVOICE' : 'RETAIL CASH MEMO';
  const showGst = printSettings?.showGstBreakdown ?? true;
  const showBank = printSettings?.showBankDetails ?? true;
  const showTerms = printSettings?.showTerms ?? true;
  const autoCut = printSettings?.autoCutPaper ?? true;

  // 1. Header
  p.alignCenter();
  p.doubleSize(true).bold(true).line(shop.shopName || 'Retail Store').doubleSize(false).bold(false);
  if (shop.tagline) {
    p.line(shop.tagline);
  }
  if (shop.address) {
    p.line(shop.address);
  }
  const contactParts = [
    shop.phone ? `Ph: ${shop.phone}` : '',
    shop.gstin ? `GSTIN: ${shop.gstin}` : ''
  ].filter(Boolean);
  if (contactParts.length > 0) {
    p.line(contactParts.join(' | '));
  }
  p.bold(true).line(`[ ${docTitle} ]`).bold(false);
  p.dashedLine();

  // 2. Bill Meta
  p.alignLeft();
  p.twoColumn(`Bill No: #${invoice.invoiceNumber}`, `Date: ${invoice.date}`);
  p.twoColumn(`Time: ${invoice.time || ''}`, `Mode: ${invoice.paymentMode.toUpperCase()}`);

  if (invoice.customerName && invoice.customerName.toLowerCase() !== 'cash customer') {
    p.dashedLine();
    p.line(`Party: ${invoice.customerName.toUpperCase()}`);
    if (invoice.customerMobile) p.line(`Mobile: ${invoice.customerMobile}`);
    if (invoice.customerGstin) p.line(`GSTIN: ${invoice.customerGstin}`);
  }

  p.dashedLine();

  // 3. Items Table
  p.bold(true).tableHeader().bold(false);
  p.dashedLine();

  const items = invoice.items || [];
  items.forEach((item, idx) => {
    const lineTotal = item.totalAmount || (item.unitRate * item.qty * (1 - (item.discountPct || 0) / 100));
    const itemName = `${idx + 1}. ${item.productName}`;
    const qtyStr = `${item.qty}${item.freeQty ? `+${item.freeQty}` : ''}`;
    const rateStr = item.unitRate.toFixed(2);
    const amtStr = lineTotal.toFixed(2);
    p.tableRow(itemName, qtyStr, rateStr, amtStr);
  });

  p.dashedLine();

  // 4. Totals Breakdown
  const grossSubtotal = invoice.subtotal + (invoice.totalDiscount || 0);
  p.twoColumn(`Items Subtotal (${items.length}):`, `Rs. ${grossSubtotal.toFixed(2)}`);

  if (invoice.totalDiscount > 0) {
    p.twoColumn('Total Discount:', `- Rs. ${invoice.totalDiscount.toFixed(2)}`);
  }
  if (invoice.freightAmount > 0) {
    p.twoColumn('Freight / Delivery:', `Rs. ${invoice.freightAmount.toFixed(2)}`);
  }

  if (isGstInvoice && showGst && invoice.totalGst > 0) {
    if (invoice.cgstTotal > 0) p.twoColumn('  CGST:', `Rs. ${invoice.cgstTotal.toFixed(2)}`);
    if (invoice.sgstTotal > 0) p.twoColumn('  SGST:', `Rs. ${invoice.sgstTotal.toFixed(2)}`);
    if (invoice.igstTotal > 0) p.twoColumn('  IGST:', `Rs. ${invoice.igstTotal.toFixed(2)}`);
  }

  if (invoice.roundOff !== 0) {
    p.twoColumn('Round Off:', `${invoice.roundOff > 0 ? '+' : ''}${invoice.roundOff.toFixed(2)}`);
  }

  p.doubleLine();

  // 5. Net Payable (Double Height & Bold)
  p.alignCenter();
  p.doubleHeight(true).bold(true);
  p.line(`NET PAYABLE: Rs. ${invoice.netPayable.toFixed(2)}`);
  p.doubleHeight(false).bold(false);
  p.doubleLine();

  // 6. Tender Details
  p.alignLeft();
  p.twoColumn(`Paid (${invoice.paymentMode.toUpperCase()}):`, `Rs. ${(invoice.paidAmount || invoice.netPayable).toFixed(2)}`);
  if (invoice.balanceAmount > 0) {
    p.bold(true).twoColumn('BALANCE DUE (KHATA):', `Rs. ${invoice.balanceAmount.toFixed(2)}`).bold(false);
  }
  if (invoice.transactionRef || invoice.upiReference) {
    p.line(`Ref / UTR: ${invoice.transactionRef || invoice.upiReference}`);
  }

  // 7. Bank & UPI Info
  if (showBank && shop.upiId) {
    p.dashedLine();
    p.alignCenter();
    p.line(`UPI Pay ID: ${shop.upiId}`);
    if (shop.bankName && shop.accountNo) {
      p.line(`${shop.bankName} | A/C: ${shop.accountNo} | IFSC: ${shop.ifscCode}`);
    }
  }

  // 8. Terms & Conditions
  if (showTerms && shop.termsAndConditions) {
    p.dashedLine();
    p.alignLeft();
    const terms = shop.termsAndConditions.split('\n').filter(t => t.trim() !== '');
    p.bold(true).line('Terms & Conditions:').bold(false);
    terms.forEach(t => p.line(`- ${t}`));
  }

  // 9. Footer
  p.dashedLine();
  p.alignCenter();
  p.bold(true).line('*** THANK YOU! VISIT AGAIN ***').bold(false);
  p.line('Powered by WebRajya Invoice');

  // 10. Auto Cut
  if (autoCut) {
    p.cutPaper(true);
  } else {
    p.feed(3);
  }

  return p.build();
}

export const buildInvoiceEscPos = build80mmEscPos;

/**
 * Builds a small diagnostic test receipt to verify USB printer communication
 */
export function buildTestReceiptEscPos(shopName: string = 'WEBRAJYA POS'): Uint8Array {
  const p = new EscPosBuilder(48);
  p.alignCenter();
  p.doubleSize(true).bold(true).line(shopName).doubleSize(false).bold(false);
  p.line('USB THERMAL PRINTER TEST');
  p.dashedLine();
  p.alignLeft();
  p.line(`Date & Time: ${new Date().toLocaleString('en-IN')}`);
  p.line('Protocol: ESC/POS Direct Binary');
  p.line('Connection: Chrome WebUSB Cable');
  p.line('Paper Width: 80mm (48 Columns)');
  p.dashedLine();
  p.alignCenter();
  p.bold(true).line('SILENT PRINT STATUS: OK (SUCCESS)').bold(false);
  p.line('--------------------------------');
  p.cutPaper(true);
  return p.build();
}
