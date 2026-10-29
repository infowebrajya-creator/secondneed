import React, { useState, useEffect } from 'react';
import { Printer, Receipt, FileText, Share2, Smartphone } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Invoice, ShopProfile, PrintSettings, PaperSize, PrintCopyType } from '../../types';
import { triggerInvoicePrint } from '../../lib/print';
import { dispatchWhatsAppReceipt } from '../../lib/whatsappDispatcher';
import { useSettingsStore } from '../../store/useSettingsStore';
import { A5PrintInvoice } from './A5PrintInvoice';
import { Thermal80mmInvoice } from './Thermal80mmInvoice';
import { Thermal58mmInvoice } from './Thermal58mmInvoice';

interface A5PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  shopProfile: ShopProfile;
  printSettings: PrintSettings;
}

export const A5PrintPreviewModal: React.FC<A5PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  invoice,
  shopProfile,
  printSettings
}) => {
  const { billingSettings } = useSettingsStore();
  const [selectedSize, setSelectedSize] = useState<PaperSize>(printSettings?.paperSize || 'A5');
  const [selectedCopy, setSelectedCopy] = useState<PrintCopyType>(invoice?.copyType || 'original');

  useEffect(() => {
    if (isOpen) {
      setSelectedSize(printSettings?.paperSize || 'A5');
      setSelectedCopy(invoice?.copyType || 'original');
    }
  }, [isOpen, printSettings?.paperSize, invoice?.copyType]);

  if (!invoice) return null;

  const is80mm = selectedSize === '80mm' || selectedSize === 'Thermal';
  const is58mm = selectedSize === '58mm';

  const handlePrint = () => {
    triggerInvoicePrint(invoice, shopProfile, { ...printSettings, paperSize: selectedSize }, selectedCopy);
  };

  const handleShareWhatsApp = async () => {
    if (!invoice) return;
    await dispatchWhatsAppReceipt({
      invoice,
      shop: shopProfile,
      settings: billingSettings,
      printSettings: { ...printSettings, paperSize: selectedSize }
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${invoice.invoiceType === 'quotation' ? 'Quotation' : 'Invoice'} Preview - #${invoice.invoiceNumber}`}
      subtitle={
        is58mm 
          ? "58mm (2-Inch) Mini Thermal Roll" 
          : is80mm 
          ? "80mm (3-Inch) POS Receipt Roll" 
          : "Standard Retail Wholesale Format (A5 Half-Page)"
      }
      maxWidth={is58mm ? "md" : is80mm ? "lg" : "4xl"}
    >
      <div className="space-y-4">
        {/* Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#172B4D]">Paper Format:</span>
            <div className="inline-flex bg-white border border-[#D8E1EC] p-0.5 rounded-lg text-xs font-bold shadow-xs">
              <button
                type="button"
                onClick={() => setSelectedSize('80mm')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  is80mm ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" /> 80mm
              </button>
              <button
                type="button"
                onClick={() => setSelectedSize('58mm')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  is58mm ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" /> 58mm (2")
              </button>
              <button
                type="button"
                onClick={() => setSelectedSize('A5')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  !is80mm && !is58mm ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> A5 Half
              </button>
            </div>

            {/* Statutory Copy Selector (Rule 48) */}
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              <span className="text-xs font-bold text-[#172B4D]">Copy:</span>
              <div className="inline-flex bg-white border border-[#D8E1EC] p-0.5 rounded-lg text-xs font-bold shadow-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCopy('original')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                    selectedCopy === 'original' ? 'bg-[#15803D] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                  }`}
                  title="Original for Buyer (Input Tax Credit)"
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCopy('duplicate')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                    selectedCopy === 'duplicate' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                  }`}
                  title="Duplicate for Transporter / Vehicle"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCopy('triplicate')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                    selectedCopy === 'triplicate' ? 'bg-[#B45309] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                  }`}
                  title="Triplicate for Supplier (Self Records)"
                >
                  Triplicate
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              title="Send bill on customer's WhatsApp"
            >
              <Share2 className="w-4 h-4 text-emerald-200" /> WhatsApp Bill
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Invoice Preview Box */}
        <div className="bg-[#F1F5F9] p-4 rounded-lg border border-[#D8E1EC] max-h-[65vh] overflow-y-auto flex justify-center">
          {is58mm ? (
            <Thermal58mmInvoice invoice={invoice} shopProfile={shopProfile} printSettings={printSettings} />
          ) : is80mm ? (
            <Thermal80mmInvoice invoice={invoice} shopProfile={shopProfile} printSettings={printSettings} copyType={selectedCopy} />
          ) : (
            <div className="bg-white shadow-md rounded p-2 text-black border border-slate-400">
              <A5PrintInvoice invoice={invoice} shopProfile={shopProfile} copyType={selectedCopy} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

