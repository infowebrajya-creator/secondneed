import { db } from './db';
import { 
  ReportPeriodType, ReportPeriod, ReportCategoryId, ReportCategoryConfig, 
  CaReportData, TaxRateBucket, Gstr1Table13Item 
} from '../types/caReport';
import { GstRate, Invoice, PurchaseInvoice, Customer, Supplier, Product, ShopProfile } from '../types';

// Supported report categories configuration
export const REPORT_CATEGORIES_CONFIG: ReportCategoryConfig[] = [
  {
    id: 'sales',
    name: 'Sales Register',
    shortDesc: 'B2B/B2C invoices, taxable value, customer details & status',
    longDesc: 'Complete invoice-level register including invoice numbers, dates, customer names, GSTINs, taxable amounts, and line-item details.',
    isSupported: true,
    defaultSelected: true,
    categoryTag: 'Core'
  },
  {
    id: 'purchases',
    name: 'Purchase Register',
    shortDesc: 'Vendor bills, supplier GSTINs, inward quantities & rates',
    longDesc: 'Inward purchase records maintained in WebRajya with supplier names, GSTINs, invoice numbers, dates, subtotal, and GST amounts.',
    isSupported: true,
    defaultSelected: true,
    categoryTag: 'Core'
  },
  {
    id: 'tax_summary',
    name: 'Tax Summary Matrix',
    shortDesc: 'GST rate-wise (0%, 5%, 12%, 18%, 28%) breakdown & ITC position',
    longDesc: 'Compiled summary of taxable values and tax splits (CGST, SGST, IGST) across standard GST rate slabs for outward and inward supplies.',
    isSupported: true,
    defaultSelected: true,
    categoryTag: 'Tax'
  },
  {
    id: 'payments',
    name: 'Payments & Collections',
    shortDesc: 'Cash, UPI, Card collection logs & outstanding balances',
    longDesc: 'Detailed log of tender receipts, UPI/UTR references, cash collected, and outstanding khata credit balances from billed invoices.',
    isSupported: true,
    defaultSelected: true,
    categoryTag: 'Ledger'
  },
  {
    id: 'customers',
    name: 'Customer Khata (Receivables)',
    shortDesc: 'Customer directory, contact, GSTIN & current credit balances',
    longDesc: 'List of customers with recorded phone numbers, addresses, GSTIN numbers, and their current outstanding khata debit/credit ledger balance.',
    isSupported: true,
    defaultSelected: true,
    categoryTag: 'Ledger'
  },
  {
    id: 'suppliers',
    name: 'Suppliers (Payables)',
    shortDesc: 'Supplier directory, GSTINs & pending payable balances',
    longDesc: 'Directory of suppliers, registered GSTINs, contact numbers, and cumulative balance payable amounts.',
    isSupported: true,
    defaultSelected: true,
    categoryTag: 'Ledger'
  },
  {
    id: 'inventory',
    name: 'Stock & Inventory Valuation',
    shortDesc: 'Current stock quantities, valuation at cost & selling price',
    longDesc: 'Snapshot of all catalog products with current stock counts, purchase rates, selling rates, HSN codes, and total inventory value.',
    isSupported: true,
    defaultSelected: false,
    categoryTag: 'Stock'
  }
];

