import React, { useState, useRef, useMemo } from 'react';
import { 
  Search, Plus, Minus, Trash2, ShoppingBag, User, Phone, FileText, StickyNote,
  CheckCircle2, ChevronDown, ChevronUp, X, Sparkles, Wifi, WifiOff, ArrowRight,
  Camera, Gift, Percent, Bookmark, Mic, MicOff, LayoutGrid, Zap, Check,
  Save, Printer, MessageSquare
} from 'lucide-react';
import { useBillingStore } from '../../store/useBillingStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProductStore, STATIONERY_CATEGORIES } from '../../store/useProductStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { formatCurrency } from '../../utils/formatters';
import { CameraScannerModal } from '../common/CameraScannerModal';
import { QuickPriceModal } from './QuickPriceModal';
import { playBeep, playError } from '../../utils/audio';
import { db } from '../../lib/db';
import type { Product, Customer } from '../../types';

interface MobileBillingViewProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
  onOpenQuickPay: () => void;
  onOpenNewBill: () => void;
  onFastSaveBill?: (options: { shouldPrint: boolean; shareWhatsApp?: boolean }) => Promise<void>;
  totals: {
    subtotal: number;
    grossPayable?: number;
    totalDiscount: number;
    totalGst: number;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    roundOff: number;
    netPayable: number;
  };
  isOnline: boolean;
  isSupabaseConnected: boolean;
}

