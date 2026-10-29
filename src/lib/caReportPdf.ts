import { CaReportData } from '../types/caReport';
import { formatCurrency, formatDate } from '../utils/formatters';

export function generateCaReportHtml(data: CaReportData): string {
  const { shopProfile, period, metrics, taxSummary, salesInvoices, purchaseInvoices, customers, suppliers, inventory, selectedCategories } = data;

  const generatedDateFormatted = new Date(data.generatedAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Rate-wise GST Table Rows (Sales)
  let sumTaxable = 0;
  let sumCgst = 0;
  let sumSgst = 0;
  let sumIgst = 0;
  let sumTotalGst = 0;
  let sumCount = 0;

  const salesRateRows = ([0, 5, 12, 18, 28] as const).map(rate => {
    const b = taxSummary.salesByRate[rate];
    sumTaxable += b.taxableAmount;
    sumCgst += b.cgstAmount;
    sumSgst += b.sgstAmount;
    sumIgst += b.igstAmount;
    sumTotalGst += b.totalGst;
    sumCount += b.transactionCount;

    return `
      <tr>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 700;">GST @ ${rate}%</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">₹${b.taxableAmount.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">₹${b.cgstAmount.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">₹${b.sgstAmount.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">₹${b.igstAmount.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 700; color: #1e3a8a;">₹${b.totalGst.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${b.transactionCount}</td>
      </tr>
    `;
  }).join('');

  // Rate-wise GST Purchases Rows
  const hasPurchases = selectedCategories.includes('purchases') && purchaseInvoices.length > 0;
  let sumPurTaxable = 0;
  let sumPurGst = 0;
  let sumPurCount = 0;

  const purRateRows = ([0, 5, 12, 18, 28] as const).map(rate => {
    const pb = taxSummary.purchasesByRate[rate];
    sumPurTaxable += pb.taxableAmount;
    sumPurGst += pb.totalGst;
    sumPurCount += pb.billCount;

    return `
      <tr>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 700;">GST @ ${rate}%</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">₹${pb.taxableAmount.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 700; color: #15803d;">₹${pb.totalGst.toFixed(2)}</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${pb.billCount}</td>
      </tr>
    `;
  }).join('');

  // Sales Register Table Rows (Up to 150 invoices in PDF print for performance and clean paging)
  const salesTableRows = salesInvoices.map((inv, idx) => `
    <tr style="page-break-inside: avoid; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-size: 8.5px;">${idx + 1}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: 700; font-size: 9px;">${inv.invoiceNumber}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-size: 8.5px; white-space: nowrap;">${formatDate(inv.date)}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; text-transform: uppercase;">${inv.customerName || 'Cash Customer'}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 8.5px;">${inv.customerGstin || '-'}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: center; font-size: 8px; text-transform: uppercase; font-weight: bold;">${inv.paymentMode}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 8.5px;">₹${(inv.subtotal || 0).toFixed(2)}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 8.5px;">₹${(inv.totalGst || 0).toFixed(2)}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 700; font-size: 9px; color: #1e3a8a;">₹${(inv.netPayable || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  // Purchase Register Table Rows
  const purchaseTableRows = purchaseInvoices.map((pur, idx) => `
    <tr style="page-break-inside: avoid; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-size: 8.5px;">${idx + 1}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-size: 8.5px; white-space: nowrap;">${formatDate(pur.invoiceDate)}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-weight: 700; font-family: monospace; font-size: 9px;">${pur.invoiceNumber}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; text-transform: uppercase;">${pur.supplierName}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 8.5px;">${pur.supplierGstin || '-'}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 8.5px;">₹${(pur.subtotal || 0).toFixed(2)}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 8.5px;">₹${(pur.totalGst || 0).toFixed(2)}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 700; font-size: 9px; color: #15803d;">₹${(pur.grandTotal || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  // Customer Khata Rows (Top balances)
  const topCustomers = [...customers]
    .filter(c => Math.abs(c.creditBalance || 0) > 0)
    .sort((a, b) => (b.creditBalance || 0) - (a.creditBalance || 0))
    .slice(0, 30);

  const customerRows = topCustomers.map((c, idx) => `
    <tr style="page-break-inside: avoid; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-size: 8.5px;">${idx + 1}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: bold; text-transform: uppercase;">${c.name}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 8.5px;">${c.mobile || '-'}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 8.5px;">${c.gstin || '-'}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; font-size: 8.5px;">${c.city || '-'}</td>
      <td style="padding: 3px 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 700; font-size: 9px; color: #b45309;">₹${(c.creditBalance || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>WebRajya_CA_Report_${period.startDate}_to_${period.endDate}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            font-size: 9px;
            line-height: 1.25;
          }
          .header-banner {
            border: 2px solid #1e3a8a;
            border-radius: 6px;
            padding: 8px 12px;
            background: #f8fafc;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
          }
          .business-title {
            font-size: 15px;
            font-weight: 900;
            color: #1e3a8a;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .business-sub {
            font-size: 9px;
            color: #475569;
            margin-top: 1px;
            font-weight: 600;
          }
          .business-meta {
            font-size: 8.5px;
            color: #334155;
            margin-top: 2px;
            line-height: 1.3;
          }
          .report-badge {
            text-align: right;
          }
          .badge-title {
            font-size: 12px;
            font-weight: 900;
            color: #b45309;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1.5px solid #b45309;
            padding-bottom: 2px;
            display: inline-block;
          }
          .badge-period {
            font-size: 10px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 3px;
          }
          .badge-meta {
            font-size: 8px;
            color: #64748b;
            margin-top: 2px;
          }

          /* KPI Dashboard Grid */
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin-bottom: 12px;
          }
          .kpi-card {
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            padding: 6px 8px;
            background: #ffffff;
          }
          .kpi-label {
            font-size: 7.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.3px;
          }
          .kpi-value {
            font-size: 13px;
            font-weight: 900;
            font-family: monospace;
            margin-top: 2px;
            color: #0f172a;
          }
          .kpi-sub {
            font-size: 7.5px;
            color: #64748b;
            margin-top: 1px;
          }

          /* Section Titles */
          .section-heading {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: #1e3a8a;
            border-bottom: 1.5px solid #1e3a8a;
            padding-bottom: 2px;
            margin-top: 10px;
            margin-bottom: 5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          /* Tables */
          table.report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5px;
            margin-bottom: 8px;
          }
          table.report-table th {
            background-color: #f1f5f9;
            color: #0f172a;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 8px;
            padding: 4px 5px;
            border: 1px solid #94a3b8;
            letter-spacing: 0.2px;
          }
          table.report-table td {
            padding: 3px 5px;
            border: 1px solid #cbd5e1;
          }
          tr.total-row td {
            background-color: #e2e8f0;
            font-weight: 900;
            font-size: 9px;
            border-top: 1.5px solid #475569;
          }

          /* Disclaimer & Signatory Footer */
          .footer-section {
            page-break-inside: avoid;
            margin-top: 15px;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .disclaimer-box {
            width: 60%;
            font-size: 7.5px;
            color: #64748b;
            line-height: 1.3;
          }
          .signatory-box {
            width: 35%;
            text-align: right;
            border-top: 1px dashed #94a3b8;
            padding-top: 25px;
            font-size: 8.5px;
            font-weight: 800;
            color: #0f172a;
          }

          .page-footer-note {
            font-size: 7.5px;
            color: #94a3b8;
            text-align: center;
            margin-top: 8px;
            border-top: 1px solid #f1f5f9;
            padding-top: 3px;
          }
        </style>
      </head>
      <body>
        <!-- Header Banner -->
        <div class="header-banner">
          <div>
            <div class="business-title">${shopProfile.shopName || 'Retail Store'}</div>
            <div class="business-sub">${shopProfile.tagline || 'RETAIL & WHOLESALE TRADING'}</div>
            <div class="business-meta">
              <strong>Address:</strong> ${shopProfile.address || 'Address Not Configured'}<br />
              <strong>GSTIN:</strong> ${shopProfile.gstin || 'Not Provided'} &nbsp;|&nbsp; <strong>State:</strong> ${shopProfile.state || 'Madhya Pradesh (23)'}<br />
              <strong>Phone:</strong> ${shopProfile.phone || ''} &nbsp;|&nbsp; <strong>Email:</strong> ${shopProfile.email || ''}
            </div>
          </div>
          <div class="report-badge">
            <div class="badge-title">CHARTERED ACCOUNTANT REPORT PACK</div>
            <div class="badge-period">${period.label}</div>
            <div class="badge-meta">Date Range: <strong>${formatDate(period.startDate)}</strong> to <strong>${formatDate(period.endDate)}</strong></div>
            <div class="badge-meta">Generated: ${generatedDateFormatted}</div>
          </div>
        </div>

        <!-- 1. Executive Performance Overview (KPIs) -->
        <div class="kpi-grid">
          <div class="kpi-card" style="border-left: 3px solid #1e3a8a;">
            <div class="kpi-label">Total Net Sales</div>
            <div class="kpi-value" style="color: #1e3a8a;">₹${metrics.totalSalesNet.toFixed(2)}</div>
            <div class="kpi-sub">${metrics.completedSalesCount} Billed Invoices</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #15803d;">
            <div class="kpi-label">Taxable Turnover</div>
            <div class="kpi-value" style="color: #15803d;">₹${metrics.totalSalesTaxable.toFixed(2)}</div>
            <div class="kpi-sub">Total Disc: ₹${metrics.totalSalesDiscount.toFixed(2)}</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #d97706;">
            <div class="kpi-label">Sales Output GST</div>
            <div class="kpi-value" style="color: #d97706;">₹${metrics.totalSalesGst.toFixed(2)}</div>
            <div class="kpi-sub">CGST+SGST: ₹${(metrics.cgstTotal + metrics.sgstTotal).toFixed(2)}</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #0284c7;">
            <div class="kpi-label">Purchases (Inward)</div>
            <div class="kpi-value" style="color: #0284c7;">₹${metrics.totalPurchasesAmount.toFixed(2)}</div>
            <div class="kpi-sub">Input GST (ITC): ₹${metrics.totalPurchasesGst.toFixed(2)}</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #059669;">
            <div class="kpi-label">Cash Tendered</div>
            <div class="kpi-value" style="color: #059669;">₹${metrics.cashCollection.toFixed(2)}</div>
            <div class="kpi-sub">Physical Cash Receipts</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #2563eb;">
            <div class="kpi-label">UPI / Digital Receipts</div>
            <div class="kpi-value" style="color: #2563eb;">₹${metrics.upiCollection.toFixed(2)}</div>
            <div class="kpi-sub">QR & Online Banking</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #b45309;">
            <div class="kpi-label">Customer Khata Balance</div>
            <div class="kpi-value" style="color: #b45309;">₹${metrics.totalCustomerReceivables.toFixed(2)}</div>
            <div class="kpi-sub">Total Receivables</div>
          </div>

          <div class="kpi-card" style="border-left: 3px solid #4f46e5;">
            <div class="kpi-label">Stock Valuation (Cost)</div>
            <div class="kpi-value" style="color: #4f46e5;">₹${metrics.inventoryValuationAtCost.toFixed(2)}</div>
            <div class="kpi-sub">${metrics.totalStockQuantity} Units in Stock</div>
          </div>
        </div>

        <!-- 2. Rate-Wise GST Outward Supplies Matrix -->
        <div class="section-heading">
          <span>1. Outward Supplies Tax Summary (Sales by GST Rate Slab)</span>
          <span style="font-size: 8px; font-weight: normal; color: #64748b;">Indian GST Schedule</span>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 14%; text-align: left;">Rate Slab</th>
              <th style="width: 16%; text-align: right;">Taxable Amount</th>
              <th style="width: 14%; text-align: right;">CGST</th>
              <th style="width: 14%; text-align: right;">SGST</th>
              <th style="width: 14%; text-align: right;">IGST</th>
              <th style="width: 16%; text-align: right;">Total GST Tax</th>
              <th style="width: 12%; text-align: center;">Bills Count</th>
            </tr>
          </thead>
          <tbody>
            ${salesRateRows}
            <tr class="total-row">
              <td>TOTAL SALES</td>
              <td style="text-align: right; font-family: monospace;">₹${sumTaxable.toFixed(2)}</td>
              <td style="text-align: right; font-family: monospace;">₹${sumCgst.toFixed(2)}</td>
              <td style="text-align: right; font-family: monospace;">₹${sumSgst.toFixed(2)}</td>
              <td style="text-align: right; font-family: monospace;">₹${sumIgst.toFixed(2)}</td>
              <td style="text-align: right; font-family: monospace; color: #1e3a8a;">₹${sumTotalGst.toFixed(2)}</td>
              <td style="text-align: center; font-family: monospace;">${sumCount}</td>
            </tr>
          </tbody>
        </table>

        <!-- 2.1 Rate-Wise GST Inward Purchases Matrix (if applicable) -->
        ${hasPurchases ? `
          <div class="section-heading" style="margin-top: 12px;">
            <span>2. Inward Supplies Tax Summary (Purchases / Input Tax Credit)</span>
            <span style="font-size: 8px; font-weight: normal; color: #64748b;">Recorded Inward Bills</span>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 25%; text-align: left;">Rate Slab</th>
                <th style="width: 30%; text-align: right;">Taxable Inward Purchase</th>
                <th style="width: 25%; text-align: right;">Input GST (ITC)</th>
                <th style="width: 20%; text-align: center;">Bills Count</th>
              </tr>
            </thead>
            <tbody>
              ${purRateRows}
              <tr class="total-row">
                <td>TOTAL PURCHASES</td>
                <td style="text-align: right; font-family: monospace;">₹${sumPurTaxable.toFixed(2)}</td>
                <td style="text-align: right; font-family: monospace; color: #15803d;">₹${sumPurGst.toFixed(2)}</td>
                <td style="text-align: center; font-family: monospace;">${sumPurCount}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <!-- 3. Sales Register Itemized Table -->
        ${selectedCategories.includes('sales') && salesInvoices.length > 0 ? `
          <div class="section-heading" style="margin-top: 14px;">
            <span>${hasPurchases ? '3' : '2'}. Sales Register (${salesInvoices.length} Bills)</span>
            <span style="font-size: 8px; font-weight: normal; color: #64748b;">Completed Invoices</span>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 4%; text-align: center;">#</th>
                <th style="width: 13%;">Invoice #</th>
                <th style="width: 9%;">Date</th>
                <th style="width: 24%; text-align: left;">Customer</th>
                <th style="width: 14%;">GSTIN</th>
                <th style="width: 8%; text-align: center;">Mode</th>
                <th style="width: 9%; text-align: right;">Taxable</th>
                <th style="width: 8%; text-align: right;">GST</th>
                <th style="width: 11%; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${salesTableRows}
              <tr class="total-row">
                <td colspan="6" style="text-align: right; padding-right: 8px;">TOTALS:</td>
                <td style="text-align: right; font-family: monospace;">₹${metrics.totalSalesTaxable.toFixed(2)}</td>
                <td style="text-align: right; font-family: monospace;">₹${metrics.totalSalesGst.toFixed(2)}</td>
                <td style="text-align: right; font-family: monospace; color: #1e3a8a;">₹${metrics.totalSalesNet.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <!-- 4. Purchase Register Itemized Table -->
        ${hasPurchases ? `
          <div class="section-heading" style="margin-top: 14px;">
            <span>4. Purchase Register (${purchaseInvoices.length} Bills)</span>
            <span style="font-size: 8px; font-weight: normal; color: #64748b;">Inward Vendor Records</span>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 4%; text-align: center;">#</th>
                <th style="width: 10%;">Date</th>
                <th style="width: 14%;">Bill #</th>
                <th style="width: 28%; text-align: left;">Supplier Name</th>
                <th style="width: 14%;">GSTIN</th>
                <th style="width: 10%; text-align: right;">Subtotal</th>
                <th style="width: 9%; text-align: right;">GST</th>
                <th style="width: 11%; text-align: right;">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              ${purchaseTableRows}
              <tr class="total-row">
                <td colspan="5" style="text-align: right; padding-right: 8px;">TOTALS:</td>
                <td style="text-align: right; font-family: monospace;">₹${metrics.totalPurchasesTaxable.toFixed(2)}</td>
                <td style="text-align: right; font-family: monospace;">₹${metrics.totalPurchasesGst.toFixed(2)}</td>
                <td style="text-align: right; font-family: monospace; color: #15803d;">₹${metrics.totalPurchasesAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <!-- 5. Customer Khata Receivables Summary -->
        ${selectedCategories.includes('customers') && customerRows ? `
          <div class="section-heading" style="margin-top: 14px;">
            <span>${hasPurchases ? '5' : '3'}. Customer Khata & Receivables (Top Balances)</span>
            <span style="font-size: 8px; font-weight: normal; color: #64748b;">Outstanding Credit Ledger</span>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">#</th>
                <th style="width: 32%; text-align: left;">Customer Name</th>
                <th style="width: 16%;">Mobile</th>
                <th style="width: 17%;">GSTIN</th>
                <th style="width: 15%;">City</th>
                <th style="width: 15%; text-align: right;">Balance Due</th>
              </tr>
            </thead>
            <tbody>
              ${customerRows}
              <tr class="total-row">
                <td colspan="5" style="text-align: right; padding-right: 8px;">TOTAL RECEIVABLES:</td>
                <td style="text-align: right; font-family: monospace; color: #b45309;">₹${metrics.totalCustomerReceivables.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <!-- GSTR-1 Table 13 Document Summary (Rule 48) -->
        ${data.docSummaryTable13 && data.docSummaryTable13.length > 0 ? `
          <div class="section-title">GSTR-1 Table 13: Documents Issued During Tax Period (Rule 48)</div>
          <table>
            <thead>
              <tr>
                <th style="width: 45%;">Nature of Document</th>
                <th style="width: 15%; text-align: center;">Sr. No. From</th>
                <th style="width: 15%; text-align: center;">Sr. No. To</th>
                <th style="width: 8%; text-align: center;">Total Count</th>
                <th style="width: 8%; text-align: center;">Cancelled</th>
                <th style="width: 9%; text-align: center;">Net Issued</th>
              </tr>
            </thead>
            <tbody>
              ${data.docSummaryTable13.map(row => `
                <tr>
                  <td style="font-weight: bold; color: #1e3a8a;">${row.natureOfDocument}</td>
                  <td style="text-align: center; font-family: monospace;">${row.fromSrNo}</td>
                  <td style="text-align: center; font-family: monospace;">${row.toSrNo}</td>
                  <td style="text-align: center; font-family: monospace; font-weight: bold;">${row.totalCount}</td>
                  <td style="text-align: center; font-family: monospace; color: #dc2626;">${row.cancelledCount}</td>
                  <td style="text-align: center; font-family: monospace; font-weight: bold; color: #16a34a;">${row.netIssuedCount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <!-- Audit & Reconciliation Notes -->
        ${data.validationNotes.length > 0 ? `
          <div style="margin-top: 12px; padding: 6px 10px; background-color: #fefce8; border: 1px solid #fde047; border-radius: 4px; font-size: 8px; color: #854d0e;">
            <strong>System Audit Notes:</strong>
            <ul style="margin: 2px 0 0 16px; padding: 0;">
              ${data.validationNotes.map(n => `<li>${n}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Declaration & Authorized Signatory Footer -->
        <div class="footer-section">
          <div class="disclaimer-box">
            <strong>COMPILATION DECLARATION & NOTES FOR CHARTERED ACCOUNTANT:</strong><br />
            1. This report pack has been generated directly from the underlying transactional database maintained in <strong>WebRajya Invoice</strong>.<br />
            2. All figures represent recorded invoices and inward bills within the authorized business account for internal compilation and accounting audit.<br />
            3. Tax calculations and summaries are compiled from recorded line items and do not constitute statutory certification or GST filing approval.
          </div>
          <div class="signatory-box">
            For <strong>${shopProfile.shopName || 'Retail Store'}</strong><br />
            <br />
            <br />
            Authorised Signatory / Proprietor
          </div>
        </div>

        <div class="page-footer-note">
          WebRajya Invoice | Report ID: WR-CA-${Date.now().toString(36).toUpperCase()} | Page 1 of 1
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
    </html>
  `;
}

// Print / Save as PDF Trigger
export function triggerCaReportPrint(data: CaReportData) {
  const html = generateCaReportHtml(data);
  const docTitle = `WebRajya_CA_Report_${data.period.startDate}_to_${data.period.endDate}`;

  try {
    const printWindow = window.open('', '_blank', 'width=1000,height=900');
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.title = `${docTitle}.pdf`;
      printWindow.document.write(html);
      printWindow.document.close();
      return;
    }
  } catch (e) {
    console.warn('Popup blocked, falling back to hidden iframe printing:', e);
  }

  // Fallback: hidden iframe printing
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
      doc.title = `${docTitle}.pdf`;
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 4000);
      }, 500);
    }
  } catch (err) {
    console.error('Print trigger failed:', err);
  }
}