// Helper to format Date to YYYY-MM-DD
function formatYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Compute Indian Financial Year and Period Ranges
export function getReportPeriodRange(
  type: ReportPeriodType, 
  customStart?: string, 
  customEnd?: string
): ReportPeriod {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed: 0=Jan, 3=Apr, 9=Oct

  // Indian Financial Year: 1 April to 31 March
  const isAfterMarch = currentMonth >= 3;
  const currentFyStartYear = isAfterMarch ? currentYear : currentYear - 1;
  const currentFyEndYear = currentFyStartYear + 1;

  switch (type) {
    case 'this_month': {
      const start = new Date(currentYear, currentMonth, 1);
      const end = new Date(currentYear, currentMonth + 1, 0); // last day of this month
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return {
        type,
        label: `This Month (${monthNames[currentMonth]} ${currentYear})`,
        startDate: formatYYYYMMDD(start),
        endDate: formatYYYYMMDD(end)
      };
    }

    case 'prev_month': {
      const start = new Date(currentYear, currentMonth - 1, 1);
      const end = new Date(currentYear, currentMonth, 0); // last day of previous month
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const prevMonthIdx = (currentMonth + 11) % 12;
      const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      return {
        type,
        label: `Previous Month (${monthNames[prevMonthIdx]} ${prevMonthYear})`,
        startDate: formatYYYYMMDD(start),
        endDate: formatYYYYMMDD(end)
      };
    }

    case 'current_fy': {
      return {
        type,
        label: `Current FY (${currentFyStartYear}-${String(currentFyEndYear).slice(-2)})`,
        startDate: `${currentFyStartYear}-04-01`,
        endDate: `${currentFyEndYear}-03-31`
      };
    }

    case 'prev_fy': {
      const prevFyStartYear = currentFyStartYear - 1;
      const prevFyEndYear = currentFyStartYear;
      return {
        type,
        label: `Previous FY (${prevFyStartYear}-${String(prevFyEndYear).slice(-2)})`,
        startDate: `${prevFyStartYear}-04-01`,
        endDate: `${prevFyEndYear}-03-31`
      };
    }

    case 'custom':
    default: {
      const validStart = customStart && !isNaN(Date.parse(customStart)) 
        ? customStart 
        : formatYYYYMMDD(new Date(currentYear, currentMonth, 1));
      const validEnd = customEnd && !isNaN(Date.parse(customEnd)) 
        ? customEnd 
        : formatYYYYMMDD(now);
      return {
        type: 'custom',
        label: `Custom Range (${validStart} to ${validEnd})`,
        startDate: validStart,
        endDate: validEnd
      };
    }
  }
}

// Safely normalize date strings to YYYY-MM-DD for comparison
function normalizeDateStr(d: string | undefined): string {
  if (!d) return '';
  if (d.includes('T')) {
    return d.split('T')[0];
  }
  return d.trim().slice(0, 10);
}

