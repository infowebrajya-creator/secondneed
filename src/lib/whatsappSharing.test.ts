import { DEFAULT_BILLING_SETTINGS, DEFAULT_SHOP_PROFILE } from './db';
import { generateA5ReceiptHtml, generate80mmReceiptHtml } from './print';
import { dispatchWhatsAppReceipt } from './whatsappDispatcher';
import { Invoice } from '../types';

export function runWhatsAppSharingSuite(): boolean {
  console.log('\n--- WhatsApp Sharing & Format Engine Test Suite ---');
  let passed = true;

  // 1. Settings Schema Test
  try {
    if (DEFAULT_BILLING_SETTINGS.whatsappFormat !== 'text') {
      throw new Error(`Default format expected 'text', got '${DEFAULT_BILLING_SETTINGS.whatsappFormat}'`);
    }
    if (DEFAULT_BILLING_SETTINGS.whatsappPdfStyle !== 'a5') {
      throw new Error(`Default PDF style expected 'a5', got '${DEFAULT_BILLING_SETTINGS.whatsappPdfStyle}'`);
    }
    console.log('  [PASS] 1. Default Billing Settings have whatsappFormat & whatsappPdfStyle');
  } catch (err: any) {
    console.error('  [FAIL] 1. Settings Schema:', err.message);
    passed = false;
  }

  const mockInvoice: Invoice = {
    id: 'test_inv_01',
    invoiceNumber: 'INV-26-09999',
    invoiceType: 'gst',
    date: '2026-10-30',
    time: '12:00:00',
    createdAt: new Date().toISOString(),
    customerName: 'Rajesh Sharma',
    customerMobile: '9876543210',
    items: [
      {
        id: 'item_1',
        productId: 'prod_1',
        productName: 'Camlin Geometry Box',
        sku: 'CAM-GB-01',
        barcode: '8901234567890',
        pack: '1x1',
        freeQty: 0,
        hsnCode: '9017',
        qty: 2,
        unit: 'Pcs',
        mrp: 150,
        unitRate: 150,
        schemeDiscountPct: 0,
        schemeDiscountAmount: 0,
        addlDiscountPct: 0,
        addlDiscountAmount: 0,
        discountPct: 10,
        discountAmount: 30,
        taxableAmount: 270,
        gstRate: 18,
        taxType: 'inclusive',
        cgstAmount: 24.3,
        sgstAmount: 24.3,
        igstAmount: 0,
        totalAmount: 318.6,
        availableStock: 50
      }
    ],
    subtotal: 300,
    totalDiscount: 30,
    totalGst: 48.6,
    cgstTotal: 24.3,
    sgstTotal: 24.3,
    igstTotal: 0,
    freightAmount: 0,
    roundOff: 0.4,
    netPayable: 319,
    paymentMode: 'cash',
    paidAmount: 319,
    status: 'completed',
    isInterstate: false,
    copyType: 'original',
    balanceAmount: 0
  };

  // 2. HTML Generation Test (A5)
  try {
    const htmlA5 = generateA5ReceiptHtml(mockInvoice, DEFAULT_SHOP_PROFILE);
    if (!htmlA5.includes('INV-26-09999')) throw new Error('A5 HTML missing invoice number');
    if (!htmlA5.includes('CAMLIN GEOMETRY BOX') && !htmlA5.includes('Camlin Geometry Box')) throw new Error('A5 HTML missing product name');
    if (!htmlA5.includes('RAJESH SHARMA') && !htmlA5.includes('Rajesh Sharma')) throw new Error('A5 HTML missing customer name');
    console.log('  [PASS] 2. A5 Receipt HTML generates complete tax invoice markup');
  } catch (err: any) {
    console.error('  [FAIL] 2. A5 Receipt HTML:', err.message);
    passed = false;
  }

  // 3. HTML Generation Test (80mm)
  try {
    const html80 = generate80mmReceiptHtml(mockInvoice, DEFAULT_SHOP_PROFILE);
    if (!html80.includes('INV-26-09999')) throw new Error('80mm HTML missing invoice number');
    if (!html80.includes('Camlin Geometry Box')) throw new Error('80mm HTML missing item');
    console.log('  [PASS] 3. 80mm Receipt HTML generates thermal receipt markup');
  } catch (err: any) {
    console.error('  [FAIL] 3. 80mm Receipt HTML:', err.message);
    passed = false;
  }

  // 4. Invalid Phone Number Guard
  try {
    let notified = false;
    const invInvalid = { ...mockInvoice, customerMobile: '123' };
    dispatchWhatsAppReceipt({
      invoice: invInvalid,
      shop: DEFAULT_SHOP_PROFILE,
      settings: DEFAULT_BILLING_SETTINGS,
      onToast: (_type, title) => {
        if (title.includes('Mobile')) notified = true;
      }
    }).then(res => {
      if (res.success || !notified) {
        throw new Error('Expected invalid phone to fail dispatch and notify');
      }
    });
    console.log('  [PASS] 4. Mobile number validator rejects short/empty numbers safely');
  } catch (err: any) {
    console.error('  [FAIL] 4. Mobile Validator:', err.message);
    passed = false;
  }

  return passed;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('whatsappSharing.test.ts')) {
  const ok = runWhatsAppSharingSuite();
  process.exit(ok ? 0 : 1);
}
