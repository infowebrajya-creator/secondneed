import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Plus, Package, Edit, Trash2, Download, Upload, 
  AlertTriangle, Eye, Power, ShieldCheck, Camera, Tag, Scan 
} from 'lucide-react';
import { useProductStore, STATIONERY_CATEGORIES } from '../../store/useProductStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { ProductDetailModal } from './ProductDetailModal';
import { BulkImportModal } from './BulkImportModal';
import { BarcodeGeneratorModal } from './BarcodeGeneratorModal';
import { PurchaseBillScannerModal } from '../inventory/PurchaseBillScannerModal';
import { CameraScannerModal } from '../common/CameraScannerModal';
import { playBeep, playError } from '../../utils/audio';
import type { Product, UnitType, GstRate, TaxType } from '../../types';
import { ProductSchema } from '../../utils/validation';
import { runProductsImportTestSuite, TestCaseResult } from '../../lib/importTester';

interface ProductsSectionProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
  isAddModalOpenFromExternal?: boolean;
  onCloseExternalModal?: () => void;
}

export const ProductsSection: React.FC<ProductsSectionProps> = ({ 
  onToast, 
  isAddModalOpenFromExternal = false, 
  onCloseExternalModal 
}) => {
  const { 
    products, isLoading, searchQuery, selectedCategory, statusFilter,
    setSearchQuery, setSelectedCategory, setStatusFilter, loadProducts, addProduct, updateProduct, 
    toggleProductActiveStatus, deleteProduct, adjustStock, seedDefaultProducts, commitBatchImport 
  } = useProductStore();

  const { shopProfile, loadSettings } = useSettingsStore();

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeTargetProduct, setBarcodeTargetProduct] = useState<Product | null>(null);
  
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockChangeQty, setStockChangeQty] = useState<number>(10);
  const [stockReason, setStockReason] = useState<string>('New Stock Purchase');
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'form' | 'catalog'>('form');

  // Form State
  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    category: 'Notebooks & Registers',
    packInfo: '1 Pcs',
    unit: 'Pcs' as UnitType,
    mrp: 50,
    purchaseRate: 35,
    saleRate: 45,
    hsnCode: '4820',
    gstRate: 12 as GstRate,
    taxType: 'inclusive' as TaxType,
    stockQty: 100,
    minStockLevel: 15,
    isActive: true
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadProducts();
    loadSettings();
  }, []);

  useEffect(() => {
    if (isAddModalOpenFromExternal) {
      handleOpenAddModal();
    }
  }, [isAddModalOpenFromExternal]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    const generatedSku = `SKU-${Date.now().toString().slice(-6)}`;
    setFormData({
      sku: generatedSku,
      barcode: '',
      name: '',
      category: 'Notebooks & Registers',
      packInfo: '1 Pcs',
      unit: 'Pcs',
      mrp: 50,
      purchaseRate: 35,
      saleRate: 45,
      hsnCode: '4820',
      gstRate: 12,
      taxType: 'inclusive',
      stockQty: 100,
      minStockLevel: 15,
      isActive: true
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setFormData({
      sku: prod.sku,
      barcode: prod.barcode,
      name: prod.name,
      category: prod.category,
      packInfo: prod.packInfo || '1 Pcs',
      unit: prod.unit,
      mrp: prod.mrp,
      purchaseRate: prod.purchaseRate,
      saleRate: prod.saleRate,
      hsnCode: prod.hsnCode,
      gstRate: prod.gstRate,
      taxType: prod.taxType,
      stockQty: prod.stockQty,
      minStockLevel: prod.minStockLevel,
      isActive: prod.isActive
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleBarcodeScanned = (scannedCode: string) => {
    const code = scannedCode.trim().replace(/[\s\r\n\t>]+/g, '');
    if (!code) return;

    if (scannerMode === 'form') {
      const existing = products.find(
        p => {
          const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
          return b && b === code.toLowerCase() && p.id !== editingProduct?.id;
        }
      );

      setFormData(prev => ({ ...prev, barcode: code }));
      setIsBarcodeScannerOpen(false);

      if (existing) {
        playError();
        setFormErrors(prev => ({
          ...prev,
          barcode: `⚠️ Barcode "${code}" is already assigned to "${existing.name}" (SKU: ${existing.sku}).`
        }));
        onToast('error', 'Duplicate Barcode', `Already assigned to "${existing.name}".`);
      } else {
        playBeep();
        setFormErrors(prev => {
          const next = { ...prev };
          delete next.barcode;
          return next;
        });
        onToast('success', 'Barcode Captured', `Company barcode "${code}" saved to item.`);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 200);
      }
    } else {
      // Catalog Quick-Scan: find existing product or pre-fill new product
      setIsBarcodeScannerOpen(false);
      const existing = products.find(
        p => {
          const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
          const s = (p.sku || '').trim().toLowerCase();
          return (b && b === code.toLowerCase()) || (s && s === code.toLowerCase());
        }
      );

      if (existing) {
        playBeep();
        setSearchQuery(code);
        setViewingProduct(existing);
        setIsDetailModalOpen(true);
        onToast('info', 'Product Found', `Showing details for "${existing.name}".`);
      } else {
        playBeep();
        setEditingProduct(null);
        const generatedSku = `SKU-${Date.now().toString().slice(-6)}`;
        setFormData({
          sku: generatedSku,
          barcode: code,
          name: '',
          category: 'Notebooks & Registers',
          packInfo: '1 Pcs',
          unit: 'Pcs',
          mrp: 50,
          purchaseRate: 35,
          saleRate: 45,
          hsnCode: '4820',
          gstRate: 12,
          taxType: 'inclusive',
          stockQty: 100,
          minStockLevel: 15,
          isActive: true
        });
        setFormErrors({});
        setIsModalOpen(true);
        onToast('success', 'New Item Barcode Scanned', `Scanned "${code}". Fill details to create product.`);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 250);
      }
    }
  };

  const handleBarcodeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = formData.barcode.trim();
      if (code) {
        const existing = products.find(
          p => p.barcode && p.barcode.toLowerCase().trim() === code.toLowerCase() && p.id !== editingProduct?.id
        );
        if (existing) {
          playError();
          setFormErrors(prev => ({
            ...prev,
            barcode: `⚠️ Barcode "${code}" is already assigned to "${existing.name}".`
          }));
          onToast('error', 'Duplicate Barcode', `Already assigned to "${existing.name}".`);
        } else {
          playBeep();
          setFormErrors(prev => {
            const next = { ...prev };
            delete next.barcode;
            return next;
          });
          onToast('success', 'Barcode Confirmed', `"${code}" ready.`);
          nameInputRef.current?.focus();
        }
      } else {
        nameInputRef.current?.focus();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = ProductSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        if (err.path[0]) errors[err.path[0].toString()] = err.message;
      });
      setFormErrors(errors);
      return;
    }

    // Check duplicate SKU/Barcode against existing
    const existingSku = products.find(p => p.sku.toLowerCase().trim() === formData.sku.toLowerCase().trim() && p.id !== editingProduct?.id);
    if (existingSku) {
      setFormErrors({ sku: `SKU "${formData.sku}" is already assigned to "${existingSku.name}".` });
      return;
    }

    const cleanBarcode = (formData.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '');
    if (cleanBarcode) {
      const existingBarcode = products.find(p => {
        const b = (p.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '').toLowerCase();
        return b === cleanBarcode.toLowerCase() && p.id !== editingProduct?.id;
      });
      if (existingBarcode) {
        setFormErrors({ barcode: `Barcode "${cleanBarcode}" is already assigned to "${existingBarcode.name}".` });
        return;
      }
    }

    const dataToSave = {
      ...formData,
      barcode: cleanBarcode
    };

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, dataToSave);
        onToast('success', 'Product Updated', `${formData.name} updated successfully.`);
      } else {
        await addProduct(dataToSave);
        onToast('success', 'Product Created', `${formData.name} added to catalog.`);
      }
      setIsModalOpen(false);
      onCloseExternalModal?.();
    } catch (err: any) {
      onToast('error', 'Failed to save product', err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      await deleteProduct(id);
      onToast('info', 'Product Deleted', `${name} removed.`);
    }
  };

  const handleSeed = async () => {
    const count = await seedDefaultProducts();
    onToast('success', 'Catalog Seeded', `Added ${count} popular retail products to catalog.`);
  };

  const handleStockAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockProduct) return;
    await adjustStock(stockProduct.id, stockChangeQty, stockReason);
    onToast('success', 'Stock Updated', `${stockProduct.name} stock adjusted by ${stockChangeQty > 0 ? '+' : ''}${stockChangeQty}`);
    setIsStockModalOpen(false);
  };

  const handleRunTestSuite = () => {
    const results = runProductsImportTestSuite(products);
    setTestResults(results);
    onToast('info', 'Import Test Suite Complete', 'Executed 6 validation tests on product catalog engine.');
  };

  const exportCSV = () => {
    const headers = ['ID', 'SKU', 'Barcode', 'ProductName', 'Category', 'PackInfo', 'Unit', 'MRP', 'PurchaseRate', 'SellingRate', 'HSNCode', 'GSTRate', 'TaxType', 'StockQuantity', 'LowStockThreshold', 'IsActive'];
    const rows = products.map(p => [
      p.id, `"${p.sku}"`, `"${p.barcode}"`, `"${p.name}"`, `"${p.category}"`, `"${p.packInfo}"`, p.unit, p.mrp, p.purchaseRate, p.saleRate, p.hsnCode, p.gstRate, p.taxType, p.stockQty, p.minStockLevel, p.isActive
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `WebRajya_Products_Catalog_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All Categories' || p.category === selectedCategory;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.isActive : !p.isActive);
      if (!matchesCategory || !matchesStatus) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.hsnCode.toLowerCase().includes(q);
    });
  }, [products, selectedCategory, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, statusFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-4.5rem)] gap-3 font-sans text-[#172B4D] pb-16 md:pb-0">
      {/* Top Header & Actions */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between bg-white border border-[#D8E1EC] rounded-xl p-3 sm:p-4 shadow-sm shrink-0 gap-3">
        <div>
          <h2 className="text-base font-extrabold text-[#172B4D] flex items-center gap-2">
            <Package className="w-5 h-5 text-[#2563EB]" /> Products & Retail Catalog ({products.length} Items)
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">Manage SKU codes, barcodes, MRP/rates, GST slabs, and bulk import spreadsheets</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
          <button
            onClick={handleRunTestSuite}
            className="px-2.5 py-1.5 bg-[#F3E8FF] hover:bg-[#E9D5FF] text-[#7E22CE] border border-[#E9D5FF] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Run 6 import validation safety tests"
          >
            <ShieldCheck className="w-4 h-4 text-[#7E22CE]" /> Tests
          </button>

          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-2.5 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Scan purchase bill with AI camera"
          >
            <Camera className="w-4 h-4 text-[#2563EB]" /> Scan Bill
          </button>

          <button
            onClick={() => {
              setScannerMode('catalog');
              setIsBarcodeScannerOpen(true);
            }}
            className="px-2.5 py-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Scan item barcode to view or quickly create"
          >
            <Scan className="w-4 h-4 text-[#059669]" /> Scan Item
          </button>

          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="px-2.5 py-1.5 bg-[#DBEAFE] hover:bg-[#BFDBFE] text-[#123B70] border border-[#BFDBFE] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" /> Import
          </button>

          <button
            onClick={exportCSV}
            className="px-2.5 py-1.5 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export
          </button>

          <button
            onClick={() => {
              setBarcodeTargetProduct(null);
              setIsBarcodeModalOpen(true);
            }}
            className="px-2.5 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Generate and print barcode stickers & price labels"
          >
            <Tag className="w-4 h-4 text-[#2563EB]" /> Labels
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Test Suite Results Banner */}
      {testResults && (
        <div className="p-3 bg-[#F3E8FF] border border-[#E9D5FF] rounded-xl space-y-2 shrink-0 text-xs">
          <div className="flex items-center justify-between font-bold text-[#7E22CE]">
            <span>Automated Import Test Suite Results ({testResults.filter(t => t.passed).length}/{testResults.length} Passed)</span>
            <button onClick={() => setTestResults(null)} className="text-[#64748B] hover:text-[#172B4D] text-xs font-semibold cursor-pointer">Dismiss</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            {testResults.map((t, i) => (
              <div key={i} className="p-2 bg-white rounded border border-[#D8E1EC] flex items-center justify-between">
                <span className="truncate pr-1 text-[#172B4D] font-medium">{t.testName}</span>
                <Badge variant={t.passed ? 'emerald' : 'rose'}>{t.passed ? `${t.executionTimeMs}ms` : 'FAIL'}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white border border-[#D8E1EC] rounded-xl p-3 shrink-0 shadow-sm space-y-2.5">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 md:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#64748B]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by Product Name, SKU, Barcode, HSN Code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-12 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] shadow-xs font-mono"
            />
            <button
              type="button"
              onClick={() => {
                setScannerMode('catalog');
                setIsBarcodeScannerOpen(true);
              }}
              className="absolute right-1.5 top-1.5 p-1 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50 rounded-md transition-colors"
              title="Scan item barcode with camera"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="col-span-6 md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-medium"
            >
              {STATIONERY_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="col-span-6 md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-medium"
            >
              <option value="all">All Statuses (Active & Inactive)</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Mobile Horizontal Quick Category Touch Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto touch-scroll pb-0.5 no-scrollbar">
          {STATIONERY_CATEGORIES.slice(0, 8).map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#172B4D] border border-[#E2E8F0]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Responsive Mobile Cards + Desktop Dense Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* 1. MOBILE PRODUCT CARDS VIEW (Visible on mobile screens < 768px) */}
        <div className="md:hidden flex-1 overflow-y-auto space-y-2.5 pb-20">
          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-[#D8E1EC] rounded-2xl p-8 text-center text-[#64748B] shadow-xs">
              <Package className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
              <div className="font-bold text-[#172B4D]">No products found</div>
              <button onClick={handleSeed} className="mt-2 text-xs text-[#2563EB] underline font-bold cursor-pointer">
                Seed Sample Catalog Items
              </button>
            </div>
          ) : (
            paginatedProducts.map((prod) => {
              const isLowStock = prod.stockQty <= prod.minStockLevel;
              const isOut = prod.stockQty <= 0;
              return (
                <div
                  key={prod.id}
                  className={`bg-white border border-[#D8E1EC] rounded-xl p-3 shadow-xs space-y-2 transition-all ${
                    !prod.isActive ? 'opacity-60 bg-[#F8FAFC]' : ''
                  }`}
                >
                  {/* Card Title & Category */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-[#172B4D] leading-snug">
                        {prod.name}
                      </div>
                      <div className="text-[10px] text-[#64748B] font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[#2563EB] font-bold">{prod.sku}</span>
                        {prod.barcode && <span>• {prod.barcode}</span>}
                        <span>• {prod.category}</span>
                        <span>• {prod.gstRate}% GST</span>
                      </div>
                    </div>

                    <Badge variant={prod.isActive ? 'emerald' : 'rose'}>
                      {prod.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </div>

                  {/* Pricing & Stock Row */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-black text-[#15803D] font-mono">
                          ₹{prod.saleRate.toFixed(2)}
                        </span>
                        {prod.mrp > prod.saleRate && (
                          <span className="text-[10px] text-[#94A3B8] line-through font-mono">
                            MRP ₹{prod.mrp.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#64748B] font-mono">
                        Cost: ₹{prod.purchaseRate.toFixed(2)}
                      </span>
                    </div>

                    {/* Stock Pill & Quick Adjust Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setStockProduct(prod);
                        setStockChangeQty(10);
                        setIsStockModalOpen(true);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                        isOut
                          ? 'bg-[#FEE2E2] text-[#B91C1C] border border-[#FCA5A5]'
                          : isLowStock
                          ? 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                          : 'bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]'
                      }`}
                      title="Adjust Stock"
                    >
                      <span>{prod.stockQty} {prod.unit}</span>
                      {isLowStock && <AlertTriangle className="w-3 h-3 text-[#B45309]" />}
                      <span className="text-[10px] opacity-70 underline ml-0.5">+Edit</span>
                    </button>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-dashed border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setBarcodeTargetProduct(prod); setIsBarcodeModalOpen(true); }}
                      className="px-2 py-1 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Print Barcode Labels"
                    >
                      <Tag className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Tag</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViewingProduct(prod); setIsDetailModalOpen(true); }}
                      className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#DBEAFE] text-[#172B4D] rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(prod)}
                      className="px-2.5 py-1 bg-[#DBEAFE] hover:bg-[#BFDBFE] text-[#123B70] rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleProductActiveStatus(prod.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        prod.isActive ? 'text-[#64748B] hover:text-[#B91C1C] hover:bg-red-50' : 'text-[#15803D] bg-green-50'
                      }`}
                      title={prod.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. DESKTOP DENSE TABLE VIEW (Visible on screens >= 768px) */}
        <div className="hidden md:flex flex-1 bg-white border border-[#D8E1EC] rounded-xl overflow-hidden flex-col min-h-0 shadow-sm">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#F1F5F9] text-[#172B4D] font-bold uppercase sticky top-0 border-b border-[#D8E1EC] text-[11px]">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-center">GST %</th>
                  <th className="p-3 text-right">MRP</th>
                  <th className="p-3 text-right">Purchase</th>
                  <th className="p-3 text-right">Selling Rate</th>
                  <th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-[#64748B]">
                      <Package className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                      <div className="font-bold text-[#172B4D]">No products found matching criteria</div>
                      <button onClick={handleSeed} className="mt-2 text-xs text-[#2563EB] underline font-bold cursor-pointer">Seed Sample Catalog Items</button>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((prod) => {
                    const isLowStock = prod.stockQty <= prod.minStockLevel;
                    return (
                      <tr key={prod.id} className={`hover:bg-[#F0F6FF] transition-colors ${!prod.isActive ? 'opacity-60 bg-[#F5F9FF]' : ''}`}>
                        <td className="p-3 font-mono font-bold text-[#2563EB]">{prod.sku}</td>
                        <td className="p-3 font-mono text-[#64748B]">{prod.barcode || '-'}</td>
                        <td className="p-3 font-semibold text-[#172B4D]">
                          {prod.name}
                          <div className="text-[10px] text-[#64748B] font-mono mt-0.5 font-normal">{prod.packInfo || '1 Pcs'} • Tax: {prod.taxType.toUpperCase()}</div>
                        </td>
                        <td className="p-3 text-[#64748B] text-[11px]">{prod.category}</td>
                        <td className="p-3 text-center font-mono">
                          <Badge variant="cyan">{prod.gstRate}%</Badge>
                        </td>
                        <td className="p-3 text-right font-mono text-[#64748B] line-through">₹{prod.mrp}</td>
                        <td className="p-3 text-right font-mono text-[#64748B]">₹{prod.purchaseRate}</td>
                        <td className="p-3 text-right font-mono font-extrabold text-[#15803D]">₹{prod.saleRate}</td>
                        <td className="p-3 text-right font-mono">
                          <button
                            onClick={() => {
                              setStockProduct(prod);
                              setStockChangeQty(10);
                              setIsStockModalOpen(true);
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                              isLowStock 
                                ? 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] font-bold' 
                                : 'bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC]'
                            }`}
                            title="Click to adjust stock"
                          >
                            {prod.stockQty} {prod.unit}
                            {isLowStock && <AlertTriangle className="w-3 h-3 text-[#B45309]" />}
                          </button>
                        </td>
                        <td className="p-3 text-center font-mono">
                          <Badge variant={prod.isActive ? 'emerald' : 'rose'}>
                            {prod.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setBarcodeTargetProduct(prod); setIsBarcodeModalOpen(true); }}
                              className="p-1 text-[#64748B] hover:text-[#2563EB] rounded hover:bg-[#DBEAFE] transition-colors cursor-pointer"
                              title="Print Barcode Labels"
                            >
                              <Tag className="w-4 h-4 text-[#2563EB]" />
                            </button>
                            <button
                              onClick={() => { setViewingProduct(prod); setIsDetailModalOpen(true); }}
                              className="p-1 text-[#64748B] hover:text-[#2563EB] rounded hover:bg-[#DBEAFE] transition-colors cursor-pointer"
                              title="View Detail"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(prod)}
                              className="p-1 text-[#64748B] hover:text-[#2563EB] rounded hover:bg-[#DBEAFE] transition-colors cursor-pointer"
                              title="Edit Product"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleProductActiveStatus(prod.id)}
                              className={`p-1 rounded hover:bg-[#F5F9FF] transition-colors cursor-pointer ${prod.isActive ? 'text-[#64748B] hover:text-[#B91C1C]' : 'text-[#64748B] hover:text-[#15803D]'}`}
                              title={prod.isActive ? 'Deactivate Product' : 'Activate Product'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Clean Pagination Bar */}
          {filteredProducts.length > pageSize && (
            <div className="bg-white border-t border-[#D8E1EC] px-3.5 py-2 flex items-center justify-between text-xs text-[#64748B] shrink-0 rounded-b-xl">
              <div>
                Showing <span className="font-bold text-[#172B4D]">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-bold text-[#172B4D]">{Math.min(currentPage * pageSize, filteredProducts.length)}</span> of{' '}
                <span className="font-bold text-[#172B4D]">{filteredProducts.length}</span> items
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-[#D8E1EC] font-semibold bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F5F9FF] text-[#172B4D] transition-colors cursor-pointer"
                >
                  Prev
                </button>
                <span className="px-2 font-mono font-bold text-[#172B4D]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-[#D8E1EC] font-semibold bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F5F9FF] text-[#172B4D] transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        product={viewingProduct}
        onEdit={handleOpenEditModal}
        onToggleActive={toggleProductActiveStatus}
      />

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        existingProducts={products}
        onCommitImport={commitBatchImport}
        onToast={onToast}
      />

      {/* AI Purchase Bill Scanner Modal */}
      <PurchaseBillScannerModal
        isOpen={isScannerOpen}
        onClose={() => {
          setIsScannerOpen(false);
          loadProducts(true);
        }}
        onToast={onToast}
      />

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); onCloseExternalModal?.(); }}
        title={editingProduct ? 'Edit Product Details' : 'Add New Product'}
        subtitle="Specify SKU, barcode, MRP, rates, GST tax slab & stock alert level"
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">SKU / Item Code *</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#2563EB] font-bold focus:outline-none focus:border-[#2563EB]"
                placeholder="e.g. CLM-NB-172"
              />
              {formErrors.sku && <p className="text-[11px] text-[#B91C1C] font-mono mt-0.5">{formErrors.sku}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-[#172B4D]">
                  Company / Item Barcode
                </label>
                <span className="text-[10px] text-[#64748B] font-medium hidden sm:inline">
                  EAN / UPC / Box code
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  onKeyDown={handleBarcodeInputKeyDown}
                  className="w-full pl-3 pr-20 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB] transition-colors"
                  placeholder="e.g. 8901030678901"
                />
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('form');
                    setIsBarcodeScannerOpen(true);
                  }}
                  className="absolute right-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="Scan company barcode on item using camera"
                >
                  <Camera className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Scan</span>
                </button>
              </div>
              {formErrors.barcode ? (
                <p className="text-[11px] text-[#B91C1C] font-mono mt-0.5">{formErrors.barcode}</p>
              ) : (
                <p className="text-[10px] text-[#64748B] mt-0.5">
                  Point camera or zap with USB scanner to capture
                </p>
              )}
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Product Name *</label>
              <input
                ref={nameInputRef}
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-bold"
                placeholder="e.g. Classmate Notebook A4 200 Pgs"
              />
              {formErrors.name && <p className="text-[11px] text-[#B91C1C] font-mono mt-0.5">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              >
                {STATIONERY_CATEGORIES.filter(c => c !== 'All Categories').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Pack Info</label>
              <input
                type="text"
                value={formData.packInfo}
                onChange={(e) => setFormData({ ...formData, packInfo: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                placeholder="e.g. Pack of 10, 500 Sheets"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Measurement Unit *</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value as UnitType })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              >
                {['Pcs', 'Pkt', 'Box', 'Dozen', 'Ream', 'Set', 'Roll', 'Pad'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">MRP (Maximum Retail Price) ₹</label>
              <input
                type="number"
                step="0.01"
                value={formData.mrp}
                onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Purchase Price ₹</label>
              <input
                type="number"
                step="0.01"
                value={formData.purchaseRate}
                onChange={(e) => setFormData({ ...formData, purchaseRate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Selling Rate ₹ *</label>
              <input
                type="number"
                step="0.01"
                value={formData.saleRate}
                onChange={(e) => setFormData({ ...formData, saleRate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#15803D] font-bold focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">HSN Code</label>
              <input
                type="text"
                value={formData.hsnCode}
                onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                placeholder="e.g. 4820"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">GST Tax Slab *</label>
              <select
                value={formData.gstRate}
                onChange={(e) => setFormData({ ...formData, gstRate: parseInt(e.target.value) as GstRate })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              >
                {[0, 5, 12, 18, 28].map(g => (
                  <option key={g} value={g}>{g}% GST</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Initial Stock Qty</label>
              <input
                type="number"
                value={formData.stockQty}
                onChange={(e) => setFormData({ ...formData, stockQty: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Low Stock Threshold</label>
              <input
                type="number"
                value={formData.minStockLevel}
                onChange={(e) => setFormData({ ...formData, minStockLevel: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[#D8E1EC]">
            <button
              type="button"
              onClick={() => { setIsModalOpen(false); onCloseExternalModal?.(); }}
              className="px-4 py-2 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Stock Adjustment Modal */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
        title={`Adjust Stock - ${stockProduct?.name}`}
        subtitle="Add incoming purchase stock or record physical stock adjustments"
        maxWidth="md"
      >
        {stockProduct && (
          <form onSubmit={handleStockAdjustSubmit} className="space-y-4 font-sans text-xs">
            <div className="p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg space-y-1">
              <div>Current Stock: <strong className="text-[#15803D] font-mono">{stockProduct.stockQty} {stockProduct.unit}</strong></div>
              <div>Min Alert Level: <span className="text-[#B45309] font-mono">{stockProduct.minStockLevel} {stockProduct.unit}</span></div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Quantity Change (Use + to add, - to deduct)</label>
              <input
                type="number"
                value={stockChangeQty}
                onChange={(e) => setStockChangeQty(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-sm font-mono text-[#172B4D] font-bold focus:outline-none focus:border-[#2563EB]"
              />
              <p className="text-[11px] text-[#64748B] mt-1">
                New stock will be: <strong className="text-[#2563EB] font-mono">{stockProduct.stockQty + stockChangeQty} {stockProduct.unit}</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172B4D] mb-1">Reason / Reference Note</label>
              <input
                type="text"
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-xs text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                placeholder="e.g. Purchase Invoice #451, Stock Audit"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#D8E1EC]">
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#15803D] hover:bg-[#166534] text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Update Stock Now
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Barcode Sticker & Label Generator Modal */}
      <BarcodeGeneratorModal
        isOpen={isBarcodeModalOpen}
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setBarcodeTargetProduct(null);
        }}
        products={products}
        initialProduct={barcodeTargetProduct}
        shopProfile={shopProfile}
        onToast={onToast}
      />

      {/* Item Barcode Camera Scanner */}
      <CameraScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
};
