import 'fake-indexeddb/auto';
import { db } from './db';
import { normalizeText, calculateTokenSimilarity, matchCatalogItem, createSuggestedProduct } from './catalogMatcher';
import { parseAndSanitizeBillJson, DEMO_PURCHASE_BILLS } from './billExtractor';
import { usePurchaseStore } from '../store/usePurchaseStore';
import { useProductStore } from '../store/useProductStore';
import type { Product, PurchaseInvoiceItem } from '../types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  executionTimeMs: number;
}

export async function runPurchaseBillScannerTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    const start = performance.now();
    try {
      await fn();
      results.push({
        name,
        passed: true,
        message: 'Passed successfully',
        executionTimeMs: Math.round(performance.now() - start)
      });
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        message: err?.message || String(err),
        executionTimeMs: Math.round(performance.now() - start)
      });
    }
  };

  // Setup sample product catalog
  const sampleProducts: Product[] = [
    {
      id: 'prod_test_clsmt',
      sku: 'CLM-NB-172',
      barcode: '8901030678901',
      name: 'Classmate Long Book Unruled 172 Pgs',
      category: 'Notebooks & Registers',
      packInfo: '1 Pcs',
      unit: 'Pcs',
      mrp: 75,
      purchaseRate: 50,
      saleRate: 70,
      hsnCode: '4820',
      gstRate: 12,
      taxType: 'inclusive',
      stockQty: 50,
      minStockLevel: 10,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'prod_test_rey',
      sku: 'REY-TRM-BLU',
      barcode: '8901234000012',
      name: 'Reynolds Trimax Gel Pen Blue',
      category: 'Pens',
      packInfo: '1 Pcs',
      unit: 'Pcs',
      mrp: 60,
      purchaseRate: 42,
      saleRate: 55,
      hsnCode: '9608',
      gstRate: 18,
      taxType: 'inclusive',
      stockQty: 80,
      minStockLevel: 20,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  await runTest('1. Abbreviation Expansion & Token Normalization', () => {
    const tokens = normalizeText('CLSMT LONG BK 172P');
    if (!tokens.includes('classmate')) throw new Error('Expected "clsmt" to expand to "classmate"');
    if (!tokens.includes('book')) throw new Error('Expected "bk" to expand to "book"');

    const penTokens = normalizeText('REY TRM GEL BLU');
    if (!penTokens.includes('reynolds')) throw new Error('Expected "rey" to expand to "reynolds"');
    if (!penTokens.includes('trimax')) throw new Error('Expected "trm" to expand to "trimax"');
  });

  await runTest('2. Semantic Token Similarity Engine', () => {
    const score = calculateTokenSimilarity('CLSMT LONG BK 172P', 'Classmate Long Book Unruled 172 Pgs');
    if (score < 0.5) throw new Error(`Expected token similarity > 0.5, got ${score}`);
  });

  await runTest('3. Catalog Matcher: Barcode Priority Match', () => {
    const match = matchCatalogItem(
      { rawName: 'Random Bill Name', barcode: '8901030678901' },
      sampleProducts
    );
    if (!match.matchedProduct || match.matchedProduct.id !== 'prod_test_clsmt') {
      throw new Error('Failed to match item by barcode');
    }
    if (match.confidence !== 1.0) throw new Error('Expected 100% confidence on barcode match');
    if (match.matchReason !== 'barcode') throw new Error('Expected matchReason "barcode"');
  });

  await runTest('4. Catalog Matcher: Fuzzy Name & Rate Difference Calculation', () => {
    const match = matchCatalogItem(
      { rawName: 'REY TRM GEL PEN BLU', purchaseRate: 40.00 },
      sampleProducts
    );
    if (!match.matchedProduct || match.matchedProduct.id !== 'prod_test_rey') {
      throw new Error('Failed to match Reynolds Trimax via fuzzy string');
    }
    if (!match.rateDifference) throw new Error('Rate difference not computed');
    // Previous rate: 42, new rate: 40 -> diff is -2, approx -4.8%
    if (match.rateDifference.previousRate !== 42 || match.rateDifference.newRate !== 40) {
      throw new Error(`Rate diff incorrect: ${JSON.stringify(match.rateDifference)}`);
    }
  });

  await runTest('5. Catalog Matcher: Unmatched Item Flagged as New Product', () => {
    const match = matchCatalogItem(
      { rawName: 'Faber Castell 36 Color Pencils Tin' },
      sampleProducts
    );
    if (!match.isNewProduct) throw new Error('Unmatched product should have isNewProduct = true');
    if (match.matchedProduct !== null) throw new Error('Unmatched product should have null matchedProduct');
  });

  await runTest('6. Raw Bill JSON Sanitizer & Tax Verifier', () => {
    const rawAiOutput = `
    \`\`\`json
    {
      "supplier": {
        "name": "CHANDRA TRADERS",
        "invoiceNumber": "CT/26/101",
        "invoiceDate": "2026-10-18"
      },
      "items": [
        {
          "rawName": "CLSMT LONG BK 172P",
          "quantity": 100,
          "freeQuantity": 10,
          "unit": "Pcs",
          "purchaseRate": 48.00,
          "mrp": 75.00,
          "gstRate": 12
        }
      ]
    }
    \`\`\`
    `;

    const parsed = parseAndSanitizeBillJson(rawAiOutput);
    if (parsed.supplier.name !== 'CHANDRA TRADERS') throw new Error('Supplier name mismatch');
    if (parsed.items.length !== 1) throw new Error('Items length mismatch');
    if (parsed.items[0].quantity !== 100) throw new Error('Quantity mismatch');
    if (parsed.items[0].freeQuantity !== 10) throw new Error('Free quantity mismatch');
    // Subtotal: 100 * 48 = 4800, GST 12% = 576, Grand Total = 5376
    if (parsed.totals.subtotal !== 4800) throw new Error(`Subtotal mismatch: got ${parsed.totals.subtotal}`);
    if (parsed.totals.totalGst !== 576) throw new Error(`GST mismatch: got ${parsed.totals.totalGst}`);
    if (parsed.totals.grandTotal !== 5376) throw new Error(`Grand total mismatch: got ${parsed.totals.grandTotal}`);
  });

  await runTest('7. Atomic Stock Inwarding Transaction & Movement Logging', async () => {
    // Put sample product into Dexie DB with clean test identifier
    const testInwardProd: Product = {
      ...sampleProducts[0],
      id: 'prod_test_inward_1',
      sku: 'TEST-INWARD-001',
      name: 'Test Inward Product 172 Pgs'
    };
    await db.products.put(testInwardProd);
    const prevStock = testInwardProd.stockQty; // 50

    const purchaseStore = usePurchaseStore.getState();

    const result = await purchaseStore.inwardPurchaseInvoice({
      supplier: {
        name: 'TEST DISTRIBUTOR SEONI',
        invoiceNumber: `TEST-INV-${Date.now()}`,
        invoiceDate: '2026-10-18',
        gstin: '23AABCC1234F1Z5'
      },
      items: [
        {
          id: 'test_item_1',
          productId: testInwardProd.id,
          rawName: testInwardProd.name,
          matchedProductName: testInwardProd.name,
          qty: 25,
          freeQty: 5,
          unit: 'Pcs',
          purchaseRate: 46.50,
          mrp: 75.00,
          gstRate: 12,
          totalAmount: 1162.50
        },
        {
          id: 'test_item_new',
          rawName: 'Highlighter Neon Orange 50 Pcs Jar',
          isNewProduct: true,
          qty: 10,
          freeQty: 0,
          unit: 'Box',
          purchaseRate: 200,
          mrp: 300,
          gstRate: 18,
          totalAmount: 2000
        }
      ]
    });

    if (!result.success) throw new Error('Inwarding failed');
    if (result.updatedCount !== 1) throw new Error(`Expected 1 updated product, got ${result.updatedCount}`);
    if (result.createdCount !== 1) throw new Error(`Expected 1 created product, got ${result.createdCount}`);
    if (result.totalStockAdded !== 40) throw new Error(`Expected 40 total stock units (30 + 10), got ${result.totalStockAdded}`);

    // Verify product stock incremented in DB
    const updatedProd = await db.products.get(testInwardProd.id);
    if (!updatedProd) throw new Error('Product not found in DB');
    // 50 + 25 + 5 = 80
    if (updatedProd.stockQty !== 80) {
      throw new Error(`Expected stock 80, got ${updatedProd.stockQty}`);
    }
    // Verify purchase rate updated
    if (updatedProd.purchaseRate !== 46.50) {
      throw new Error(`Expected purchase rate 46.50, got ${updatedProd.purchaseRate}`);
    }

    // Verify stock movements were recorded
    const movements = await db.stockMovements.where('productId').equals(testInwardProd.id).toArray();
    const purchaseMovement = movements.find(m => m.type === 'purchase');
    if (!purchaseMovement) throw new Error('StockMovement of type "purchase" not created');
    if (purchaseMovement.quantityChange !== 30) {
      throw new Error(`Expected movement qtyChange 30, got ${purchaseMovement.quantityChange}`);
    }

    // Verify PurchaseInvoice saved
    const inv = await db.purchaseInvoices.get(result.invoiceId);
    if (!inv) throw new Error('PurchaseInvoice record not found in Dexie');
    if (inv.totalItems !== 2) throw new Error(`Expected 2 items in invoice, got ${inv.totalItems}`);

    // Verify Supplier was created / updated
    const supplier = await db.suppliers.where('name').equals('TEST DISTRIBUTOR SEONI').first();
    if (!supplier) throw new Error('Supplier record not created in Dexie');
  });

  await runTest('8. Poka-Yoke Zero-Double-Inwarding Guard', async () => {
    const purchaseStore = usePurchaseStore.getState();
    const duplicateInvNumber = `DUP-INV-${Date.now()}`;

    // First inwarding
    await purchaseStore.inwardPurchaseInvoice({
      supplier: {
        name: 'DUPLICATE TEST SUPPLIER',
        invoiceNumber: duplicateInvNumber,
        invoiceDate: '2026-10-18'
      },
      items: [
        {
          id: 'dup_item_1',
          rawName: 'Sample Notebook',
          isNewProduct: true,
          qty: 10,
          unit: 'Pcs',
          purchaseRate: 20,
          mrp: 30,
          gstRate: 12,
          totalAmount: 200
        }
      ]
    });

    // Second inwarding of SAME invoice number and supplier should throw error
    let blocked = false;
    try {
      await purchaseStore.inwardPurchaseInvoice({
        supplier: {
          name: 'DUPLICATE TEST SUPPLIER',
          invoiceNumber: duplicateInvNumber,
          invoiceDate: '2026-10-18'
        },
        items: [
          {
            id: 'dup_item_2',
            rawName: 'Sample Notebook',
            isNewProduct: true,
            qty: 10,
            unit: 'Pcs',
            purchaseRate: 20,
            mrp: 30,
            gstRate: 12,
            totalAmount: 200
          }
        ]
      });
    } catch (err: any) {
      if (err.message.includes('already been inwarded')) {
        blocked = true;
      }
    }

    if (!blocked) {
      throw new Error('Duplicate purchase invoice was NOT blocked!');
    }
  });

  return results;
}
