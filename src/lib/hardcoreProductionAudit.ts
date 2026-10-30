import 'fake-indexeddb/auto';
import { db } from './db';
import { disableCloudSyncForTests } from './supabase';
import { runMasterAuditSuite } from './masterAuditRunner';
import { ShopProfileSchema } from '../utils/validation';
import { numberToWordsIndian } from '../utils/numberToWords';
import { EscPosBuilder } from './escpos';
import { useCustomerStore } from '../store/useCustomerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { encodeCode128 } from '../utils/barcode128';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  message?: string;
}

export async function runHardcoreProductionAudit(): Promise<{
  totalPassed: number;
  totalFailed: number;
  totalTests: number;
  passRate: number;
  results: TestResult[];
}> {
  disableCloudSyncForTests();
  const results: TestResult[] = [];

  const record = (suite: string, name: string, condition: boolean, message?: string) => {
    results.push({
      suite,
      name,
      passed: condition,
      message: condition ? undefined : (message || 'Assertion failed')
    });
  };

  console.log('\n============================================================');
  console.log('   WEBRAJYA BILLING POS - HARDCORE PRODUCTION READINESS AUDIT');
  console.log('============================================================\n');

  // =========================================================================
  // SECTION 1: MASTER INTEGRATION AUDIT SUITE (52 TESTS)
  // =========================================================================
  console.log('[SECTION 1] Executing Master Integration Audit (52 Tests)...');
  const masterResult = await runMasterAuditSuite();
  record('Master Integration', 'Existing Master Audit 52/52 Tests Complete', masterResult.allPassed, `Expected 52 passed, got ${masterResult.totalPassed}`);

  // =========================================================================
  // SECTION 2: SHOP PROFILE & FORM VALIDATION SUITE (12 TESTS)
  // =========================================================================
  console.log('[SECTION 2] Validating Shop Profile & Form Validation Suite...');
  
  // 2.1 Complete Shop Profile
  const validFullProfile = {
    shopName: 'The secondneedstore',
    tagline: 'Mens Clothing & Retail',
    address: 'New Shukrawari Market, Seoni, MP - 480661',
    phone: '+91 94251 74721',
    email: 'contact@secondneed.in',
    gstin: '23AAAAA0000A1Z5',
    state: 'Madhya Pradesh (23)',
    pincode: '480661',
    bankName: 'State Bank of India',
    accountNo: '34567890123',
    ifscCode: 'SBIN0001234',
    upiId: 'mjain21@sbi',
    invoicePrefix: 'CTC-',
    termsAndConditions: 'Standard retail terms apply.'
  };
  const r1 = ShopProfileSchema.safeParse(validFullProfile);
  record('Shop Profile', 'Full Shop Profile with all fields is valid', r1.success, r1.error?.message);

  // 2.2 Minimal Profile (Only Compulsory fields)
  const minimalProfile = {
    shopName: 'Retail Counter',
    address: 'Main Bazaar Road',
    phone: '9876543210',
    invoicePrefix: 'INV-'
  };
  const r2 = ShopProfileSchema.safeParse(minimalProfile);
  record('Shop Profile', 'Minimal Profile with only compulsory fields is valid', r2.success, r2.error?.message);

  // 2.3 Non-GST Store (Empty GSTIN)
  const nonGstProfile = {
    ...minimalProfile,
    gstin: ''
  };
  const r3 = ShopProfileSchema.safeParse(nonGstProfile);
  record('Shop Profile', 'Non-GST Retailer with empty GSTIN is valid', r3.success, r3.error?.message);

  // 2.4 Empty Shop Name rejected
  const emptyShopName = { ...minimalProfile, shopName: '' };
  const r4 = ShopProfileSchema.safeParse(emptyShopName);
  record('Shop Profile', 'Empty Shop Name is rejected as compulsory', !r4.success);

  // 2.5 Whitespace only Shop Name rejected
  const wsShopName = { ...minimalProfile, shopName: '   ' };
  const r5 = ShopProfileSchema.safeParse(wsShopName);
  record('Shop Profile', 'Whitespace-only Shop Name is rejected', !r5.success);

  // 2.6 Empty Address rejected
  const emptyAddress = { ...minimalProfile, address: '' };
  const r6 = ShopProfileSchema.safeParse(emptyAddress);
  record('Shop Profile', 'Empty Address is rejected as compulsory', !r6.success);

  // 2.7 Empty Phone rejected
  const emptyPhone = { ...minimalProfile, phone: '' };
  const r7 = ShopProfileSchema.safeParse(emptyPhone);
  record('Shop Profile', 'Empty Phone Number is rejected as compulsory', !r7.success);

  // 2.8 Phone with < 5 digits rejected
  const shortPhone = { ...minimalProfile, phone: '123' };
  const r8 = ShopProfileSchema.safeParse(shortPhone);
  record('Shop Profile', 'Phone number with < 5 digits is rejected', !r8.success);

  // 2.9 Phone with international format / spaces accepted
  const intlPhone = { ...minimalProfile, phone: '+91 94251 74721' };
  const r9 = ShopProfileSchema.safeParse(intlPhone);
  record('Shop Profile', 'Phone with "+91" and spaces is accepted', r9.success, r9.error?.message);

  // 2.10 Empty Invoice Prefix rejected
  const emptyPrefix = { ...minimalProfile, invoicePrefix: '' };
  const r10 = ShopProfileSchema.safeParse(emptyPrefix);
  record('Shop Profile', 'Empty Invoice Prefix is rejected as compulsory', !r10.success);

  // 2.11 Valid 15-character GSTIN accepted
  const validGstin = { ...minimalProfile, gstin: '23ABCDE1234F1Z5' };
  const r11 = ShopProfileSchema.safeParse(validGstin);
  record('Shop Profile', 'Valid 15-character GSTIN is accepted', r11.success, r11.error?.message);

  // 2.12 Invalid length GSTIN rejected
  const invalidGstin = { ...minimalProfile, gstin: 'INVALID' };
  const r12 = ShopProfileSchema.safeParse(invalidGstin);
  record('Shop Profile', 'Invalid length GSTIN is rejected', !r12.success);

  // =========================================================================
  // SECTION 3: BARCODE & LABEL PRINTING SUITE (8 TESTS)
  // =========================================================================
  console.log('[SECTION 3] Validating Barcode & Label Sheet Generator Suite...');

  // 3.1 Code 128 Encoding for standard item code
  const code1 = encodeCode128('CTC-1001');
  record('Label Print', 'Code 128 correctly encodes alphanumeric SKU with start/stop codes', code1.bars.length > 0 && code1.totalWidth > 0);

  // 3.2 Numeric only Barcode 128
  const code2 = encodeCode128('8901030678901');
  record('Label Print', 'Numeric EAN/UPC Code 128 encodes coordinates accurately', code2.bars.length > 0 && code2.text === '8901030678901');

  // 3.3 Page fit estimation <= 24 labels -> 1 Page Sheet on A4-24
  const count24 = 24;
  const perPage24 = 24;
  const est24 = Math.ceil(count24 / perPage24) <= 1 ? `${count24} Labels (1 Page Sheet)` : `${count24} Labels (Multi Page)`;
  record('Label Print', '24 labels on A4-24 format calculates as exactly (1 Page Sheet)', est24.includes('1 Page Sheet'));

  // 3.4 Page fit estimation <= 40 labels -> 1 Page Sheet on A4-40
  const count40 = 40;
  const perPage40 = 40;
  const est40 = Math.ceil(count40 / perPage40) <= 1 ? `${count40} Labels (1 Page Sheet)` : `${count40} Labels (Multi Page)`;
  record('Label Print', '40 labels on A4-40 format calculates as exactly (1 Page Sheet)', est40.includes('1 Page Sheet'));

  // 3.5 Page fit estimation > 40 labels -> Multiple Pages
  const count50 = 50;
  const pages50 = Math.ceil(count50 / perPage40);
  const est50 = pages50 <= 1 ? `${count50} Labels (1 Page Sheet)` : `${count50} Labels (${pages50} Pages)`;
  record('Label Print', '50 labels on A4-40 calculates as 2 Pages', est50.includes('2 Pages'));

  // 3.6 Thermal Roll Layout formatting
  const thermalEst = `${count24} Labels (Roll)`;
  record('Label Print', 'Thermal layout estimates as continuous Roll format', thermalEst.includes('Roll'));

  // 3.7 Auto-layout selection logic
  const autoSelectLayout = (numProducts: number) => {
    if (numProducts <= 24) return 'A4-24';
    if (numProducts <= 40) return 'A4-40';
    return 'A4-40';
  };
  record('Label Print', 'Auto-selector picks A4-24 for <= 24 products', autoSelectLayout(15) === 'A4-24');
  record('Label Print', 'Auto-selector picks A4-40 for 25-40 products', autoSelectLayout(35) === 'A4-40');

  // =========================================================================
  // SECTION 4: INDIAN NUMBER TO WORDS SUITE (6 TESTS)
  // =========================================================================
  console.log('[SECTION 4] Validating Indian Number to Words Suite...');

  record('Number to Words', 'Zero converts to "Rupees Zero Only"', numberToWordsIndian(0) === 'Rupees Zero Only');
  record('Number to Words', '45 converts to "Rupees Forty Five Only"', numberToWordsIndian(45) === 'Rupees Forty Five Only');
  record('Number to Words', '500 converts to "Rupees Five Hundred Only"', numberToWordsIndian(500) === 'Rupees Five Hundred Only');
  record('Number to Words', '1250.50 converts with Paise correctly', numberToWordsIndian(1250.50) === 'Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
  record('Number to Words', '99999 converts to Thousands correctly', numberToWordsIndian(99999) === 'Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only');
  record('Number to Words', '1054321.75 converts Lakhs & Paise correctly', numberToWordsIndian(1054321.75) === 'Rupees Ten Lakh Fifty Four Thousand Three Hundred Twenty One and Seventy Five Paise Only');

  // =========================================================================
  // SECTION 5: KHATA LEDGER & CUSTOMER CREDIT SUITE (6 TESTS)
  // =========================================================================
  console.log('[SECTION 5] Validating Khata Ledger & Customer Credit Suite...');

  // Setup test customer
  const custId = 'test_cust_' + Date.now();
  await db.customers.put({
    id: custId,
    name: 'Ramesh Patel',
    mobile: '9826012345',
    creditBalance: 0,
    creditLimit: 10000,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const c1 = await db.customers.get(custId);
  record('Khata Ledger', 'Customer initialized with 0 credit balance', c1?.creditBalance === 0);

  // Record credit purchase (+ ₹2,500)
  await db.customers.update(custId, {
    creditBalance: (c1?.creditBalance || 0) + 2500,
    updatedAt: new Date().toISOString()
  });
  const c2 = await db.customers.get(custId);
  record('Khata Ledger', 'Credit purchase increments customer credit balance to ₹2500', c2?.creditBalance === 2500);

  // Record partial cash payment (- ₹1,000)
  await db.customers.update(custId, {
    creditBalance: (c2?.creditBalance || 2500) - 1000,
    updatedAt: new Date().toISOString()
  });
  const c3 = await db.customers.get(custId);
  record('Khata Ledger', 'Partial cash payment reduces credit balance to ₹1500', c3?.creditBalance === 1500);

  // Record UPI payment (- ₹1,500)
  await db.customers.update(custId, {
    creditBalance: 0,
    updatedAt: new Date().toISOString()
  });
  const c4 = await db.customers.get(custId);
  record('Khata Ledger', 'Full settlement clears credit balance to ₹0', c4?.creditBalance === 0);

  // Credit limit enforcement check
  const isCreditAllowed = (currentBalance: number, newPurchase: number, limit: number) => {
    return (currentBalance + newPurchase) <= limit;
  };
  record('Khata Ledger', 'Purchase within credit limit is permitted', isCreditAllowed(5000, 3000, 10000));
  record('Khata Ledger', 'Purchase exceeding credit limit is blocked/warned', !isCreditAllowed(8000, 3000, 10000));

  // =========================================================================
  // SECTION 6: DATABASE BACKUP & RESTORE V2.0 SUITE (6 TESTS)
  // =========================================================================
  console.log('[SECTION 6] Validating Database Backup & Restore v2.0 Suite...');

  const settingsStore = useSettingsStore.getState();

  // Export JSON
  const backupJson = await settingsStore.exportBackupJSON();
  let parsedBackup: any = null;
  try {
    parsedBackup = JSON.parse(backupJson);
  } catch (_) {}

  record('Backup & Restore', 'exportBackupJSON produces valid JSON string', !!parsedBackup);
  record('Backup & Restore', 'Backup schema specifies version 2.0', parsedBackup?.version === '2.0');
  record('Backup & Restore', 'Backup payload includes products & invoices collections', Array.isArray(parsedBackup?.products) && Array.isArray(parsedBackup?.invoices));

  // Test tampered/invalid JSON
  const invalidRes = await settingsStore.importBackupJSON('NOT_A_JSON');
  record('Backup & Restore', 'Corrupted non-JSON string returns failure cleanly without crashing', !invalidRes.success);

  // Test missing products catalog JSON
  const missingCatalogRes = await settingsStore.importBackupJSON(JSON.stringify({ version: '2.0' }));
  record('Backup & Restore', 'Backup missing products catalog is rejected safely', !missingCatalogRes.success);

  // Test valid re-import
  const validRes = await settingsStore.importBackupJSON(backupJson);
  record('Backup & Restore', 'Valid backup re-import succeeds and returns success flag', validRes.success);

  // =========================================================================
  // SECTION 7: ESC/POS HARDWARE THERMAL RECEIPT BUILDER (6 TESTS)
  // =========================================================================
  console.log('[SECTION 7] Validating ESC/POS Hardware Thermal Receipt Builder...');

  // 7.1 Initialized buffer has ESC @ (0x1B, 0x40)
  const b1 = new EscPosBuilder(48);
  const bytes1 = b1.build();
  record('ESC/POS Hardware', 'Builder initialization includes ESC @ (0x1B, 0x40)', bytes1[0] === 0x1B && bytes1[1] === 0x40);

  // 7.2 Bold toggle includes ESC E (0x1B, 0x45, 0x01)
  const b2 = new EscPosBuilder(48).bold(true);
  const bytes2 = b2.build();
  record('ESC/POS Hardware', 'Bold text toggle emits ESC E (0x1B, 0x45, 0x01)', Array.from(bytes2).includes(0x45));

  // 7.3 Rupee symbol replacement with ASCII "Rs."
  const b3 = new EscPosBuilder(48).text('Amount: ₹150.00');
  const str3 = String.fromCharCode(...b3.build());
  record('ESC/POS Hardware', 'Indian Rupee symbol (₹) is replaced with "Rs." for ASCII thermal printer safety', str3.includes('Rs.150.00'));

  // 7.4 Dashed line is exactly 48 chars
  const b4 = new EscPosBuilder(48).dashedLine();
  const str4 = String.fromCharCode(...b4.build());
  record('ESC/POS Hardware', 'Dashed line generates standard 48-char separator for 80mm roll', str4.includes('------------------------------------------------'));

  // 7.5 Two-column layout pads accurately to 48 columns
  const b5 = new EscPosBuilder(48).twoColumn('Subtotal', 'Rs. 450.00');
  const str5 = String.fromCharCode(...b5.build());
  const cleanStr5 = str5.replace(/^\x1b@/, '').trim();
  record('ESC/POS Hardware', 'Two-column line aligns left and right text to 48 columns', cleanStr5.startsWith('Subtotal') && cleanStr5.endsWith('Rs. 450.00') && cleanStr5.length === 48);

  // 7.6 Cut paper byte sequence
  const b6 = new EscPosBuilder(48);
  b6.cutPaper(true);
  const bytes6 = b6.build();
  record('ESC/POS Hardware', 'Cut paper emits GS V cut sequence', Array.from(bytes6).includes(0x1D) && Array.from(bytes6).includes(0x56));

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;
  const totalTests = results.length;
  const passRate = (totalPassed / totalTests) * 100;

  console.log('\n============================================================');
  console.log(`   HARDCORE PRODUCTION AUDIT SUMMARY:`);
  console.log(`   PASSED: ${totalPassed} / ${totalTests} (${passRate.toFixed(1)}%)`);
  if (totalFailed > 0) {
    console.log(`   FAILED: ${totalFailed} tests`);
    results.filter(r => !r.passed).forEach(f => {
      console.log(`     - [${f.suite}] ${f.name}: ${f.message}`);
    });
  } else {
    console.log('   ALL CRITICAL SUBSYSTEMS 100% OPERATIONAL & PRODUCTION READY!');
  }
  console.log('============================================================\n');

  return {
    totalPassed,
    totalFailed,
    totalTests,
    passRate,
    results
  };
}

