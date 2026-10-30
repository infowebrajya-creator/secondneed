import React, { useState, useMemo } from 'react';
import { 
  PackageCheck, AlertTriangle, Send, Download, Printer, 
  Trash2, Plus, Search, CheckCircle2, Phone, Building2 
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Product, ShopProfile } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface ReorderItem {
  product: Product;
  orderQty: number;
}

interface ReorderAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  shopProfile: ShopProfile;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const ReorderAssistantModal: React.FC<ReorderAssistantModalProps> = ({
  isOpen,
  onClose,
  products,
  shopProfile,
  onToast
}) => {
  const [vendorName, setVendorName] = useState('Clothing Wholesaler / Distributor');
  const [vendorMobile, setVendorMobile] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Initial low stock products
  const [orderItems, setOrderItems] = useState<ReorderItem[]>([]);

  // Populate low-stock items whenever modal opens
  React.useEffect(() => {
    if (isOpen) {
      const lowItems = products
        .filter(p => p.isActive && p.stockQty <= p.minStockLevel)
        .map(p => {
          // Suggested formula: double the minimum stock level minus current stock
          const suggested = Math.max(1, (p.minStockLevel * 2) - Math.max(0, p.stockQty));
          return { product: p, orderQty: suggested };
        });
      setOrderItems(lowItems);
    }
  }, [isOpen, products]);

  // Product search to add items that aren't strictly low stock
  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
      )
      .slice(0, 6);
  }, [products, searchQuery]);

  const handleAddItem = (prod: Product) => {
    setOrderItems(prev => {
      const exists = prev.find(item => item.product.id === prod.id);
      if (exists) {
        return prev.map(item =>
          item.product.id === prod.id ? { ...item, orderQty: item.orderQty + 10 } : item
        );
      }
      return [...prev, { product: prod, orderQty: Math.max(10, prod.minStockLevel || 10) }];
    });
    setSearchQuery('');
  };

  const handleUpdateQty = (id: string, qty: number) => {
    const validQty = Math.max(1, qty || 1);
    setOrderItems(prev => prev.map(item => item.product.id === id ? { ...item, orderQty: validQty } : item));
  };

  const handleRemoveItem = (id: string) => {
    setOrderItems(prev => prev.filter(item => item.product.id !== id));
  };

  const totalEstCost = useMemo(() => {
    return orderItems.reduce((acc, it) => acc + (it.product.purchaseRate * it.orderQty), 0);
  }, [orderItems]);

  const totalUnits = useMemo(() => {
    return orderItems.reduce((acc, it) => acc + it.orderQty, 0);
  }, [orderItems]);

  // Send PO via WhatsApp
  const handleSendWhatsApp = () => {
    if (orderItems.length === 0) {
      onToast('info', 'No Items', 'Add at least one item to generate Purchase Order.');
      return;
    }

    const cleanPhone = vendorMobile.replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const messageLines = [
      `📦 *PURCHASE ORDER (PO)*`,
      `*Store:* ${shopProfile.shopName.toUpperCase()}`,
      `*Address:* ${shopProfile.address}`,
      shopProfile.phone ? `*Phone:* ${shopProfile.phone}` : '',
      `*Date:* ${new Date().toLocaleDateString('en-IN')}`,
      `--------------------------------`,
      `*Vendor:* ${vendorName || 'Distributor'}`,
      `--------------------------------`,
      `*REQUIRED ITEMS FOR DISPATCH:*`,
      ...orderItems.map((it, idx) => 
        `${idx + 1}. *${it.product.name}* (SKU: ${it.product.sku}) - Qty: ${it.orderQty} ${it.product.unit || 'Pcs'} (Est: ₹${(it.product.purchaseRate * it.orderQty).toFixed(2)})`
      ),
      `--------------------------------`,
      `*Total Items:* ${orderItems.length} | *Total Units:* ${totalUnits}`,
      `*Estimated PO Value:* ₹${totalEstCost.toLocaleString('en-IN')}`,
      `--------------------------------`,
      `Please confirm stock availability and expected dispatch/delivery date. Thank you!`
    ].filter(Boolean).join('\n');

    const waUrl = targetPhone
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(messageLines)}`
      : `https://wa.me/?text=${encodeURIComponent(messageLines)}`;

    window.open(waUrl, '_blank');
    onToast('success', 'WhatsApp PO Ready', 'Opening WhatsApp to share Purchase Order with vendor.');
  };

  // Export PO to CSV
  const handleExportCSV = () => {
    if (orderItems.length === 0) return;
    const headers = ['SNo', 'ProductName', 'SKU', 'Barcode', 'CurrentStock', 'MinStock', 'OrderQty', 'Unit', 'EstimatedPurchaseRate', 'TotalEstimatedAmount'];
    const rows = orderItems.map((it, idx) => [
      idx + 1,
      `"${it.product.name.replace(/"/g, '""')}"`,
      `"${it.product.sku}"`,
      `"${it.product.barcode || ''}"`,
      it.product.stockQty,
      it.product.minStockLevel,
      it.orderQty,
      it.product.unit || 'Pcs',
      it.product.purchaseRate.toFixed(2),
      (it.product.purchaseRate * it.orderQty).toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Purchase_Order_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('success', 'PO Exported', 'Purchase order downloaded in CSV format.');
  };

  // Print PO Sheet
  const handlePrintPO = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const itemsHtml = orderItems.map((it, idx) => `
      <tr>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.product.name}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.product.sku}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${it.product.stockQty}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; background: #eff6ff;">${it.orderQty} ${it.product.unit || 'Pcs'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">₹${it.product.purchaseRate.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">₹${(it.product.purchaseRate * it.orderQty).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order - ${shopProfile.shopName}</title>
        <style>
          body { font-family: system-ui, sans-serif; font-size: 12px; margin: 24px; color: #1e293b; }
          .hdr { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 16px; }
          .title { font-size: 18px; font-weight: 900; color: #1e3a8a; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #f1f5f9; padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px; }
          .summary { margin-top: 16px; text-align: right; font-size: 14px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="hdr">
          <div class="title">PURCHASE ORDER (PO)</div>
          <div><strong>${shopProfile.shopName}</strong> | ${shopProfile.address} | Phone: ${shopProfile.phone || 'N/A'}</div>
          <div>Date: ${new Date().toLocaleDateString('en-IN')} | Vendor: ${vendorName || 'Distributor'}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: center;">S.No</th>
              <th>Product Name</th>
              <th>SKU</th>
              <th style="text-align: right;">In-Stock</th>
              <th style="text-align: right;">Order Qty</th>
              <th style="text-align: right;">Est Rate</th>
              <th style="text-align: right;">Est Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="summary">
          Total Items: ${orderItems.length} | Total Units: ${totalUnits} | Estimated Value: ₹${totalEstCost.toLocaleString('en-IN')}
        </div>

        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 250); };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Smart Low-Stock Reorder PO Assistant"
      subtitle="Instantly compile replenishment purchase orders and dispatch to suppliers via WhatsApp or CSV"
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Top Summary & Vendor Details */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl">
          <div className="md:col-span-4 space-y-1">
            <label className="text-[11px] font-bold text-[#172B4D] flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[#2563EB]" /> Supplier / Distributor Name:
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={e => setVendorName(e.target.value)}
              placeholder="e.g. Surat Garments Wholesaler / Fabric Mills"
              className="w-full px-2.5 py-1.5 bg-white border border-[#D8E1EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="md:col-span-4 space-y-1">
            <label className="text-[11px] font-bold text-[#172B4D] flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-emerald-600" /> Supplier WhatsApp Phone:
            </label>
            <input
              type="tel"
              value={vendorMobile}
              onChange={e => setVendorMobile(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full px-2.5 py-1.5 bg-white border border-[#D8E1EC] rounded-lg text-xs font-mono font-semibold focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="md:col-span-4 flex items-center justify-between sm:justify-end gap-3 pt-2 md:pt-0">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-[#64748B]">Estimated PO Total</div>
              <div className="text-base font-black text-[#15803D] font-mono">
                {formatCurrency(totalEstCost)}
              </div>
              <div className="text-[10px] text-[#64748B]">
                {orderItems.length} items ({totalUnits} units)
              </div>
            </div>
          </div>
        </div>

        {/* Search & Add Extra Products */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
          <input
            type="text"
            placeholder="Add more products to this purchase order by name or SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#D8E1EC] rounded-xl text-xs text-[#172B4D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] shadow-xs"
          />

          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-10 mt-1 bg-white border border-[#D8E1EC] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-[#E2E8F0]">
              {searchResults.map(prod => (
                <div
                  key={prod.id}
                  onClick={() => handleAddItem(prod)}
                  className="p-2 hover:bg-[#F5F9FF] cursor-pointer flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-[#172B4D] truncate">{prod.name}</div>
                    <div className="text-[10px] text-[#64748B]">
                      Stock: {prod.stockQty} | Min: {prod.minStockLevel} | Purchase Rate: ₹{prod.purchaseRate}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 bg-[#2563EB] text-white rounded text-[11px] font-bold shrink-0"
                  >
                    + Add to PO
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PO Items Table */}
        <div className="bg-white border border-[#D8E1EC] rounded-xl overflow-hidden shadow-xs">
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#F1F5F9] text-[#172B4D] uppercase font-bold sticky top-0 border-b border-[#D8E1EC] text-[11px]">
                <tr>
                  <th className="p-2.5">Item Name</th>
                  <th className="p-2.5 text-center">In-Stock</th>
                  <th className="p-2.5 text-center">Min Level</th>
                  <th className="p-2.5 text-center">Order Qty</th>
                  <th className="p-2.5 text-right">Cost Rate</th>
                  <th className="p-2.5 text-right">Est Amount</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {orderItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-[#64748B]">
                      <PackageCheck className="w-8 h-8 text-[#15803D] mx-auto mb-2 opacity-60" />
                      All products are currently above minimum stock levels. Great inventory health!
                    </td>
                  </tr>
                ) : (
                  orderItems.map(item => {
                    const isCriticallyLow = item.product.stockQty <= 0;
                    return (
                      <tr key={item.product.id} className="hover:bg-[#F8FAFC]">
                        <td className="p-2.5">
                          <div className="font-semibold text-[#172B4D]">{item.product.name}</div>
                          <div className="text-[10px] text-[#64748B] font-mono">{item.product.sku}</div>
                        </td>

                        <td className="p-2.5 text-center font-mono">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            isCriticallyLow ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.product.stockQty} {item.product.unit || 'Pcs'}
                          </span>
                        </td>

                        <td className="p-2.5 text-center font-mono text-[#64748B]">
                          {item.product.minStockLevel}
                        </td>

                        <td className="p-2.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, item.orderQty - 5)}
                              className="w-6 h-6 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172B4D] rounded font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.orderQty}
                              onChange={e => handleUpdateQty(item.product.id, parseInt(e.target.value, 10))}
                              className="w-16 px-1 py-1 border border-[#D8E1EC] rounded text-center font-bold font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, item.orderQty + 5)}
                              className="w-6 h-6 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172B4D] rounded font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="p-2.5 text-right font-mono text-[#64748B]">
                          ₹{item.product.purchaseRate.toFixed(2)}
                        </td>

                        <td className="p-2.5 text-right font-mono font-bold text-[#172B4D]">
                          ₹{(item.product.purchaseRate * item.orderQty).toFixed(2)}
                        </td>

                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.product.id)}
                            className="p-1 text-[#EF4444] hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Remove from PO"
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

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D8E1EC]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={orderItems.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-[#F5F9FF] disabled:opacity-50 text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-[#64748B]" /> Export CSV
            </button>

            <button
              type="button"
              onClick={handlePrintPO}
              disabled={orderItems.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-[#F5F9FF] disabled:opacity-50 text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Printer className="w-4 h-4 text-[#64748B]" /> Print PO Sheet
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={orderItems.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-black flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4 text-emerald-200" /> Dispatch PO via WhatsApp
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
