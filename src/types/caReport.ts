import { GstRate, Invoice, PurchaseInvoice, Customer, Supplier, Product, ShopProfile } from './index';

export type ReportPeriodType = 
  | 'this_month' 
  | 'prev_month' 
  | 'current_fy' 
  | 'prev_fy' 
  | 'custom';

export interface ReportPeriod {
  type: ReportPeriodType;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type ReportCategoryId = 
  | 'sales' 
  | 'purchases' 
  | 'customers' 
  | 'suppliers' 
  | 'tax_summary' 
  | 'payments' 
  | 'inventory';

export interface ReportCategoryConfig {
  id: ReportCategoryId;
  name: string;
  shortDesc: string;
  longDesc: string;
  isSupported: boolean;
  defaultSelected: boolean;
  categoryTag: 'Core' | 'Tax' | 'Ledger' | 'Stock';
}

export interface TaxRateBucket {
  rate: GstRate;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGst: number;
  transactionCount: number;
}

export interface Gstr1Table13Item {
  natureOfDocument: string;
  fromSrNo: string;
  toSrNo: string;
  totalCount: number;
  cancelledCount: number;
  netIssuedCount: number;
}

export interface CaReportData {
  shopProfile: ShopProfile;
  period: ReportPeriod;
  generatedAt: string;
  selectedCategories: ReportCategoryId[];

  // Reconciliation & KPI Metrics
  metrics: {
    totalSalesGross: number;
    totalSalesNet: number;
    totalSalesDiscount: number;
    totalSalesTaxable: number;
    totalSalesGst: number;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    completedSalesCount: number;
    cancelledSalesCount: number;
    cancelledSalesAmount: number;

    // Purchase Metrics
    totalPurchasesAmount: number;
    totalPurchasesTaxable: number;
    totalPurchasesGst: number;
    completedPurchasesCount: number;

    // Payments Metrics
    cashCollection: number;
    upiCollection: number;
    cardCollection: number;
    creditSalesAmount: number;
    totalPaidAmount: number;
    totalBalanceOutstanding: number;

    // Khata & Ledgers
    totalCustomerReceivables: number;
    totalCustomerCount: number;
    totalSupplierPayables: number;
    totalSupplierCount: number;

    // Inventory
    totalProductCount: number;
    totalStockQuantity: number;
    inventoryValuationAtCost: number;
    inventoryValuationAtRetail: number;
  };

  // Tax Summary Breakdowns
  taxSummary: {
    salesByRate: Record<GstRate, TaxRateBucket>;
    purchasesByRate: Record<GstRate, { rate: GstRate; taxableAmount: number; totalGst: number; billCount: number }>;
    netTaxPosition: {
      outwardTax: number;
      inwardTax: number;
      netTaxBalance: number;
    };
  };

  // Datasets for the period
  salesInvoices: Invoice[];
  cancelledInvoices: Invoice[];
  purchaseInvoices: PurchaseInvoice[];
  customers: Customer[];
  suppliers: Supplier[];
  inventory: Product[];

  // Data Integrity & Audit Notes
  validationNotes: string[];
  docSummaryTable13?: Gstr1Table13Item[];
}
