import React, { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, Search, Printer, Eye, XCircle, Download, RefreshCw, Trash2, Share2, FileCheck, RotateCcw 
} from 'lucide-react';
import { useSalesStore } from '../../store/useSalesStore';
import { useProductStore } from '../../store/useProductStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useBillingStore } from '../../store/useBillingStore';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Invoice, PaymentMode, InvoiceType, InvoiceStatus } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { triggerA5Print } from '../../lib/print';
import { dispatchWhatsAppReceipt } from '../../lib/whatsappDispatcher';
import { db } from '../../lib/db';
import { 
  exportProductsCSV, exportInvoiceHeadersCSV, exportInvoiceItemsCSV, 
  exportPaymentsCSV, exportStockMovementsCSV 
} from '../../lib/exportProcessor';
import { ShareReportsModal } from '../caReports/ShareReportsModal';
import { A5PrintPreviewModal } from '../billing/A5PrintPreviewModal';
import { CreditNoteModal } from './CreditNoteModal';

interface SalesSectionProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
  onNavigateToBilling?: () => void;
}

export const SalesSection: React.FC<SalesSectionProps> = ({ onToast, onNavigateToBilling }) => {
  const { loadInvoiceIntoActiveBill } = useBillingStore();
  const { 
    invoices, isLoading, searchQuery, paymentFilter, dateRange, 
    setSearchQuery, setPaymentFilter, setDateRange, loadInvoices, cancelInvoice,
    syncInvoicesWithSupabase, clearAllSalesData
  } = useSalesStore();

  const { products, loadProducts } = useProductStore();
  const { shopProfile, printSettings, billingSettings } = useSettingsStore();

  // Additional Filter State
  const [billTypeFilter, setBillTypeFilter] = useState<InvoiceType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [isSyncing, setIsSyncing] = useState(false);

  // Modals state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShareReportsModalOpen, setIsShareReportsModalOpen] = useState(false);
  const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false);
  const [creditNoteTargetInvoice, setCreditNoteTargetInvoice] = useState<Invoice | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  const handleSyncSupabase = async () => {
    setIsSyncing(true);
    try {
      const res = await syncInvoicesWithSupabase();
      if (res.success) {
        onToast('success', 'Cloud Synced', res.message);
      } else {
        onToast('info', 'Supabase Notice', res.message);
      }
    } catch (e: any) {
      onToast('error', 'Sync Failed', e?.message || 'Failed to sync with Supabase.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearOldSalesData = async () => {
    if (!window.confirm('Are you sure you want to remove all old/test sales bills? This will reset sales history to match your clean Supabase database.')) {
      return;
    }
    try {
      await clearAllSalesData(true);
      onToast('success', 'Sales Data Reset', 'All old/test sales bills have been removed.');
    } catch (e: any) {
      onToast('error', 'Reset Failed', e?.message || 'Failed to reset sales data.');
    }
  };

  useEffect(() => {
    loadInvoices();
    loadProducts();
  }, []);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const isDateToday = (d: string) => d === todayStr;

  // Filter Invoices (Memoized)
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = inv.invoiceNumber.toLowerCase().includes(q);
        const matchCust = inv.customerName.toLowerCase().includes(q);
        const matchMobile = inv.customerMobile?.includes(q);
        const matchNotes = inv.notes?.toLowerCase().includes(q);
        if (!matchNum && !matchCust && !matchMobile && !matchNotes) return false;
      }

      // Payment Filter
      if (paymentFilter !== 'all' && inv.paymentMode !== paymentFilter) return false;

      // Bill Type Filter
      if (billTypeFilter !== 'all' && inv.invoiceType !== billTypeFilter) return false;

      // Status Filter
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;

      // Date Range Filter
      if (dateRange !== 'all') {
        const invDate = new Date(inv.date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (dateRange === 'today') {
          if (!isDateToday(inv.date)) return false;
        } else if (dateRange === 'yesterday') {
          const yest = new Date(now);
          yest.setDate(now.getDate() - 1);
          const yestStr = yest.toLocaleDateString('en-CA');
          if (inv.date !== yestStr) return false;
        } else if (dateRange === 'week') {
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          if (invDate < weekAgo) return false;
        } else if (dateRange === 'month') {
          const monthAgo = new Date(now);
          monthAgo.setDate(now.getDate() - 30);
          if (invDate < monthAgo) return false;
        }
      }

      return true;
    });
  }, [invoices, searchQuery, paymentFilter, billTypeFilter, statusFilter, dateRange, todayStr]);

  // Compute Operational Dashboard Stats based on active selection (Memoized)
  const stats = useMemo(() => {
    const activeStatsInvoices = dateRange === 'today'
      ? invoices.filter(i => isDateToday(i.date))
      : filteredInvoices;

    const todayCompleted = activeStatsInvoices.filter(i => i.status === 'completed' && i.invoiceType !== 'quotation');
    const todayCompletedSalesAmt = todayCompleted.reduce((sum, i) => sum + i.netPayable, 0);

    const todayCashAmt = todayCompleted
      .filter(i => i.paymentMode === 'cash')
      .reduce((sum, i) => sum + i.paidAmount, 0);

    const todayUpiAmt = todayCompleted
      .filter(i => i.paymentMode === 'upi')
      .reduce((sum, i) => sum + i.paidAmount, 0);

    const todayCompletedCount = todayCompleted.length;

    const todayCancelled = activeStatsInvoices.filter(i => i.status === 'cancelled');
    const todayCancelledCount = todayCancelled.length;
    const todayCancelledAmt = todayCancelled.reduce((sum, i) => sum + i.netPayable, 0);

    const quotationInvoices = activeStatsInvoices.filter(i => i.invoiceType === 'quotation');
    const quotationCount = quotationInvoices.length;
    const quotationAmt = quotationInvoices.reduce((sum, i) => sum + i.netPayable, 0);

    return {
      todayCompleted,
      todayCompletedSalesAmt,
      todayCashAmt,
      todayUpiAmt,
      todayCompletedCount,
      todayCancelled,
      todayCancelledCount,
      todayCancelledAmt,
      quotationCount,
      quotationAmt
    };
  }, [invoices, filteredInvoices, dateRange, todayStr]);

  const {
    todayCompleted,
    todayCompletedSalesAmt,
    todayCashAmt,
    todayUpiAmt,
    todayCompletedCount,
    todayCancelled,
    todayCancelledCount,
    todayCancelledAmt,
    quotationCount,
    quotationAmt
  } = stats;

  const handleConvertToBill = (inv: Invoice) => {
    loadInvoiceIntoActiveBill(inv);
    onToast('success', 'Quotation Converted', `Quotation #${inv.invoiceNumber} loaded into active invoice.`);
    if (onNavigateToBilling) {
      onNavigateToBilling();
    }
  };

  const handleReprintA5 = (inv: Invoice) => {
    setPreviewInvoice(inv);
    setIsPreviewModalOpen(true);
  };

  const handleOpenCreditNote = (inv: Invoice) => {
    setCreditNoteTargetInvoice(inv);
    setIsCreditNoteModalOpen(true);
  };

  const handleCreditNoteSuccess = (cn: Invoice) => {
    setIsDetailModalOpen(false);
    setPreviewInvoice(cn);
    setIsPreviewModalOpen(true);
  };

  const handleOpenReversal = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setReversalReason('');
    setIsReversalModalOpen(true);
  };

  const handleConfirmReversal = async () => {
    if (!selectedInvoice) return;
    if (!reversalReason.trim()) {
      onToast('error', 'Reason Required', 'Please enter a valid reason for cancelling this invoice.');
      return;
    }

    setIsSubmittingReversal(true);
    try {
      await cancelInvoice(selectedInvoice.id, true, reversalReason.trim());
      onToast('success', 'Invoice Cancelled & Reversed', `Invoice #${selectedInvoice.invoiceNumber} reversed. Stock restored and audit log written.`);
      setIsReversalModalOpen(false);
      setIsDetailModalOpen(false);
    } catch (err: any) {
      onToast('error', 'Reversal Failed', err.message || 'Error executing invoice reversal.');
    } finally {
      setIsSubmittingReversal(false);
    }
  };

  const handleShareWhatsApp = async (inv: Invoice) => {
    await dispatchWhatsAppReceipt({
      invoice: inv,
      shop: shopProfile,
      settings: billingSettings,
      printSettings,
      onToast
    });
  };

  const handleExportStockMovements = async () => {
    const movements = await db.stockMovements.orderBy('createdAt').reverse().toArray();
    exportStockMovementsCSV(movements);
    onToast('success', 'Export Complete', `Exported ${movements.length} stock movement records.`);
  };

  const datePresets: { id: 'today' | 'yesterday' | 'week' | 'month' | 'all'; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: 'Last 7 Days' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Dates' }
  ];

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-4.5rem)] gap-3 font-sans text-[#172B4D] pb-24 md:pb-0">
      {/* Top Reporting Dashboard Stats - Horizontal Scrollable on Mobile */}
      <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 shrink-0 font-sans overflow-x-auto touch-scroll pb-1 no-scrollbar">
        <div className="min-w-[150px] flex-1 p-3 bg-white border border-[#D8E1EC] rounded-xl shadow-xs shrink-0 flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#64748B] font-bold">
            {dateRange === 'today' ? "Today's Sales" : dateRange === 'all' ? "Total Sales" : "Period Sales"}
          </div>
          <div className="text-lg sm:text-xl font-black text-[#15803D] font-mono mt-0.5 sm:mt-1 truncate" title={formatCurrency(todayCompletedSalesAmt, true)}>
            {formatCurrency(todayCompletedSalesAmt, false)}
          </div>
          <div className="text-[10px] text-[#64748B] mt-0.5">{todayCompletedCount} bill(s)</div>
        </div>

        <div className="min-w-[140px] flex-1 p-3 bg-white border border-[#D8E1EC] rounded-xl shadow-xs shrink-0 flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#64748B] font-bold">Cash In Hand</div>
          <div className="text-lg sm:text-xl font-black text-[#B45309] font-mono mt-0.5 sm:mt-1 truncate" title={formatCurrency(todayCashAmt, true)}>
            {formatCurrency(todayCashAmt, false)}
          </div>
          <div className="text-[10px] text-[#64748B] mt-0.5">Cash tender</div>
        </div>

        <div className="min-w-[140px] flex-1 p-3 bg-white border border-[#D8E1EC] rounded-xl shadow-xs shrink-0 flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#64748B] font-bold">UPI Collected</div>
          <div className="text-lg sm:text-xl font-black text-[#2563EB] font-mono mt-0.5 sm:mt-1 truncate" title={formatCurrency(todayUpiAmt, true)}>
            {formatCurrency(todayUpiAmt, false)}
          </div>
          <div className="text-[10px] text-[#64748B] mt-0.5">UPI / QR total</div>
        </div>

        <div className="min-w-[120px] flex-1 p-3 bg-white border border-[#D8E1EC] rounded-xl shadow-xs shrink-0 flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#64748B] font-bold">Completed</div>
          <div className="text-lg sm:text-xl font-black text-[#172B4D] font-mono mt-0.5 sm:mt-1">
            {todayCompletedCount}
          </div>
          <div className="text-[10px] text-[#64748B] mt-0.5">Transactions</div>
        </div>

        <div className="min-w-[140px] flex-1 p-3 bg-white border border-[#FCA5A5] bg-[#FEE2E2]/30 rounded-xl shadow-xs shrink-0 flex flex-col justify-between">
          <div className="text-[10px] uppercase text-[#B91C1C] font-bold">Cancelled</div>
          <div className="text-lg sm:text-xl font-black text-[#B91C1C] font-mono mt-0.5 sm:mt-1 truncate" title={formatCurrency(todayCancelledAmt, true)}>
            {formatCurrency(todayCancelledAmt, false)}
          </div>
          <div className="text-[10px] text-[#B91C1C] mt-0.5">{todayCancelledCount} bill(s)</div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 bg-white border border-[#D8E1EC] rounded-xl p-3 sm:p-4 flex flex-col min-h-0 shadow-sm space-y-3">
        {/* Filters Bar & Quick Date Chips */}
        <div className="space-y-2.5 pb-2 border-b border-[#D8E1EC]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Invoice #, Customer or Remark..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB] shadow-xs"
              />
            </div>

            {/* Quick Actions (Sync & Export) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleSyncSupabase}
                disabled={isSyncing || isLoading}
                className="px-2.5 py-1.5 bg-white hover:bg-[#F0F6FF] border border-[#D8E1EC] text-[#172B4D] rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                title="Sync sales with Supabase cloud"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#2563EB] ${isSyncing || isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
              </button>

              <button
                onClick={() => setIsExportModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-[#D8E1EC] text-[#172B4D] rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => setIsShareReportsModalOpen(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-[#123B70] to-[#2563EB] hover:from-[#0D2D56] hover:to-[#1D4ED8] text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 border border-blue-400/30"
                title="Prepare and share Excel & PDF reports with your Chartered Accountant"
              >
                <Share2 className="w-3.5 h-3.5 text-blue-200" />
                <span>Share with CA</span>
              </button>
            </div>
          </div>

          {/* Quick Date Presets Touch Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto touch-scroll pb-1 no-scrollbar">
            {datePresets.map((dp) => {
              const isSelected = dateRange === dp.id;
              return (
                <button
                  key={dp.id}
                  type="button"
                  onClick={() => setDateRange(dp.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#172B4D] border border-[#CBD5E1]'
                  }`}
                >
                  {dp.label}
                </button>
              );
            })}

            <div className="h-4 w-px bg-gray-300 mx-1 shrink-0" />

            {/* Payment Filters Chips */}
            {(['all', 'cash', 'upi', 'credit'] as const).map((pm) => {
              const isSelected = paymentFilter === pm;
              return (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPaymentFilter(pm)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#123B70] text-white shadow-xs'
                      : 'bg-white text-[#64748B] border border-[#D8E1EC]'
                  }`}
                >
                  {pm}
                </button>
              );
            })}

            <div className="h-4 w-px bg-gray-300 mx-1 shrink-0" />

            {/* Document Type Filter Chips */}
            {([
              { id: 'all', label: 'All Types' },
              { id: 'gst', label: 'GST Tax' },
              { id: 'bill_of_supply', label: 'Bill of Supply' },
              { id: 'delivery_challan', label: 'Challan' },
              { id: 'credit_note', label: 'Credit Note' },
              { id: 'simple', label: 'Simple' },
              { id: 'quotation', label: 'Quotations' }
            ] as const).map((bt) => {
              const isSelected = billTypeFilter === bt.id;
              return (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => setBillTypeFilter(bt.id as any)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? bt.id === 'quotation'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-[#2563EB] text-white shadow-xs'
                      : bt.id === 'quotation'
                      ? 'bg-amber-50 text-amber-800 border border-amber-300'
                      : 'bg-white text-[#64748B] border border-[#D8E1EC]'
                  }`}
                >
                  {bt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. MOBILE INVOICE CARDS VIEW (Visible on mobile < 768px) */}
        <div className="md:hidden flex-1 overflow-y-auto space-y-2.5 pb-20">
          {filteredInvoices.length === 0 ? (
            <div className="py-12 text-center text-[#64748B]">
              <Receipt className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
              <div className="font-bold text-[#172B4D]">No invoices found</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Try changing the date filter or search query</div>
            </div>
          ) : (
            filteredInvoices.map((inv) => (
              <div
                key={inv.id}
                className="bg-white border border-[#D8E1EC] rounded-xl p-3 shadow-xs space-y-2.5 transition-all"
              >
                {/* Header: Invoice # + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-[#2563EB]">
                        #{inv.invoiceNumber}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        inv.invoiceType === 'gst'
                          ? 'bg-[#DBEAFE] text-[#123B70]'
                          : inv.invoiceType === 'credit_note'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : inv.invoiceType === 'bill_of_supply'
                          ? 'bg-purple-100 text-purple-800'
                          : inv.invoiceType === 'delivery_challan'
                          ? 'bg-orange-100 text-orange-800'
                          : inv.invoiceType === 'quotation'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {inv.invoiceType === 'gst' ? 'GST' : inv.invoiceType === 'credit_note' ? 'Credit Note' : inv.invoiceType === 'bill_of_supply' ? 'B.O.S' : inv.invoiceType === 'delivery_challan' ? 'Challan' : inv.invoiceType === 'quotation' ? 'Quotation' : 'Simple'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono mt-0.5">
                      {formatDate(inv.date)} • {inv.time || ''}
                    </div>
                  </div>

                  <Badge variant={inv.status === 'completed' ? 'emerald' : 'rose'}>
                    {inv.status === 'completed' ? 'PAID' : 'CANCELLED'}
                  </Badge>
                </div>

                {/* Customer & Remark Info */}
                <div className="flex items-center justify-between text-xs bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-[#172B4D] truncate">
                      {inv.customerName || 'Cash Customer'}
                    </div>
                    {inv.customerMobile && (
                      <div className="text-[10px] text-[#64748B] font-mono">
                        📱 {inv.customerMobile}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#CBD5E1] text-[#172B4D]">
                      {inv.paymentMode}
                    </span>
                  </div>
                </div>

                {inv.notes && (
                  <div className="text-[11px] font-medium text-[#B45309] bg-[#FFFBEB] px-2 py-1 rounded border border-[#FDE68A] truncate">
                    📝 {inv.notes}
                  </div>
                )}

                {/* Amount & Touch Actions Row */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <div>
                    <div className="text-[10px] text-[#64748B] font-mono">
                      {inv.items.length} item(s)
                    </div>
                    <div className="text-base font-black text-[#15803D] font-mono leading-tight">
                      {formatCurrency(inv.netPayable, inv.netPayable % 1 !== 0)}
                    </div>
                  </div>

                  {/* Mobile Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* Convert Quotation to Active Bill */}
                    {inv.invoiceType === 'quotation' && (
                      <button
                        type="button"
                        onClick={() => handleConvertToBill(inv)}
                        className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 shadow-2xs cursor-pointer"
                        title="Load quotation to create live invoice"
                      >
                        <FileCheck className="w-4 h-4 text-amber-600" />
                        <span>Bill</span>
                      </button>
                    )}

                    {/* WhatsApp Share Button */}
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(inv)}
                      className="p-2 bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#15803D] rounded-lg transition-colors active:scale-95 shadow-2xs cursor-pointer"
                      title="Share WhatsApp Receipt"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    {/* Print A5 Button */}
                    <button
                      type="button"
                      onClick={() => handleReprintA5(inv)}
                      className="p-2 bg-[#DBEAFE] hover:bg-[#BFDBFE] text-[#123B70] rounded-lg transition-colors active:scale-95 shadow-2xs cursor-pointer"
                      title="Print A5 Bill"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* View Details */}
                    <button
                      type="button"
                      onClick={() => { setSelectedInvoice(inv); setIsDetailModalOpen(true); }}
                      className="p-2 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172B4D] rounded-lg transition-colors active:scale-95 shadow-2xs cursor-pointer"
                      title="View Bill Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Cancel Sale */}
                    {inv.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleOpenReversal(inv)}
                        className="p-2 bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#B91C1C] rounded-lg transition-colors active:scale-95 shadow-2xs cursor-pointer"
                        title="Cancel / Reverse"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2. DESKTOP DENSE TABLE VIEW (Visible on >= 768px) */}
        <div className="hidden md:flex flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F1F5F9] text-[#172B4D] font-bold uppercase sticky top-0 border-b border-[#D8E1EC] text-[11px]">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Bill Type</th>
                <th className="p-3">Date & Time</th>
                <th className="p-3">Customer Details</th>
                <th className="p-3">Remark</th>
                <th className="p-3 text-center">Payment Mode</th>
                <th className="p-3 text-right">Items</th>
                <th className="p-3 text-right">Net Amount</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[#64748B]">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                    <div className="font-bold text-[#172B4D]">No invoices found matching current criteria</div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#F0F6FF] transition-colors">
                    <td className="p-3 font-mono font-bold text-[#2563EB]">{inv.invoiceNumber}</td>
                    <td className="p-3 font-mono uppercase text-[11px]">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        inv.invoiceType === 'gst'
                          ? 'bg-[#DBEAFE] text-[#123B70] border border-[#BFDBFE]'
                          : inv.invoiceType === 'credit_note'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : inv.invoiceType === 'bill_of_supply'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : inv.invoiceType === 'delivery_challan'
                          ? 'bg-orange-100 text-orange-800 border border-orange-200'
                          : inv.invoiceType === 'quotation'
                          ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                          : 'bg-[#F1F5F9] text-[#64748B] border border-[#D8E1EC]'
                      }`}>
                        {inv.invoiceType === 'gst' ? 'GST' : inv.invoiceType === 'credit_note' ? 'CREDIT NOTE' : inv.invoiceType === 'bill_of_supply' ? 'B.O.S' : inv.invoiceType === 'delivery_challan' ? 'CHALLAN' : inv.invoiceType === 'quotation' ? 'QUOTATION' : 'SIMPLE'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[#64748B]">{formatDate(inv.date)} {inv.time}</td>
                    <td className="p-3 font-semibold text-[#172B4D]">
                      <div>{inv.customerName || 'Cash Customer'}</div>
                      {inv.customerMobile && <div className="text-[11px] text-[#64748B] font-mono font-normal">{inv.customerMobile}</div>}
                    </td>
                    <td className="p-3">
                      {inv.notes ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] max-w-[170px] truncate" title={inv.notes}>
                          {inv.notes}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8] font-mono text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center uppercase font-mono text-xs">
                      <Badge variant={inv.paymentMode === 'cash' ? 'emerald' : inv.paymentMode === 'upi' ? 'indigo' : 'cyan'}>
                        {inv.paymentMode}
                      </Badge>
                      {inv.transactionRef && <div className="text-[10px] text-[#64748B] mt-0.5 truncate max-w-[100px]" title={inv.transactionRef}>Ref: {inv.transactionRef}</div>}
                    </td>
                    <td className="p-3 text-right font-mono text-[#172B4D]">{inv.items.length} items</td>
                    <td className="p-3 text-right font-mono font-extrabold text-[#15803D]">₹{inv.netPayable.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-center font-mono">
                      {inv.status === 'completed' ? (
                        <Badge variant="emerald">COMPLETED</Badge>
                      ) : (
                        <Badge variant="rose">CANCELLED</Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {inv.invoiceType === 'quotation' && (
                          <button
                            onClick={() => handleConvertToBill(inv)}
                            className="px-2 py-1 text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Convert quotation into active invoice"
                          >
                            <FileCheck className="w-3.5 h-3.5 text-amber-600" />
                            <span>Convert</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleShareWhatsApp(inv)}
                          className="p-1.5 text-[#64748B] hover:text-[#15803D] rounded hover:bg-[#DCFCE7] transition-colors cursor-pointer"
                          title="Share WhatsApp Receipt"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => { setSelectedInvoice(inv); setIsDetailModalOpen(true); }}
                          className="p-1.5 text-[#64748B] hover:text-[#2563EB] rounded hover:bg-[#DBEAFE] transition-colors cursor-pointer"
                          title="View Saved Invoice Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleReprintA5(inv)}
                          className="p-1.5 text-[#64748B] hover:text-[#15803D] rounded hover:bg-[#DCFCE7] transition-colors cursor-pointer"
                          title="Reprint A5 Invoice"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {inv.status === 'completed' && (
                          <button
                            onClick={() => handleOpenReversal(inv)}
                            className="p-1.5 text-[#64748B] hover:text-[#B91C1C] rounded hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                            title="Reverse / Cancel Sale"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Details Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Saved Invoice Details #${selectedInvoice?.invoiceNumber}`}
        subtitle="Saved line items, historical snapshots, and authoritative totals"
        maxWidth="3xl"
      >
        {selectedInvoice && (
          <div className="space-y-4 font-sans text-xs text-[#172B4D]">
            <div className="grid grid-cols-2 gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg font-mono">
              <div>
                <div>Customer Name: <strong className="text-[#172B4D]">{selectedInvoice.customerName}</strong></div>
                <div>Mobile: <span className="text-[#64748B]">{selectedInvoice.customerMobile || 'N/A'}</span></div>
                {selectedInvoice.customerGstin && <div>GSTIN: <span className="text-[#172B4D]">{selectedInvoice.customerGstin}</span></div>}
              </div>
              <div>
                <div>Date & Time: <span className="text-[#172B4D]">{selectedInvoice.date} {selectedInvoice.time}</span></div>
                <div>Document Type: <strong className={`uppercase ${
                  selectedInvoice.invoiceType === 'credit_note' ? 'text-emerald-700' :
                  selectedInvoice.invoiceType === 'bill_of_supply' ? 'text-purple-700' :
                  selectedInvoice.invoiceType === 'delivery_challan' ? 'text-orange-700' :
                  selectedInvoice.invoiceType === 'quotation' ? 'text-amber-600' : 'text-[#2563EB]'
                }`}>
                  {selectedInvoice.invoiceType === 'gst' ? 'GST Tax Invoice' :
                   selectedInvoice.invoiceType === 'credit_note' ? 'GST Credit Note' :
                   selectedInvoice.invoiceType === 'bill_of_supply' ? 'Bill of Supply' :
                   selectedInvoice.invoiceType === 'delivery_challan' ? 'Delivery Challan' :
                   selectedInvoice.invoiceType === 'quotation' ? 'Quotation / Estimate' : 'Simple Bill'}
                </strong></div>
                <div>Payment Mode: <strong className="text-[#15803D] uppercase">{selectedInvoice.paymentMode}</strong></div>
                {selectedInvoice.transactionRef && <div>Transaction Ref / UTR: <span className="text-[#B45309]">{selectedInvoice.transactionRef}</span></div>}
              </div>

              {selectedInvoice.originalInvoiceNumber && (
                <div className="col-span-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[10px] font-bold uppercase text-emerald-800">Linked Original Invoice (CGST Rule 53):</div>
                  <div className="text-xs font-bold text-emerald-950 mt-0.5">
                    Invoice #{selectedInvoice.originalInvoiceNumber} {selectedInvoice.originalInvoiceDate ? `dated ${formatDate(selectedInvoice.originalInvoiceDate)}` : ''}
                    {selectedInvoice.returnReason ? ` • Reason: ${selectedInvoice.returnReason}` : ''}
                  </div>
                </div>
              )}

              {selectedInvoice.notes && (
                <div className="col-span-2 p-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg">
                  <div className="text-[10px] font-bold uppercase text-[#92400E]">Bill Remark / Narration:</div>
                  <div className="text-xs font-bold text-[#78350F] mt-0.5">{selectedInvoice.notes}</div>
                </div>
              )}
            </div>

            {/* Item Table */}
            <div className="overflow-x-auto border border-[#D8E1EC] rounded-lg bg-white">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="bg-[#F1F5F9] text-[#172B4D] uppercase font-bold border-b border-[#D8E1EC]">
                  <tr>
                    <th className="p-2">Product</th>
                    <th className="p-2 text-center">Remark (Pack/HSN)</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-center">Free</th>
                    <th className="p-2 text-right">Rate</th>
                    <th className="p-2 text-right">MRP</th>
                    <th className="p-2 text-center">Disc %</th>
                    <th className="p-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-2 text-[#172B4D] font-semibold">{item.productName}</td>
                      <td className="p-2 text-center text-[#64748B] text-[10px] font-mono">{item.pack} {item.hsnCode ? `| HSN:${item.hsnCode}` : ''}</td>
                      <td className="p-2 text-center text-[#15803D] font-bold font-mono">{item.qty} {item.unit}</td>
                      <td className="p-2 text-center text-[#B45309] font-mono">{item.freeQty > 0 ? item.freeQty : '-'}</td>
                      <td className="p-2 text-right font-mono">₹{item.unitRate.toFixed(2)}</td>
                      <td className="p-2 text-right text-[#64748B] font-mono">₹{item.mrp.toFixed(2)}</td>
                      <td className="p-2 text-center font-mono">{item.discountPct}%</td>
                      <td className="p-2 text-right font-bold text-[#123B70] font-mono">₹{item.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Authoritative Totals */}
            <div className="p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg space-y-1 text-right text-xs font-mono">
              <div className="flex justify-between text-[#64748B]"><span>Taxable Subtotal:</span><span>₹{selectedInvoice.subtotal.toFixed(2)}</span></div>
              {selectedInvoice.totalDiscount > 0 && <div className="flex justify-between text-[#15803D]"><span>Total Discount:</span><span>- ₹{selectedInvoice.totalDiscount.toFixed(2)}</span></div>}
              {selectedInvoice.isInterstate ? (
                <div className="flex justify-between text-[#64748B]"><span>IGST Total:</span><span>₹{selectedInvoice.igstTotal.toFixed(2)}</span></div>
              ) : (
                <>
                  <div className="flex justify-between text-[#64748B]"><span>CGST Total:</span><span>₹{selectedInvoice.cgstTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[#64748B]"><span>SGST Total:</span><span>₹{selectedInvoice.sgstTotal.toFixed(2)}</span></div>
                </>
              )}
              {selectedInvoice.freightAmount > 0 && <div className="flex justify-between text-[#64748B]"><span>Freight Overhead:</span><span>₹{selectedInvoice.freightAmount.toFixed(2)}</span></div>}
              <div className="flex justify-between text-[#64748B]"><span>Round Off:</span><span>{selectedInvoice.roundOff >= 0 ? '+' : ''}₹{selectedInvoice.roundOff.toFixed(2)}</span></div>
              <div className="flex justify-between text-base font-extrabold text-[#123B70] pt-1 border-t border-[#D8E1EC] mt-1">
                <span>NET PAYABLE (SAVED):</span>
                <span>{formatCurrency(selectedInvoice.netPayable)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between pt-3 border-t border-[#D8E1EC] gap-2">
              <div className="flex items-center gap-2">
                {selectedInvoice.status === 'completed' && selectedInvoice.invoiceType !== 'credit_note' && selectedInvoice.invoiceType !== 'quotation' && (
                  <button
                    type="button"
                    onClick={() => handleOpenCreditNote(selectedInvoice)}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Issue GST Credit Note / Sales Return against this invoice"
                  >
                    <RotateCcw className="w-4 h-4 text-emerald-600" /> Issue Credit Note / Return
                  </button>
                )}

                {selectedInvoice.status === 'completed' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenReversal(selectedInvoice)}
                    className="px-3 py-2 bg-[#FEE2E2] hover:bg-[#FECDD3] text-[#B91C1C] border border-[#FCA5A5] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" /> Cancel / Reverse
                  </button>
                ) : (
                  <Badge variant="rose">CANCELLED / REVERSED</Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {selectedInvoice.invoiceType === 'quotation' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleConvertToBill(selectedInvoice);
                      setIsDetailModalOpen(false);
                    }}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    title="Load quotation to invoice customer"
                  >
                    <FileCheck className="w-4 h-4" /> Convert to Active Bill
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleReprintA5(selectedInvoice)}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Print / Share Invoice
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Controlled Invoice Reversal Modal */}
      <Modal
        isOpen={isReversalModalOpen}
        onClose={() => setIsReversalModalOpen(false)}
        title={`Confirm Reversal - Invoice #${selectedInvoice?.invoiceNumber}`}
        subtitle="Stock restoration & audit trail recording workflow"
        maxWidth="lg"
      >
        <div className="space-y-4 font-sans text-xs">
          <div className="p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg text-xs text-[#B91C1C]">
            <strong>Warning:</strong> Reversing an invoice will restore the product stock quantities in database, set invoice status to <code>cancelled</code>, and write an immutable audit log record.
          </div>

          <div>
            <label className="block text-xs font-bold text-[#172B4D] mb-1">Reason for Reversal / Cancellation *</label>
            <textarea
              rows={3}
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Customer returned merchandise / Billed wrong item by cashier..."
              className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#B91C1C]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmittingReversal}
              onClick={() => setIsReversalModalOpen(false)}
              className="px-4 py-2 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-semibold cursor-pointer"
            >
              Back
            </button>

            <button
              type="button"
              disabled={isSubmittingReversal}
              onClick={handleConfirmReversal}
              className="px-4 py-2 bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
            >
              {isSubmittingReversal ? 'Processing Reversal...' : 'Confirm Reversal & Restore Stock'}
            </button>
          </div>
        </div>
      </Modal>

      {/* CSV Data Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export Operational Data (CSV)"
        subtitle="Export sales, products, payments and stock ledger reports"
        maxWidth="lg"
      >
        <div className="space-y-3 font-sans text-xs">
          <div className="p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg text-xs text-[#64748B]">
            Select a report to download in standard CSV format suitable for Microsoft Excel or accounting audit.
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => { setIsExportModalOpen(false); setIsShareReportsModalOpen(true); }}
              className="p-3 bg-gradient-to-r from-[#EFF6FF] to-[#DBEAFE]/40 border-2 border-[#3B82F6] rounded-xl text-left flex items-center justify-between text-xs transition-all cursor-pointer shadow-xs hover:border-[#1D4ED8]"
            >
              <div>
                <div className="font-black text-[#1E3A8A] flex items-center gap-1.5">
                  <span>★ Share Reports Pack with CA (Excel & PDF)</span>
                  <span className="text-[9px] font-bold bg-[#2563EB] text-white px-1.5 py-0.2 rounded">Recommended</span>
                </div>
                <div className="text-[11px] text-[#475569] mt-0.5">Generate multi-sheet workbook, rate-wise GST matrix, customer/supplier ledgers, and share on WhatsApp.</div>
              </div>
              <Share2 className="w-4 h-4 text-[#2563EB] shrink-0 ml-2" />
            </button>

            <button
              onClick={() => { exportInvoiceHeadersCSV(filteredInvoices); onToast('success', 'CSV Exported', `Exported ${filteredInvoices.length} invoice headers.`); }}
              className="p-3 bg-white hover:bg-[#F0F6FF] border border-[#D8E1EC] rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer shadow-xs"
            >
              <div>
                <div className="font-bold text-[#15803D]">1. Invoice Summary Headers CSV</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Includes invoice numbers, totals, discounts, taxes, customer details, payment modes.</div>
              </div>
              <Download className="w-4 h-4 text-[#15803D] shrink-0 ml-2" />
            </button>

            <button
              onClick={() => { exportInvoiceItemsCSV(filteredInvoices); onToast('success', 'CSV Exported', 'Exported invoice line items.'); }}
              className="p-3 bg-white hover:bg-[#F0F6FF] border border-[#D8E1EC] rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer shadow-xs"
            >
              <div>
                <div className="font-bold text-[#2563EB]">2. Invoice Line Items Detailed CSV</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Includes item-level snapshots, quantities, free quantities, rates, MRPs, item discounts, GST breakdown.</div>
              </div>
              <Download className="w-4 h-4 text-[#2563EB] shrink-0 ml-2" />
            </button>

            <button
              onClick={() => { exportPaymentsCSV(filteredInvoices); onToast('success', 'CSV Exported', 'Exported payment log report.'); }}
              className="p-3 bg-white hover:bg-[#F0F6FF] border border-[#D8E1EC] rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer shadow-xs"
            >
              <div>
                <div className="font-bold text-[#B45309]">3. Payments Log CSV</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Includes payment methods (Cash, UPI), paid amounts, and UTR transaction references.</div>
              </div>
              <Download className="w-4 h-4 text-[#B45309] shrink-0 ml-2" />
            </button>

            <button
              onClick={() => { exportProductsCSV(products); onToast('success', 'CSV Exported', `Exported ${products.length} product records.`); }}
              className="p-3 bg-white hover:bg-[#F0F6FF] border border-[#D8E1EC] rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer shadow-xs"
            >
              <div>
                <div className="font-bold text-[#0369A1]">4. Products Catalogue CSV</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Includes SKUs, barcodes, names, MRPs, selling rates, GST rates, HSN codes, stock quantities.</div>
              </div>
              <Download className="w-4 h-4 text-[#0369A1] shrink-0 ml-2" />
            </button>

            <button
              onClick={handleExportStockMovements}
              className="p-3 bg-white hover:bg-[#F0F6FF] border border-[#D8E1EC] rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer shadow-xs"
            >
              <div>
                <div className="font-bold text-[#B91C1C]">5. Stock Movements Audit Ledger CSV</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Includes full stock audit history (sales, returns, adjustments, previous & new stock).</div>
              </div>
              <Download className="w-4 h-4 text-[#B91C1C] shrink-0 ml-2" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Share Reports with CA Dedicated Modal */}
      <ShareReportsModal
        isOpen={isShareReportsModalOpen}
        onClose={() => setIsShareReportsModalOpen(false)}
        onToast={onToast}
      />

      {/* Statutory Credit Note / Sales Return Modal (CGST Rule 53) */}
      <CreditNoteModal
        isOpen={isCreditNoteModalOpen}
        onClose={() => {
          setIsCreditNoteModalOpen(false);
          setCreditNoteTargetInvoice(null);
        }}
        invoice={creditNoteTargetInvoice}
        onSuccess={handleCreditNoteSuccess}
        onToast={onToast}
      />

      {/* Universal Print & Share Preview Modal */}
      <A5PrintPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setPreviewInvoice(null);
        }}
        invoice={previewInvoice}
        shopProfile={shopProfile}
        printSettings={printSettings}
      />
    </div>
  );
};