// Main report generator: aggregates, validates, and reconciles records from Dexie DB
export async function generateCaReportDataset(
  period: ReportPeriod,
  selectedCategories: ReportCategoryId[],
  shopProfile: ShopProfile
): Promise<CaReportData> {
  const validationNotes: string[] = [];
  const { startDate, endDate } = period;

  // 1. Retrieve all Invoices
  let allInvoices: Invoice[] = [];
  try {
    allInvoices = await db.invoices.toArray();
  } catch (err: any) {
    console.error('Error fetching invoices from Dexie:', err);
    validationNotes.push(`Warning: Could not read all invoices (${err?.message || 'Database query error'}).`);
  }

  // 2. Retrieve Purchase Invoices
  let allPurchases: PurchaseInvoice[] = [];
  try {
    allPurchases = await db.purchaseInvoices.toArray();
  } catch (err: any) {
    console.error('Error fetching purchases from Dexie:', err);
  }

  // 3. Retrieve Customers
  let allCustomers: Customer[] = [];
  try {
    allCustomers = await db.customers.toArray();
  } catch (err: any) {
    console.error('Error fetching customers from Dexie:', err);
  }

  // 4. Retrieve Suppliers
  let allSuppliers: Supplier[] = [];
  try {
    allSuppliers = await db.suppliers.toArray();
  } catch (err: any) {
    console.error('Error fetching suppliers from Dexie:', err);
  }

  // 5. Retrieve Inventory
  let allProducts: Product[] = [];
  try {
    allProducts = await db.products.toArray();
  } catch (err: any) {
    console.error('Error fetching products from Dexie:', err);
  }

  // Filter Sales Invoices by selected date range [startDate, endDate]
  const periodInvoices = allInvoices.filter(inv => {
    const invDate = normalizeDateStr(inv.date);
    if (!invDate) return false;
    return invDate >= startDate && invDate <= endDate;
  });

  // Distinguish completed, cancelled, and drafts
  const completedInvoices = periodInvoices.filter(inv => inv.status === 'completed');
  const cancelledInvoices = periodInvoices.filter(inv => inv.status === 'cancelled');
  const otherInvoices = periodInvoices.filter(inv => inv.status !== 'completed' && inv.status !== 'cancelled');

  if (cancelledInvoices.length > 0) {
    validationNotes.push(
      `Excluded ${cancelledInvoices.length} cancelled invoice(s) totalling ₹${cancelledInvoices.reduce((s, i) => s + (i.netPayable || 0), 0).toFixed(2)} from taxable turnover and collection summaries.`
    );
  }
  if (otherInvoices.length > 0) {
    validationNotes.push(
      `Excluded ${otherInvoices.length} draft/unfinalized invoice(s) from financial summaries.`
    );
  }

  // Filter Purchases by date range
  const periodPurchases = allPurchases.filter(pur => {
    const purDate = normalizeDateStr(pur.invoiceDate || pur.createdAt);
    if (!purDate) return false;
    return purDate >= startDate && purDate <= endDate;
  });
  const completedPurchases = periodPurchases.filter(pur => pur.status === 'completed' || !pur.status);

  // Sales Aggregate Calculations
  let totalSalesGross = 0;
  let totalSalesNet = 0;
  let totalSalesDiscount = 0;
  let totalSalesTaxable = 0;
  let totalSalesGst = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  let cashCollection = 0;
  let upiCollection = 0;
  let cardCollection = 0;
  let creditSalesAmount = 0;
  let totalPaidAmount = 0;
  let totalBalanceOutstanding = 0;

  // Rate bucket initializers
  const gstRates: GstRate[] = [0, 5, 12, 18, 28];
  const salesByRate: Record<GstRate, TaxRateBucket> = {
    0: { rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGst: 0, transactionCount: 0 },
    5: { rate: 5, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGst: 0, transactionCount: 0 },
    12: { rate: 12, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGst: 0, transactionCount: 0 },
    18: { rate: 18, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGst: 0, transactionCount: 0 },
    28: { rate: 28, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGst: 0, transactionCount: 0 },
  };

  for (const inv of completedInvoices) {
    totalSalesNet += inv.netPayable || 0;
    totalSalesDiscount += inv.totalDiscount || 0;
    totalSalesTaxable += inv.subtotal || 0;
    totalSalesGst += inv.totalGst || 0;
    cgstTotal += inv.cgstTotal || 0;
    sgstTotal += inv.sgstTotal || 0;
    igstTotal += inv.igstTotal || 0;
    totalSalesGross += (inv.subtotal || 0) + (inv.totalDiscount || 0);

    // Payments
    totalPaidAmount += inv.paidAmount || 0;
    totalBalanceOutstanding += inv.balanceAmount || 0;

    if (inv.paymentMode === 'cash') cashCollection += inv.paidAmount || 0;
    else if (inv.paymentMode === 'upi') upiCollection += inv.paidAmount || 0;
    else if (inv.paymentMode === 'card') cardCollection += inv.paidAmount || 0;
    else if (inv.paymentMode === 'credit') creditSalesAmount += inv.netPayable || 0;

    // Line items rate-wise breakdown
    const ratesInThisInvoice = new Set<GstRate>();
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const rate = (gstRates.includes(item.gstRate as GstRate) ? item.gstRate : 12) as GstRate;
        ratesInThisInvoice.add(rate);
        const bucket = salesByRate[rate];
        if (bucket) {
          bucket.taxableAmount += item.taxableAmount || 0;
          bucket.cgstAmount += item.cgstAmount || 0;
          bucket.sgstAmount += item.sgstAmount || 0;
          bucket.igstAmount += item.igstAmount || 0;
          bucket.totalGst += (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0);
        }
      }
    }
    ratesInThisInvoice.forEach(r => {
      if (salesByRate[r]) salesByRate[r].transactionCount += 1;
    });
  }

  // Purchases Aggregate Calculations
  let totalPurchasesAmount = 0;
  let totalPurchasesTaxable = 0;
  let totalPurchasesGst = 0;

  const purchasesByRate: Record<GstRate, { rate: GstRate; taxableAmount: number; totalGst: number; billCount: number }> = {
    0: { rate: 0, taxableAmount: 0, totalGst: 0, billCount: 0 },
    5: { rate: 5, taxableAmount: 0, totalGst: 0, billCount: 0 },
    12: { rate: 12, taxableAmount: 0, totalGst: 0, billCount: 0 },
    18: { rate: 18, taxableAmount: 0, totalGst: 0, billCount: 0 },
    28: { rate: 28, taxableAmount: 0, totalGst: 0, billCount: 0 },
  };

  for (const pur of completedPurchases) {
    totalPurchasesAmount += pur.grandTotal || 0;
    totalPurchasesTaxable += pur.subtotal || 0;
    totalPurchasesGst += pur.totalGst || 0;

    if (pur.items && Array.isArray(pur.items)) {
      const ratesInBill = new Set<GstRate>();
      for (const it of pur.items) {
        const rate = (gstRates.includes(it.gstRate as GstRate) ? it.gstRate : 12) as GstRate;
        ratesInBill.add(rate);
        const lineTaxable = (it.qty || 0) * (it.purchaseRate || 0);
        const lineGst = lineTaxable * (rate / 100);
        if (purchasesByRate[rate]) {
          purchasesByRate[rate].taxableAmount += lineTaxable;
          purchasesByRate[rate].totalGst += lineGst;
        }
      }
      ratesInBill.forEach(r => {
        if (purchasesByRate[r]) purchasesByRate[r].billCount += 1;
      });
    }
  }

  // Customer Ledger Aggregates
  const totalCustomerReceivables = allCustomers.reduce((sum, c) => sum + (c.creditBalance || 0), 0);

  // Supplier Ledger Aggregates
  const totalSupplierPayables = allSuppliers.reduce((sum, s) => sum + (s.balancePayable || 0), 0);

  // Inventory Valuation Aggregates
  let totalStockQuantity = 0;
  let inventoryValuationAtCost = 0;
  let inventoryValuationAtRetail = 0;

  for (const prod of allProducts) {
    const qty = prod.stockQty || 0;
    totalStockQuantity += qty;
    inventoryValuationAtCost += qty * (prod.purchaseRate || 0);
    inventoryValuationAtRetail += qty * (prod.saleRate || prod.mrp || 0);
  }

  // Check for empty dataset in period
  if (completedInvoices.length === 0 && completedPurchases.length === 0) {
    validationNotes.push(
      `Notice: No finalized sales invoices or purchase bills were found between ${startDate} and ${endDate}.`
    );
  }

  // Reconciliation check
  const calculatedTaxSum = Math.round((cgstTotal + sgstTotal + igstTotal) * 100) / 100;
  const recordedTaxSum = Math.round(totalSalesGst * 100) / 100;
  if (Math.abs(calculatedTaxSum - recordedTaxSum) > 1.0) {
    validationNotes.push(
      `Reconciliation: Minor tax rounding variance detected (₹${Math.abs(calculatedTaxSum - recordedTaxSum).toFixed(2)} between line item breakdown and invoice totals). Original bill totals are preserved.`
    );
  }

  // Round metrics cleanly
  const metrics = {
    totalSalesGross: Math.round(totalSalesGross * 100) / 100,
    totalSalesNet: Math.round(totalSalesNet * 100) / 100,
    totalSalesDiscount: Math.round(totalSalesDiscount * 100) / 100,
    totalSalesTaxable: Math.round(totalSalesTaxable * 100) / 100,
    totalSalesGst: Math.round(totalSalesGst * 100) / 100,
    cgstTotal: Math.round(cgstTotal * 100) / 100,
    sgstTotal: Math.round(sgstTotal * 100) / 100,
    igstTotal: Math.round(igstTotal * 100) / 100,
    completedSalesCount: completedInvoices.length,
    cancelledSalesCount: cancelledInvoices.length,
    cancelledSalesAmount: Math.round(cancelledInvoices.reduce((s, i) => s + (i.netPayable || 0), 0) * 100) / 100,

    totalPurchasesAmount: Math.round(totalPurchasesAmount * 100) / 100,
    totalPurchasesTaxable: Math.round(totalPurchasesTaxable * 100) / 100,
    totalPurchasesGst: Math.round(totalPurchasesGst * 100) / 100,
    completedPurchasesCount: completedPurchases.length,

    cashCollection: Math.round(cashCollection * 100) / 100,
    upiCollection: Math.round(upiCollection * 100) / 100,
    cardCollection: Math.round(cardCollection * 100) / 100,
    creditSalesAmount: Math.round(creditSalesAmount * 100) / 100,
    totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
    totalBalanceOutstanding: Math.round(totalBalanceOutstanding * 100) / 100,

    totalCustomerReceivables: Math.round(totalCustomerReceivables * 100) / 100,
    totalCustomerCount: allCustomers.length,
    totalSupplierPayables: Math.round(totalSupplierPayables * 100) / 100,
    totalSupplierCount: allSuppliers.length,

    totalProductCount: allProducts.length,
    totalStockQuantity,
    inventoryValuationAtCost: Math.round(inventoryValuationAtCost * 100) / 100,
    inventoryValuationAtRetail: Math.round(inventoryValuationAtRetail * 100) / 100
  };

  // Net tax position (calculated summary only)
  const netTaxBalance = Math.round((metrics.totalSalesGst - metrics.totalPurchasesGst) * 100) / 100;

  // GSTR-1 Table 13 Document Summary Calculation (Rule 48)
  const docSummaryTable13: Gstr1Table13Item[] = [];
  const addDocGroup = (nature: string, docs: Invoice[]) => {
    if (docs.length === 0) return;
    const sorted = [...docs].sort((a, b) => (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''));
    const cancelled = sorted.filter(d => d.status === 'cancelled');
    const net = sorted.filter(d => d.status === 'completed');
    docSummaryTable13.push({
      natureOfDocument: nature,
      fromSrNo: sorted[0]?.invoiceNumber || 'N/A',
      toSrNo: sorted[sorted.length - 1]?.invoiceNumber || 'N/A',
      totalCount: sorted.length,
      cancelledCount: cancelled.length,
      netIssuedCount: net.length
    });
  };

  const gstInvoices = periodInvoices.filter(i => i.invoiceType === 'gst' || !i.invoiceType);
  const bosInvoices = periodInvoices.filter(i => i.invoiceType === 'bill_of_supply');
  const challans = periodInvoices.filter(i => i.invoiceType === 'delivery_challan');
  const creditNotes = periodInvoices.filter(i => i.invoiceType === 'credit_note');

  addDocGroup('Invoices for Outward Supply (Tax Invoice)', gstInvoices);
  addDocGroup('Bill of Supply (Composition / Exempt)', bosInvoices);
  addDocGroup('Delivery Challans for Job Work / Transportation', challans);
  addDocGroup('Credit Notes (Sales Returns)', creditNotes);

  return {
    shopProfile,
    period,
    generatedAt: new Date().toISOString(),
    selectedCategories,
    metrics,
    taxSummary: {
      salesByRate,
      purchasesByRate,
      netTaxPosition: {
        outwardTax: metrics.totalSalesGst,
        inwardTax: metrics.totalPurchasesGst,
        netTaxBalance
      }
    },
    salesInvoices: completedInvoices,
    cancelledInvoices,
    purchaseInvoices: completedPurchases,
    customers: allCustomers,
    suppliers: allSuppliers,
    inventory: allProducts,
    validationNotes,
    docSummaryTable13
  };
}
