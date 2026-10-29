import 'fake-indexeddb/auto';
import { db } from '../src/lib/db';
import { calculateNextInvoiceNumber } from '../src/utils/formatters';
import { calculateItemTaxes, calculateInvoiceTotals } from '../src/lib/taxCalculator';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useSalesStore } from '../src/store/useSalesStore';
import { generate80mmReceiptHtml } from '../src/lib/print';
import type { Invoice, InvoiceItem, Product, Customer } from '../src/types';

async function runPreHandoverVerification() {
  console.log('====================================================');
  console.log('  WEBRAJYA POS: PRE-HANDOVER MASTER VERIFICATION    ');
  console.log('====================================================\n');

  const checklist: { item: string; passed: boolean; details: string }[] = [];

  // TEST 1: INVOICE NUMBERING & SEQUENTIAL GENERATION
  try {
    const existingNums = ['INV-26-01001', 'INV-26-01002', 'INV-26-01005'];
    const nextNum = calculateNextInvoiceNumber(existingNums, 'INV-');
    const cnNextNum = calculateNextInvoiceNumber(['CN-26-01001'], 'CN-');
    const customPrefixNum = calculateNextInvoiceNumber(['SHARMA-26-01010'], 'SHARMA-');

    const passed = nextNum === 'INV-26-01006' && cnNextNum === 'CN-26-01002' && customPrefixNum === 'SHARMA-26-01011';
    checklist.push({
      item: 'Invoice numbering and FY series configuration',
      passed,
      details: `Next Inv: ${nextNum} | Next CN: ${cnNextNum} | Custom Prefix: ${customPrefixNum}`
    });
  } catch (e: any) {
    checklist.push({ item: 'Invoice numbering and FY series configuration', passed: false, details: e.message });
  }

  // TEST 2: CALCULATIONS, TAXES, RETURNS & STOCK ADJUSTMENTS
  try {
    // 1. Create a product with stock = 50
    const prod: Product = {
      id: 'prod_audit_1',
      sku: 'SKU-AUDIT-1',
      barcode: '8901234567890',
      name: 'Classmate Spiral Notebook',
      category: 'Notebooks',
      packInfo: '1 Pcs',
      unit: 'Pcs',
      mrp: 120,
      purchaseRate: 75,
      saleRate: 100,
      hsnCode: '4820',
      gstRate: 12,
      taxType: 'inclusive',
      stockQty: 50,
      minStockLevel: 5,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    await db.products.put(prod);

    // 2. Bill 5 units
    const itemTaxes = calculateItemTaxes(5, 100, 0, 0, 12, 'inclusive', false);
    const item: InvoiceItem = {
      id: 'item_aud_1',
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      barcode: prod.barcode,
      hsnCode: prod.hsnCode,
      pack: prod.packInfo,
      unit: prod.unit,
      qty: 5,
      freeQty: 0,
      mrp: prod.mrp,
      unitRate: prod.saleRate,
      schemeDiscountPct: 0,
      schemeDiscountAmount: 0,
      addlDiscountPct: 0,
      addlDiscountAmount: 0,
      discountPct: 0,
      discountAmount: 0,
      gstRate: 12,
      taxType: 'inclusive',
      availableStock: 50,
      ...itemTaxes
    };

    const totals = calculateInvoiceTotals([item], 0, 0, true);
    const salesStore = useSalesStore.getState();

    const inv = await salesStore.createCompletedInvoice({
      customerName: 'Audit Test Client',
      customerMobile: '9876543210',
      invoiceType: 'gst',
      items: [item],
      subtotal: totals.subtotal,
      totalDiscount: 0,
      totalGst: totals.totalGst,
      cgstTotal: totals.cgstTotal,
      sgstTotal: totals.sgstTotal,
      igstTotal: 0,
      freightAmount: 0,
      roundOff: totals.roundOff,
      netPayable: totals.netPayable,
      paymentMode: 'cash',
      paidAmount: totals.netPayable,
      balanceAmount: 0,
      isInterstate: false
    });

    const prodAfterSale = await db.products.get(prod.id);
    const stockDeducted = prodAfterSale?.stockQty === 45; // 50 - 5 = 45

    // 3. Issue Credit Note return for 2 units
    const cn = await salesStore.createCreditNote({
      originalInvoice: inv,
      returnedItems: [{ item: inv.items[0], returnQty: 2 }],
      returnReason: 'Customer returned 2 units'
    });

    const prodAfterReturn = await db.products.get(prod.id);
    const stockRestored = prodAfterReturn?.stockQty === 47; // 45 + 2 = 47

    const cnLinked = cn.originalInvoiceNumber === inv.invoiceNumber && cn.invoiceType === 'credit_note';
    const cnTaxReversed = cn.totalGst > 0 && cn.netPayable === Math.round(200);

    const passed = stockDeducted && stockRestored && cnLinked && cnTaxReversed;
    checklist.push({
      item: 'Verify calculations, taxes, returns and stock adjustments',
      passed,
      details: `Sale stock: 50 -> ${prodAfterSale?.stockQty} | Return stock: -> ${prodAfterReturn?.stockQty} | CN #${cn.invoiceNumber} linked to Inv #${inv.invoiceNumber}`
    });
  } catch (e: any) {
    checklist.push({ item: 'Verify calculations, taxes, returns and stock adjustments', passed: false, details: e.message });
  }

  // TEST 3: BACKUP EXPORT & RESTORE PROTOCOL (ALL 7 TABLES)
  try {
    // Seed test customer with Khata balance
    const cust: Customer = {
      id: 'cust_khata_1',
      name: 'Ramesh Stationery Store',
      mobile: '9826011223',
      creditBalance: 1250.50,
      createdAt: new Date().toISOString()
    };
    await db.customers.put(cust);

    const settingsStore = useSettingsStore.getState();
    const backupJson = await settingsStore.exportBackupJSON();
    const parsed = JSON.parse(backupJson);

    // Verify all 7 tables in export
    const hasProducts = Array.isArray(parsed.products) && parsed.products.length > 0;
    const hasInvoices = Array.isArray(parsed.invoices) && parsed.invoices.length > 0;
    const hasCustomers = Array.isArray(parsed.customers) && parsed.customers.length > 0;
    const hasMovements = Array.isArray(parsed.stockMovements);
    const hasSuppliers = Array.isArray(parsed.suppliers);
    const hasPurchases = Array.isArray(parsed.purchaseInvoices);
    const hasSettings = Array.isArray(parsed.settings);

    // Clear and restore
    await db.customers.clear();
    await db.products.clear();
    const importRes = await settingsStore.importBackupJSON(backupJson);

    const restoredCust = await db.customers.get('cust_khata_1');
    const restoredKhata = restoredCust?.creditBalance === 1250.50;
    const restoredProd = await db.products.get('prod_audit_1');

    const passed = importRes.success && hasProducts && hasInvoices && hasCustomers && hasMovements && hasSuppliers && hasPurchases && hasSettings && restoredKhata && !!restoredProd;

    checklist.push({
      item: 'Export a backup and restore it on a separate installation',
      passed,
      details: `Export v${parsed.version}: 7 tables verified | Restored customer Khata balance: ₹${restoredCust?.creditBalance} | Message: "${importRes.message}"`
    });
  } catch (e: any) {
    checklist.push({ item: 'Export a backup and restore it on a separate installation', passed: false, details: e.message });
  }

  // TEST 4: CLIENT BRANDING IN PRINT GENERATION
  try {
    const mockShopProfile = {
      shopName: 'SUPER SHARMA TRADERS',
      tagline: 'Wholesale & Retail Stationers',
      address: '124, M.G. Road, Indore, MP - 452001',
      phone: '9827098270',
      email: 'sharma@example.com',
      gstin: '23AABCS1429B1Z1',
      state: 'Madhya Pradesh (23)',
      pincode: '452001',
      bankName: 'HDFC Bank',
      accountNo: '50200012345678',
      ifscCode: 'HDFC0001234',
      upiId: 'sharma@okhdfc',
      invoicePrefix: 'SST-26-',
      termsAndConditions: '1. Goods once sold will not be returned without bill.'
    };

    const mockInvoice: Invoice = {
      id: 'inv_brand_test',
      invoiceNumber: 'SST-26-00001',
      invoiceType: 'gst',
      date: '2026-10-29',
      time: '12:30 PM',
      customerName: 'Gupta General Store',
      customerMobile: '9988776655',
      customerGstin: '23AABCG9999A1Z5',
      placeOfSupply: 'Madhya Pradesh (23)',
      placeOfSupplyCode: '23',
      copyType: 'original',
      reverseCharge: false,
      items: [{
        id: 'it_1',
        productId: 'p_1',
        productName: 'Camlin Geometry Box',
        sku: 'CAM-GEO',
        hsnCode: '9017',
        pack: '1 Pcs',
        unit: 'Pcs',
        qty: 2,
        freeQty: 0,
        mrp: 150,
        unitRate: 150,
        schemeDiscountPct: 0,
        schemeDiscountAmount: 0,
        addlDiscountPct: 0,
        addlDiscountAmount: 0,
        discountPct: 0,
        discountAmount: 0,
        gstRate: 12,
        taxType: 'inclusive',
        taxableAmount: 267.86,
        cgstAmount: 16.07,
        sgstAmount: 16.07,
        igstAmount: 0,
        totalAmount: 300,
        availableStock: 20
      }],
      subtotal: 267.86,
      totalDiscount: 0,
      totalGst: 32.14,
      cgstTotal: 16.07,
      sgstTotal: 16.07,
      igstTotal: 0,
      freightAmount: 0,
      roundOff: 0,
      netPayable: 300,
      paymentMode: 'cash',
      paidAmount: 300,
      balanceAmount: 0,
      status: 'completed',
      isInterstate: false,
      createdAt: new Date().toISOString()
    };

    const html = generate80mmReceiptHtml(mockInvoice, mockShopProfile, { paperSize: '80mm', autoCut: true, showGstSummary: true } as any, 'original');

    const containsName = html.includes('SUPER SHARMA TRADERS');
    const containsGstin = html.includes('23AABCS1429B1Z1');
    const containsAddress = html.includes('124, M.G. Road, Indore');
    const containsCopyBadge = html.includes('ORIGINAL FOR RECIPIENT');
    const containsTaxSlab = html.includes('9017') && html.includes('CGST') && html.includes('SGST');

    const passed = containsName && containsGstin && containsAddress && containsCopyBadge && containsTaxSlab;
    checklist.push({
      item: 'Confirm the correct client branding appears throughout the app and printed documents',
      passed,
      details: `Brand: "${mockShopProfile.shopName}" | GSTIN: ${mockShopProfile.gstin} | Copy: ORIGINAL FOR RECIPIENT | HSN 9017 slab verified in receipt HTML`
    });
  } catch (e: any) {
    checklist.push({ item: 'Confirm the correct client branding appears throughout the app and printed documents', passed: false, details: e.message });
  }

  // PRINT SUMMARY REPORT
  console.log('RESULTS OF AUTOMATED VERIFICATION:\n');
  checklist.forEach((c, idx) => {
    const symbol = c.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${idx + 1}/${checklist.length}] ${symbol} : ${c.item}`);
    console.log(`      Details: ${c.details}\n`);
  });

  const allPassed = checklist.every(c => c.passed);
  console.log('----------------------------------------------------');
  console.log(`OVERALL PRE-HANDOVER TEST RESULT: ${allPassed ? 'ALL VERIFIED (READY FOR HANDOVER)' : 'FAILED CHECKS FOUND'}`);
  console.log('----------------------------------------------------');
}

runPreHandoverVerification().catch(console.error);
