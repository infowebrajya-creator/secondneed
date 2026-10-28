import React, { useState, useEffect } from 'react';
import { 
  FileText, Calendar, CheckSquare, Square, Download, Share2, 
  Printer, Eye, AlertCircle, FileSpreadsheet, CheckCircle2, 
  TrendingUp, Users, Truck, Package, CreditCard, ChevronRight,
  ShieldCheck, RefreshCw, Smartphone, ArrowLeft
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { 
  ReportPeriodType, ReportPeriod, ReportCategoryId, CaReportData 
} from '../../types/caReport';
import { 
  REPORT_CATEGORIES_CONFIG, getReportPeriodRange, generateCaReportDataset 
} from '../../lib/caReportGenerator';
import { 
  exportCaMasterExcelWorkbook, exportCaSalesCSV, exportCaPurchaseCSV, 
  exportCaCustomersCSV, exportCaPaymentsCSV 
} from '../../lib/caReportExcel';
import { triggerCaReportPrint } from '../../lib/caReportPdf';
import { 
  getSavedCaContact, saveCaContact, shareReportsWithCa, generateCaWhatsAppMessage 
} from '../../lib/caReportSharing';
import { useSettingsStore } from '../../store/useSettingsStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CaReportPreviewModal } from './CaReportPreviewModal';

interface ShareReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const ShareReportsModal: React.FC<ShareReportsModalProps> = ({
  isOpen,
  onClose,
  onToast
}) => {
  const { shopProfile } = useSettingsStore();

  // Period State
  const [periodType, setPeriodType] = useState<ReportPeriodType>('current_fy');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  // Selected Categories
  const [selectedCategories, setSelectedCategories] = useState<ReportCategoryId[]>([
    'sales', 'purchases', 'tax_summary', 'payments', 'customers', 'suppliers'
  ]);

  // Generation & Results State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<CaReportData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const resultsSectionRef = React.useRef<HTMLDivElement>(null);

  // CA Contact Information
  const [caName, setCaName] = useState('');
  const [caPhone, setCaPhone] = useState('');
  const [showCaPhoneForm, setShowCaPhoneForm] = useState(false);

  // Load saved CA contact on modal open
  useEffect(() => {
    if (isOpen) {
      const contact = getSavedCaContact();
      setCaName(contact.name);
      setCaPhone(contact.phone);
    }
  }, [isOpen]);

  // Current calculated period
  const activePeriod: ReportPeriod = getReportPeriodRange(periodType, customStart, customEnd);

  // Toggle single category
  const toggleCategory = (id: ReportCategoryId) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Select all supported
  const selectAllCategories = () => {
    setSelectedCategories(REPORT_CATEGORIES_CONFIG.map(c => c.id));
  };

  // Clear all
  const deselectAllCategories = () => {
    setSelectedCategories([]);
  };

  // Generate Reports Trigger
  const handleGenerateReports = async () => {
    if (selectedCategories.length === 0) {
      onToast('error', 'Select Reports', 'Please select at least one report category to export.');
      return;
    }

    if (periodType === 'custom' && customStart && customEnd && customStart > customEnd) {
      onToast('error', 'Invalid Date Range', 'Start date cannot be after end date.');
      return;
    }

    setIsGenerating(true);
    try {
      const dataset = await generateCaReportDataset(activePeriod, selectedCategories, shopProfile);
      setGeneratedReport(dataset);
      onToast('success', 'CA Report Pack Ready', `Retrieved ${dataset.salesInvoices.length} sales bills and prepared statements.`);
      setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err: any) {
      onToast('error', 'Generation Error', err?.message || 'Failed to compile report records.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Excel Master Download
  const handleDownloadExcel = () => {
    if (!generatedReport) return;
    exportCaMasterExcelWorkbook(generatedReport);
    onToast('success', 'Excel Workbook Exported', 'Downloaded multi-sheet CA report (.xlsx).');
  };

  // PDF Print Trigger
  const handlePrintPdf = () => {
    if (!generatedReport) return;
    triggerCaReportPrint(generatedReport);
    onToast('info', 'Print / Save PDF Triggered', 'Select "Save as PDF" to save the official report.');
  };

  // WhatsApp Share Trigger
  const handleShareWhatsApp = async () => {
    if (!generatedReport) return;

    if (caPhone.trim()) {
      saveCaContact({ name: caName, phone: caPhone });
    }

    try {
      const { sharedViaNative } = await shareReportsWithCa({
        data: generatedReport,
        caPhone: caPhone.trim(),
        caName: caName.trim()
      });

      if (sharedViaNative) {
        onToast('success', 'Reports Shared', 'Report shared successfully via native share sheet.');
      } else {
        onToast('info', 'WhatsApp Opened', 'Prepared WhatsApp message. Please attach the downloaded Excel/PDF to the chat.');
      }
    } catch (err: any) {
      onToast('error', 'Share Error', err?.message || 'Could not launch WhatsApp.');
    }
  };

  const periodOptions: { id: ReportPeriodType; label: string; badge: string }[] = [
    { id: 'this_month', label: 'This Month', badge: 'Current' },
    { id: 'prev_month', label: 'Previous Month', badge: 'Monthly Filing' },
    { id: 'current_fy', label: 'Current Financial Year (1 Apr - 31 Mar)', badge: 'FY 26-27' },
    { id: 'prev_fy', label: 'Previous Financial Year', badge: 'Audit FY 25-26' },
    { id: 'custom', label: 'Custom Date Range', badge: 'Flexible' }
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Share Reports with CA"
        subtitle="Prepare and share your business records with your Chartered Accountant."
        maxWidth="4xl"
      >
        <div className="space-y-4 font-sans text-xs text-[#172B4D]">
          {/* Header Info Banner */}
          <div className="p-3 bg-gradient-to-r from-[#EFF6FF] to-[#DBEAFE]/40 border border-[#BFDBFE] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="font-extrabold text-sm text-[#1E3A8A] leading-tight">
                  {shopProfile.shopName || 'Retail Store'}
                </div>
                <div className="text-[11px] text-[#475569] mt-0.5">
                  GSTIN: <span className="font-mono font-bold text-[#1E3A8A]">{shopProfile.gstin || 'Not Provided'}</span> | State: {shopProfile.state || 'Madhya Pradesh (23)'}
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#2563EB] font-bold bg-white/80 px-2.5 py-1 rounded-lg border border-blue-200">
              <ShieldCheck className="w-3.5 h-3.5 text-[#15803D]" />
              <span>Direct Database Export</span>
            </div>
          </div>

          {/* SECTION 1: Select Reporting Period */}
          <div className="p-3.5 bg-white border border-[#D8E1EC] rounded-xl shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-xs font-black text-[#172B4D] uppercase tracking-wide">
                  1. Select Reporting Period
                </h3>
              </div>
              <span className="text-[11px] font-bold font-mono text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-blue-200">
                {activePeriod.startDate} to {activePeriod.endDate}
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {periodOptions.map((opt) => {
                const isSelected = periodType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPeriodType(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#EFF6FF] border-[#3B82F6] ring-1 ring-[#3B82F6] shadow-xs'
                        : 'bg-white hover:bg-gray-50 border-[#D8E1EC]'
                    }`}
                  >
                    <div>
                      <div className={`font-bold text-xs ${isSelected ? 'text-[#1D4ED8]' : 'text-[#172B4D]'}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-0.5">{opt.badge}</div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0 ml-1.5" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Pickers */}
            {periodType === 'custom' && (
              <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStart || activePeriod.startDate}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono font-bold text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>

                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customEnd || activePeriod.endDate}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono font-bold text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Select Report Categories */}
          <div className="p-3.5 bg-white border border-[#D8E1EC] rounded-xl shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#15803D]" />
                <h3 className="text-xs font-black text-[#172B4D] uppercase tracking-wide">
                  2. Select Report Categories
                </h3>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllCategories}
                  className="font-bold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-[#CBD5E1]">•</span>
                <button
                  type="button"
                  onClick={deselectAllCategories}
                  className="font-bold text-[#64748B] hover:text-[#B91C1C] cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Checkable Report Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REPORT_CATEGORIES_CONFIG.map((cat) => {
                const isChecked = selectedCategories.includes(cat.id);
                return (
                  <div
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all cursor-pointer select-none ${
                      isChecked
                        ? 'bg-[#F0FDF4] border-[#86EFAC] shadow-2xs'
                        : 'bg-white hover:bg-gray-50 border-[#D8E1EC] opacity-80'
                    }`}
                  >
                    <div className="mt-0.5 text-[#15803D]">
                      {isChecked ? (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#94A3B8]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-[#172B4D]">{cat.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-[#64748B]">
                          {cat.categoryTag}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#64748B] mt-0.5 leading-snug">
                        {cat.shortDesc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3 & 4: Action & Generation Bar */}
          <div className="p-3.5 bg-white border border-[#D8E1EC] rounded-xl shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-bold text-xs text-[#172B4D] flex items-center gap-1.5">
                <span>Selected:</span>
                <span className="font-black text-[#2563EB]">{selectedCategories.length} category(s)</span>
                <span className="text-[#94A3B8]">•</span>
                <span className="text-[#64748B]">{activePeriod.label}</span>
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">
                Generates a consolidated multi-sheet Excel workbook and an A4 PDF statement.
              </div>
            </div>

            <button
              type="button"
              disabled={isGenerating || selectedCategories.length === 0}
              onClick={handleGenerateReports}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Compiling Database Records...' : 'Generate Reports'}</span>
            </button>
          </div>

          {/* SECTION 5: Generated Files & Sharing Dashboard (Revealed after generation) */}
          {generatedReport && (
            <div 
              ref={resultsSectionRef}
              className="p-4 bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] border-2 border-[#3B82F6]/50 rounded-2xl shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#15803D]" />
                  <div>
                    <h4 className="text-xs font-black text-[#172B4D] uppercase">
                      5. Generated Report Files Ready
                    </h4>
                    <div className="text-[10px] text-[#64748B]">
                      Extracted {generatedReport.salesInvoices.length} sales bills & {generatedReport.purchaseInvoices.length} purchase records
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[#64748B]">Net Turnover: </span>
                  <span className="font-mono font-black text-sm text-[#15803D]">
                    {formatCurrency(generatedReport.metrics.totalSalesNet)}
                  </span>
                </div>
              </div>

              {/* Primary Download & Preview Actions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. Download Multi-sheet Excel */}
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="p-3 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-xl text-left flex items-start gap-3 transition-all cursor-pointer shadow-xs group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#15803D] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-xs text-[#15803D]">Download Excel (.xlsx)</div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">Single workbook with all sheets</div>
                    <span className="inline-block mt-1 text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                      Recommended for CA
                    </span>
                  </div>
                </button>

                {/* 2. Download / Print PDF Report */}
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="p-3 bg-white hover:bg-blue-50 border border-blue-300 rounded-xl text-left flex items-start gap-3 transition-all cursor-pointer shadow-xs group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-xs text-[#1E3A8A]">Download / Print PDF</div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">A4 Professional Report Pack</div>
                    <span className="inline-block mt-1 text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                      Save as PDF
                    </span>
                  </div>
                </button>

                {/* 3. On-screen Statement Preview */}
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="p-3 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-xl text-left flex items-start gap-3 transition-all cursor-pointer shadow-xs group"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-xs text-indigo-900">Preview Statement</div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">Inspect tables before sharing</div>
                    <span className="inline-block mt-1 text-[9px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded">
                      In-App View
                    </span>
                  </div>
                </button>
              </div>

              {/* WhatsApp Share Card */}
              <div className="p-3.5 bg-white border border-[#86EFAC] rounded-xl shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#25D366] text-white flex items-center justify-center font-bold">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-black text-xs text-[#15803D]">Share via WhatsApp</div>
                      <div className="text-[10px] text-[#64748B]">Sends prefilled message summary to your CA</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCaPhoneForm(!showCaPhoneForm)}
                    className="text-[11px] font-bold text-[#2563EB] hover:underline text-left sm:text-right"
                  >
                    {showCaPhoneForm ? 'Hide CA Contact' : (caPhone ? `Sending to: ${caPhone}` : '+ Set CA Contact Number')}
                  </button>
                </div>

                {/* CA Contact Input Drawer */}
                {showCaPhoneForm && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg animate-in fade-in duration-100">
                    <div>
                      <label className="block text-[10px] font-bold text-[#64748B] mb-0.5">CA Name (Optional)</label>
                      <input
                        type="text"
                        value={caName}
                        onChange={(e) => setCaName(e.target.value)}
                        placeholder="e.g. Ramesh Jain / Sharma & Associates"
                        className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#64748B] mb-0.5">CA WhatsApp Number</label>
                      <input
                        type="tel"
                        value={caPhone}
                        onChange={(e) => setCaPhone(e.target.value)}
                        placeholder="e.g. 9826012345 (10-digit)"
                        className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono font-bold text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* WhatsApp Action Button & Guidance Notice */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                  <div className="text-[10px] text-[#475569] leading-tight">
                    <span className="font-bold text-[#B45309]">Note for WhatsApp:</span> Download the Excel workbook or PDF above, then click below to open WhatsApp and attach the file.
                  </div>

                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="px-4 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95 shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Open WhatsApp & Share</span>
                  </button>
                </div>
              </div>

              {/* Individual CSV Downloads Accordion / Sub-options */}
              <div className="pt-1 border-t border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
                <span className="font-semibold">Individual CSVs:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportCaSalesCSV(generatedReport)}
                    className="hover:text-[#2563EB] hover:underline font-bold"
                  >
                    Sales.csv
                  </button>
                  <span>•</span>
                  {generatedReport.purchaseInvoices.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => exportCaPurchaseCSV(generatedReport)}
                        className="hover:text-[#2563EB] hover:underline font-bold"
                      >
                        Purchases.csv
                      </button>
                      <span>•</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => exportCaCustomersCSV(generatedReport)}
                    className="hover:text-[#2563EB] hover:underline font-bold"
                  >
                    Parties.csv
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => exportCaPaymentsCSV(generatedReport)}
                    className="hover:text-[#2563EB] hover:underline font-bold"
                  >
                    Payments.csv
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer: Close */}
          <div className="flex justify-end pt-2 border-t border-[#D8E1EC]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-bold cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </Modal>

      {/* Embedded Document Preview Modal */}
      <CaReportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        reportData={generatedReport}
        onToast={onToast}
      />
    </>
  );
};
