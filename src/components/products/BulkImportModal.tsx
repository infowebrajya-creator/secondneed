import React, { useState } from 'react';
import { 
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  XCircle, ArrowRight, RefreshCw, ShieldCheck, Sparkles 
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { 
  parseSpreadsheetBuffer, autoDetectColumnMapping, validateImportBatch, 
  generateSampleTemplateCSV, generateErrorReportCSV, STANDARD_IMPORT_FIELDS, 
  ColumnMapping, ValidatedImportRow, ImportMode, ImportSummaryResult 
} from '../../lib/importProcessor';
import { runProductsImportTestSuite, TestCaseResult } from '../../lib/importTester';
import type { Product } from '../../types';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  onCommitImport: (
    rowsToCommit: ValidatedImportRow[], 
    mode: ImportMode
  ) => Promise<ImportSummaryResult>;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  onCommitImport,
  onToast
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    sku: '', barcode: '', name: '', category: '', packInfo: '', unit: '',
    mrp: '', purchaseRate: '', saleRate: '', hsnCode: '', gstRate: '',
    taxType: '', stockQty: '', minStockLevel: '', isActive: ''
  });
  const [importMode, setImportMode] = useState<ImportMode>('CREATE_AND_UPDATE');
  const [validatedRows, setValidatedRows] = useState<ValidatedImportRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'error' | 'warning'>('all');
  const [summaryResult, setSummaryResult] = useState<ImportSummaryResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSuiteResults, setTestSuiteResults] = useState<TestCaseResult[] | null>(null);

  const resetWizard = () => {
    setStep(1);
    setRawHeaders([]);
    setRawRows([]);
    setValidatedRows([]);
    setSummaryResult(null);
    setTestSuiteResults(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const { headers, rows } = parseSpreadsheetBuffer(buffer);

        if (rows.length === 0) {
          onToast('error', 'Empty Spreadsheet', 'Uploaded file contains no rows.');
          return;
        }

        setRawHeaders(headers);
        setRawRows(rows);
        const detectedMapping = autoDetectColumnMapping(headers);
        setMapping(detectedMapping);
        setStep(2);
        onToast('info', 'Spreadsheet Parsed', `Loaded ${rows.length} rows. Please verify column mapping.`);
      } catch (err: any) {
        onToast('error', 'Parse Error', err.message || 'Failed to parse file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const csvStr = generateSampleTemplateCSV();
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'WebRajya_Product_Import_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
    onToast('success', 'Template Downloaded', 'Sample product import CSV template generated.');
  };

  const handleRunValidation = () => {
    if (!mapping.sku || !mapping.name) {
      onToast('error', 'Mapping Error', 'You must map at least SKU and Product Name columns.');
      return;
    }

    const valRows = validateImportBatch(rawRows, mapping, existingProducts, importMode);
    setValidatedRows(valRows);
    setStep(3);
  };

  const handleDownloadErrorReport = () => {
    const csvStr = generateErrorReportCSV(validatedRows);
    if (!csvStr) {
      onToast('info', 'No Errors', 'No failing rows found to export.');
      return;
    }
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Import_Error_Report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('info', 'Error Report Downloaded', 'Downloaded CSV with row-level error reasons.');
  };

  const handleExecuteCommit = async () => {
    setIsProcessing(true);
    try {
      const rowsToProcess = validatedRows.filter(r => r.status !== 'error');
      const res = await onCommitImport(rowsToProcess, importMode);
      setSummaryResult(res);
      setStep(4);
      onToast('success', 'Import Completed!', `Created ${res.createdCount}, Updated ${res.updatedCount}, Skipped ${res.skippedCount}.`);
    } catch (err: any) {
      onToast('error', 'Import Commit Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunTestSuite = () => {
    const results = runProductsImportTestSuite(existingProducts);
    setTestSuiteResults(results);
    onToast('info', 'Import Test Suite Complete', 'Executed 6 import safety test cases.');
  };

  const filteredPreviewRows = validatedRows.filter(r => {
    if (previewFilter === 'valid') return r.status === 'valid';
    if (previewFilter === 'error') return r.status === 'error';
    if (previewFilter === 'warning') return r.status === 'warning';
    return true;
  });

  const errorCount = validatedRows.filter(r => r.status === 'error').length;
  const warningCount = validatedRows.filter(r => r.status === 'warning').length;
  const validCount = validatedRows.filter(r => r.status === 'valid').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); resetWizard(); }}
      title="Bulk Product Import & Spreadsheet Wizard"
      subtitle="Import CSV/Excel catalogs with column mapping, safety validation, and error reporting"
      maxWidth="5xl"
    >
      <div className="space-y-6 font-sans text-[#172B4D]">
        {/* Step Indicator */}
        <div className="flex items-center justify-between bg-[#F5F9FF] p-3 rounded-xl border border-[#D8E1EC] text-xs">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#2563EB] font-bold' : 'text-[#64748B]'}`}>
            <span className="w-6 h-6 rounded-full bg-white border border-[#D8E1EC] flex items-center justify-center font-mono">1</span> Upload & Template
          </div>
          <ArrowRight className="w-4 h-4 text-[#64748B]" />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#2563EB] font-bold' : 'text-[#64748B]'}`}>
            <span className="w-6 h-6 rounded-full bg-white border border-[#D8E1EC] flex items-center justify-center font-mono">2</span> Column Mapping
          </div>
          <ArrowRight className="w-4 h-4 text-[#64748B]" />
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[#2563EB] font-bold' : 'text-[#64748B]'}`}>
            <span className="w-6 h-6 rounded-full bg-white border border-[#D8E1EC] flex items-center justify-center font-mono">3</span> Batch Validation
          </div>
          <ArrowRight className="w-4 h-4 text-[#64748B]" />
          <div className={`flex items-center gap-2 ${step === 4 ? 'text-[#2563EB] font-bold' : 'text-[#64748B]'}`}>
            <span className="w-6 h-6 rounded-full bg-white border border-[#D8E1EC] flex items-center justify-center font-mono">4</span> Summary
          </div>
        </div>

        {/* STEP 1: UPLOAD FILE & TEMPLATE */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* File Drag Box */}
              <div className="border-2 border-dashed border-[#D8E1EC] hover:border-[#2563EB] bg-[#F5F9FF] rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors">
                <FileSpreadsheet className="w-12 h-12 text-[#2563EB] mb-3" />
                <h4 className="text-sm font-bold text-[#172B4D]">Select CSV or Excel Spreadsheet</h4>
                <p className="text-xs text-[#64748B] mt-1">Supports .csv, .xlsx, .xls formats</p>
                
                <label className="mt-4 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs">
                  Browse File
                  <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {/* Template & Automated Tests Card */}
              <div className="p-6 bg-white border border-[#D8E1EC] rounded-xl space-y-4 flex flex-col justify-between shadow-xs">
                <div>
                  <h4 className="text-sm font-bold text-[#172B4D] flex items-center gap-2">
                    <Download className="w-4 h-4 text-[#B45309]" /> Download Standard Template
                  </h4>
                  <p className="text-xs text-[#64748B] mt-1">
                    Download our ready-to-use CSV template pre-formatted with standard product catalog columns.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="mt-3 px-3.5 py-2 bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#B45309] border border-[#FDE68A] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download Sample CSV
                  </button>
                </div>

                <div className="border-t border-[#D8E1EC] pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#172B4D] font-medium">Run Automated Import Test Suite</span>
                    <button
                      type="button"
                      onClick={handleRunTestSuite}
                      className="px-3 py-1.5 bg-[#F3E8FF] hover:bg-[#E9D5FF] text-[#7E22CE] border border-[#E9D5FF] rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#7E22CE]" /> Run 6 Tests
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Suite Results Display */}
            {testSuiteResults && (
              <div className="p-4 bg-[#F3E8FF] border border-[#E9D5FF] rounded-xl space-y-3 text-xs">
                <h4 className="font-bold text-[#7E22CE] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#15803D]" /> Automated Import Test Suite Results ({testSuiteResults.length} Tests Executed)
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {testSuiteResults.map((t, idx) => (
                    <div key={idx} className="p-2.5 bg-white border border-[#D8E1EC] rounded flex items-center justify-between">
                      <div>
                        <div className="font-bold text-[#172B4D]">{t.testName}</div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          Total Rows: {t.totalRows} | Valid: {t.validCount} | Errors Captured: {t.errorCount} ({t.executionTimeMs}ms)
                        </div>
                        {t.detectedErrors.length > 0 && (
                          <div className="text-[10px] text-[#B91C1C] mt-0.5 font-mono">
                            Captured: {t.detectedErrors.slice(0, 2).join('; ')}
                          </div>
                        )}
                      </div>
                      <Badge variant={t.passed ? 'emerald' : 'rose'}>{t.passed ? 'PASSED' : 'FAILED'}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: COLUMN MAPPING */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg">
              <span className="text-xs text-[#64748B]">File Rows: <strong className="text-[#2563EB] font-mono">{rawRows.length}</strong> | Detected Headers: <strong className="text-[#2563EB] font-mono">{rawHeaders.length}</strong></span>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B] font-medium">Import Strategy:</span>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as ImportMode)}
                  className="px-2.5 py-1 bg-white border border-[#D8E1EC] rounded text-xs text-[#172B4D] font-semibold"
                >
                  <option value="CREATE_AND_UPDATE">Create New & Update Existing SKUs</option>
                  <option value="CREATE_ONLY">Create New SKUs Only (Skip Existing)</option>
                  <option value="UPDATE_PRICES_ONLY">Update Selling Rates Only (Preserve Stock)</option>
                </select>
              </div>
            </div>

            <div className="border border-[#D8E1EC] rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#F1F5F9] text-[#172B4D] uppercase font-bold sticky top-0 border-b border-[#D8E1EC]">
                  <tr>
                    <th className="p-3">Standard Field</th>
                    <th className="p-3">Requirement</th>
                    <th className="p-3">Spreadsheet Column Header</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {STANDARD_IMPORT_FIELDS.map(f => (
                    <tr key={f.key} className="hover:bg-[#F0F6FF]">
                      <td className="p-3 font-bold text-[#172B4D]">{f.label}</td>
                      <td className="p-3">
                        {f.required ? (
                          <Badge variant="rose">Required</Badge>
                        ) : (
                          <Badge variant="slate">Optional</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <select
                          value={mapping[f.key]}
                          onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                          className="w-full px-2.5 py-1 bg-white border border-[#D8E1EC] rounded text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-mono"
                        >
                          <option value="">-- Do Not Import / Skip --</option>
                          {rawHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleRunValidation}
                className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                Run Validation & Preview <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: BATCH VALIDATION PREVIEW */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Validation Summary Bar */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-white border border-[#D8E1EC] rounded-lg shadow-xs">
                <div className="text-[11px] text-[#64748B]">Total Import Rows</div>
                <div className="text-xl font-bold font-mono text-[#172B4D] mt-0.5">{validatedRows.length}</div>
              </div>
              <div className="p-3 bg-white border border-[#D8E1EC] rounded-lg shadow-xs">
                <div className="text-[11px] text-[#64748B]">Valid Rows</div>
                <div className="text-xl font-bold font-mono text-[#15803D] mt-0.5">{validCount}</div>
              </div>
              <div className="p-3 bg-white border border-[#D8E1EC] rounded-lg shadow-xs">
                <div className="text-[11px] text-[#64748B]">Warnings (Will Import)</div>
                <div className="text-xl font-bold font-mono text-[#B45309] mt-0.5">{warningCount}</div>
              </div>
              <div className="p-3 bg-white border border-[#D8E1EC] rounded-lg shadow-xs">
                <div className="text-[11px] text-[#64748B]">Errors (Will Be Skipped)</div>
                <div className="text-xl font-bold font-mono text-[#B91C1C] mt-0.5">{errorCount}</div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B]">Filter Preview:</span>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('all')}
                  className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${previewFilter === 'all' ? 'bg-[#2563EB] text-white' : 'bg-white text-[#64748B] border border-[#D8E1EC]'}`}
                >
                  All ({validatedRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('valid')}
                  className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${previewFilter === 'valid' ? 'bg-[#15803D] text-white' : 'bg-white text-[#64748B] border border-[#D8E1EC]'}`}
                >
                  Valid ({validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('error')}
                  className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${previewFilter === 'error' ? 'bg-[#B91C1C] text-white' : 'bg-white text-[#64748B] border border-[#D8E1EC]'}`}
                >
                  Errors ({errorCount})
                </button>
              </div>

              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="px-3 py-1.5 bg-[#FEE2E2] hover:bg-[#FECDD3] text-[#B91C1C] border border-[#FCA5A5] rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download Error Report CSV
                </button>
              )}
            </div>

            {/* Preview Table */}
            <div className="border border-[#D8E1EC] rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#F1F5F9] text-[#172B4D] uppercase font-bold sticky top-0 border-b border-[#D8E1EC]">
                  <tr>
                    <th className="p-2.5 text-center">Row</th>
                    <th className="p-2.5">SKU</th>
                    <th className="p-2.5">Barcode</th>
                    <th className="p-2.5">Product Name</th>
                    <th className="p-2.5 text-right">Selling Rate</th>
                    <th className="p-2.5 text-center">GST %</th>
                    <th className="p-2.5 text-right">Stock</th>
                    <th className="p-2.5 text-center">Action</th>
                    <th className="p-2.5">Status & Validation Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredPreviewRows.map((r) => (
                    <tr key={r.rowNumber} className={`hover:bg-[#F0F6FF] ${r.status === 'error' ? 'bg-[#FEE2E2]/30' : ''}`}>
                      <td className="p-2.5 text-center font-mono text-[#64748B]">{r.rowNumber}</td>
                      <td className="p-2.5 font-mono font-bold text-[#2563EB]">{r.parsedProduct.sku || '-'}</td>
                      <td className="p-2.5 font-mono text-[#64748B]">{r.parsedProduct.barcode || '-'}</td>
                      <td className="p-2.5 font-semibold text-[#172B4D]">{r.parsedProduct.name || '-'}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-[#15803D]">₹{r.parsedProduct.saleRate || 0}</td>
                      <td className="p-2.5 text-center font-mono">{r.parsedProduct.gstRate}%</td>
                      <td className="p-2.5 text-right font-mono text-[#172B4D]">{r.parsedProduct.stockQty} {r.parsedProduct.unit}</td>
                      <td className="p-2.5 text-center uppercase text-[11px]">
                        <Badge variant={r.action === 'create' ? 'emerald' : r.action === 'update' ? 'indigo' : 'rose'}>
                          {r.action}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-[11px]">
                        {r.errors.length > 0 && (
                          <div className="text-[#B91C1C] font-bold flex items-center gap-1 font-mono">
                            <XCircle className="w-3.5 h-3.5 shrink-0" /> {r.errors.join(' | ')}
                          </div>
                        )}
                        {r.warnings.length > 0 && (
                          <div className="text-[#B45309] font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {r.warnings.join(' | ')}
                          </div>
                        )}
                        {r.errors.length === 0 && r.warnings.length === 0 && (
                          <div className="text-[#15803D] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Ready to Import
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Back to Mapping
              </button>

              <button
                type="button"
                onClick={handleExecuteCommit}
                disabled={isProcessing || (validCount + warningCount === 0)}
                className="px-6 py-2.5 bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Commit Import ({validCount + warningCount} Valid Rows)
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: IMPORT SUMMARY */}
        {step === 4 && summaryResult && (
          <div className="space-y-6 text-center py-4">
            <div className="w-16 h-16 bg-[#DCFCE7] border border-[#86EFAC] rounded-full flex items-center justify-center mx-auto text-[#15803D]">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#172B4D]">Product Import Batch Complete!</h3>
              <p className="text-xs text-[#64748B] mt-1">Summary report of processed rows</p>
            </div>

            <div className="grid grid-cols-4 gap-4 max-w-2xl mx-auto font-mono text-xs">
              <div className="p-4 bg-white border border-[#D8E1EC] rounded-xl shadow-xs">
                <span className="text-[#64748B] font-sans">Created New</span>
                <div className="text-2xl font-bold text-[#15803D] mt-1">{summaryResult.createdCount}</div>
              </div>

              <div className="p-4 bg-white border border-[#D8E1EC] rounded-xl shadow-xs">
                <span className="text-[#64748B] font-sans">Updated</span>
                <div className="text-2xl font-bold text-[#2563EB] mt-1">{summaryResult.updatedCount}</div>
              </div>

              <div className="p-4 bg-white border border-[#D8E1EC] rounded-xl shadow-xs">
                <span className="text-[#64748B] font-sans">Skipped</span>
                <div className="text-2xl font-bold text-[#B45309] mt-1">{summaryResult.skippedCount}</div>
              </div>

              <div className="p-4 bg-white border border-[#D8E1EC] rounded-xl shadow-xs">
                <span className="text-[#64748B] font-sans">Failed</span>
                <div className="text-2xl font-bold text-[#B91C1C] mt-1">{summaryResult.failedCount}</div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={() => { onClose(); resetWizard(); }}
                className="px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
              >
                Close & View Product Catalog
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
