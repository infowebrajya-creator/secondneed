import React, { useState, useMemo } from 'react';
import { RotateCcw, AlertTriangle, CheckSquare, Square, FileText } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Invoice, InvoiceItem } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useSalesStore } from '../../store/useSalesStore';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onSuccess: (creditNote: Invoice) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

const COMMON_REASONS = [
  'Defective / Damaged goods returned by customer',
  'Customer returned goods within return window',
  'Incorrect quantity billed / cashier error',
  'Deficiency in service / post-sale price adjustment',
  'Goods rejected at delivery'
];

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onSuccess,
  onToast
}) => {
  const { createCreditNote } = useSalesStore();

  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [reasonCategory, setReasonCategory] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize returnQtys when invoice opens
  React.useEffect(() => {
    if (invoice && isOpen) {
      const initial: Record<string, number> = {};
      invoice.items.forEach((item, idx) => {
        initial[item.id || `${item.productId}_${idx}`] = 0;
      });
      setReturnQtys(initial);
      setCustomReason('');
    }
  }, [invoice, isOpen]);

  if (!invoice) return null;

  const handleQtyChange = (itemId: string, maxQty: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxQty, Math.floor(val || 0)));
    setReturnQtys(prev => ({ ...prev, [itemId]: clamped }));
  };

  const handleSelectAll = () => {
    const all: Record<string, number> = {};
    invoice.items.forEach((item, idx) => {
      all[item.id || `${item.productId}_${idx}`] = item.qty;
    });
    setReturnQtys(all);
  };

  const handleClearAll = () => {
    const cleared: Record<string, number> = {};
    invoice.items.forEach((item, idx) => {
      cleared[item.id || `${item.productId}_${idx}`] = 0;
    });
    setReturnQtys(cleared);
  };

  // Calculations
  const calculation = useMemo(() => {
    const returnedItemsList: { item: InvoiceItem; returnQty: number }[] = [];
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let rawTotalAmount = 0;
    let totalUnits = 0;

    invoice.items.forEach((item, idx) => {
      const id = item.id || `${item.productId}_${idx}`;
      const rQty = returnQtys[id] || 0;
      if (rQty > 0) {
        returnedItemsList.push({ item, returnQty: rQty });
        const ratio = rQty / item.qty;
        const taxable = Math.round(item.taxableAmount * ratio * 100) / 100;
        const cgst = Math.round((item.cgstAmount || 0) * ratio * 100) / 100;
        const sgst = Math.round((item.sgstAmount || 0) * ratio * 100) / 100;
        const igst = Math.round((item.igstAmount || 0) * ratio * 100) / 100;
        const total = Math.round(item.totalAmount * ratio * 100) / 100;

        totalTaxable += taxable;
        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;
        rawTotalAmount += total;
        totalUnits += rQty;
      }
    });

    const netRefund = Math.round(rawTotalAmount);
    const roundOff = Math.round((netRefund - rawTotalAmount) * 100) / 100;

    return {
      returnedItemsList,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      totalGst: totalCgst + totalSgst + totalIgst,
      rawTotalAmount,
      netRefund,
      roundOff,
      totalUnits
    };
  }, [invoice, returnQtys]);

  const handleIssueCreditNote = async () => {
    if (calculation.returnedItemsList.length === 0) {
      onToast('error', 'No Items Selected', 'Please specify return quantity for at least one item.');
      return;
    }

    const finalReason = customReason.trim()
      ? `${reasonCategory}: ${customReason.trim()}`
      : reasonCategory;

    setIsSubmitting(true);
    try {
      const cn = await createCreditNote({
        originalInvoice: invoice,
        returnedItems: calculation.returnedItemsList,
        returnReason: finalReason
      });

      onToast(
        'success',
        'Credit Note Issued',
        `Credit Note #${cn.invoiceNumber} created for ${formatCurrency(cn.netPayable)}. Inventory restocked.`
      );
      onSuccess(cn);
      onClose();
    } catch (err: any) {
      onToast('error', 'Failed to Issue Credit Note', err?.message || 'Transaction error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issue GST Credit Note / Sales Return"
      subtitle={`Original Inv #${invoice.invoiceNumber} • ${formatDate(invoice.date)} • ${invoice.customerName}`}
      maxWidth="4xl"
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Statutory Rule 53 Banner */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-900 leading-relaxed">
            <span className="font-bold">CGST Rule 53 Statutory Requirement:</span> A Credit Note officially reverses output GST liability, restocks returned items to your warehouse, and references the original invoice number & date.
          </div>
        </div>

        {/* Item Selection Table */}
        <div className="border border-[#D8E1EC] rounded-lg overflow-hidden bg-white">
          <div className="flex items-center justify-between p-2.5 bg-[#F5F9FF] border-b border-[#D8E1EC]">
            <span className="font-bold text-[#172B4D] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
              Select Items & Return Quantities
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2 py-1 bg-white hover:bg-blue-50 text-[#2563EB] border border-blue-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3 h-3" /> Return All Items
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2 py-1 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-[#D8E1EC] text-[10px] text-[#64748B] uppercase font-bold sticky top-0">
                <tr>
                  <th className="p-2">Item Description</th>
                  <th className="p-2 text-center">HSN</th>
                  <th className="p-2 text-center">Billed Qty</th>
                  <th className="p-2 text-center">Return Qty</th>
                  <th className="p-2 text-right">Unit Rate</th>
                  <th className="p-2 text-center">GST %</th>
                  <th className="p-2 text-right">Refund Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {invoice.items.map((item, idx) => {
                  const id = item.id || `${item.productId}_${idx}`;
                  const rQty = returnQtys[id] || 0;
                  const ratio = rQty / item.qty;
                  const refundForThisItem = Math.round(item.totalAmount * ratio * 100) / 100;

                  return (
                    <tr key={id} className={rQty > 0 ? 'bg-blue-50/40' : ''}>
                      <td className="p-2 font-semibold text-[#172B4D]">
                        {item.productName}
                        {item.pack && <span className="text-[10px] text-[#64748B] ml-1.5 font-normal">({item.pack})</span>}
                      </td>
                      <td className="p-2 text-center font-mono text-[#64748B] text-[11px]">
                        {item.hsnCode || '—'}
                      </td>
                      <td className="p-2 text-center font-bold text-[#172B4D]">
                        {item.qty} {item.unit}
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max={item.qty}
                            value={rQty}
                            onChange={(e) => handleQtyChange(id, item.qty, parseInt(e.target.value, 10))}
                            className="w-16 px-2 py-1 text-center font-bold text-xs border border-[#CBD5E1] rounded focus:border-[#2563EB] focus:outline-none"
                          />
                          <span className="text-[10px] text-gray-500">/{item.qty}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono">₹{item.unitRate.toFixed(2)}</td>
                      <td className="p-2 text-center font-mono text-gray-600">{item.gstRate}%</td>
                      <td className="p-2 text-right font-mono font-bold text-[#1E3A8A]">
                        {rQty > 0 ? `₹${refundForThisItem.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reason Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 border border-[#D8E1EC] rounded-lg">
          <div>
            <label className="block text-[11px] font-bold text-[#172B4D] mb-1">
              Statutory Reason for Return *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
            >
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#172B4D] mb-1">
              Additional Remarks (Optional)
            </label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="e.g. Serial # broken / partial packet accepted..."
              className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        {/* Reversal Totals Summary Card */}
        <div className="p-3 bg-[#F5F9FF] border border-[#CBD5E1] rounded-lg space-y-1.5 text-right font-mono text-xs">
          <div className="flex justify-between text-[#64748B]">
            <span>Selected Units to Return:</span>
            <span className="font-bold text-[#172B4D]">{calculation.totalUnits} Units</span>
          </div>
          <div className="flex justify-between text-[#64748B]">
            <span>Taxable Value Reversal:</span>
            <span>₹{calculation.totalTaxable.toFixed(2)}</span>
          </div>
          {invoice.isInterstate ? (
            <div className="flex justify-between text-[#64748B]">
              <span>IGST Reversal:</span>
              <span>₹{calculation.totalIgst.toFixed(2)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-[#64748B]">
                <span>CGST Reversal:</span>
                <span>₹{calculation.totalCgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#64748B]">
                <span>SGST Reversal:</span>
                <span>₹{calculation.totalSgst.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-[#64748B]">
            <span>Round Off:</span>
            <span>{calculation.roundOff >= 0 ? '+' : ''}₹{calculation.roundOff.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-extrabold text-[#123B70] pt-1.5 border-t border-[#CBD5E1]">
            <span>NET CREDIT / REFUND AMOUNT:</span>
            <span className="text-emerald-700">{formatCurrency(calculation.netRefund)}</span>
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[#D8E1EC]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleIssueCreditNote}
            disabled={isSubmitting || calculation.totalUnits === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            {isSubmitting ? 'Issuing Credit Note...' : `Issue Credit Note (${formatCurrency(calculation.netRefund)})`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

