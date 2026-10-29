import * as XLSX from 'xlsx';
import { CaReportData } from '../types/caReport';
import { formatCurrency, formatDate } from '../utils/formatters';

// Utility to trigger browser download of a Blob
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 1. Generate Master Multi-Sheet Excel Workbook
export function exportCaMasterExcelWorkbook(data: CaReportData) {
  const wb = XLSX.utils.book_new();
  const { shopProfile, period, metrics, taxSummary, salesInvoices, purchaseInvoices, customers, suppliers, inventory, selectedCategories } = data;

  // --- SHEET 1: Executive Summary & Tax Matrix ---
  const summaryAoa: any[][] = [
    ['WEBRAJYA INVOICE - CHARTERED ACCOUNTANT REPORT PACK'],
    [`Business Name: ${shopProfile.shopName || 'Retail Store'}`],
    [`GSTIN: ${shopProfile.gstin || 'Not Provided'} | State: ${shopProfile.state || 'Madhya Pradesh (23)'}`],
    [`Address: ${shopProfile.address || ''} | Contact: ${shopProfile.phone || ''}`],
    [`Reporting Period: ${period.label} (${period.startDate} to ${period.endDate})`],
    [`Generated On: ${new Date(data.generatedAt).toLocaleString('en-IN')}`],
    [],
    ['KEY PERFORMANCE INDICATORS (PERIOD OVERVIEW)'],
    ['Metric Name', 'Value (INR / Count)', 'Notes'],
    ['Total Net Sales Turnover', metrics.totalSalesNet, 'Completed outward sales invoices within period'],
    ['Total Taxable Sales Turnover', metrics.totalSalesTaxable, 'Taxable base amount excluding GST'],
    ['Total Sales Output GST', metrics.totalSalesGst, 'CGST + SGST + IGST collected'],
    ['Total Inward Purchases (Gross)', metrics.totalPurchasesAmount, 'Inward purchase bills recorded'],
    ['Total Purchase Input GST (ITC)', metrics.totalPurchasesGst, 'Input GST recorded on purchases'],
    ['Net GST Position (Outward - Inward)', taxSummary.netTaxPosition.netTaxBalance, 'Calculated indicative balance (not statutory filing)'],
    ['Total Completed Sales Bills', metrics.completedSalesCount, 'Excludes cancelled bills'],
    ['Cancelled Bills Count', metrics.cancelledSalesCount, `Total value: Rs. ${metrics.cancelledSalesAmount.toFixed(2)} (excluded)`],
    ['Cash Collection', metrics.cashCollection, 'Tender cash received'],
    ['UPI / Digital Collection', metrics.upiCollection, 'QR / Bank collections'],
    ['Total Khata Receivables (Customers)', metrics.totalCustomerReceivables, `Across ${metrics.totalCustomerCount} customer(s)`],
    ['Total Supplier Payables', metrics.totalSupplierPayables, `Across ${metrics.totalSupplierCount} supplier(s)`],
    ['Stock Valuation (Cost Rate)', metrics.inventoryValuationAtCost, `Across ${metrics.totalStockQuantity} units in catalog`],
    [],
    ['GST OUTWARD SUPPLIES SUMMARY (SALES BY RATE SLAB)'],
    ['GST Rate Slab', 'Taxable Turnover (Rs.)', 'CGST Amount (Rs.)', 'SGST Amount (Rs.)', 'IGST Amount (Rs.)', 'Total GST (Rs.)', 'Invoices Count']
  ];

  let sumTaxableSales = 0;
  let sumCgstSales = 0;
  let sumSgstSales = 0;
  let sumIgstSales = 0;
  let sumTotalGstSales = 0;
  let sumInvCount = 0;

  ([0, 5, 12, 18, 28] as const).forEach(rate => {
    const b = taxSummary.salesByRate[rate];
    sumTaxableSales += b.taxableAmount;
    sumCgstSales += b.cgstAmount;
    sumSgstSales += b.sgstAmount;
    sumIgstSales += b.igstAmount;
    sumTotalGstSales += b.totalGst;
    sumInvCount += b.transactionCount;

    summaryAoa.push([
      `GST @ ${rate}%`,
      Number(b.taxableAmount.toFixed(2)),
      Number(b.cgstAmount.toFixed(2)),
      Number(b.sgstAmount.toFixed(2)),
      Number(b.igstAmount.toFixed(2)),
      Number(b.totalGst.toFixed(2)),
      b.transactionCount
    ]);
  });

  summaryAoa.push([
    'TOTAL OUTWARD SUPPLIES',
    Number(sumTaxableSales.toFixed(2)),
    Number(sumCgstSales.toFixed(2)),
    Number(sumSgstSales.toFixed(2)),
    Number(sumIgstSales.toFixed(2)),
    Number(sumTotalGstSales.toFixed(2)),
    sumInvCount
  ]);

  // Purchases Inward Tax Breakdown
  if (purchaseInvoices.length > 0) {
    summaryAoa.push([]);
    summaryAoa.push(['GST INWARD SUPPLIES SUMMARY (PURCHASES BY RATE SLAB)']);
    summaryAoa.push(['GST Rate Slab', 'Taxable Purchase Value (Rs.)', 'Input GST (Rs.)', 'Bills Count']);

    let sumTaxablePur = 0;
    let sumGstPur = 0;
    let sumBillsPur = 0;

    ([0, 5, 12, 18, 28] as const).forEach(rate => {
      const pb = taxSummary.purchasesByRate[rate];
      sumTaxablePur += pb.taxableAmount;
      sumGstPur += pb.totalGst;
      sumBillsPur += pb.billCount;

      summaryAoa.push([
        `GST @ ${rate}%`,
        Number(pb.taxableAmount.toFixed(2)),
        Number(pb.totalGst.toFixed(2)),
        pb.billCount
      ]);
    });

    summaryAoa.push([
      'TOTAL INWARD SUPPLIES',
      Number(sumTaxablePur.toFixed(2)),
      Number(sumGstPur.toFixed(2)),
      sumBillsPur
    ]);
  }

  // GSTR-1 Table 13: Documents Issued During Tax Period (Rule 48)
  if (data.docSummaryTable13 && data.docSummaryTable13.length > 0) {
    summaryAoa.push([]);
    summaryAoa.push(['GSTR-1 TABLE 13: DOCUMENTS ISSUED DURING THE TAX PERIOD (RULE 48)']);
    summaryAoa.push(['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled', 'Net Issued']);
    data.docSummaryTable13.forEach(d => {
      summaryAoa.push([
        d.natureOfDocument,
        d.fromSrNo,
        d.toSrNo,
        d.totalCount,
        d.cancelledCount,
        d.netIssuedCount
      ]);
    });
  }

  // Audit notes
  if (data.validationNotes.length > 0) {
    summaryAoa.push([]);
    summaryAoa.push(['AUDIT & RECONCILIATION NOTES']);
    data.validationNotes.forEach(note => summaryAoa.push(['•', note]));
  }

  summaryAoa.push([]);
  summaryAoa.push(['DISCLAIMER: This report is compiled from data recorded in WebRajya Invoice software for accounting review and compilation by your Chartered Accountant. It does not certify statutory compliance.']);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 45 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary & Tax Matrix');

  // --- SHEET 2: Sales Register ---
  if (selectedCategories.includes('sales')) {
    const salesAoa: any[][] = [
      ['SALES REGISTER - WEBRAJYA INVOICE'],
      [`Period: ${period.startDate} to ${period.endDate} | Generated: ${new Date(data.generatedAt).toLocaleDateString('en-IN')}`],
      [],
      [
        'S.No', 'Invoice Number', 'Invoice Date', 'Customer Name', 'Customer Mobile', 
        'Customer GSTIN', 'Bill Type', 'Payment Mode', 'Subtotal (Taxable)', 'Discount (Rs.)', 
        'CGST (Rs.)', 'SGST (Rs.)', 'IGST (Rs.)', 'Total GST (Rs.)', 'Freight (Rs.)', 
        'Round Off (Rs.)', 'Net Amount (Rs.)', 'Paid Amount (Rs.)', 'Balance Due (Rs.)', 
        'Status', 'UTR / Transaction Ref'
      ]
    ];

    let tSubtotal = 0;
    let tDiscount = 0;
    let tCgst = 0;
    let tSgst = 0;
    let tIgst = 0;
    let tGst = 0;
    let tFreight = 0;
    let tNet = 0;
    let tPaid = 0;
    let tBal = 0;

    salesInvoices.forEach((inv, idx) => {
      tSubtotal += inv.subtotal || 0;
      tDiscount += inv.totalDiscount || 0;
      tCgst += inv.cgstTotal || 0;
      tSgst += inv.sgstTotal || 0;
      tIgst += inv.igstTotal || 0;
      tGst += inv.totalGst || 0;
      tFreight += inv.freightAmount || 0;
      tNet += inv.netPayable || 0;
      tPaid += inv.paidAmount || 0;
      tBal += inv.balanceAmount || 0;

      salesAoa.push([
        idx + 1,
        inv.invoiceNumber,
        inv.date,
        inv.customerName || 'Cash Customer',
        inv.customerMobile || '',
        inv.customerGstin || '',
        (inv.invoiceType || 'gst').toUpperCase(),
        inv.paymentMode.toUpperCase(),
        Number((inv.subtotal || 0).toFixed(2)),
        Number((inv.totalDiscount || 0).toFixed(2)),
        Number((inv.cgstTotal || 0).toFixed(2)),
        Number((inv.sgstTotal || 0).toFixed(2)),
        Number((inv.igstTotal || 0).toFixed(2)),
        Number((inv.totalGst || 0).toFixed(2)),
        Number((inv.freightAmount || 0).toFixed(2)),
        Number((inv.roundOff || 0).toFixed(2)),
        Number((inv.netPayable || 0).toFixed(2)),
        Number((inv.paidAmount || 0).toFixed(2)),
        Number((inv.balanceAmount || 0).toFixed(2)),
        inv.status.toUpperCase(),
        inv.transactionRef || inv.upiReference || ''
      ]);
    });

    salesAoa.push([
      'TOTAL', '', '', `${salesInvoices.length} Bills`, '', '', '', '',
      Number(tSubtotal.toFixed(2)),
      Number(tDiscount.toFixed(2)),
      Number(tCgst.toFixed(2)),
      Number(tSgst.toFixed(2)),
      Number(tIgst.toFixed(2)),
      Number(tGst.toFixed(2)),
      Number(tFreight.toFixed(2)),
      '',
      Number(tNet.toFixed(2)),
      Number(tPaid.toFixed(2)),
      Number(tBal.toFixed(2)),
      '', ''
    ]);

    const wsSales = XLSX.utils.aoa_to_sheet(salesAoa);
    wsSales['!cols'] = [
      { wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, 
      { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, 
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSales, 'Sales Register');
  }

  // --- SHEET 3: Purchase Register ---
  if (selectedCategories.includes('purchases') && purchaseInvoices.length > 0) {
    const purAoa: any[][] = [
      ['PURCHASE REGISTER - WEBRAJYA INVOICE'],
      [`Period: ${period.startDate} to ${period.endDate}`],
      [],
      [
        'S.No', 'Supplier Name', 'Supplier GSTIN', 'Bill Number', 'Invoice Date', 
        'Total Items', 'Subtotal Taxable (Rs.)', 'Total GST (Rs.)', 'Grand Total (Rs.)', 'Status'
      ]
    ];

    let tPurSub = 0;
    let tPurGst = 0;
    let tPurGrand = 0;

    purchaseInvoices.forEach((pur, idx) => {
      tPurSub += pur.subtotal || 0;
      tPurGst += pur.totalGst || 0;
      tPurGrand += pur.grandTotal || 0;

      purAoa.push([
        idx + 1,
        pur.supplierName,
        pur.supplierGstin || '',
        pur.invoiceNumber,
        pur.invoiceDate,
        pur.totalItems || (pur.items ? pur.items.length : 0),
        Number((pur.subtotal || 0).toFixed(2)),
        Number((pur.totalGst || 0).toFixed(2)),
        Number((pur.grandTotal || 0).toFixed(2)),
        (pur.status || 'completed').toUpperCase()
      ]);
    });

    purAoa.push([
      'TOTAL', `${purchaseInvoices.length} Bills`, '', '', '', '',
      Number(tPurSub.toFixed(2)),
      Number(tPurGst.toFixed(2)),
      Number(tPurGrand.toFixed(2)),
      ''
    ]);

    const wsPur = XLSX.utils.aoa_to_sheet(purAoa);
    wsPur['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, 
      { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPur, 'Purchase Register');
  }

  // --- SHEET 4: Payments & Collections ---
  if (selectedCategories.includes('payments')) {
    const payAoa: any[][] = [
      ['PAYMENTS & COLLECTIONS LOG - WEBRAJYA INVOICE'],
      [`Period: ${period.startDate} to ${period.endDate}`],
      [],
      [
        'S.No', 'Invoice Number', 'Date', 'Customer Name', 'Payment Mode', 
        'Amount Paid (Rs.)', 'Balance Amount (Rs.)', 'Transaction Ref / UTR', 'Settlement Status'
      ]
    ];

    let tPaidTotal = 0;
    let tBalTotal = 0;

    salesInvoices.forEach((inv, idx) => {
      tPaidTotal += inv.paidAmount || 0;
      tBalTotal += inv.balanceAmount || 0;

      payAoa.push([
        idx + 1,
        inv.invoiceNumber,
        inv.date,
        inv.customerName || 'Cash Customer',
        inv.paymentMode.toUpperCase(),
        Number((inv.paidAmount || 0).toFixed(2)),
        Number((inv.balanceAmount || 0).toFixed(2)),
        inv.transactionRef || inv.upiReference || '',
        inv.balanceAmount <= 0 ? 'Fully Settled' : 'Partial / Balance Due'
      ]);
    });

    payAoa.push([
      'TOTAL', '', '', '', '',
      Number(tPaidTotal.toFixed(2)),
      Number(tBalTotal.toFixed(2)),
      '', ''
    ]);

    const wsPay = XLSX.utils.aoa_to_sheet(payAoa);
    wsPay['!cols'] = [
      { wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, 
      { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPay, 'Payments & Collections');
  }

  // --- SHEET 5: Customer Khata (Receivables) ---
  if (selectedCategories.includes('customers')) {
    const custAoa: any[][] = [
      ['CUSTOMER KHATA & RECEIVABLES DIRECTORY - WEBRAJYA INVOICE'],
      [`Compiled As Of: ${new Date(data.generatedAt).toLocaleDateString('en-IN')}`],
      [],
      [
        'S.No', 'Customer Name', 'Mobile', 'GSTIN', 'City', 'Address', 
        'Credit Balance Due (Rs.)', 'Credit Limit (Rs.)', 'Notes'
      ]
    ];

    let tCustBal = 0;
    customers.forEach((c, idx) => {
      tCustBal += c.creditBalance || 0;
      custAoa.push([
        idx + 1,
        c.name,
        c.mobile || '',
        c.gstin || '',
        c.city || '',
        c.address || '',
        Number((c.creditBalance || 0).toFixed(2)),
        c.creditLimit ? Number(c.creditLimit.toFixed(2)) : 'Not Set',
        c.notes || ''
      ]);
    });

    custAoa.push([
      'TOTAL', `${customers.length} Customers`, '', '', '', '',
      Number(tCustBal.toFixed(2)),
      '', ''
    ]);

    const wsCust = XLSX.utils.aoa_to_sheet(custAoa);
    wsCust['!cols'] = [
      { wch: 6 }, { wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, 
      { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCust, 'Customer Khata');
  }

  // --- SHEET 6: Suppliers (Payables) ---
  if (selectedCategories.includes('suppliers') && suppliers.length > 0) {
    const supAoa: any[][] = [
      ['SUPPLIERS & PAYABLES DIRECTORY - WEBRAJYA INVOICE'],
      [`Compiled As Of: ${new Date(data.generatedAt).toLocaleDateString('en-IN')}`],
      [],
      ['S.No', 'Supplier Name', 'Mobile', 'GSTIN', 'Address', 'Balance Payable (Rs.)']
    ];

    let tSupBal = 0;
    suppliers.forEach((s, idx) => {
      tSupBal += s.balancePayable || 0;
      supAoa.push([
        idx + 1,
        s.name,
        s.mobile || '',
        s.gstin || '',
        s.address || '',
        Number((s.balancePayable || 0).toFixed(2))
      ]);
    });

    supAoa.push([
      'TOTAL', `${suppliers.length} Suppliers`, '', '', '',
      Number(tSupBal.toFixed(2))
    ]);

    const wsSup = XLSX.utils.aoa_to_sheet(supAoa);
    wsSup['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 32 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSup, 'Suppliers Ledger');
  }

  // --- SHEET 7: Stock & Inventory Valuation ---
  if (selectedCategories.includes('inventory')) {
    const invAoa: any[][] = [
      ['STOCK & INVENTORY VALUATION REPORT - WEBRAJYA INVOICE'],
      [`Compiled As Of: ${new Date(data.generatedAt).toLocaleDateString('en-IN')}`],
      [],
      [
        'S.No', 'Product Name', 'Category', 'SKU', 'Barcode', 'HSN Code', 
        'Unit', 'GST Rate (%)', 'Stock Qty', 'Purchase Rate (Rs.)', 
        'Sale Rate (Rs.)', 'Valuation at Cost (Rs.)', 'Valuation at Sale (Rs.)'
      ]
    ];

    let tQty = 0;
    let tValCost = 0;
    let tValRetail = 0;

    inventory.forEach((p, idx) => {
      const q = p.stockQty || 0;
      const vCost = q * (p.purchaseRate || 0);
      const vRetail = q * (p.saleRate || p.mrp || 0);
      tQty += q;
      tValCost += vCost;
      tValRetail += vRetail;

      invAoa.push([
        idx + 1,
        p.name,
        p.category || '',
        p.sku || '',
        p.barcode || '',
        p.hsnCode || '',
        p.unit || '',
        p.gstRate || 0,
        q,
        Number((p.purchaseRate || 0).toFixed(2)),
        Number((p.saleRate || 0).toFixed(2)),
        Number(vCost.toFixed(2)),
        Number(vRetail.toFixed(2))
      ]);
    });

    invAoa.push([
      'TOTAL', `${inventory.length} Products`, '', '', '', '', '', '',
      tQty, '', '',
      Number(tValCost.toFixed(2)),
      Number(tValRetail.toFixed(2))
    ]);

    const wsInv = XLSX.utils.aoa_to_sheet(invAoa);
    wsInv['!cols'] = [
      { wch: 6 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, 
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, wsInv, 'Stock & Valuation');
  }

  // Generate Excel binary and trigger download
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `WebRajya_CA_Reports_${period.startDate}_to_${period.endDate}.xlsx`;
  downloadBlob(blob, filename);

  return { filename, blob };
}

// 2. Individual CSV Exports for specific accounting platforms
export function exportCaSalesCSV(data: CaReportData) {
  const headers = [
    'InvoiceNumber', 'InvoiceDate', 'CustomerName', 'CustomerMobile', 'CustomerGSTIN',
    'BillType', 'PaymentMode', 'SubtotalTaxable', 'DiscountAmount', 'CGST', 'SGST', 
    'IGST', 'TotalGST', 'FreightAmount', 'RoundOff', 'GrandTotalNetPayable', 
    'PaidAmount', 'BalanceAmount', 'Status', 'TransactionRef'
  ];

  const rows = data.salesInvoices.map(inv => [
    `"${inv.invoiceNumber}"`,
    `"${inv.date}"`,
    `"${(inv.customerName || '').replace(/"/g, '""')}"`,
    `"${inv.customerMobile || ''}"`,
    `"${inv.customerGstin || ''}"`,
    `"${inv.invoiceType || 'gst'}"`,
    `"${inv.paymentMode}"`,
    (inv.subtotal || 0).toFixed(2),
    (inv.totalDiscount || 0).toFixed(2),
    (inv.cgstTotal || 0).toFixed(2),
    (inv.sgstTotal || 0).toFixed(2),
    (inv.igstTotal || 0).toFixed(2),
    (inv.totalGst || 0).toFixed(2),
    (inv.freightAmount || 0).toFixed(2),
    (inv.roundOff || 0).toFixed(2),
    (inv.netPayable || 0).toFixed(2),
    (inv.paidAmount || 0).toFixed(2),
    (inv.balanceAmount || 0).toFixed(2),
    `"${inv.status}"`,
    `"${(inv.transactionRef || inv.upiReference || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `WebRajya_Sales_Data_${data.period.startDate}_to_${data.period.endDate}.csv`);
}

export function exportCaPurchaseCSV(data: CaReportData) {
  const headers = [
    'SupplierName', 'SupplierGSTIN', 'InvoiceNumber', 'InvoiceDate', 
    'TotalItems', 'SubtotalTaxable', 'TotalGST', 'GrandTotal', 'Status'
  ];

  const rows = data.purchaseInvoices.map(pur => [
    `"${pur.supplierName.replace(/"/g, '""')}"`,
    `"${pur.supplierGstin || ''}"`,
    `"${pur.invoiceNumber}"`,
    `"${pur.invoiceDate}"`,
    pur.totalItems || (pur.items ? pur.items.length : 0),
    (pur.subtotal || 0).toFixed(2),
    (pur.totalGst || 0).toFixed(2),
    (pur.grandTotal || 0).toFixed(2),
    `"${pur.status || 'completed'}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `WebRajya_Purchase_Data_${data.period.startDate}_to_${data.period.endDate}.csv`);
}

export function exportCaCustomersCSV(data: CaReportData) {
  const headers = ['CustomerName', 'Mobile', 'GSTIN', 'City', 'Address', 'CreditBalance', 'CreditLimit'];
  const rows = data.customers.map(c => [
    `"${c.name.replace(/"/g, '""')}"`,
    `"${c.mobile || ''}"`,
    `"${c.gstin || ''}"`,
    `"${(c.city || '').replace(/"/g, '""')}"`,
    `"${(c.address || '').replace(/"/g, '""')}"`,
    (c.creditBalance || 0).toFixed(2),
    (c.creditLimit || 0).toFixed(2)
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `WebRajya_Party_Details_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportCaPaymentsCSV(data: CaReportData) {
  const headers = ['InvoiceNumber', 'Date', 'CustomerName', 'PaymentMode', 'AmountPaid', 'BalanceDue', 'TransactionRef'];
  const rows = data.salesInvoices.map(inv => [
    `"${inv.invoiceNumber}"`,
    `"${inv.date}"`,
    `"${(inv.customerName || 'Cash Customer').replace(/"/g, '""')}"`,
    `"${inv.paymentMode}"`,
    (inv.paidAmount || 0).toFixed(2),
    (inv.balanceAmount || 0).toFixed(2),
    `"${(inv.transactionRef || inv.upiReference || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `WebRajya_Payments_Data_${data.period.startDate}_to_${data.period.endDate}.csv`);
}
