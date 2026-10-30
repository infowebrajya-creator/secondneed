import React, { useState } from 'react';
import { X, Sparkles, Plus, Minus, Tag, Check, Delete } from 'lucide-react';
import { useBillingStore } from '../../store/useBillingStore';
import { formatCurrency } from '../../utils/formatters';

interface QuickPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

const COMMON_PRESETS = [199, 299, 399, 499, 699, 999, 1499, 1999];

const ITEM_NAME_TAGS = [
  'Casual Shirt',
  'T-Shirt / Polo',
  'Jeans / Denim',
  'Cotton Trousers',
  'Formal Shirt',
  'Kurta / Ethnic',
  'Innerwear',
  'Accessories / Belt'
];

export const QuickPriceModal: React.FC<QuickPriceModalProps> = ({
  isOpen,
  onClose,
  onToast
}) => {
  const { addCustomItem, invoiceType } = useBillingStore();

  const [selectedTag, setSelectedTag] = useState('Casual Shirt');
  const [customName, setCustomName] = useState('');
  const [amountStr, setAmountStr] = useState('499');
  const [qty, setQty] = useState(1);
  const [gstRate, setGstRate] = useState<number>(invoiceType === 'gst' ? 12 : 0);

  if (!isOpen) return null;

  const handleKeypadPress = (val: string) => {
    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(25);
    }

    if (val === 'C') {
      setAmountStr('0');
      return;
    }
    if (val === 'BACK') {
      setAmountStr(prev => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    setAmountStr(prev => {
      if (prev === '0') return val;
      if (prev.length >= 6) return prev; // max 999999
      return prev + val;
    });
  };

  const handlePresetSelect = (val: number) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(25);
    }
    setAmountStr(String(val));
  };

  const handleAdd = () => {
    const rate = parseFloat(amountStr);
    if (!rate || rate <= 0) {
      onToast('error', 'Enter Amount', 'Please specify a valid item price.');
      return;
    }

    const itemName = customName.trim() || selectedTag;

    addCustomItem({
      name: itemName,
      rate,
      qty,
      unit: 'Pcs',
      hsnCode: selectedTag.includes('Photocopy') || selectedTag.includes('Binding') ? '9983' : '4820',
      gstRate
    });

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 30, 40]);
    }

    onClose();
    // Reset state
    setAmountStr('10');
    setQty(1);
    setCustomName('');
  };

  const currentRate = parseFloat(amountStr) || 0;
  const currentTotal = currentRate * qty;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs font-sans text-[#172B4D] animate-in fade-in duration-150">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-[#D8E1EC] animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-3.5 bg-[#F5F9FF] border-b border-[#D8E1EC] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#2563EB] text-white rounded-lg shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#172B4D]">
                Quick Add by Price (₹)
              </h3>
              <p className="text-[10px] text-[#64748B]">
                Punch amount directly without typing product names
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#64748B] hover:text-[#172B4D] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 space-y-3 overflow-y-auto min-h-0">
          {/* Amount Display & Qty */}
          <div className="p-3 bg-[#F8FAFC] border-2 border-[#BFDBFE] rounded-2xl flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-bold text-[#64748B] uppercase block">Item Price (₹)</span>
              <div className="text-3xl font-black text-[#15803D] font-mono tracking-tight">
                ₹{amountStr}
              </div>
              {qty > 1 && (
                <div className="text-[11px] text-[#64748B] font-mono mt-0.5">
                  Total: <strong className="text-[#172B4D]">{formatCurrency(currentTotal)}</strong>
                </div>
              )}
            </div>

            {/* Qty +/- Buttons */}
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-[#D8E1EC] shadow-2xs">
              <button
                type="button"
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-7 h-7 bg-[#F1F5F9] hover:bg-[#E2E8F0] active:scale-90 text-[#172B4D] rounded-lg font-bold flex items-center justify-center transition-all cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center text-xs font-mono font-black text-[#172B4D]">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(q => q + 1)}
                className="w-7 h-7 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-90 text-white rounded-lg font-bold flex items-center justify-center transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Price Preset Buttons */}
          <div>
            <div className="text-[10px] font-bold text-[#64748B] uppercase mb-1">Common Counter Amounts:</div>
            <div className="grid grid-cols-4 gap-1.5">
              {COMMON_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetSelect(p)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-extrabold transition-all cursor-pointer active:scale-95 border ${
                    amountStr === String(p)
                      ? 'bg-[#2563EB] text-white border-[#1D4ED8] shadow-xs'
                      : 'bg-white text-[#172B4D] border-[#D8E1EC] hover:bg-[#F5F9FF]'
                  }`}
                >
                  ₹{p}
                </button>
              ))}
            </div>
          </div>

          {/* Item Category Tag Chips */}
          <div>
            <div className="text-[10px] font-bold text-[#64748B] uppercase mb-1">Item Description / Tag:</div>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_NAME_TAGS.map((tag) => {
                const isSelected = selectedTag === tag && !customName;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => { setSelectedTag(tag); setCustomName(''); }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#15803D] text-white shadow-2xs'
                        : 'bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] hover:text-[#172B4D]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numeric Touch Keypad (Zero Mobile Keyboard Needed!) */}
          <div className="bg-[#F8FAFC] p-2 rounded-2xl border border-[#D8E1EC]">
            <div className="grid grid-cols-3 gap-1.5 font-mono text-sm">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeypadPress(digit)}
                  className="py-2.5 bg-white hover:bg-[#F0F6FF] active:bg-[#DBEAFE] active:scale-95 rounded-xl border border-[#D8E1EC] font-bold text-[#172B4D] shadow-2xs transition-all cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleKeypadPress('BACK')}
                className="py-2.5 bg-[#FEE2E2] hover:bg-[#FCA5A5] active:scale-95 text-[#B91C1C] rounded-xl border border-[#FCA5A5] font-bold shadow-2xs flex items-center justify-center transition-all cursor-pointer"
                title="Backspace"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Add Button */}
        <div className="p-3 bg-[#F5F9FF] border-t border-[#D8E1EC] shrink-0">
          <button
            type="button"
            onClick={handleAdd}
            className="w-full py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Add {qty > 1 ? `${qty}x ` : ''}{selectedTag} ({formatCurrency(currentTotal)}) to Bill</span>
          </button>
        </div>
      </div>
    </div>
  );
};
