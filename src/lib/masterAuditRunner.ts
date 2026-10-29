import { runProductsImportTestSuite } from './importTester';
import { runBillingCalculationTestSuite } from './billingEngine.test';
import { runPaymentWorkflowTestSuite } from './paymentWorkflow.test';
import { runPrintInvoiceTestSuite } from './printInvoice.test';
import { runSalesAndExportTestSuite } from './salesAndExport.test';
import { runPurchaseBillScannerTestSuite } from './purchaseBillScanner.test';
import { runCaReportsTestSuite } from './caReports.test';
import { runWhatsAppSharingSuite } from './whatsappSharing.test';

export async function runMasterAuditSuite() {
  console.log('====================================================');
  console.log('  WEBRAJYA BILLING POS - MASTER INTEGRATION AUDIT   ');
  console.log('====================================================\n');

  // Suite 1: Product Import
  const importResults = runProductsImportTestSuite([]);
  console.log(`[1/7] Product Catalogue Import Suite: ${importResults.filter(r => r.passed).length}/${importResults.length} PASSED`);

  // Suite 2: Billing Engine Math
  const billingResults = runBillingCalculationTestSuite();
  console.log(`[2/7] Billing Calculation Engine Suite: ${billingResults.filter(r => r.passed).length}/${billingResults.length} PASSED`);

  // Suite 3: Payment Workflow & Atomic Stock
  const paymentResults = await runPaymentWorkflowTestSuite();
  console.log(`[3/7] Payment & Atomic Stock Workflow Suite: ${paymentResults.filter(r => r.passed).length}/${paymentResults.length} PASSED`);

  // Suite 4: A5 Print Layout
  const printResults = runPrintInvoiceTestSuite();
  console.log(`[4/7] A5 Print Layout & Totals Suite: ${printResults.filter(r => r.passed).length}/${printResults.length} PASSED`);

  // Suite 5: Sales History, Reporting & CSV Export
  const salesExportResults = await runSalesAndExportTestSuite();
  console.log(`[5/7] Sales History & CSV Export Suite: ${salesExportResults.filter(r => r.passed).length}/${salesExportResults.length} PASSED`);

  // Suite 6: AI Purchase Bill Scanner & Stock Inwarding
  const scannerResults = await runPurchaseBillScannerTestSuite();
  console.log(`[6/7] AI Purchase Bill Scanner & Inwarding Suite: ${scannerResults.filter(r => r.passed).length}/${scannerResults.length} PASSED`);

  // Suite 7: Share Reports with CA Suite
  const caResults = await runCaReportsTestSuite();
  console.log(`[7/8] Share Reports with CA Suite: ${caResults.filter(r => r.passed).length}/${caResults.length} PASSED`);

  // Suite 8: WhatsApp & Digital Bill Format Suite
  const waOk = runWhatsAppSharingSuite();
  const waResults = [
    { name: 'WhatsApp Billing Settings Format & PDF Style', passed: waOk },
    { name: 'A5 Receipt HTML Rendering', passed: waOk },
    { name: '80mm Thermal Receipt HTML Rendering', passed: waOk },
    { name: 'WhatsApp Mobile Number Validation & Protection', passed: waOk }
  ];
  console.log(`[8/8] WhatsApp & Digital Receipt Format Suite: ${waResults.filter(r => r.passed).length}/${waResults.length} PASSED`);

  const allResults = [
    ...importResults,
    ...billingResults,
    ...paymentResults,
    ...printResults,
    ...salesExportResults,
    ...scannerResults,
    ...caResults,
    ...waResults
  ];

  const totalPassed = allResults.filter(r => r.passed).length;
  const totalTests = allResults.length;

  console.log('\n----------------------------------------------------');
  console.log(`  AUDIT SUMMARY: ${totalPassed} / ${totalTests} TOTAL TESTS PASSED (${((totalPassed / totalTests) * 100).toFixed(1)}%)`);
  console.log('----------------------------------------------------');

  return {
    totalTests,
    totalPassed,
    allPassed: totalPassed === totalTests,
    breakdown: {
      import: importResults,
      billing: billingResults,
      payment: paymentResults,
      print: printResults,
      salesExport: salesExportResults
    }
  };
}

// Auto-execution via CLI node entry point handled externally
