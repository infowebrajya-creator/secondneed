import React, { useState, useEffect, useRef } from 'react';
import { StickyNote, ArrowRight, X, Sparkles } from 'lucide-react';
import { Modal } from '../common/Modal';

interface NewBillRemarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRemark: string;
  onConfirm: (remark: string) => void;
}

const COMMON_REMARKS = [
  'Counter Sale',
  'Casual Wear',
  'Formal Wear',
  'Festive Offer',
  'Wedding Purchase',
  'Customer Exchange',
  'Trial & Fit',
  'Bulk Order'
];

export const NewBillRemarkModal: React.FC<NewBillRemarkModalProps> = ({
  isOpen,
  onClose,
  initialRemark,
  onConfirm
}) => {
  const [remark, setRemark] = useState(initialRemark);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRemark(initialRemark);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, initialRemark]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onConfirm(remark.trim());
    onClose();
  };

  const handleSkip = () => {
    onConfirm('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleSkip();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start New Bill — Enter Remark"
      subtitle="Remark prints on invoice, appears in sales history, and is searchable in software."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#172B4D] mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <StickyNote className="w-4 h-4 text-[#2563EB]" />
              <span>Bill Remark / Narration (Optional)</span>
            </span>
            <span className="text-[10px] text-[#64748B] font-mono">[Enter to Start]</span>
          </label>

          <input
            ref={inputRef}
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Class 10th Books, School Order, Counter Sale..."
            className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border-2 border-[#D8E1EC] rounded-xl text-sm font-semibold text-[#172B4D] placeholder-[#94A3B8] focus:bg-white focus:outline-none focus:border-[#2563EB] shadow-xs"
          />
        </div>

        {/* Quick Suggestion Pills */}
        <div>
          <div className="text-[11px] font-bold text-[#64748B] mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#D97706]" /> Quick Suggestions:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_REMARKS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setRemark(item);
                  inputRef.current?.focus();
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                  remark === item
                    ? 'bg-[#2563EB] text-white border-[#2563EB]'
                    : 'bg-white text-[#172B4D] border-[#D8E1EC] hover:bg-[#F1F5F9] hover:border-[#94A3B8]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-[#D8E1EC]">
          <button
            type="button"
            onClick={handleSkip}
            className="px-3.5 py-2 text-xs font-bold text-[#64748B] hover:text-[#172B4D] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            Skip (No Remark)
          </button>

          <button
            type="submit"
            className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <span>Start Billing</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </Modal>
  );
};
