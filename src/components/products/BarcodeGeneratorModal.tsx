import React, { useState, useMemo, useRef } from 'react';
import { 
  Printer, X, Tag, Search, Plus, Trash2, CheckCircle2, 
  Settings2, Copy, Sliders, LayoutGrid, Check, Sparkles
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Product, ShopProfile } from '../../types';
import { encodeCode128 } from '../../utils/barcode128';
import { formatCurrency } from '../../utils/formatters';

export type StickerLayout = 'A4-24' | 'A4-40' | 'Thermal-50x25';

interface StickerItem {
  product: Product;
  count: number;
}

interface BarcodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialProduct?: Product | null;
  initialMode?: 'single' | 'all';
  shopProfile: ShopProfile;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const BarcodeGeneratorModal: React.FC<BarcodeGeneratorModalProps> = ({
  isOpen,
  onClose,
  products,
  initialProduct,
  initialMode,
  shopProfile,
  onToast
}) => {
  const [selectedLayout, setSelectedLayout] = useState<StickerLayout>('A4-24');
  const [searchQuery, setSearchQuery] = useState('');
  const [stickerItems, setStickerItems] = useState<StickerItem[]>(() => {
    if (initialProduct) {
      return [{ product: initialProduct, count: 24 }];
    }
    const active = products.filter(p => p.isActive !== false);
    if (active.length > 0) {
      return active.map(p => ({ product: p, count: 1 }));
    }
    return [];
  });

  // Display toggles
  const [showShopName, setShowShopName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showMrp, setShowMrp] = useState(true);
  const [showSalePrice, setShowSalePrice] = useState(true);
  const [showCodeText, setShowCodeText] = useState(true);

  // Sync if initialProduct or modal open state changes
  React.useEffect(() => {
    if (isOpen) {
      if (initialProduct) {
        setStickerItems([{ product: initialProduct, count: 24 }]);
      } else {
        const active = products.filter(p => p.isActive !== false);
        if (active.length <= 24) {
          setSelectedLayout('A4-24');
        } else if (active.length <= 40) {
          setSelectedLayout('A4-40');
        }
        setStickerItems(active.map(p => ({ product: p, count: 1 })));
      }
    }
  }, [isOpen, initialProduct, products]);

  // Product search picker results
  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term))
      )
      .slice(0, 8);
  }, [products, searchQuery]);

  const handleAddProduct = (prod: Product) => {
    setStickerItems(prev => {
      const exists = prev.find(item => item.product.id === prod.id);
      if (exists) {
        return prev.map(item => 
          item.product.id === prod.id ? { ...item, count: item.count + 12 } : item
        );
      }
      return [...prev, { product: prod, count: 12 }];
    });
    setSearchQuery('');
  };

  const handleUpdateCount = (id: string, count: number) => {
    const validCount = Math.max(1, count || 1);
    setStickerItems(prev => prev.map(item => item.product.id === id ? { ...item, count: validCount } : item));
  };

  const handleRemoveItem = (id: string) => {
    setStickerItems(prev => prev.filter(item => item.product.id !== id));
  };

  const totalStickerCount = useMemo(() => {
    return stickerItems.reduce((acc, it) => acc + it.count, 0);
  }, [stickerItems]);

  // Flattened stickers list for preview & printing
  const flatStickers = useMemo(() => {
    const list: Product[] = [];
    stickerItems.forEach(item => {
      for (let i = 0; i < item.count; i++) {
        list.push(item.product);
      }
    });
    return list;
  }, [stickerItems]);

  // Page estimate helper
  const pageEstimate = useMemo(() => {
    if (selectedLayout === 'Thermal-50x25') {
      return `${totalStickerCount} Labels (Roll)`;
    }
    const perPage = selectedLayout === 'A4-40' ? 40 : 24;
    const pages = Math.ceil(totalStickerCount / perPage);
    if (pages <= 1) {
      return `${totalStickerCount} Labels (1 Page Sheet)`;
    }
    return `${totalStickerCount} Labels (${pages} Pages)`;
  }, [selectedLayout, totalStickerCount]);

  // Print Barcode Stickers via dedicated print window (reusable helper)
  const executePrint = (itemsToPrint: StickerItem[] = stickerItems, layoutToUse: StickerLayout = selectedLayout) => {
    const list: Product[] = [];
    itemsToPrint.forEach(item => {
      for (let i = 0; i < item.count; i++) {
        list.push(item.product);
      }
    });

    if (list.length === 0) {
      onToast('info', 'No Stickers', 'Please add at least one product sticker to print.');
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      onToast('error', 'Popup Blocked', 'Please allow popups to print barcode stickers.');
      return;
    }

    let pageStyles = '';
    let gridStyles = '';
    let stickerStyles = '';

    if (layoutToUse === 'A4-24') {
      // 3 cols x 8 rows on A4 (70mm x 37mm per label)
      pageStyles = `@page { size: A4 portrait; margin: 4mm 5mm; }`;
      gridStyles = `
        display: grid;
        grid-template-columns: repeat(3, 70mm);
        grid-auto-rows: 37mm;
        gap: 0mm 2.5mm;
        width: 210mm;
      `;
      stickerStyles = `
        width: 70mm;
        height: 37mm;
        box-sizing: border-box;
        padding: 2.5mm 3mm;
        page-break-inside: avoid;
      `;
    } else if (layoutToUse === 'A4-40') {
      // 4 cols x 10 rows on A4 (52.5mm x 29.7mm per label)
      pageStyles = `@page { size: A4 portrait; margin: 3mm 4mm; }`;
      gridStyles = `
        display: grid;
        grid-template-columns: repeat(4, 50mm);
        grid-auto-rows: 29.7mm;
        gap: 0mm 2mm;
        width: 210mm;
      `;
      stickerStyles = `
        width: 50mm;
        height: 29.7mm;
        box-sizing: border-box;
        padding: 1.5mm 2mm;
        page-break-inside: avoid;
      `;
    } else {
      // Direct Thermal Roll (50mm x 25mm)
      pageStyles = `@page { size: 50mm 25mm; margin: 0; }`;
      gridStyles = `display: block; width: 50mm;`;
      stickerStyles = `
        width: 50mm;
        height: 25mm;
        box-sizing: border-box;
        padding: 1.5mm 2mm;
        page-break-after: always;
      `;
    }

    const stickersHtml = list.map(prod => {
      const barcodeValue = (prod.barcode && prod.barcode.trim()) || prod.sku;
      const encoded = encodeCode128(barcodeValue);
      const svgBars = encoded.bars.map(b => 
        `<rect x="${b.x}" y="0" width="${b.width}" height="32" fill="#000" />`
      ).join('');

      return `
        <div class="sticker-card" style="${stickerStyles}">
          ${showShopName ? `<div class="store-name">${shopProfile.shopName || 'WEBRAJYA'}</div>` : ''}
          ${showProductName ? `<div class="product-name">${prod.name}</div>` : ''}
          
          <div class="barcode-wrapper">
            <svg viewBox="0 0 ${encoded.totalWidth} 32" preserveAspectRatio="none" style="width: 100%; height: 26px; display: block;">
              ${svgBars}
            </svg>
          </div>

          ${showCodeText ? `<div class="barcode-text font-mono">${barcodeValue}</div>` : ''}

          <div class="price-row">
            ${showMrp ? `<span class="mrp">MRP: ₹${prod.mrp.toFixed(2)}</span>` : ''}
            ${showSalePrice ? `<span class="sale">OUR: ₹${prod.saleRate.toFixed(2)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Barcode Stickers - WebRajya Invoice</title>
        <style>
          ${pageStyles}
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
          body { 
            font-family: system-ui, -apple-system, sans-serif; 
            background: #fff; 
            color: #000;
          }
          .sticker-grid {
            ${gridStyles}
          }
          .sticker-card {
            border: 1px dashed #e2e8f0;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            overflow: hidden;
            background: #fff;
          }
          .store-name {
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          .product-name {
            font-size: 9px;
            font-weight: 700;
            line-height: 1.1;
            max-height: 19px;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
            margin-top: 1px;
          }
          .barcode-wrapper {
            width: 90%;
            margin: 1.5px auto;
          }
          .barcode-text {
            font-size: 8px;
            font-family: monospace;
            font-weight: 600;
            line-height: 1;
            letter-spacing: 1px;
          }
          .price-row {
            display: flex;
            justify-content: center;
            align-items: baseline;
            gap: 6px;
            width: 100%;
            margin-top: 1px;
          }
          .mrp {
            font-size: 8px;
            color: #444;
            text-decoration: line-through;
          }
          .sale {
            font-size: 10px;
            font-weight: 900;
            color: #000;
          }
          @media print {
            .sticker-card {
              border: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="sticker-grid">
          ${stickersHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(fullHtml);
    printWin.document.close();
  };

  const handlePrint = () => {
    executePrint(stickerItems, selectedLayout);
  };

  // 1-Click Load All Catalog Products (1 Label Each) with smart 1-page layout auto-selection
  const handleLoadAllProducts = (autoPrint = false) => {
    const activeProducts = products.filter(p => p.isActive !== false);
    if (activeProducts.length === 0) {
      onToast('info', 'No Products', 'Your product catalog has no active products.');
      return;
    }

    let layoutToUse: StickerLayout = selectedLayout;
    if (selectedLayout !== 'Thermal-50x25') {
      if (activeProducts.length <= 24) {
        layoutToUse = 'A4-24';
        setSelectedLayout('A4-24');
      } else if (activeProducts.length <= 40) {
        layoutToUse = 'A4-40';
        setSelectedLayout('A4-40');
      }
    }

    const items: StickerItem[] = activeProducts.map(prod => ({
      product: prod,
      count: 1
    }));

    setStickerItems(items);
    onToast(
      'success',
      'All Products Loaded',
      `Queued 1 label each for ${activeProducts.length} product(s)${activeProducts.length <= (layoutToUse === 'A4-40' ? 40 : 24) ? ' (fits 1 page)' : ''}.`
    );

    if (autoPrint) {
      setTimeout(() => {
        executePrint(items, layoutToUse);
      }, 150);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Barcode Sticker & Price Label Generator"
      subtitle="Print ready-to-peel barcode stickers for retail shelves & stationary items"
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Top Controls: Layout Selector & Print Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#172B4D]">Label Format:</span>
            <div className="inline-flex bg-white border border-[#D8E1EC] p-0.5 rounded-lg text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedLayout('A4-24')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedLayout === 'A4-24' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> A4 - 24 Stickers (3x8)
              </button>
              <button
                type="button"
                onClick={() => setSelectedLayout('A4-40')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedLayout === 'A4-40' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> A4 - 40 Stickers (4x10)
              </button>
              <button
                type="button"
                onClick={() => setSelectedLayout('Thermal-50x25')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedLayout === 'Thermal-50x25' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172B4D]'
                }`}
              >
                <Tag className="w-3.5 h-3.5" /> 50x25mm Thermal Roll
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#15803D] bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              {pageEstimate}
            </span>
            <button
              type="button"
              onClick={handlePrint}
              disabled={flatStickers.length === 0}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Labels
            </button>
          </div>
        </div>

        {/* Quick Presets Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200/80 rounded-xl shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-[#1E3A8A] flex items-center gap-1.5 shrink-0">
              <Sparkles className="w-4 h-4 text-amber-500" /> 1-Click Options:
            </span>
            <button
              type="button"
              onClick={() => handleLoadAllProducts(false)}
              className="px-3 py-1.5 bg-white hover:bg-blue-50 text-[#1D4ED8] border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
              title="Add 1 label for each product in your catalog into the sheet"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
              <span>All Products (1 Label Each)</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadAllProducts(true)}
              className="px-3.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all shadow-xs hover:shadow-md active:scale-95 cursor-pointer"
              title="1-Click: Load 1 label per product and open print window immediately"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>1-Click Print All (1 Page Sheet)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {stickerItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStickerItems([]);
                  onToast('info', 'Queue Cleared', 'Removed all items from sticker queue.');
                }}
                className="text-xs text-[#64748B] hover:text-red-600 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-white/60 transition-colors cursor-pointer"
                title="Clear all queued items"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Queue
              </button>
            )}
          </div>
        </div>

        {/* Content Columns: Configuration & Products vs Live Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column (5 Cols): Product Picker & Display Switches */}
          <div className="lg:col-span-5 space-y-3">
            {/* Display Switches */}
            <div className="p-3 bg-white border border-[#D8E1EC] rounded-xl shadow-xs space-y-2">
              <span className="text-[11px] font-extrabold text-[#172B4D] uppercase tracking-wider block">
                Label Content Options
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-[#172B4D]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showShopName}
                    onChange={e => setShowShopName(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2563EB] rounded cursor-pointer"
                  />
                  <span>Shop Name</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={e => setShowProductName(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2563EB] rounded cursor-pointer"
                  />
                  <span>Product Title</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showMrp}
                    onChange={e => setShowMrp(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2563EB] rounded cursor-pointer"
                  />
                  <span>MRP Strike-off</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSalePrice}
                    onChange={e => setShowSalePrice(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2563EB] rounded cursor-pointer"
                  />
                  <span>Selling Price</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer col-span-2">
                  <input
                    type="checkbox"
                    checked={showCodeText}
                    onChange={e => setShowCodeText(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2563EB] rounded cursor-pointer"
                  />
                  <span>Barcode Text / SKU Code</span>
                </label>
              </div>
            </div>

            {/* Product Search Add Box */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
              <input
                type="text"
                placeholder="Search products to add to sticker sheet..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D8E1EC] rounded-xl text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] shadow-xs"
              />

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-10 mt-1 bg-white border border-[#D8E1EC] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-[#E2E8F0]">
                  {searchResults.map(prod => (
                    <div
                      key={prod.id}
                      onClick={() => handleAddProduct(prod)}
                      className="p-2 hover:bg-[#F5F9FF] cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-[#172B4D] truncate">{prod.name}</div>
                        <div className="text-[10px] text-[#64748B] font-mono">
                          SKU: {prod.sku} | Barcode: {prod.barcode || 'None'} | ₹{prod.saleRate}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-2 py-1 bg-[#2563EB] text-white rounded text-[11px] font-bold shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Products List & Quantity */}
            <div className="bg-white border border-[#D8E1EC] rounded-xl overflow-hidden shadow-xs">
              <div className="p-2.5 bg-[#F5F9FF] border-b border-[#D8E1EC] flex items-center justify-between">
                <span className="text-xs font-bold text-[#172B4D]">Queue Products ({stickerItems.length})</span>
                <span className="text-[11px] text-[#64748B]">Copies per item</span>
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0]">
                {stickerItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#64748B]">
                    No items selected. Search and add products above.
                  </div>
                ) : (
                  stickerItems.map(item => (
                    <div key={item.product.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#172B4D] truncate">{item.product.name}</div>
                        <div className="text-[10px] text-[#64748B] font-mono">
                          {item.product.barcode || item.product.sku} | MRP: ₹{item.product.mrp}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={item.count}
                          onChange={e => handleUpdateCount(item.product.id, parseInt(e.target.value, 10))}
                          className="w-16 px-2 py-1 border border-[#D8E1EC] rounded-lg text-center font-bold font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.product.id)}
                          className="p-1 text-[#EF4444] hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column (7 Cols): Live Preview Canvas */}
          <div className="lg:col-span-7 bg-[#F1F5F9] border border-[#D8E1EC] rounded-xl p-3 flex flex-col shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-[#172B4D] uppercase tracking-wider">
                Live Print Layout Preview ({selectedLayout})
              </span>
              <span className="text-[11px] text-[#64748B]">
                Showing first {Math.min(12, flatStickers.length)} of {flatStickers.length}
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-[#CBD5E1] shadow-xs max-h-[460px] overflow-y-auto">
              {flatStickers.length === 0 ? (
                <div className="py-12 text-center text-[#64748B] text-xs">
                  Select products to preview sticker sheet layout.
                </div>
              ) : (
                <div 
                  className={`grid gap-2 ${
                    selectedLayout === 'A4-40' 
                      ? 'grid-cols-2 sm:grid-cols-4' 
                      : selectedLayout === 'Thermal-50x25'
                      ? 'grid-cols-1 sm:grid-cols-2 max-w-sm mx-auto'
                      : 'grid-cols-2 sm:grid-cols-3'
                  }`}
                >
                  {flatStickers.slice(0, 18).map((prod, idx) => {
                    const code = (prod.barcode && prod.barcode.trim()) || prod.sku;
                    const encoded = encodeCode128(code);
                    return (
                      <div 
                        key={idx} 
                        className="border border-dashed border-[#CBD5E1] p-2 rounded flex flex-col justify-between items-center text-center bg-white shadow-2xs min-h-[90px]"
                      >
                        {showShopName && (
                          <div className="text-[8px] font-extrabold uppercase text-[#172B4D] truncate w-full">
                            {shopProfile.shopName || 'WEBRAJYA'}
                          </div>
                        )}
                        {showProductName && (
                          <div className="text-[9px] font-bold text-[#172B4D] truncate w-full leading-tight">
                            {prod.name}
                          </div>
                        )}

                        <div className="w-full my-1">
                          <svg 
                            viewBox={`0 0 ${encoded.totalWidth} 32`} 
                            preserveAspectRatio="none" 
                            className="w-full h-6 block"
                          >
                            {encoded.bars.map((b, bi) => (
                              <rect key={bi} x={b.x} y="0" width={b.width} height="32" fill="#000" />
                            ))}
                          </svg>
                        </div>

                        {showCodeText && (
                          <div className="text-[8px] font-mono font-bold text-[#64748B] tracking-wider">
                            {code}
                          </div>
                        )}

                        <div className="flex items-baseline justify-center gap-1.5 w-full mt-0.5">
                          {showMrp && (
                            <span className="text-[8px] line-through text-[#94A3B8]">
                              ₹{prod.mrp}
                            </span>
                          )}
                          {showSalePrice && (
                            <span className="text-[10px] font-black text-[#172B4D]">
                              ₹{prod.saleRate}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
