import React from 'react';
import { Invoice, ShopProfile, PrintSettings } from '../../types';

interface Thermal58mmInvoiceProps {
  invoice: Invoice;
  shopProfile: ShopProfile;
  printSettings?: PrintSettings;
}

function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return dateStr;
}

export const Thermal58mmInvoice: React.FC<Thermal58mmInvoiceProps> = ({
  invoice,
  shopProfile
}) => {
  const isGstInvoice = invoice.invoiceType === 'gst';
  const isQuotation = invoice.invoiceType === 'quotation';
  const docTitle = isQuotation ? 'QUOTATION' : isGstInvoice ? 'TAX INVOICE' : 'CASH MEMO';
  const formattedDate = formatDateDDMMYYYY(invoice.date);
  const items = invoice.items || [];

  return (
    <div
      style={{
        width: '210px',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'monospace, -apple-system, sans-serif',
        fontSize: '9.5px',
        lineHeight: 1.2,
        padding: '8px 6px',
        margin: '0 auto',
        boxSizing: 'border-box',
        border: '1px dashed #cbd5e1',
        borderRadius: '2px'
      }}
    >
      {/* 1. Header Details */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.1 }}>
          {shopProfile.shopName || 'Retail Store'}
        </div>
        <div style={{ fontSize: '8px', color: '#222', marginTop: '2px' }}>
          {shopProfile.address && <div>{shopProfile.address}</div>}
          {shopProfile.phone && <div>Ph: {shopProfile.phone}</div>}
          {shopProfile.gstin && <div>GSTIN: {shopProfile.gstin}</div>}
        </div>
        <div style={{ margin: '3px 0' }}>
          <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 900, border: '1px solid #000', padding: '1px 4px' }}>
            {docTitle}
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '3px 0' }}></div>

      {/* 2. Metadata */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
        <span>Bill: #{invoice.invoiceNumber}</span>
        <span>{formattedDate}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
        <span>Mode: {invoice.paymentMode.toUpperCase()}</span>
        <span>{invoice.time || ''}</span>
      </div>

      {invoice.customerName && invoice.customerName.toLowerCase() !== 'cash customer' && (
        <div style={{ fontSize: '9px', marginTop: '2px' }}>
          Party: <strong>{invoice.customerName}</strong>
        </div>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '3px 0' }}></div>

      {/* 3. Items List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '9px', borderBottom: '1px solid #000', paddingBottom: '2px' }}>
        <span style={{ width: '55%' }}>Item</span>
        <span style={{ width: '20%', textAlign: 'center' }}>Qty</span>
        <span style={{ width: '25%', textAlign: 'right' }}>Amt</span>
      </div>

      <div style={{ marginTop: '2px' }}>
        {items.map((item, index) => (
          <div key={item.id || index} style={{ marginBottom: '3px' }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.productName}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#333' }}>
              <span>{item.qty} {item.unit || 'Pcs'} x ₹{item.unitRate.toFixed(2)}</span>
              <span style={{ fontWeight: 'bold', color: '#000' }}>₹{item.totalAmount.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '3px 0' }}></div>

      {/* 4. Totals */}
      <div style={{ fontSize: '9px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal:</span>
          <span>₹{invoice.subtotal.toFixed(2)}</span>
        </div>
        {invoice.totalDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Discount:</span>
            <span>-₹{invoice.totalDiscount.toFixed(2)}</span>
          </div>
        )}
        {isGstInvoice && invoice.totalGst > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>GST Total:</span>
            <span>+₹{invoice.totalGst.toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 900, borderTop: '1px solid #000', paddingTop: '2px', marginTop: '2px' }}>
          <span>NET PAYABLE:</span>
          <span>₹{invoice.netPayable.toFixed(2)}</span>
        </div>
      </div>

      {invoice.balanceAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 'bold', marginTop: '2px', color: '#b91c1c' }}>
          <span>Due Balance:</span>
          <span>₹{invoice.balanceAmount.toFixed(2)}</span>
        </div>
      )}

      {/* 5. Footer */}
      <div style={{ textAlign: 'center', marginTop: '6px', borderTop: '1px dashed #000', paddingTop: '4px', fontSize: '8px' }}>
        {shopProfile.upiId && <div>Pay UPI: {shopProfile.upiId}</div>}
        <div>Thank you! Visit again.</div>
      </div>
    </div>
  );
};
