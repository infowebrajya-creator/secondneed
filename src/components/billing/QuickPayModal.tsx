import React, { useState, useEffect } from 'react';
import { 
  IndianRupee, CreditCard, QrCode, BookOpen, Printer, CheckCircle2, 
  Loader2, Info, ReceiptText, User, StickyNote, Share2, ChevronDown, ChevronUp, AlertCircle 
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { PaymentMode, InvoiceItem, InvoiceType } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useSettingsStore } from '../../store/useSettingsStore';

interface QuickPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  netPayable: number;
  paymentMode: PaymentMode;
  onSelectPaymentMode: (mode: PaymentMode) => void;
  onConfirmPayment: (paidAmount: number, shouldPrint: boolean, upiRef?: string) => Promise<void> | void;
  isSubmitting?: boolean;
  items?: InvoiceItem[];
  totals?: {
    subtotal: number;
    totalDiscount: number;
    totalGst: number;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    roundOff: number;
    netPayable: number;
  };
  customerName?: string;
  customerMobile?: string;
  shopUpiId?: string;
  shopName?: string;
  invoiceType?: InvoiceType;
  notes?: string;
  onNotesChange?: (notes: string) => void;
}

export const QuickPayModal: React.FC<QuickPayModalProps> = ({
  isOpen,
  onClose,
  netPayable,
  paymentMode,
  onSelectPaymentMode,
  onConfirmPayment,
  isSubmitting = false,
  items = [],
  totals,
  customerName = 'Cash Customer',
  customerMobile = '',
  shopUpiId = '',
  shopName = '',
  invoiceType = 'gst',
  notes = '',
  onNotesChange
}) => {
  const { shopProfile, printSettings } = useSettingsStore();
  const paperFormat = printSettings?.paperSize === '80mm' || printSettings?.paperSize === 'Thermal' ? '80mm' : printSettings?.paperSize === 'A4' ? 'A4' : 'A5';

  // Always prefer active shopProfile setting with fallback to prop
  const activeUpiId = (shopProfile?.upiId || shopUpiId || '').trim();
  const activeShopName = (shopProfile?.shopName || shopName || 'WebRajya Store').trim();

  const [cashTendered, setCashTendered] = useState<number>(netPayable);
  const [upiRef, setUpiRef] = useState<string>('');
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [inputMobile, setInputMobile] = useState<string>(customerMobile);

  useEffect(() => {
    if (isOpen) {
      setCashTendered(netPayable);
      setUpiRef('');
      setInputMobile(customerMobile);
    }
  }, [isOpen, netPayable, customerMobile]);

  const changeReturn = Math.max(0, cashTendered - netPayable);

  const quickCashOptions = [netPayable, 100, 200, 500, 2000].filter(
    (val, idx, arr) => arr.indexOf(val) === idx && val >= netPayable
  );

  const paymentModes: { id: PaymentMode; label: string; shortcut: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: 'Cash', shortcut: '1', icon: <IndianRupee className="w-4 h-4" /> },
    { id: 'upi', label: 'UPI / QR', shortcut: '2', icon: <QrCode className="w-4 h-4" /> },
    { id: 'card', label: 'Card / POS', shortcut: '3', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'credit', label: 'Credit / Khata', shortcut: '4', icon: <BookOpen className="w-4 h-4" /> },
  ];

  const isAnonymousCustomer = (!customerName.trim() || customerName.trim().toLowerCase() === 'cash customer') && !customerMobile.trim() && !inputMobile.trim();

  const handleConfirm = (shouldPrint: boolean) => {
    if (isSubmitting) return;
    if (paymentMode === 'credit' && isAnonymousCustomer) {
      alert('Credit / Khata (Udhar) sale requires a Customer Name or Mobile Number so the ledger balance can be tracked.');
      return;
    }
    onConfirmPayment(paymentMode === 'cash' ? cashTendered : netPayable, shouldPrint, upiRef.trim() || undefined);
  };

  const handleConfirmAndWhatsApp = async () => {
    if (isSubmitting) return;
    if (paymentMode === 'credit' && isAnonymousCustomer) {
      alert('Credit / Khata (Udhar) sale requires a Customer Name or Mobile Number so the ledger balance can be tracked.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(25); } catch (_) {}
    }

    // First save the invoice
    await onConfirmPayment(paymentMode === 'cash' ? cashTendered : netPayable, false, upiRef.trim() || undefined);

    // Format WhatsApp receipt text
    const cleanPhone = (inputMobile || customerMobile || '').replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const receiptMessage = [
      `🧾 *TAX INVOICE / RECEIPT*`,
      `*${activeShopName.toUpperCase()}*`,
      `--------------------------------`,
      `Customer: ${customerName.trim() || 'Valued Customer'}`,
      `Date: ${new Date().toLocaleDateString('en-IN')}`,
      `Items: ${items.length} product(s)`,
      `Payment: ${paymentMode.toUpperCase()}`,
      `--------------------------------`,
      ...items.slice(0, 15).map((it, idx) => `${idx + 1}. ${it.productName} (${it.qty} ${it.unit}) = ₹${(it.totalAmount || (it.unitRate * it.qty)).toFixed(2)}`),
      items.length > 15 ? `...and ${items.length - 15} more item(s)` : '',
      `--------------------------------`,
      `*GRAND TOTAL: ₹${netPayable.toFixed(2)}*`,
      notes ? `Note: ${notes}` : '',
      `--------------------------------`,
      `Thank you for your business! 🙏`
    ].filter(Boolean).join('\n');

    // On mobile devices, prefer native Web Share API for 1-tap sheet (WhatsApp, Messages, etc.)
    if (typeof navigator !== 'undefined' && navigator.share && window.innerWidth < 768) {
      try {
        await navigator.share({
          title: `${activeShopName} Receipt`,
          text: receiptMessage,
        });
        return;
      } catch (shareErr: any) {
        if (shareErr.name === 'AbortError') return;
      }
    }

    const waUrl = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(receiptMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(receiptMessage)}`;

    window.open(waUrl, '_blank');
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleModalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'F9') {
        e.preventDefault();
        handleConfirm(true);
        return;
      }

      if (e.key === 'Enter' && !isInput) {
        e.preventDefault();
        handleConfirm(true);
        return;
      }

      // Quick payment mode keys (1: Cash, 2: UPI, 3: Card, 4: Credit)
      if (!isInput) {
        if (e.key === '1' || e.key.toLowerCase() === 'c') {
          e.preventDefault();
          onSelectPaymentMode('cash');
        } else if (e.key === '2' || e.key.toLowerCase() === 'u') {
          e.preventDefault();
          onSelectPaymentMode('upi');
        } else if (e.key === '3' || e.key.toLowerCase() === 'p') {
          e.preventDefault();
          onSelectPaymentMode('card');
        } else if (e.key === '4' || e.key.toLowerCase() === 'k') {
          e.preventDefault();
          onSelectPaymentMode('credit');
        }
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [isOpen, paymentMode, cashTendered, netPayable, isSubmitting, upiRef, inputMobile]);

  // Construct UPI URI for scannable QR code
  const cleanUpiId = activeUpiId;
  const upiPayUri = `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(activeShopName)}&am=${netPayable.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Bill Payment')}`;
  const upiQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiPayUri)}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Settle & Save Bill [F8]"
      subtitle="Select payment method and confirm bill"
      maxWidth="4xl"
    >
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-5">
        {/* PAYMENT & SETTLEMENT CONTROLS (Rendered FIRST for rapid mobile access) */}
        <div className="order-1 lg:order-2 lg:col-span-6 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3.5">
            {/* Net Payable Banner */}
            <div className="p-3.5 sm:p-4 bg-[#123B70] border border-[#0D2D56] rounded-2xl text-center shadow-sm text-white">
              <div className="text-[11px] sm:text-xs uppercase tracking-wider text-blue-200 font-bold">Net Payable Amount</div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-0.5 sm:mt-1">
                {formatCurrency(netPayable)}
              </div>
            </div>

            {/* Payment Modes Selection */}
            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1.5 uppercase tracking-wider">Select Payment Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {paymentModes.map((mode) => {
                  const active = paymentMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => onSelectPaymentMode(mode.id)}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                        active
                          ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-sm ring-2 ring-[#2563EB]/30'
                          : 'bg-white border-[#D8E1EC] text-[#172B4D] hover:bg-[#F5F9FF]'
                      } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {mode.icon}
                        <span>{mode.label}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        [{mode.shortcut}]
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cash Tender Calculation */}
            {paymentMode === 'cash' && (
              <div className="p-3.5 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#172B4D]">Cash Received (₹)</label>
                  <span className="text-xs text-[#64748B] font-mono">
                    Change: <strong className="text-[#B45309] font-bold">₹{changeReturn.toFixed(2)}</strong>
                  </span>
                </div>
                
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  disabled={isSubmitting}
                  value={cashTendered || ''}
                  onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-lg font-mono text-[#15803D] font-extrabold focus:outline-none focus:border-[#2563EB] shadow-2xs"
                />

                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[11px] text-[#64748B] font-mono">Quick:</span>
                  {quickCashOptions.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setCashTendered(amt)}
                      className="px-2.5 py-1 bg-white hover:bg-[#DBEAFE] border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] transition-colors cursor-pointer font-bold active:scale-95"
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* UPI QR Code & Reference */}
            {paymentMode === 'upi' && (
              <div className="p-3.5 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl space-y-3">
                {cleanUpiId ? (
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-[#D8E1EC]">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white p-1 border border-gray-200 rounded-lg shrink-0 flex items-center justify-center">
                      <img 
                        src={upiQrUrl} 
                        alt="UPI QR Code" 
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-[#64748B] uppercase">Scan & Pay via any UPI App</div>
                      <div className="text-sm font-extrabold text-[#15803D] font-mono mt-0.5">₹{netPayable.toFixed(2)}</div>
                      <div className="text-xs font-mono text-[#172B4D] truncate mt-1">VPA: {cleanUpiId}</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">GPay • PhonePe • Paytm • BHIM</div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-xs text-amber-900">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>Store UPI ID Not Configured</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      To display your dynamic QR code and receive payments straight into your bank account, please enter your UPI ID in <strong>Settings &gt; Shop Profile</strong>.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-[#172B4D] mb-1">UPI UTR / Reference ID (Optional)</label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={upiRef}
                    onChange={(e) => setUpiRef(e.target.value)}
                    placeholder="e.g. 123456789012 or UTR Ref"
                    className="w-full px-3 py-1.5 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>
            )}

            {/* Credit / Khata Sale Mode Notice & Warning */}
            {paymentMode === 'credit' && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
                <div className="font-bold text-amber-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-amber-700" />
                    <span>Credit / Khata (Udhar) Sale</span>
                  </span>
                  <span className="text-[11px] font-mono font-black text-amber-800">
                    Debit: ₹{netPayable.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This entire balance of <strong>₹{netPayable.toFixed(2)}</strong> will be recorded as outstanding credit in the customer's ledger statement.
                </p>
                {isAnonymousCustomer && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 font-bold flex items-center gap-1.5 text-[11px]">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>Customer Name or Mobile is required to book a Credit sale.</span>
                  </div>
                )}
              </div>
            )}

            {/* Bill Remark / Narration */}
            <div className="p-2.5 bg-[#F8FAFC] border border-[#D8E1EC] rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-[#172B4D] flex items-center gap-1">
                  <StickyNote className="w-3 h-3 text-[#2563EB]" />
                  <span>Bill Narration / Remark</span>
                </label>
                <span className="text-[10px] text-[#64748B]">Prints on bill</span>
              </div>
              <input
                type="text"
                disabled={isSubmitting}
                placeholder="e.g. Class 10th Books, School Order..."
                value={notes || ''}
                onChange={(e) => onNotesChange?.(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#172B4D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          {/* Action Buttons (Save, Print, and WhatsApp Share) */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isSubmitting || items.length === 0}
                onClick={() => handleConfirm(false)}
                className="py-2.5 sm:py-3 bg-white hover:bg-[#F5F9FF] disabled:opacity-50 text-[#172B4D] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-[#D8E1EC] cursor-pointer active:scale-95"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" /> : <CheckCircle2 className="w-4 h-4 text-[#15803D]" />}
                <span>Save (No Print)</span>
              </button>
              
              <button
                type="button"
                disabled={isSubmitting || items.length === 0}
                onClick={() => handleConfirm(true)}
                className="py-2.5 sm:py-3 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer active:scale-95"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Printer className="w-4 h-4" />}
                <span>Save & Print {paperFormat}</span>
              </button>
            </div>

            {/* Direct WhatsApp Share Button */}
            <button
              type="button"
              disabled={isSubmitting || items.length === 0}
              onClick={handleConfirmAndWhatsApp}
              className="w-full py-2.5 bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Share2 className="w-4 h-4" />
              <span>Save & Share Receipt via WhatsApp</span>
            </button>
          </div>
        </div>

        {/* BILL DETAILS & ITEMS PREVIEW (Collapsible on Mobile, Expanded on Desktop) */}
        <div className="order-2 lg:order-1 lg:col-span-6 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            {/* Header / Info */}
            <div 
              onClick={() => setIsMobilePreviewOpen(!isMobilePreviewOpen)}
              className="flex items-center justify-between border-b border-[#D8E1EC] pb-2 mb-2 cursor-pointer lg:cursor-default"
            >
              <div className="flex items-center gap-1.5">
                <ReceiptText className="w-4 h-4 text-[#2563EB]" />
                <span className="text-xs font-extrabold text-[#172B4D] uppercase tracking-wider">
                  Bill Summary ({items.length} items)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase ${
                  invoiceType === 'gst' ? 'bg-[#DBEAFE] text-[#123B70]' : 'bg-gray-200 text-gray-700'
                }`}>
                  {invoiceType === 'gst' ? 'GST Invoice' : 'Non-GST'}
                </span>
                <span className="lg:hidden text-[#2563EB]">
                  {isMobilePreviewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="flex items-center justify-between text-xs font-semibold text-[#172B4D] mb-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#D8E1EC]">
              <div className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                <span className="font-bold text-[#123B70] truncate">{customerName.trim() || 'Cash Customer'}</span>
              </div>
              {customerMobile && <span className="text-[11px] font-mono text-[#64748B]">📱 {customerMobile}</span>}
            </div>

            {/* Line Items Table (Visible on desktop or when expanded on mobile) */}
            <div className={`overflow-y-auto border border-[#D8E1EC] rounded-lg bg-white mb-2 transition-all ${
              isMobilePreviewOpen ? 'max-h-56 block' : 'hidden lg:block lg:max-h-52'
            }`}>
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F5F9FF] text-[#123B70] font-bold border-b border-[#D8E1EC] sticky top-0">
                  <tr>
                    <th className="py-1.5 px-2">#</th>
                    <th className="py-1.5 px-2">Item</th>
                    <th className="py-1.5 px-2 text-center">Qty</th>
                    <th className="py-1.5 px-2 text-right">Rate</th>
                    <th className="py-1.5 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-[#64748B] italic">No items added to bill</td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[#F5F9FF]/50">
                        <td className="py-1.5 px-2 text-[#64748B] font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-semibold text-[#172B4D] max-w-[120px] truncate" title={item.productName}>
                          {item.productName}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-[#123B70]">{item.qty}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-[#64748B]">₹{item.unitRate.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-[#172B4D]">₹{(item.totalAmount || (item.unitRate * item.qty)).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Totals Breakdown */}
          {totals && (
            <div className="bg-white border border-[#D8E1EC] rounded-lg p-2.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-[#64748B]">
                <span>Taxable Subtotal:</span>
                <span>₹{totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-[#15803D]">
                  <span>Total Discount:</span>
                  <span>-₹{totals.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              {totals.totalGst > 0 && (
                <div className="flex justify-between text-[#2563EB]">
                  <span>GST Amount:</span>
                  <span>+₹{totals.totalGst.toFixed(2)}</span>
                </div>
              )}
              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-[#64748B]">
                  <span>Round Off:</span>
                  <span>{totals.roundOff > 0 ? '+' : ''}₹{totals.roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-[#123B70] pt-1 border-t border-[#D8E1EC]">
                <span>Grand Total:</span>
                <span className="text-[#2563EB]">₹{totals.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
