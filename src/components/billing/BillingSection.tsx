import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Trash2, ShoppingBag, User, Phone, FileText, StickyNote,
  Save, AlertTriangle, Wifi, WifiOff, CheckCircle2, Printer, Download
} from 'lucide-react';
import { WINDOWS_EXE_URL } from '../../utils/constants';
import { useBillingStore } from '../../store/useBillingStore';
import { useProductStore } from '../../store/useProductStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { calculateInvoiceTotals } from '../../lib/taxCalculator';
import { ProductPickerModal } from './ProductPickerModal';
import { HoldDraftsModal } from './HoldDraftsModal';
import { QuickPayModal } from './QuickPayModal';
import { A5PrintPreviewModal } from './A5PrintPreviewModal';
import { AddCustomerModal } from './AddCustomerModal';
import { NewBillRemarkModal } from './NewBillRemarkModal';
import { MobileBillingView } from './MobileBillingView';
import { useIsMobile } from '../../utils/useIsMobile';
import { KeyboardBadge } from '../common/KeyboardBadge';
import type { Product, Invoice, InvoiceType, Customer } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { triggerA5Print, triggerInvoicePrint, openWhatsAppReceipt } from '../../lib/print';
import { getSupabaseClient } from '../../lib/supabase';
import { useKeyboardShortcuts } from '../../utils/keyboard';
import { playBeep, playError, playCashChime } from '../../utils/audio';
import { db } from '../../lib/db';

interface BillingSectionProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
  onOpenAddProductModal: () => void;
}