export const MobileBillingView: React.FC<MobileBillingViewProps> = ({
  onToast,
  onOpenQuickPay,
  onOpenNewBill,
  onFastSaveBill,
  totals,
  isOnline,
  isSupabaseConnected
}) => {
  const {
    customerName, customerMobile, customerGstin, customerAddress, invoiceType,
    items, notes, isInterstate, billDiscountAmount, billDiscountPct,
    setCustomerInfo, setInvoiceType, setIsInterstate, setNotes,
    setBillDiscountAmount, setBillDiscountPct,
    addItemByProduct, updateItemQty, updateItemFreeQty, updateItemRate, updateItemRemark,
    updateItemSchemeDiscount, removeItem, clearBill, saveCurrentAsDraft
  } = useBillingStore();

  const { products } = useProductStore();
  const { customers, findOrCreateCustomer } = useCustomerStore();
  const { billingSettings } = useSettingsStore();

  // Search, View Mode & Modals
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cart' | 'grid'>('cart');
  const [selectedGridCategory, setSelectedGridCategory] = useState<string>('All Categories');
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isQuickPriceOpen, setIsQuickPriceOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const isGstEnabled = invoiceType === 'gst';

  // Check if customer mobile number is valid (>= 10 digits)
  const hasValidMobile = useMemo(() => {
    const digits = (customerMobile || '').replace(/\D/g, '');
    return digits.length >= 10;
  }, [customerMobile]);

  // Fast Mover SKUs (most popular stationery counter items)
  const FAST_MOVER_SKUS = [
    'CLM-NB-172', 'CLM-NB-A4-200', 'REY-TRM-BLU', 'REY-TRM-BLK', 
    'HAU-XO-5PKT', 'JK-A4-75GSM', 'FEV-MR-100G', 'FEV-STK-15G',
    'NAT-621-10PKT', 'APS-PLT-10PKT', 'KNG-STP-10D', 'WND-CEL-1IN',
    'FBC-HLT-4SET', 'LUX-MRK-BLK', 'CAS-MJ12D'
  ];

  const fastMoverProducts = useMemo(() => {
    return products
      .filter(p => p.isActive && (FAST_MOVER_SKUS.includes(p.sku) || p.stockQty > 50))
      .slice(0, 12);
  }, [products]);

  const triggerHaptic = (pattern: number | number[] = 20) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  };

  // 1-Tap Quick Product Adder with Haptic Touch & Audio Beep
  const handleQuickTapProduct = (prod: Product) => {
    triggerHaptic(25);
    playBeep();
    addItemByProduct(prod, 1);
  };

  // Indian Speech Recognition (Voice Dictation)
  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onToast('info', 'Voice Search', 'Voice recognition is not supported in this browser. Please tap the quick chips or search.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;
      setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
        setIsListening(false);
        if (transcript) {
          setSearchQuery(transcript);
          onToast('info', 'Voice Heard', `Searching for: "${transcript}"`);

          // Auto-match if high confidence match exists
          const directMatch = products.find(p => p.name.toLowerCase().includes(transcript.toLowerCase()));
          if (directMatch) {
            handleQuickTapProduct(directMatch);
            setSearchQuery('');
          }
        }
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (err) {
      setIsListening(false);
    }
  };

  const handleCameraBarcodeScanned = async (scannedCode: string) => {
    const rawCode = scannedCode.trim();
    if (!rawCode) return;
    const cleanCode = rawCode.replace(/[\s\r\n\t>]+/g, '').toLowerCase();

    // 1. Search for matching product by exact barcode or SKU in memory
    let found = products.find((p) => {
      const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
      const s = (p.sku || '').trim().toLowerCase();
      return (b && b === cleanCode) || (s && s === cleanCode);
    });

    // 2. Direct Dexie fallback if not yet in memory (e.g. freshly created product)
    if (!found) {
      try {
        const localAll = await db.products.toArray();
        found = localAll.find((p) => {
          const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
          const s = (p.sku || '').trim().toLowerCase();
          return (b && b === cleanCode) || (s && s === cleanCode);
        });
        if (found) {
          useProductStore.setState({ products: localAll });
        }
      } catch (err) {
        console.error('Dexie fallback barcode lookup failed:', err);
      }
    }

    if (found) {
      triggerHaptic([35, 30, 35]);
      handleQuickTapProduct(found);
      setSearchQuery('');
      onToast('success', 'Barcode Added to Bill', `Added "${found.name}" (₹${found.saleRate}) to cart.`);
    } else {
      triggerHaptic([70, 40, 70]);
      playError();
      setSearchQuery(rawCode);
      onToast('info', 'Barcode Scanned', `Scanned: "${rawCode}". No exact match found, searching catalog.`);
    }
  };

  const handleHoldDraft = async () => {
    if (items.length === 0) {
      onToast('info', 'Empty Bill', 'Add at least one item before holding draft.');
      return;
    }
    try {
      const draftName = customerName.trim() || `Draft Bill (${items.length} items)`;
      await saveCurrentAsDraft(draftName);
      clearBill();
      onToast('success', 'Draft Saved', `Bill held for ${draftName}. You can resume anytime.`);
    } catch (e: any) {
      onToast('error', 'Hold Failed', e.message || 'Could not save draft.');
    }
  };

  // Filter matching products
  const matchingProducts = useMemo(() => {
    const rawTerm = searchQuery.trim().toLowerCase();
    if (!rawTerm) return [];
    const cleanTerm = rawTerm.replace(/[\s\r\n\t>]+/g, '');
    return products.filter(p => {
      const pName = p.name.toLowerCase();
      const pSku = p.sku.toLowerCase();
      const pBarcode = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
      return (
        pName.includes(rawTerm) ||
        pSku.includes(rawTerm) ||
        (pBarcode && (pBarcode.includes(cleanTerm) || cleanTerm.includes(pBarcode)))
      );
    }).slice(0, 10);
  }, [products, searchQuery]);

  const handleAddProduct = (prod: Product) => {
    playBeep();
    addItemByProduct(prod, 1);
    setSearchQuery('');
  };

  const handleSelectCustomer = (cust: Customer) => {
    setCustomerInfo(cust.name, cust.mobile || '', cust.gstin || '', cust.address || '');
    setIsCustomerDrawerOpen(false);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8.5rem)] pb-24 font-sans text-[#172B4D] select-none">
      {/* 1. TOP MOBILE HEADER: GST Toggle, Status, New Bill */}
      <div className="flex items-center justify-between bg-white border border-[#D8E1EC] rounded-xl px-3 py-2 shadow-xs mb-2.5">
        <div className="flex items-center gap-2">
          {/* Bill Type 2-Way Pill */}
          <div className="inline-flex bg-[#F1F5F9] border border-[#CBD5E1] p-0.5 rounded-full text-[10px] font-black shrink-0">
            <button
              type="button"
              onClick={() => setInvoiceType('gst')}
              className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                invoiceType === 'gst' ? 'bg-[#15803D] text-white shadow-xs' : 'text-[#64748B]'
              }`}
            >
              GST
            </button>
            <button
              type="button"
              onClick={() => setInvoiceType('simple')}
              className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                invoiceType === 'simple' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B]'
              }`}
            >
              Simple
            </button>
            {billingSettings?.showAdvancedModes && billingSettings?.enableEstimate && (
              <button
                type="button"
                onClick={() => setInvoiceType('quotation')}
                className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                  invoiceType === 'quotation' ? 'bg-[#D97706] text-white shadow-xs' : 'text-[#64748B]'
                }`}
              >
                Estimate
              </button>
            )}
          </div>

          {isGstEnabled && (billingSettings?.enableIgst !== false) && (
            <label className="flex items-center gap-1 text-[10px] font-bold text-[#172B4D]">
              <input
                type="checkbox"
                checked={isInterstate}
                onChange={(e) => setIsInterstate(e.target.checked)}
                className="w-3 h-3 text-[#2563EB] rounded"
              />
              <span>IGST</span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status dot */}
          <span className="flex items-center gap-1 text-[11px] text-[#64748B] font-mono">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#15803D]' : 'bg-[#B91C1C]'}`}></span>
            {isOnline ? 'Online' : 'Offline'}
          </span>

          {/* New Bill Button */}
          <button
            type="button"
            onClick={onOpenNewBill}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#2563EB] text-white rounded-lg text-xs font-bold shadow-xs active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* 2. CUSTOMER & REMARK QUICK CARD */}
      <div 
        onClick={() => setIsCustomerDrawerOpen(!isCustomerDrawerOpen)}
        className="bg-white border border-[#D8E1EC] rounded-xl p-3 shadow-xs mb-2.5 cursor-pointer active:bg-[#F5F9FF] transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-[#172B4D] truncate">
                {customerName.trim() || 'Cash Customer'}
              </div>
              <div className="text-[11px] text-[#64748B] flex items-center gap-2 truncate">
                {customerMobile && <span>📱 {customerMobile}</span>}
                {notes ? (
                  <span className="text-[#B45309] font-bold truncate">📝 {notes}</span>
                ) : (
                  <span className="text-[#94A3B8] italic">No remark</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-[#2563EB] font-bold shrink-0">
            <span>{isCustomerDrawerOpen ? 'Close' : 'Edit'}</span>
            {isCustomerDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Expandable Customer & Remark Form on Mobile */}
        {isCustomerDrawerOpen && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="mt-3 pt-3 border-t border-[#D8E1EC] space-y-2.5 animate-in fade-in duration-100"
          >
            <div>
              <label className="block text-[11px] font-bold text-[#64748B] mb-1">Customer Name</label>
              <input
                type="text"
                placeholder="e.g. Ramesh Kumar / School Name"
                value={customerName}
                onChange={(e) => setCustomerInfo(e.target.value, customerMobile, customerGstin, customerAddress)}
                className="w-full px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#172B4D] focus:bg-white focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-[#64748B] mb-1">Mobile Number</label>
                <input
                  type="text"
                  placeholder="10 Digits..."
                  value={customerMobile}
                  onChange={(e) => setCustomerInfo(customerName, e.target.value, customerGstin, customerAddress)}
                  className="w-full px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#172B4D] focus:bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#64748B] mb-1">GSTIN (Optional)</label>
                <input
                  type="text"
                  placeholder="GSTIN..."
                  value={customerGstin}
                  onChange={(e) => setCustomerInfo(customerName, customerMobile, e.target.value.toUpperCase(), customerAddress)}
                  className="w-full px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-mono uppercase text-[#172B4D] focus:bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#64748B] mb-1 flex items-center justify-between">
                <span>Bill Remark / Narration</span>
                <span className="text-[10px] text-[#2563EB]">Prints on bill</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Class 10th Books, School Order..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs font-bold text-[#78350F] focus:outline-none focus:border-[#D97706]"
              />
            </div>

            {/* Quick suggestion customers if list available */}
            {customers.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-[#64748B] mb-1">Saved Clients:</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {customers.slice(0, 5).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="px-2 py-0.5 bg-[#F1F5F9] hover:bg-[#DBEAFE] border border-[#D8E1EC] rounded text-[11px] font-semibold text-[#172B4D] whitespace-nowrap"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. PROMINENT PRODUCT SEARCH BAR + VOICE + CAMERA SCAN BUTTON (MOBILE) */}
      <div className="relative mb-2.5">
        <div className="relative flex items-center bg-white border-2 border-[#BFDBFE] rounded-xl shadow-xs p-1 focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20">
          <Search className="w-4 h-4 text-[#2563EB] ml-2.5 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, barcode or SKU..."
            className="w-full min-w-0 py-2 px-2 text-xs font-semibold text-[#172B4D] placeholder-[#94A3B8] focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
              className="p-1.5 text-[#94A3B8] hover:text-[#172B4D]"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}

          {/* Voice Search (Hindi/English Speech Recognition) */}
          <button
            type="button"
            onClick={handleVoiceSearch}
            className={`p-1.5 rounded-lg mr-1 transition-all cursor-pointer ${
              isListening
                ? 'bg-red-100 text-red-600 animate-pulse'
                : 'text-[#64748B] hover:text-[#2563EB] active:scale-95'
            }`}
            title="Voice search products"
          >
            {isListening ? <MicOff className="w-4 h-4 text-red-600" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Phone Camera Barcode Scanner Trigger Button */}
          <button
            type="button"
            onClick={() => setIsCameraScannerOpen(true)}
            className="px-3 sm:px-3.5 py-1.5 bg-[#DCFCE7] hover:bg-[#BBF7D0] active:scale-95 text-[#15803D] border border-[#86EFAC] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-2xs"
            title="Scan barcode with phone camera"
          >
            <Camera className="w-3.5 h-3.5 text-[#16A34A]" />
            <span className="text-[11px] font-black tracking-wide">Scan Barcode</span>
          </button>
        </div>

        {/* Live Search Suggestions Dropdown */}
        {searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#D8E1EC] rounded-xl shadow-xl z-30 max-h-72 overflow-y-auto divide-y divide-gray-100 animate-in fade-in duration-100">
            {matchingProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#64748B]">
                No products found for "{searchQuery}"
              </div>
            ) : (
              matchingProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => handleAddProduct(prod)}
                  className="p-3 hover:bg-[#F5F9FF] active:bg-[#DBEAFE] cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-[#172B4D] truncate">{prod.name}</div>
                    <div className="text-[11px] text-[#64748B] flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[#15803D] font-bold">₹{prod.saleRate.toFixed(2)}</span>
                      {prod.mrp > prod.saleRate && (
                        <span className="text-[#94A3B8] line-through text-[10px]">₹{prod.mrp}</span>
                      )}
                      <span>• {prod.unit}</span>
                      <span className="text-[10px] text-gray-500 font-mono">Stock: {prod.stockQty}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 bg-[#2563EB] text-white rounded-lg text-xs font-bold shrink-0 shadow-xs active:scale-95"
                  >
                    + Add
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 3.1 FAST MOVERS & QUICK PUNCH DOCK (HORIZONTAL SCROLL) */}
      <div className="mb-2.5 -mx-1 px-1">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {/* Quick Price Punch Button (+ Custom ₹) */}
          <button
            type="button"
            onClick={() => setIsQuickPriceOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#FFFBEB] to-[#FEF3C7] hover:from-[#FEF3C7] text-[#B45309] border border-[#FCD34D] rounded-xl text-xs font-black shrink-0 shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Add custom item by price without typing"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D97706] animate-pulse" />
            <span>+ Custom ₹</span>
          </button>

          {/* Top Fast Mover Stationery Counter Items */}
          {fastMoverProducts.map((prod) => {
            const inCartQty = items.find(i => i.productId === prod.id)?.qty || 0;
            return (
              <button
                key={prod.id}
                type="button"
                onClick={() => handleQuickTapProduct(prod)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition-all active:scale-95 cursor-pointer shadow-xs ${
                  inCartQty > 0
                    ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]'
                    : 'bg-white hover:bg-gray-50 border-[#D8E1EC] text-[#172B4D]'
                }`}
              >
                {inCartQty > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#2563EB] text-white text-[10px] font-black flex items-center justify-center shrink-0">
                    {inCartQty}
                  </span>
                )}
                <span className="max-w-[120px] truncate text-left">{prod.name}</span>
                <span className="font-mono font-bold text-[#15803D] shrink-0">₹{prod.saleRate}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. VIEW TOGGLE BAR: Cart List vs. Touch Product Grid */}
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1 bg-[#F1F5F9] p-0.5 rounded-lg border border-[#D8E1EC]">
          <button
            type="button"
            onClick={() => setViewMode('cart')}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'cart'
                ? 'bg-white text-[#123B70] shadow-xs'
                : 'text-[#64748B] hover:text-[#172B4D]'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Cart ({items.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'grid'
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#172B4D]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>⚡ Touch Grid</span>
          </button>
        </div>

        {viewMode === 'cart' && items.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleHoldDraft}
              className="text-[10px] text-[#2563EB] bg-[#DBEAFE] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 active:scale-95"
              title="Hold this draft"
            >
              <Bookmark className="w-2.5 h-2.5" /> Hold
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear all items from current bill?')) clearBill();
              }}
              className="text-[11px] text-[#B91C1C] font-bold hover:underline"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {viewMode === 'grid' ? (
        <div className="space-y-2.5 mb-6">
          {/* Category Filter Chips Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {STATIONERY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedGridCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                  selectedGridCategory === cat
                    ? 'bg-[#123B70] text-white shadow-xs'
                    : 'bg-white text-[#64748B] hover:bg-gray-100 border border-[#D8E1EC]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 2-Column Responsive Touch Product Cards Grid */}
          <div className="grid grid-cols-2 gap-2">
            {products
              .filter(p => {
                if (!p.isActive) return false;
                if (selectedGridCategory !== 'All Categories' && p.category !== selectedGridCategory) return false;
                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase().trim();
                  const qClean = q.replace(/[\s\r\n\t>]+/g, '');
                  const pBarcode = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
                  return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (pBarcode && pBarcode.includes(qClean));
                }
                return true;
              })
              .slice(0, 48)
              .map((prod) => {
                const inCart = items.find(i => i.productId === prod.id)?.qty || 0;
                return (
                  <div
                    key={prod.id}
                    onClick={() => handleQuickTapProduct(prod)}
                    className={`relative p-2.5 rounded-xl border flex flex-col justify-between transition-all active:scale-95 cursor-pointer shadow-xs select-none ${
                      inCart > 0
                        ? 'bg-[#EFF6FF] border-[#60A5FA] ring-1 ring-[#3B82F6]'
                        : 'bg-white hover:bg-gray-50 border-[#D8E1EC]'
                    }`}
                  >
                    {inCart > 0 && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-[#2563EB] text-white text-[10px] font-black flex items-center gap-0.5 shadow-xs">
                        <Check className="w-2.5 h-2.5" /> {inCart}
                      </span>
                    )}
                    <div>
                      <div className="text-[10px] font-mono text-[#64748B] uppercase truncate">{prod.category}</div>
                      <div className="text-xs font-bold text-[#172B4D] line-clamp-2 mt-0.5 leading-snug">
                        {prod.name}
                      </div>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-[#15803D] font-mono">₹{prod.saleRate.toFixed(2)}</div>
                        <div className="text-[10px] text-[#94A3B8]">{prod.unit}</div>
                      </div>
                      <span className="px-2.5 py-1 bg-[#2563EB] text-white rounded-lg text-[11px] font-bold shadow-2xs">
                        + Add
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* Cart View (Default) */
        items.length === 0 ? (
          <div className="bg-white border border-[#D8E1EC] rounded-2xl p-8 text-center text-[#64748B] shadow-xs my-2">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#D8E1EC] p-2 mx-auto mb-3 flex items-center justify-center shadow-xs">
              <img src="/logo.png" alt="WebRajya Invoice" className="w-full h-full object-contain" />
            </div>
            <div className="text-sm font-black text-[#172B4D]">Cart is Empty</div>
            <div className="text-xs text-[#64748B] mt-1 max-w-xs mx-auto">
              Use search above, tap <span className="font-bold text-[#D97706]">+ Custom ₹</span>, tap fast movers, or switch to <span className="font-bold text-[#2563EB]">⚡ Touch Grid</span>.
            </div>
          </div>
        ) : (
        <div className="space-y-2.5">
          {items.map((item, index) => {
            const isEditing = editingItemId === item.id;
            return (
              <div 
                key={item.id} 
                className="bg-white border border-[#D8E1EC] rounded-xl p-3 shadow-xs space-y-2.5 transition-all"
              >
                {/* Card Header: Product Name + Trash */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-[#172B4D] leading-snug">
                      <span className="text-[#64748B] font-mono mr-1.5">#{index + 1}</span>
                      {item.productName}
                    </div>
                    <div className="text-[10px] text-[#64748B] font-mono mt-0.5 flex flex-wrap items-center gap-2">
                      {item.pack && <span>{item.pack}</span>}
                      {item.hsnCode && <span>HSN: {item.hsnCode}</span>}
                      {item.unit && <span>({item.unit})</span>}
                      {item.freeQty > 0 && (
                        <span className="bg-[#FEF3C7] text-[#B45309] px-1.5 py-0.2 rounded font-bold">
                          +{item.freeQty} Free
                        </span>
                      )}
                      {item.schemeDiscountPct > 0 && (
                        <span className="bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.2 rounded font-bold">
                          {item.schemeDiscountPct}% Disc
                        </span>
                      )}
                      {item.remark && (
                        <span className="bg-blue-50 text-[#2563EB] px-1.5 py-0.2 rounded italic">
                          "{item.remark}"
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingItemId(isEditing ? null : item.id)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isEditing ? 'bg-[#2563EB] text-white' : 'text-[#64748B] hover:bg-[#F1F5F9]'
                      }`}
                      title="Item discount & remarks"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(30);
                        removeItem(item.id);
                      }}
                      className="p-1.5 text-[#94A3B8] hover:text-[#B91C1C] rounded-lg hover:bg-red-50 transition-colors cursor-pointer active:scale-95"
                      title="Remove Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Quick Options Drawer (Free qty, Discount %, Remark) */}
                {isEditing && (
                  <div className="p-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-2 animate-in fade-in duration-100">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-[#64748B] mb-0.5">Free Scheme Qty</label>
                        <input
                          type="number"
                          min={0}
                          value={item.freeQty || ''}
                          onChange={(e) => updateItemFreeQty(item.id, Math.max(0, parseInt(e.target.value) || 0))}
                          placeholder="0 Free"
                          className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs font-mono font-bold text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#64748B] mb-0.5">Line Discount %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.schemeDiscountPct || ''}
                          onChange={(e) => updateItemSchemeDiscount(item.id, Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                          placeholder="0%"
                          className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs font-mono font-bold text-[#15803D] focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#64748B] mb-0.5">Line Remark (Optional)</label>
                      <input
                        type="text"
                        value={item.remark || ''}
                        onChange={(e) => updateItemRemark(item.id, e.target.value)}
                        placeholder="e.g. Blue Ink, Hardbound..."
                        className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs text-[#172B4D] focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Card Footer: Rate, Touch Quantity Stepper, Line Total */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  {/* Unit Rate & MRP */}
                  <div>
                    <div className="text-xs font-bold text-[#172B4D] font-mono">
                      ₹{item.unitRate.toFixed(2)}
                    </div>
                    {item.mrp > item.unitRate && (
                      <div className="text-[10px] text-[#94A3B8] line-through font-mono">
                        MRP ₹{item.mrp.toFixed(2)}
                      </div>
                    )}
                  </div>

                  {/* Touch-Friendly Quantity Stepper with Direct Input */}
                  <div className="flex items-center gap-1.5 bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        updateItemQty(item.id, Math.max(1, item.qty - 1));
                      }}
                      className="w-8 h-8 rounded bg-white text-[#172B4D] flex items-center justify-center font-bold text-sm shadow-2xs active:bg-gray-100 cursor-pointer active:scale-90 transition-transform"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) => updateItemQty(item.id, Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-9 h-7 bg-transparent text-center font-mono font-black text-xs text-[#172B4D] focus:bg-white focus:outline-none rounded"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        updateItemQty(item.id, item.qty + 1);
                      }}
                      className="w-8 h-8 rounded bg-white text-[#172B4D] flex items-center justify-center font-bold text-sm shadow-2xs active:bg-gray-100 cursor-pointer active:scale-90 transition-transform"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <div className="text-sm font-black text-[#15803D] font-mono">
                      ₹{item.totalAmount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      )}

      {/* 5. FIXED BOTTOM CHECKOUT BAR (MOBILE ONLY) */}
      <div className="fixed bottom-14 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#D8E1EC] px-3 py-2 shadow-2xl flex items-center justify-between safe-area-mb gap-2">
        {/* Left: Total & Breakdown trigger */}
        <div 
          onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
          className="cursor-pointer shrink-0 min-w-0"
        >
          <div className="text-[10px] text-[#64748B] flex items-center gap-1 font-semibold truncate">
            <span>{items.length} item(s)</span>
            <span className="text-[#2563EB] text-[9px] underline">Details</span>
          </div>
          <div className="text-base sm:text-lg font-black text-[#123B70] font-mono leading-tight">
            {formatCurrency(totals.netPayable)}
          </div>
        </div>

        {/* Right: Actions Cluster (Square Action Buttons + Settle Bill) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Button 1: Save (No Print) */}
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              triggerHaptic(20);
              onFastSaveBill?.({ shouldPrint: false });
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-700 border border-emerald-300 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Save Bill (No Print)"
            aria-label="Save Bill No Print"
          >
            <Save className="w-4 h-4 text-emerald-700" />
          </button>

          {/* Button 2: Save & Print */}
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              triggerHaptic(20);
              onFastSaveBill?.({ shouldPrint: true });
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-700 border border-amber-300 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Save & Print Bill"
            aria-label="Save and Print Bill"
          >
            <Printer className="w-4 h-4 text-amber-700" />
          </button>

          {/* Button 3: WhatsApp Share (Enabled ONLY when customer mobile has >= 10 digits) */}
          <button
            type="button"
            disabled={items.length === 0 || !hasValidMobile}
            onClick={() => {
              triggerHaptic(20);
              onFastSaveBill?.({ shouldPrint: false, shareWhatsApp: true });
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-all shadow-2xs relative ${
              hasValidMobile && items.length > 0
                ? 'bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] border border-[#25D366]/50 cursor-pointer active:scale-95'
                : 'bg-gray-100 text-gray-300 border border-gray-200 cursor-not-allowed opacity-50'
            }`}
            title={
              hasValidMobile
                ? `Save & Send ${billingSettings?.whatsappFormat === 'pdf' ? 'PDF' : billingSettings?.whatsappFormat === 'image' ? 'Image' : 'Text'} Bill to ${customerMobile} on WhatsApp`
                : 'Enter customer mobile number to enable WhatsApp bill share'
            }
            aria-label="Save and Share on WhatsApp"
          >
            <div className="relative flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
              {billingSettings?.whatsappFormat === 'pdf' && (
                <span className="absolute -top-2 -right-2 text-[7px] font-black bg-blue-600 text-white rounded px-0.5 leading-none py-0.5 shadow-2xs">
                  PDF
                </span>
              )}
              {billingSettings?.whatsappFormat === 'image' && (
                <span className="absolute -top-2 -right-2 text-[7px] font-black bg-purple-600 text-white rounded px-0.5 leading-none py-0.5 shadow-2xs">
                  IMG
                </span>
              )}
            </div>
          </button>

          {/* Settle Bill Button */}
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              triggerHaptic(30);
              onOpenQuickPay();
            }}
            className="px-3.5 sm:px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <span className="whitespace-nowrap">Settle Bill</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>



      {/* Breakdown Bottom Sheet Modal */}
      {isBreakdownOpen && (
        <div 
          onClick={() => setIsBreakdownOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-end animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-2xl p-4 space-y-3 pb-24 shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#D8E1EC]">
              <div className="text-xs font-black text-[#172B4D] uppercase">Bill Breakdown</div>
              <button 
                onClick={() => setIsBreakdownOpen(false)}
                className="p-1 text-[#64748B] hover:text-[#172B4D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-[#64748B]">
                <span>Taxable Subtotal:</span>
                <span>₹{totals.subtotal.toFixed(2)}</span>
              </div>

              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-[#15803D]">
                  <span>Total Discount:</span>
                  <span>- ₹{totals.totalDiscount.toFixed(2)}</span>
                </div>
              )}

              {isGstEnabled && (
                <>
                  <div className="flex justify-between text-[#64748B]">
                    <span>CGST:</span>
                    <span>₹{totals.cgstTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#64748B]">
                    <span>SGST:</span>
                    <span>₹{totals.sgstTotal.toFixed(2)}</span>
                  </div>
                </>
              )}

              {/* Final Discount in Mobile Drawer */}
              <div className="py-2 border-y border-dashed border-[#CBD5E1] space-y-1.5">
                <div className="flex justify-between items-center text-[#475569]">
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-[#172B4D]">Final Discount:</span>
                    <span className="text-[10px] text-[#64748B]">
                      {billDiscountPct > 0 ? `${billDiscountPct}% applied` : 'In % or ₹'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* % input */}
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={billDiscountPct > 0 ? billDiscountPct : ''}
                        onChange={(e) => {
                          const pct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                          setBillDiscountPct(pct);
                          const base = isGstEnabled ? (totals.grossPayable || totals.subtotal) : totals.subtotal;
                          setBillDiscountAmount(pct > 0 && base > 0 ? Math.round(((base * pct) / 100) * 100) / 100 : 0);
                        }}
                        className="w-14 h-7 pl-1.5 pr-4 bg-white border-2 border-[#CBD5E1] rounded text-right text-[#15803D] text-xs font-mono font-bold focus:border-[#2563EB] focus:outline-none"
                        placeholder="0"
                      />
                      <span className="absolute right-1 text-[10px] font-bold text-[#64748B] pointer-events-none">%</span>
                    </div>

                    {/* ₹ input */}
                    <div className="relative flex items-center">
                      <span className="absolute left-1 text-[10px] font-bold text-[#64748B] pointer-events-none">₹</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={billDiscountAmount > 0 ? billDiscountAmount : ''}
                        onChange={(e) => {
                          const amt = Math.max(0, parseFloat(e.target.value) || 0);
                          setBillDiscountAmount(amt);
                          const base = isGstEnabled ? (totals.grossPayable || totals.subtotal) : totals.subtotal;
                          setBillDiscountPct(base > 0 ? Math.round(((amt / base) * 100) * 100) / 100 : 0);
                        }}
                        className="w-16 h-7 pl-3.5 pr-1 bg-white border-2 border-[#CBD5E1] rounded text-right text-[#15803D] text-xs font-mono font-bold focus:border-[#2563EB] focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between text-[#64748B]">
                <span>Round Off:</span>
                <span>{totals.roundOff >= 0 ? '+' : ''}₹{totals.roundOff.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-base font-black text-[#123B70] pt-2 border-t border-[#D8E1EC]">
                <span>Grand Total:</span>
                <span>₹{totals.netPayable.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                setIsBreakdownOpen(false);
                onOpenQuickPay();
              }}
              className="w-full py-3 bg-[#2563EB] text-white rounded-xl text-xs font-black text-center shadow-md cursor-pointer"
            >
              Proceed to Payment
            </button>
          </div>
        </div>
      )}

      {/* Phone Camera Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleCameraBarcodeScanned}
      />

      {/* Quick Price Keypad Modal */}
      <QuickPriceModal
        isOpen={isQuickPriceOpen}
        onClose={() => setIsQuickPriceOpen(false)}
        onToast={onToast}
      />
    </div>
  );
};