export const BillingSection: React.FC<BillingSectionProps> = ({ onToast, onOpenAddProductModal }) => {
  const { 
    customerName, customerMobile, customerGstin, customerAddress, invoiceType,
    items, paymentMode, paidAmount, billDiscountAmount, billDiscountPct, freightAmount, isInterstate, notes, idempotencyKey,
    setCustomerInfo, setInvoiceType, setPaymentMode, setBillDiscountAmount, setBillDiscountPct, setFreightAmount, setIsInterstate, setNotes,
    addItemByProduct, updateItemQty, updateItemFreeQty, updateItemRate, updateItemRemark,
    updateItemSchemeDiscount, updateItemAddlDiscount, removeItem, clearBill,
    restoreActiveCartFromIndexedDB
  } = useBillingStore();

  const { products, isLoading: isCatalogLoading, loadProducts } = useProductStore();
  const { customers, findOrCreateCustomer } = useCustomerStore();
  const { createCompletedInvoice } = useSalesStore();
  const { shopProfile, printSettings, billingSettings } = useSettingsStore();

  const paperFormatLabel = printSettings?.paperSize === '80mm' || printSettings?.paperSize === 'Thermal'
    ? '80mm'
    : printSettings?.paperSize === 'A4'
    ? 'A4'
    : 'A5';

  // Fast entry line inputs
  const [fastSearch, setFastSearch] = useState('');
  const [fastQty, setFastQty] = useState<number>(1);
  const [fastFreeQty, setFastFreeQty] = useState<number>(0);
  const [fastRate, setFastRate] = useState<number>(0);
  const [fastRemark, setFastRemark] = useState<string>('');
  const [fastSchemeDisc, setFastSchemeDisc] = useState<number>(0);
  const [fastAddlDisc, setFastAddlDisc] = useState<number>(0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Customer Autocomplete & Directory State
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const customerContainerRef = useRef<HTMLDivElement>(null);

  // Connection Status
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);

  // Modals state
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isHoldDraftsOpen, setIsHoldDraftsOpen] = useState(false);
  const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isNewBillModalOpen, setIsNewBillModalOpen] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [challanPurpose, setChallanPurpose] = useState<'job_work' | 'godown_transfer' | 'approval' | 'others'>('approval');

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const remarkInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const freeInputRef = useRef<HTMLInputElement>(null);
  const rateInputRef = useRef<HTMLInputElement>(null);
  const itemRemarkInputRef = useRef<HTMLInputElement>(null);
  const schInputRef = useRef<HTMLInputElement>(null);
  const addlInputRef = useRef<HTMLInputElement>(null);

  const checkConnectionStatus = () => {
    setIsOnline(navigator.onLine);
    const client = getSupabaseClient();
    setIsSupabaseConnected(!!client);
  };

  // Load catalog & restore active cart on mount
  useEffect(() => {
    loadProducts();
    restoreActiveCartFromIndexedDB().then(() => {
      setTimeout(() => barcodeInputRef.current?.focus(), 150);
    });
    checkConnectionStatus();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Close customer dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerContainerRef.current && !customerContainerRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCustomers = useMemo(() => {
    const term = customerName.trim().toLowerCase();
    if (!term) return customers.slice(0, 50);
    return customers.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      (c.mobile && c.mobile.includes(term))
    ).slice(0, 50);
  }, [customers, customerName]);

  const handleSelectCustomer = (cust: Customer) => {
    setCustomerInfo(cust.name, cust.mobile || '', cust.gstin || '', cust.address || '');
    setIsCustomerDropdownOpen(false);
    setSelectedCustomerIndex(-1);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent) => {
    if (!isCustomerDropdownOpen || filteredCustomers.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedCustomerIndex((prev) => Math.min(prev + 1, Math.min(filteredCustomers.length - 1, 7)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedCustomerIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (selectedCustomerIndex >= 0 && selectedCustomerIndex < filteredCustomers.length) {
        e.preventDefault();
        handleSelectCustomer(filteredCustomers[selectedCustomerIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsCustomerDropdownOpen(false);
    }
  };

  const isGstEnabled = invoiceType === 'gst';
  const totals = useMemo(() => {
    return calculateInvoiceTotals(items, billDiscountAmount, freightAmount, isGstEnabled);
  }, [items, billDiscountAmount, freightAmount, isGstEnabled]);
  const discountBase = isGstEnabled ? totals.grossPayable : totals.subtotal;

  // Real-time wholesale gross profit and margin %
  const { cartGrossProfit, cartMarginPct } = useMemo(() => {
    let costSum = 0;
    items.forEach(it => {
      const p = products.find(prod => prod.id === it.productId);
      const buyRate = p ? p.purchaseRate : it.unitRate * 0.8;
      costSum += buyRate * it.qty;
    });
    const profit = Math.max(0, totals.subtotal - costSum);
    const margin = totals.subtotal > 0 ? (profit / totals.subtotal) * 100 : 0;
    return { cartGrossProfit: profit, cartMarginPct: margin };
  }, [items, products, totals.subtotal]);

  // Auto-sync discount in ₹ when discount in % is active and items change
  useEffect(() => {
    if (billDiscountPct > 0 && discountBase > 0) {
      const computedAmt = Math.round(((discountBase * billDiscountPct) / 100) * 100) / 100;
      if (Math.abs(computedAmt - billDiscountAmount) > 0.01) {
        setBillDiscountAmount(computedAmt);
      }
    } else if (discountBase === 0 && billDiscountAmount > 0) {
      setBillDiscountAmount(0);
    }
  }, [items, isGstEnabled, billDiscountPct, discountBase, billDiscountAmount, setBillDiscountAmount]);

  const handleBillDiscountPctChange = (pct: number) => {
    const cleanPct = Math.max(0, Math.min(100, pct));
    setBillDiscountPct(cleanPct);
    const amt = cleanPct > 0 && discountBase > 0 ? Math.round(((discountBase * cleanPct) / 100) * 100) / 100 : 0;
    setBillDiscountAmount(amt);
  };

  const handleBillDiscountAmountChange = (amt: number) => {
    const cleanAmt = Math.max(0, amt);
    setBillDiscountAmount(cleanAmt);
    const pct = discountBase > 0 ? Math.round(((cleanAmt / discountBase) * 100) * 100) / 100 : 0;
    setBillDiscountPct(pct);
  };

  // Live product search suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const matchingProducts = useMemo(() => {
    const rawTerm = fastSearch.trim().toLowerCase();
    if (!rawTerm) return [];
    const cleanTerm = rawTerm.replace(/[\s\r\n\t>]+/g, '');
    return products.filter(p => {
      const pBarcode = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
      return (
        p.name.toLowerCase().includes(rawTerm) ||
        p.sku.toLowerCase().includes(rawTerm) ||
        (pBarcode && (pBarcode.includes(cleanTerm) || cleanTerm.includes(pBarcode)))
      );
    }).slice(0, 15);
  }, [products, fastSearch]);

  // Fast Product Pick Action
  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setFastSearch(prod.name);
    setFastRate(prod.saleRate);
    setFastQty(1);
    setFastFreeQty(0);
    setFastRemark('');
    setFastSchemeDisc(0);
    setFastAddlDisc(0);
    setShowSuggestions(false);
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      rateInputRef.current?.focus();
      rateInputRef.current?.select();
    }
  };

  const handleRateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      itemRemarkInputRef.current?.focus();
      itemRemarkInputRef.current?.select();
    }
  };

  const handleItemRemarkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddFastItem();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && matchingProducts.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % matchingProducts.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev - 1 + matchingProducts.length) % matchingProducts.length);
        return;
      }
      if (e.key === 'Enter') {
        if (matchingProducts[suggestionIndex]) {
          e.preventDefault();
          handleSelectProduct(matchingProducts[suggestionIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
  };

  // Wholesale pack multiplier helper (e.g. "Pack of 10" -> 10, "Box of 20" -> 20, "Ream" -> 500)
  const getPackMultiplier = (packText?: string): number => {
    if (!packText) return 1;
    const lower = packText.toLowerCase();
    if (lower.includes('ream')) return 500;
    const match = packText.match(/\b(\d+)\b/);
    if (match) {
      const parsed = parseInt(match[1]);
      if (parsed > 1 && parsed <= 5000) return parsed;
    }
    return 1;
  };

  const handleApplyBoxMultiplier = (multiplier: number) => {
    const packSize = selectedProduct ? getPackMultiplier(selectedProduct.packInfo) : 10;
    const totalQty = multiplier * (packSize > 1 ? packSize : 10);
    setFastQty(totalQty);
    playBeep();
    onToast('info', 'Wholesale Pack Applied', `Set quantity to ${totalQty} (${multiplier} Box/Pack x ${packSize > 1 ? packSize : 10})`);
    qtyInputRef.current?.focus();
    qtyInputRef.current?.select();
  };

  // Fast Barcode Lookup / Add Item
  const handleAddFastItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const searchTerm = fastSearch.trim();
    if (!searchTerm) {
      setIsProductPickerOpen(true);
      return;
    }

    if (selectedProduct) {
      addItemByProduct(selectedProduct, fastQty, fastSchemeDisc, fastAddlDisc, fastFreeQty, fastRemark.trim());
      playBeep();
      resetFastInputs();
      return;
    }

    // Barcode Scan / Exact SKU Lookup
    const cleanSearch = searchTerm.replace(/[\s\r\n\t>]+/g, '').toLowerCase();
    let matchingBarcodes = products.filter(
      p => {
        const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
        return b && b === cleanSearch;
      }
    );

    // Direct Dexie fallback if not yet in memory
    if (matchingBarcodes.length === 0) {
      try {
        const localAll = await db.products.toArray();
        const dbMatches = localAll.filter(p => {
          const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
          return b && b === cleanSearch;
        });
        if (dbMatches.length > 0) {
          matchingBarcodes = dbMatches;
          useProductStore.setState({ products: localAll });
        }
      } catch (err) {
        console.error('Dexie fallback lookup failed:', err);
      }
    }

    if (matchingBarcodes.length === 1) {
      const prod = matchingBarcodes[0];
      addItemByProduct(prod, fastQty, fastSchemeDisc, fastAddlDisc, fastFreeQty, fastRemark.trim());
      playBeep();
      resetFastInputs();
      onToast('success', 'Product Added', `Added "${prod.name}" to bill.`);
      return;
    }

    // Exact SKU match
    let matchingSku = products.find(p => p.sku.toLowerCase().trim() === searchTerm.toLowerCase());
    if (!matchingSku) {
      try {
        const localAll = await db.products.toArray();
        matchingSku = localAll.find(p => p.sku.toLowerCase().trim() === searchTerm.toLowerCase());
        if (matchingSku) {
          useProductStore.setState({ products: localAll });
        }
      } catch (err) {}
    }

    if (matchingSku) {
      addItemByProduct(matchingSku, fastQty, fastSchemeDisc, fastAddlDisc, fastFreeQty, fastRemark.trim());
      playBeep();
      resetFastInputs();
      onToast('success', 'Product Added', `Added "${matchingSku.name}" to bill.`);
      return;
    }

    // Ambiguous barcode or unknown product warning
    playError();
    if (matchingBarcodes.length > 1) {
      onToast('info', 'Multiple Barcode Matches', `Barcode "${searchTerm}" matched multiple items. Please select from search picker.`);
      setIsProductPickerOpen(true);
    } else {
      onToast('error', 'Product Not Found', `No product found matching barcode/SKU "${searchTerm}".`);
    }
  };

  const resetFastInputs = () => {
    setSelectedProduct(null);
    setFastSearch('');
    setFastQty(1);
    setFastFreeQty(0);
    setFastRate(0);
    setFastRemark('');
    setFastSchemeDisc(0);
    setFastAddlDisc(0);
    barcodeInputRef.current?.focus();
  };

  // Complete & Save Bill Action
  const handleConfirmSaveBill = async (receivedAmount: number, shouldPrint: boolean, upiRef?: string) => {
    if (isSubmitting) return;
    if (items.length === 0) {
      onToast('error', 'Empty Bill', 'Cannot save bill without items.');
      return;
    }
    setIsSubmitting(true);



    try {
      const inv = await createCompletedInvoice({
        customerName: customerName.trim() || 'Cash Customer',
        customerMobile: customerMobile.trim() || '',
        customerGstin: customerGstin.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        invoiceType,
        items: items.map(item => isGstEnabled ? item : {
          ...item,
          taxableAmount: item.totalAmount,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0
        }),
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        totalGst: totals.totalGst,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        freightAmount,
        roundOff: totals.roundOff,
        netPayable: totals.netPayable,
        paymentMode,
        paidAmount: receivedAmount,
        balanceAmount: Math.max(0, receivedAmount - totals.netPayable),
        isInterstate,
        placeOfSupply: shopProfile?.state || 'Madhya Pradesh (23)',
        placeOfSupplyCode: '23',
        reverseCharge: false,
        copyType: 'original',
        challanPurpose: invoiceType === 'delivery_challan' ? challanPurpose : undefined,
        notes,
        idempotencyKey,
        transactionRef: upiRef,
        upiReference: upiRef
      }, shopProfile.invoicePrefix);

      setIsQuickPayOpen(false);
      clearBill();

      playCashChime();
      onToast('success', `Invoice #${inv.invoiceNumber} Saved!`, `Net Payable: ₹${inv.netPayable.toLocaleString('en-IN')}`);

      if (shouldPrint) {
        const printRes = await triggerInvoicePrint(inv, shopProfile, printSettings);
        if (printRes?.method === 'usb') {
          onToast('info', 'Silent USB Print', 'Sent direct to thermal printer with auto-cut');
        }
        setTimeout(() => barcodeInputRef.current?.focus(), 150);
      } else {
        setCompletedInvoice(inv);
        setIsPreviewOpen(true);
      }
    } catch (err: any) {
      onToast('error', 'Failed to Save Invoice', err.message || 'Server connection error. Cart preserved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fast 1-Tap Save Action for Mobile Bottom Bar (No Print, Save & Print, or WhatsApp Share)
  const handleFastSaveBill = async ({ shouldPrint, shareWhatsApp }: { shouldPrint: boolean; shareWhatsApp?: boolean }) => {
    if (isSubmitting) return;
    if (items.length === 0) {
      onToast('error', 'Empty Bill', 'Cannot save bill without items.');
      return;
    }
    setIsSubmitting(true);

    try {
      const inv = await createCompletedInvoice({
        customerName: customerName.trim() || 'Cash Customer',
        customerMobile: customerMobile.trim() || '',
        customerGstin: customerGstin.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        invoiceType,
        items: items.map(item => isGstEnabled ? item : {
          ...item,
          taxableAmount: item.totalAmount,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0
        }),
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        totalGst: totals.totalGst,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        freightAmount,
        roundOff: totals.roundOff,
        netPayable: totals.netPayable,
        paymentMode: 'cash',
        paidAmount: totals.netPayable,
        balanceAmount: 0,
        isInterstate,
        placeOfSupply: shopProfile?.state || 'Madhya Pradesh (23)',
        placeOfSupplyCode: '23',
        reverseCharge: false,
        copyType: 'original',
        challanPurpose: invoiceType === 'delivery_challan' ? challanPurpose : undefined,
        notes,
        idempotencyKey,
      }, shopProfile.invoicePrefix);

      clearBill();
      playCashChime();

      if (shouldPrint) {
        setCompletedInvoice(inv);
        setIsPreviewOpen(true);
        triggerInvoicePrint(inv, shopProfile, printSettings);
        onToast('success', `Bill #${inv.invoiceNumber} Saved & Printed!`, `Total: ₹${inv.netPayable.toLocaleString('en-IN')}`);
      } else if (shareWhatsApp) {
        openWhatsAppReceipt(inv, shopProfile);
        onToast('success', `Bill #${inv.invoiceNumber} Saved & Shared!`, 'WhatsApp opened with bill');
      } else {
        onToast('success', `Bill #${inv.invoiceNumber} Saved!`, `Net Payable: ₹${inv.netPayable.toLocaleString('en-IN')}`);
      }
    } catch (err: any) {
      playError();
      onToast('error', 'Failed to Save Invoice', err.message || 'Cart preserved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNewBill = () => {
    clearBill();
    setTimeout(() => {
      barcodeInputRef.current?.focus();
      barcodeInputRef.current?.select();
    }, 100);
  };

  const handleConfirmNewBillRemark = (enteredRemark: string) => {
    setNotes(enteredRemark);
    if (enteredRemark) {
      onToast('info', 'Bill Remark Set', `Remark: "${enteredRemark}"`);
    }
    setTimeout(() => {
      barcodeInputRef.current?.focus();
      barcodeInputRef.current?.select();
    }, 100);
  };

  // Keyboard Shortcuts inside Billing Section
  useKeyboardShortcuts({
    onF2_NewBill: () => {
      handleOpenNewBill();
    },
    onF3_AddCustomer: () => {
      setIsAddCustomerModalOpen(true);
    },
    onF4_SearchProduct: () => {
      setIsProductPickerOpen(true);
    },
    onF6_ToggleGst: () => {
      const nextType = invoiceType === 'gst' ? 'simple' : 'gst';
      setInvoiceType(nextType);
      onToast('info', `GST ${nextType === 'gst' ? 'ON (Tax Bill)' : 'OFF (Estimate Bill)'}`, 'Invoice mode changed');
    },
    onF7_ToggleInterstate: () => {
      if (invoiceType === 'gst') {
        setIsInterstate(!isInterstate);
        onToast('info', !isInterstate ? 'Interstate IGST Active' : 'Local CGST+SGST Active', 'Tax updated');
      }
    },
    onF8_QuickPay: () => {
      if (items.length > 0) {
        setIsQuickPayOpen(true);
      } else {
        onToast('info', 'Cart is Empty', 'Add items before proceeding to settlement.');
      }
    },
    onF9_SaveAndPrint: () => {
      if (items.length > 0) {
        handleConfirmSaveBill(totals.netPayable, true);
      } else {
        onToast('info', 'Cart is Empty', 'Add items before printing.');
      }
    },
    onF10_HoldDraft: () => {
      setIsHoldDraftsOpen(true);
    },
    onF11_ClearBill: () => {
      if (items.length > 0) {
        clearBill();
        onToast('info', 'Bill Cleared', 'Cart has been emptied.');
      }
    },
    onEscape: () => {
      setIsCustomerDropdownOpen(false);
      setShowSuggestions(false);
    }
  });

  const isMobile = useIsMobile(768);

  if (isMobile) {
    return (
      <div className="font-sans text-[#172B4D]">
        <MobileBillingView
          onToast={onToast}
          onOpenQuickPay={() => setIsQuickPayOpen(true)}
          onOpenNewBill={handleOpenNewBill}
          onFastSaveBill={handleFastSaveBill}
          totals={totals}
          isOnline={isOnline}
          isSupabaseConnected={isSupabaseConnected}
        />

        {/* Modals */}
        <QuickPayModal
          isOpen={isQuickPayOpen}
          onClose={() => setIsQuickPayOpen(false)}
          netPayable={totals.netPayable}
          paymentMode={paymentMode}
          onSelectPaymentMode={setPaymentMode}
          onConfirmPayment={handleConfirmSaveBill}
          isSubmitting={isSubmitting}
          items={items}
          totals={totals}
          customerName={customerName}
          customerMobile={customerMobile}
          shopUpiId={shopProfile.upiId}
          shopName={shopProfile.shopName}
          invoiceType={invoiceType}
          notes={notes}
          onNotesChange={setNotes}
        />

        <NewBillRemarkModal
          isOpen={isNewBillModalOpen}
          onClose={() => setIsNewBillModalOpen(false)}
          initialRemark={notes}
          onConfirm={handleConfirmNewBillRemark}
        />

        <A5PrintPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setTimeout(() => barcodeInputRef.current?.focus(), 150);
          }}
          invoice={completedInvoice}
          shopProfile={shopProfile}
          printSettings={printSettings}
        />

        <HoldDraftsModal
          isOpen={isHoldDraftsOpen}
          onClose={() => setIsHoldDraftsOpen(false)}
          onToast={onToast}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.25rem)] gap-2.5 font-sans text-[#172B4D]">
      {/* SECTION 4: Persistent Hotkeys & Connection Status Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-white border border-[#D8E1EC] rounded-xl shadow-xs text-xs font-mono shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <KeyboardBadge shortcut="F2" label="New Bill" onClick={handleOpenNewBill} variant="primary" />
          <KeyboardBadge shortcut="F3" label="+ Client" onClick={() => setIsAddCustomerModalOpen(true)} variant="secondary" />
          <KeyboardBadge shortcut="F4" label="Search Catalog" onClick={() => setIsProductPickerOpen(true)} variant="secondary" />
          <KeyboardBadge shortcut="F6" label={isGstEnabled ? "GST: ON" : "GST: OFF"} onClick={() => setInvoiceType(invoiceType === 'gst' ? 'simple' : 'gst')} variant={isGstEnabled ? "emerald" : "secondary"} />
          <KeyboardBadge shortcut="F8" label="Quick Settle" onClick={() => setIsQuickPayOpen(true)} variant="emerald" />
          <KeyboardBadge shortcut="F9" label={`Print ${paperFormatLabel}`} onClick={() => handleConfirmSaveBill(totals.netPayable, true)} variant="amber" />
          <KeyboardBadge shortcut="F10" label="Hold Draft" onClick={() => setIsHoldDraftsOpen(true)} variant="rose" />
          <KeyboardBadge shortcut="F11" label="Clear Bill" onClick={() => clearBill()} variant="rose" />
        </div>

        {/* Small Connection Status Indicator */}
        <div className="flex items-center gap-3 text-[#64748B]">
          {isOnline && isSupabaseConnected ? (
            <span className="flex items-center gap-1.5 text-[#15803D] font-bold" title="Connected to Supabase PostgreSQL Cloud">
              <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse"></span>
              <Wifi className="w-3.5 h-3.5" /> Online (Supabase DB)
            </span>
          ) : isOnline ? (
            <span className="flex items-center gap-1.5 text-[#B45309] font-bold" title="Operating locally on IndexedDB cache">
              <span className="w-2 h-2 rounded-full bg-[#B45309]"></span>
              <Wifi className="w-3.5 h-3.5" /> Local (IndexedDB Cache)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[#B91C1C] font-bold" title="Network disconnected. Cart saved locally.">
              <span className="w-2 h-2 rounded-full bg-[#B91C1C]"></span>
              <WifiOff className="w-3.5 h-3.5" /> Offline Mode
            </span>
          )}
          <span className="text-[#D8E1EC]">|</span>
          <span className="text-[#2563EB] font-bold">{products.length} Items Loaded</span>
          {typeof window !== 'undefined' && !window.electronAPI?.isElectron && (
            <>
              <span className="text-[#D8E1EC] hidden xl:inline">|</span>
              <a
                href={WINDOWS_EXE_URL}
                className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-[10px] transition-colors"
                title="Download WebRajya for Windows (.exe) - 0-Click Silent Printing"
              >
                <Download className="w-3 h-3 text-emerald-600" />
                <span>Windows App (.exe)</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Customer Info & Bill Type Row */}
      <div className="grid grid-cols-12 gap-2.5 bg-white border border-[#D8E1EC] rounded-xl p-3 shrink-0 shadow-sm items-center">
        {/* Customer Autocomplete Input */}
        <div className="relative col-span-3" ref={customerContainerRef}>
          <div className="flex items-center gap-1.5 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-2.5 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
            <User className="w-4 h-4 text-[#2563EB] shrink-0" />
            <input
              type="text"
              placeholder="Customer Name..."
              value={customerName}
              onFocus={() => setIsCustomerDropdownOpen(true)}
              onChange={(e) => {
                setCustomerInfo(e.target.value, customerMobile, customerGstin, customerAddress);
                setIsCustomerDropdownOpen(true);
              }}
              onKeyDown={handleCustomerKeyDown}
              className="w-full bg-transparent text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-medium"
            />
            <button
              type="button"
              onClick={() => setIsAddCustomerModalOpen(true)}
              title="Add New Contact / Client"
              className="p-1 hover:bg-[#DBEAFE] text-[#2563EB] rounded transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Autocomplete Dropdown Menu */}
          {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#D8E1EC] rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 animate-in fade-in duration-100">
              {filteredCustomers.slice(0, 8).map((cust, idx) => (
                <div
                  key={cust.id}
                  onClick={() => handleSelectCustomer(cust)}
                  className={`p-2.5 hover:bg-[#F5F9FF] cursor-pointer flex items-center justify-between transition-colors ${
                    idx === selectedCustomerIndex ? 'bg-[#DBEAFE]/60' : ''
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-xs text-[#172B4D] truncate">{cust.name}</div>
                    <div className="text-[11px] text-[#64748B] flex items-center gap-2 mt-0.5 truncate">
                      {cust.mobile && <span>📱 {cust.mobile}</span>}
                      {cust.address && <span className="truncate max-w-[140px]">📍 {cust.address}</span>}
                    </div>
                  </div>
                  {cust.creditBalance > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      Khata: ₹{cust.creditBalance.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
              <div
                onClick={() => {
                  setIsCustomerDropdownOpen(false);
                  setIsAddCustomerModalOpen(true);
                }}
                className="p-2 bg-[#F5F9FF] hover:bg-[#DBEAFE] text-[#2563EB] font-bold text-xs text-center cursor-pointer transition-colors"
              >
                + Add "{customerName || 'New Client'}" as New Contact
              </div>
            </div>
          )}
        </div>

        {/* Mobile Number */}
        <div className="col-span-2 flex items-center gap-1.5 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-2.5 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
          <Phone className="w-4 h-4 text-[#64748B] shrink-0" />
          <input
            type="text"
            placeholder="Mobile (10 Digits)..."
            value={customerMobile}
            onChange={(e) => setCustomerInfo(customerName, e.target.value, customerGstin, customerAddress)}
            className="w-full bg-transparent text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-mono"
          />
        </div>

        {/* Customer GSTIN */}
        <div className="col-span-2 flex items-center gap-1.5 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-2.5 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
          <FileText className="w-4 h-4 text-[#64748B] shrink-0" />
          <input
            type="text"
            placeholder="GSTIN (Optional)..."
            value={customerGstin}
            onChange={(e) => setCustomerInfo(customerName, customerMobile, e.target.value.toUpperCase(), customerAddress)}
            className="w-full bg-transparent text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-mono uppercase"
          />
        </div>

        {/* Bill Remark / Narration */}
        <div className="col-span-3 flex items-center gap-1.5 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg px-2.5 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
          <button
            type="button"
            onClick={() => setIsNewBillModalOpen(true)}
            title="Click for quick remark suggestions (Optional)"
            className="text-[#2563EB] hover:text-[#1D4ED8] p-0.5 rounded cursor-pointer"
          >
            <StickyNote className="w-4 h-4 shrink-0" />
          </button>
          <input
            ref={remarkInputRef}
            type="text"
            placeholder="Bill Remark (Optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-transparent text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none font-medium"
          />
          {notes && (
            <button
              type="button"
              onClick={() => setNotes('')}
              className="text-[#94A3B8] hover:text-[#B91C1C] text-xs font-bold px-1"
              title="Clear Remark"
            >
              ×
            </button>
          )}
        </div>

        {/* Bill Type Selector: GST / Simple / Estimate (Quotation) */}
        <div className="col-span-2 flex items-center justify-end gap-1.5 px-1">
          <div className="inline-flex bg-[#F1F5F9] border border-[#CBD5E1] p-0.5 rounded-lg text-[11px] font-black shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => setInvoiceType('gst')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                invoiceType === 'gst' ? 'bg-[#15803D] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
              }`}
              title="GST Tax Invoice (CGST + SGST or IGST)"
            >
              GST
            </button>
            <button
              type="button"
              onClick={() => setInvoiceType('simple')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                invoiceType === 'simple' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
              }`}
              title="Simple Retail Cash Memo"
            >
              Simple
            </button>

            {/* Advanced statutory modes: Only displayed when enabled in Settings */}
            {billingSettings?.showAdvancedModes && (
              <>
                {billingSettings.enableBos && (
                  <button
                    type="button"
                    onClick={() => setInvoiceType('bill_of_supply')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      invoiceType === 'bill_of_supply' ? 'bg-[#0284C7] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                    }`}
                    title="Bill of Supply (Rule 49 - Composition Scheme / Exempt Supplies)"
                  >
                    B.O.S
                  </button>
                )}
                {billingSettings.enableChallan && (
                  <button
                    type="button"
                    onClick={() => setInvoiceType('delivery_challan')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      invoiceType === 'delivery_challan' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                    }`}
                    title="Delivery Challan (Rule 55 - Job Work / Stock Transfer without Sale)"
                  >
                    Challan
                  </button>
                )}
                {billingSettings.enableEstimate && (
                  <button
                    type="button"
                    onClick={() => setInvoiceType('quotation')}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      invoiceType === 'quotation' ? 'bg-[#D97706] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                    }`}
                    title="Formal Price Quotation / Institutional Estimate"
                  >
                    Estimate
                  </button>
                )}
              </>
            )}

            {/* If currently set to an advanced mode not displayed, show an indicator badge */}
            {!billingSettings?.showAdvancedModes && invoiceType !== 'gst' && invoiceType !== 'simple' && (
              <span className="px-2 py-1 rounded bg-[#E0E7FF] text-[#3730A3] text-[10px] font-bold">
                {invoiceType === 'bill_of_supply' ? 'B.O.S' : invoiceType === 'delivery_challan' ? 'Challan' : 'Estimate'}
              </span>
            )}
          </div>

          {invoiceType === 'delivery_challan' && (
            <select
              value={challanPurpose}
              onChange={(e) => setChallanPurpose(e.target.value as any)}
              className="text-[10px] font-bold bg-purple-50 text-purple-900 border border-purple-300 rounded px-1.5 py-1 focus:outline-none cursor-pointer"
              title="Rule 55 Challan Statutory Purpose"
            >
              <option value="approval">Supply on Approval</option>
              <option value="job_work">Job Work</option>
              <option value="godown_transfer">Godown Transfer</option>
              <option value="others">Other Transportation</option>
            </select>
          )}

          {isGstEnabled && (billingSettings?.enableIgst !== false) && (
            <label className="flex items-center gap-1 text-[11px] text-[#172B4D] font-bold cursor-pointer select-none shrink-0" title="Interstate IGST">
              <input
                type="checkbox"
                checked={isInterstate}
                onChange={(e) => setIsInterstate(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#D8E1EC] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
              />
              <span>IGST</span>
            </label>
          )}
        </div>
      </div>

      {/* Prominent Barcode / Search Fast Add Form - High Visibility (More Big) */}
      <form onSubmit={handleAddFastItem} className="grid grid-cols-12 gap-2.5 bg-[#DBEAFE]/50 border-2 border-[#BFDBFE] rounded-2xl p-3.5 items-center shrink-0 shadow-sm">
        <div className="col-span-4 relative">
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="Scan Barcode or Type Product Name / SKU [Enter / F4]..."
            value={fastSearch}
            onChange={(e) => {
              const val = e.target.value;
              setFastSearch(val);
              setSelectedProduct(null);
              setSuggestionIndex(0);
              setShowSuggestions(val.trim().length > 0);
            }}
            onFocus={() => {
              if (fastSearch.trim().length > 0) setShowSuggestions(true);
            }}
            onKeyDown={handleSearchKeyDown}
            className="w-full h-14 pl-4 pr-12 bg-white border-2 border-[#D8E1EC] rounded-xl text-base font-mono text-[#172B4D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/20 font-bold shadow-xs"
          />
          <button
            type="button"
            onClick={() => setIsProductPickerOpen(true)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#2563EB] transition-colors p-1"
            title="Browse Product Catalog (F4)"
          >
            <Search className="w-6 h-6" />
          </button>

          {/* High-Visibility Screen-Spanning Product Suggestions Overlay */}
          {showSuggestions && matchingProducts.length > 0 && (
            <div className="absolute left-0 w-[1000px] max-w-[90vw] top-full mt-2 bg-white border-2 border-[#2563EB] rounded-2xl shadow-2xl z-50 max-h-[520px] overflow-y-auto">
              <div className="px-5 py-3 bg-[#123B70] text-white text-xs font-extrabold uppercase tracking-wider flex justify-between items-center rounded-t-xl sticky top-0 z-10 shadow-sm border-b border-[#0D2D56]">
                <span className="flex items-center gap-2.5 text-sm">
                  <Search className="w-4 h-4 text-[#60A5FA]" />
                  Matching Products ({matchingProducts.length})
                </span>
                <span className="text-xs text-blue-200 font-mono font-bold bg-white/10 px-3 py-1 rounded-md border border-white/10">
                  Use ↑↓ Arrow Keys & Press Enter to Select
                </span>
              </div>
              <ul className="divide-y divide-[#E2E8F0]">
                {matchingProducts.map((prod, idx) => {
                  const isHighlighted = idx === suggestionIndex;
                  return (
                    <li
                      key={prod.id}
                      onClick={() => handleSelectProduct(prod)}
                      onMouseEnter={() => setSuggestionIndex(idx)}
                      className={`px-5 py-3.5 cursor-pointer flex items-center justify-between transition-all ${
                        isHighlighted
                          ? 'bg-[#DBEAFE] border-l-6 border-[#2563EB] font-black text-[#123B70] shadow-xs'
                          : 'hover:bg-[#F0F6FF]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 truncate pr-4">
                        <span className="px-3 py-1 text-xs font-mono font-black bg-[#2563EB] text-white rounded-md shrink-0 shadow-2xs">
                          {prod.sku}
                        </span>
                        <span className="text-[#172B4D] font-extrabold text-base truncate tracking-tight">{prod.name}</span>
                        {prod.category && (
                          <span className="hidden sm:inline-block px-2.5 py-0.5 text-[11px] font-medium text-[#64748B] bg-slate-100 rounded border border-slate-200 shrink-0">
                            {prod.category}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-4 font-mono">
                        <span className="text-xs text-[#172B4D] font-extrabold bg-blue-50 border border-blue-200 px-3 py-1 rounded-md">
                          Pack: {prod.packInfo || '1*1'}
                        </span>
                        <span className="text-base font-black text-[#15803D] bg-emerald-50 border-2 border-emerald-300 px-3.5 py-1 rounded-lg shadow-2xs">
                          ₹{prod.saleRate.toFixed(2)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="col-span-1 h-14 flex flex-col justify-center bg-white border-2 border-[#D8E1EC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-xl px-2 py-1 shadow-xs transition-all relative">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#64748B] font-mono font-black uppercase">Qty:</span>
            <input
              ref={qtyInputRef}
              type="number"
              min={1}
              value={fastQty}
              onChange={(e) => setFastQty(parseInt(e.target.value) || 1)}
              onKeyDown={handleQtyKeyDown}
              onFocus={(e) => e.target.select()}
              className="w-full bg-transparent text-base font-mono text-[#15803D] font-black focus:outline-none"
            />
          </div>
          {/* Wholesale Box / Pack Quick Switcher */}
          {selectedProduct && (
            <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
              <button
                type="button"
                onClick={() => handleApplyBoxMultiplier(1)}
                className="text-[9px] font-black px-1 rounded bg-blue-50 text-[#2563EB] hover:bg-blue-100 border border-blue-200 cursor-pointer transition-colors"
                title={`Set 1 Box/Pack (${getPackMultiplier(selectedProduct.packInfo)} pcs)`}
              >
                1 Box
              </button>
              <button
                type="button"
                onClick={() => handleApplyBoxMultiplier(5)}
                className="text-[9px] font-black px-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer transition-colors"
                title={`Set 5 Boxes/Packs (${getPackMultiplier(selectedProduct.packInfo) * 5} pcs)`}
              >
                5 Box
              </button>
            </div>
          )}
        </div>

        <div className="col-span-1 h-14 flex items-center gap-1 bg-white border-2 border-[#D8E1EC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-xl px-2 py-1 shadow-xs transition-all">
          <span className="text-xs text-[#64748B] font-mono font-black uppercase">Free:</span>
          <input
            ref={freeInputRef}
            type="number"
            min={0}
            value={fastFreeQty}
            onChange={(e) => setFastFreeQty(parseInt(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="w-full bg-transparent text-lg font-mono text-[#2563EB] font-black focus:outline-none"
          />
        </div>

        <div className="col-span-1 h-14 flex items-center gap-1.5 bg-white border-2 border-[#D8E1EC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-xl px-2 py-1 shadow-xs transition-all">
          <span className="text-xs text-[#64748B] font-mono font-black uppercase">Rate:</span>
          <input
            ref={rateInputRef}
            type="number"
            step="0.01"
            value={fastRate}
            onChange={(e) => setFastRate(parseFloat(e.target.value) || 0)}
            onKeyDown={handleRateKeyDown}
            onFocus={(e) => e.target.select()}
            className="w-full bg-transparent text-base font-mono text-[#172B4D] font-black focus:outline-none"
          />
        </div>

        {/* Optional Item Remark Input */}
        <div className="col-span-2 h-14 flex items-center gap-1.5 bg-white border-2 border-[#D8E1EC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-xl px-2.5 py-1 shadow-xs transition-all">
          <span className="text-xs text-[#64748B] font-mono font-black uppercase shrink-0">Rem:</span>
          <input
            ref={itemRemarkInputRef}
            type="text"
            placeholder="Remark (Optional)..."
            value={fastRemark}
            onChange={(e) => setFastRemark(e.target.value)}
            onKeyDown={handleItemRemarkKeyDown}
            className="w-full bg-transparent text-sm font-semibold text-[#172B4D] focus:outline-none placeholder:text-[#94A3B8]"
            title="Optional item remark (e.g. 10th EM, Damaged, Sample)"
          />
        </div>

        <div className="col-span-1 h-14 flex items-center gap-1 bg-white border-2 border-[#D8E1EC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-xl px-2 py-1 shadow-xs transition-all">
          <span className="text-xs text-[#64748B] font-mono font-black uppercase">Sch%:</span>
          <input
            ref={schInputRef}
            type="number"
            min={0}
            max={100}
            value={fastSchemeDisc}
            onChange={(e) => setFastSchemeDisc(parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="w-full bg-transparent text-base font-mono text-[#B45309] font-black focus:outline-none"
          />
        </div>

        <div className="col-span-1 h-14 flex items-center gap-1 bg-white border-2 border-[#D8E1EC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-xl px-2 py-1 shadow-xs transition-all">
          <span className="text-xs text-[#64748B] font-mono font-black uppercase">Addl%:</span>
          <input
            ref={addlInputRef}
            type="number"
            min={0}
            max={100}
            value={fastAddlDisc}
            onChange={(e) => setFastAddlDisc(parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="w-full bg-transparent text-base font-mono text-[#B45309] font-black focus:outline-none"
          />
        </div>

        <div className="col-span-1">
          <button
            type="submit"
            className="w-full h-14 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-98 text-white rounded-xl text-base font-black flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-lg cursor-pointer"
          >
            <Plus className="w-5 h-5" /> Add
          </button>
        </div>
      </form>

      {/* Main Billing Split: Dense Product Table & Right Totals Panel */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Left Marg ERP Dense Product Entry Table */}
        <div className="col-span-9 bg-white border border-[#D8E1EC] rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-3 bg-[#F5F9FF] border-b border-[#D8E1EC] flex items-center justify-between">
            <h3 className="text-sm font-black text-[#172B4D] uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#2563EB]" /> Product Entry Table ({items.length} Items)
            </h3>
            {items.length > 0 && (
              <button
                onClick={() => clearBill()}
                className="text-xs text-[#B91C1C] hover:text-red-700 font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Clear Bill
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F1F5F9] text-[#0F172A] font-extrabold border-b-2 border-[#CBD5E1] sticky top-0 uppercase tracking-wider text-xs">
                <tr>
                  <th className="py-2.5 px-3 text-center w-10">S.</th>
                  <th className="py-2.5 px-3">Product Description</th>
                  <th className="py-2.5 px-2 text-center w-20">Pack</th>
                  <th className="py-2.5 px-2 text-center w-28">Remark</th>
                  <th className="py-2.5 px-2 text-center w-24">Qty.</th>
                  <th className="py-2.5 px-2 text-center w-20">Free</th>
                  <th className="py-2.5 px-2 text-right w-28">Rate (₹)</th>
                  <th className="py-2.5 px-2 text-right w-20">MRP</th>
                  <th className="py-2.5 px-2 text-center w-20">Scheme %</th>
                  <th className="py-2.5 px-2 text-center w-20">Discount %</th>
                  <th className="py-2.5 px-3 text-right w-32">Amount (₹)</th>
                  <th className="py-2.5 px-2 text-center w-10">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center text-[#64748B]">
                      <div className="w-16 h-16 rounded-2xl bg-white border border-[#D8E1EC] p-2 mx-auto mb-3 shadow-xs flex items-center justify-center">
                        <img src="/logo.png" alt="WebRajya Invoice" className="w-full h-full object-contain" />
                      </div>
                      <div className="font-bold text-base text-[#172B4D]">No items in bill</div>
                      <div className="text-sm text-[#64748B] mt-1">Scan barcode or press F4 to search product catalog</div>
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const isExceededStock = item.qty > item.availableStock;
                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-[#F0F6FF] transition-colors ${
                          isExceededStock ? 'bg-[#FEF2F2]' : index % 2 === 0 ? 'bg-white' : 'bg-[#FAFCEF]/30'
                        }`}
                      >
                        {/* Serial Number */}
                        <td className="py-3 px-3 text-center font-mono font-bold text-sm text-[#475569]">{index + 1}</td>
                        
                        {/* Product Name & SKU */}
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-sm text-[#0F172A] leading-snug">{item.productName}</div>
                          <div className="text-xs text-[#64748B] font-mono mt-0.5 font-medium">SKU: {item.sku} {item.barcode ? `• ${item.barcode}` : ''}</div>
                        </td>

                        {/* Pack */}
                        <td className="py-3 px-2 text-center font-mono font-bold text-xs text-[#334155]">{item.pack}</td>

                        {/* Remark (Optional - Editable) */}
                        <td className="py-3 px-2 text-center">
                          <input
                            type="text"
                            placeholder="-"
                            value={item.remark || ''}
                            onChange={(e) => updateItemRemark(item.id, e.target.value)}
                            className="w-24 h-9 px-2 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-center text-[#1E293B] text-xs font-semibold shadow-2xs focus:border-[#2563EB] focus:outline-none placeholder:text-[#94A3B8]"
                            title="Optional item remark (prints on invoice)"
                          />
                        </td>

                        {/* Quantity (Editable) */}
                        <td className="py-3 px-2 text-center font-mono">
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) => updateItemQty(item.id, parseInt(e.target.value) || 1)}
                            className="w-18 h-9 px-2 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-center text-[#15803D] text-base font-black font-mono shadow-2xs focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none"
                          />
                        </td>

                        {/* Free Quantity (Editable) */}
                        <td className="py-3 px-2 text-center font-mono">
                          <input
                            type="number"
                            min={0}
                            value={item.freeQty}
                            onChange={(e) => updateItemFreeQty(item.id, parseInt(e.target.value) || 0)}
                            className="w-14 h-9 px-2 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-center text-[#2563EB] text-base font-black font-mono shadow-2xs focus:border-[#2563EB] focus:outline-none"
                          />
                        </td>

                        {/* Rate (Editable) */}
                        <td className="py-3 px-2 text-right font-mono">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitRate}
                            onChange={(e) => updateItemRate(item.id, parseFloat(e.target.value) || 0)}
                            className="w-24 h-9 px-2 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-right text-[#0F172A] text-base font-black font-mono shadow-2xs focus:border-[#2563EB] focus:outline-none"
                          />
                        </td>

                        {/* MRP (Snapshot) */}
                        <td className="py-3 px-2 text-right font-mono font-bold text-xs text-[#64748B]">₹{item.mrp}</td>

                        {/* Scheme Disc % (Editable) */}
                        <td className="py-3 px-2 text-center font-mono">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.schemeDiscountPct}
                            onChange={(e) => updateItemSchemeDiscount(item.id, parseFloat(e.target.value) || 0)}
                            className="w-14 h-9 px-1 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-center text-[#B45309] text-sm font-black font-mono shadow-2xs focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none"
                          />
                        </td>

                        {/* Addl Disc % (Editable) */}
                        <td className="py-3 px-2 text-center font-mono">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.addlDiscountPct}
                            onChange={(e) => updateItemAddlDiscount(item.id, parseFloat(e.target.value) || 0)}
                            className="w-14 h-9 px-1 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-center text-[#B45309] text-sm font-black font-mono shadow-2xs focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none"
                          />
                        </td>

                        {/* Final Line Amount */}
                        <td className="py-3 px-3 text-right font-mono font-black text-base text-[#123B70] tracking-tight">
                          ₹{item.totalAmount.toFixed(2)}
                        </td>

                        {/* Remove Action */}
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-[#94A3B8] hover:text-[#DC2626] rounded-lg hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                            title="Remove Line Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Totals Panel */}
        <div className="col-span-3 bg-white border border-[#D8E1EC] rounded-xl p-5 flex flex-col justify-between shadow-sm font-sans">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#D8E1EC] pb-2.5">
              <h3 className="text-sm font-black text-[#0F172A] uppercase tracking-wider">
                Bill Summary
              </h3>
              <button
                type="button"
                onClick={() => setInvoiceType(invoiceType === 'gst' ? 'simple' : 'gst')}
                className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border-2 shadow-2xs ${
                  isGstEnabled
                    ? 'bg-[#15803D] text-white border-[#166534] hover:bg-[#166534]'
                    : 'bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1] hover:bg-[#E2E8F0]'
                }`}
                title={isGstEnabled ? 'Click to turn GST OFF' : 'Click to turn GST ON'}
              >
                <span className={`w-2 h-2 rounded-full ${isGstEnabled ? 'bg-white' : 'bg-[#94A3B8]'}`}></span>
                <span>{isGstEnabled ? 'GST: ON' : 'GST: OFF'}</span>
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-center text-[#475569]">
                <span className="font-medium">{isGstEnabled ? 'Taxable Subtotal:' : 'Item Subtotal:'}</span>
                <span className="text-[#0F172A] font-mono font-bold text-sm">₹{totals.subtotal.toFixed(2)}</span>
              </div>

              {totals.totalDiscount > 0 && (
                <div className="flex justify-between items-center text-[#15803D]">
                  <span className="font-semibold">Total Discount:</span>
                  <span className="font-mono font-bold text-sm">- ₹{totals.totalDiscount.toFixed(2)}</span>
                </div>
              )}

              {isGstEnabled ? (
                isInterstate ? (
                  <div className="flex justify-between items-center text-[#475569]">
                    <span className="font-medium">IGST Total:</span>
                    <span className="text-[#0F172A] font-mono font-bold text-sm">₹{totals.igstTotal.toFixed(2)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center text-[#475569]">
                      <span className="font-medium">CGST:</span>
                      <span className="text-[#0F172A] font-mono font-bold text-sm">₹{totals.cgstTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[#475569]">
                      <span className="font-medium">SGST:</span>
                      <span className="text-[#0F172A] font-mono font-bold text-sm">₹{totals.sgstTotal.toFixed(2)}</span>
                    </div>
                  </>
                )
              ) : (
                <div className="flex justify-between items-center text-[#94A3B8] italic py-0.5">
                  <span className="text-xs">GST (Tax Amount):</span>
                  <span className="font-mono font-bold text-xs bg-gray-100 text-[#64748B] px-2 py-0.5 rounded border border-gray-200">
                    OFF (₹0.00)
                  </span>
                </div>
              )}

              {/* Editable Freight Amount */}
              <div className="flex justify-between items-center text-[#475569]">
                <span className="font-medium">Freight / Delivery:</span>
                <input
                  type="number"
                  min={0}
                  value={freightAmount || ''}
                  onChange={(e) => setFreightAmount(parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 px-2 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-right text-[#0F172A] text-sm font-mono font-bold focus:border-[#2563EB] focus:outline-none"
                  placeholder="0"
                />
              </div>

              {/* Editable Bill Level Final Discount: Dual % and ₹ */}
              <div className="space-y-1.5 py-0.5">
                <div className="flex justify-between items-center text-[#475569]">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-[#172B4D]">Final Discount:</span>
                    <span className="text-[10px] text-[#64748B]">
                      {billDiscountPct > 0 ? `${billDiscountPct}% applied` : 'Enter in % or ₹'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* % input */}
                    <div className="relative flex items-center" title="Final Discount in %">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={billDiscountPct > 0 ? billDiscountPct : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleBillDiscountPctChange(val === '' ? 0 : (parseFloat(val) || 0));
                        }}
                        className="w-16 h-8 pl-1.5 pr-5 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-right text-[#15803D] text-sm font-mono font-black focus:border-[#2563EB] focus:outline-none"
                        placeholder="0"
                      />
                      <span className="absolute right-1.5 text-xs font-bold text-[#64748B] pointer-events-none select-none">%</span>
                    </div>

                    {/* ₹ input */}
                    <div className="relative flex items-center" title="Discount Amount in ₹">
                      <span className="absolute left-1.5 text-xs font-bold text-[#64748B] pointer-events-none select-none">₹</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={billDiscountAmount > 0 ? billDiscountAmount : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleBillDiscountAmountChange(val === '' ? 0 : (parseFloat(val) || 0));
                        }}
                        className="w-20 h-8 pl-4 pr-1.5 py-1 bg-white border-2 border-[#CBD5E1] rounded-lg text-right text-[#15803D] text-sm font-mono font-black focus:border-[#2563EB] focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-[#475569] pt-1 border-t border-dashed border-[#CBD5E1]">
                <span className="font-medium">Round Off:</span>
                <span className="text-[#0F172A] font-mono font-bold text-sm">{totals.roundOff >= 0 ? '+' : ''}₹{totals.roundOff.toFixed(2)}</span>
              </div>
            </div>

            {/* Rule 46(e) Statutory B2C Alert for Bills >= ₹50,000 */}
            {totals.netPayable >= 50000 && !customerGstin && (!customerAddress || !customerName || customerName.trim().toLowerCase() === 'cash customer') && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs my-2 flex items-start gap-2 shadow-2xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-tight">
                  <span className="font-bold">GST Rule 46(e) Compliance Alert:</span> For unregistered supplies of ₹50,000 or more, recording Customer Name, Delivery Address, and State is mandatory on the Tax Invoice.
                </div>
              </div>
            )}

            {/* Grand Net Payable Highlight */}
            <div className="p-4 bg-[#DBEAFE] border-2 border-[#93C5FD] rounded-xl text-center my-3 shadow-xs">
              <span className="text-xs font-black uppercase text-[#123B70] tracking-wider">
                Net Payable Grand Total
              </span>
              <div className="text-3xl lg:text-4xl font-black text-[#123B70] font-mono mt-1 tracking-tight">
                {formatCurrency(totals.netPayable)}
              </div>
            </div>

            {/* Real-time Wholesale Margin & Profit Indicator */}
            {items.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs mb-3 shadow-2xs">
                <span className="font-bold text-emerald-800">Est. Profit Margin:</span>
                <span className="font-mono font-black text-emerald-700">
                  +₹{cartGrossProfit.toFixed(0)} ({cartMarginPct.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-3 border-t border-[#D8E1EC]">
            <button
              onClick={() => handleConfirmSaveBill(totals.netPayable, true)}
              disabled={items.length === 0 || isSubmitting}
              className="w-full py-3.5 bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer hover:shadow-lg active:scale-[0.99]"
            >
              <Printer className="w-5 h-5" /> Save & Print {paperFormatLabel} [F9]
            </button>

            <button
              onClick={() => setIsQuickPayOpen(true)}
              disabled={items.length === 0 || isSubmitting}
              className="w-full py-3 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-[0.99]"
            >
              <CheckCircle2 className="w-5 h-5" /> Quick Settle [F8]
            </button>

            <button
              onClick={() => setIsHoldDraftsOpen(true)}
              className="w-full py-2.5 bg-white hover:bg-[#F8FAFC] text-[#172B4D] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors border-2 border-[#D8E1EC] cursor-pointer"
            >
              <Save className="w-4 h-4 text-[#B45309]" /> Hold Draft [F10]
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ProductPickerModal
        isOpen={isProductPickerOpen}
        onClose={() => setIsProductPickerOpen(false)}
        products={products}
        onSelectProduct={handleSelectProduct}
        onOpenAddProduct={onOpenAddProductModal}
        initialSearch={fastSearch}
      />

      <HoldDraftsModal
        isOpen={isHoldDraftsOpen}
        onClose={() => setIsHoldDraftsOpen(false)}
        onToast={onToast}
      />

      <QuickPayModal
        isOpen={isQuickPayOpen}
        onClose={() => setIsQuickPayOpen(false)}
        netPayable={totals.netPayable}
        paymentMode={paymentMode}
        onSelectPaymentMode={setPaymentMode}
        onConfirmPayment={handleConfirmSaveBill}
        isSubmitting={isSubmitting}
        items={items}
        totals={totals}
        customerName={customerName}
        customerMobile={customerMobile}
        shopUpiId={shopProfile.upiId}
        shopName={shopProfile.shopName}
        invoiceType={invoiceType}
        notes={notes}
        onNotesChange={setNotes}
      />

      <NewBillRemarkModal
        isOpen={isNewBillModalOpen}
        onClose={() => setIsNewBillModalOpen(false)}
        initialRemark={notes}
        onConfirm={handleConfirmNewBillRemark}
      />

      <A5PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setTimeout(() => barcodeInputRef.current?.focus(), 150);
        }}
        invoice={completedInvoice}
        shopProfile={shopProfile}
        printSettings={printSettings}
      />

      <AddCustomerModal
        isOpen={isAddCustomerModalOpen}
        onClose={() => setIsAddCustomerModalOpen(false)}
        initialName={customerName}
        onCustomerCreated={(cust) => {
          handleSelectCustomer(cust);
          onToast('success', `Client "${cust.name}" Saved!`, 'Added to client directory and selected.');
        }}
      />
    </div>
  );
};
