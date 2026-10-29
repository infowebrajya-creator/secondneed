import React from 'react';
import { Invoice, ShopProfile, PrintSettings, PrintCopyType } from '../../types';
import { numberToWordsIndian } from '../../utils/numberToWords';

interface Thermal80mmInvoiceProps {
  invoice: Invoice;
  shopProfile: ShopProfile;
  printSettings?: PrintSettings;
  copyType?: PrintCopyType;
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

export const Thermal80mmInvoice: React.FC<Thermal80mmInvoiceProps> = ({
  invoice,
  shopProfile,
  printSettings,
  copyType = 'original'
}) => {
  const isGstInvoice = invoice.invoiceType === 'gst';
  const isQuotation = invoice.invoiceType === 'quotation';
  const docTitle = isQuotation ? 'QUOTATION / ESTIMATE' : isGstInvoice ? 'TAX INVOICE' : 'RETAIL CASH MEMO';
  const copyLabel = 
    copyType === 'duplicate' ? 'DUPLICATE FOR TRANSPORTER' :
    copyType === 'triplicate' ? 'TRIPLICATE FOR SUPPLIER' :
    'ORIGINAL FOR RECIPIENT';

  const formattedDate = formatDateDDMMYYYY(invoice.date);
  const items = invoice.items || [];
  const showGst = printSettings?.showGstBreakdown ?? true;
  const showBank = printSettings?.showBankDetails ?? true;
  const showTerms = printSettings?.showTerms ?? true;

  const grossSubtotal = invoice.subtotal + (invoice.totalDiscount || 0);
  const termsList = shopProfile.termsAndConditions
    ? shopProfile.termsAndConditions.split('\n').filter(t => t.trim() !== '')
    : ['Goods once sold will not be taken back without bill.', 'Subject to local jurisdiction.'];

  const placeOfSupplyText = invoice.placeOfSupply || (invoice.isInterstate ? 'Inter-State' : (shopProfile.state || 'Madhya Pradesh (23)'));

  return (
    <div
      style={{
        width: '300px',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace, Arial, sans-serif',
        fontSize: '11px',
        lineHeight: 1.25,
        padding: '12px 10px',
        margin: '0 auto',
        boxSizing: 'border-box',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        border: '1px solid #cbd5e1',
        borderRadius: '4px'
      }}
    >
      {/* 1. Header Details */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: 1.15 }}>
          {shopProfile.shopName || 'Retail Store'}
        </div>
        {shopProfile.tagline && (
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#333', marginTop: '1px' }}>
            {shopProfile.tagline}
          </div>
        )}
        <div style={{ fontSize: '9px', color: '#222', lineHeight: 1.25, marginTop: '2px' }}>
          {shopProfile.address && <div>{shopProfile.address}</div>}
          <div>
            {shopProfile.phone && <span>Ph: {shopProfile.phone} </span>}
            {shopProfile.gstin && <span>| GSTIN: <strong>{shopProfile.gstin}</strong></span>}
          </div>
          {shopProfile.state && <div>State: {shopProfile.state}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', margin: '4px 0 2px 0' }}>
          <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '1px 6px', border: '1px solid #000' }}>
            {docTitle}
          </span>
          <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', padding: '1px 4px', border: '1px solid #64748b', color: '#334155' }}>
            {copyLabel}
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

      {/* 2. Metadata */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', lineHeight: 1.3 }}>
        <span>Bill No: <strong>#{invoice.invoiceNumber}</strong></span>
        <span>Date: <strong>{formattedDate}</strong></span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', lineHeight: 1.3 }}>
        <span>Time: {invoice.time || ''}</span>
        <span>Mode: <strong>{invoice.paymentMode.toUpperCase()}</strong></span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#444' }}>
        <span>POS: <strong>{placeOfSupplyText}</strong></span>
        <span>RCM: <strong>{invoice.reverseCharge ? 'YES' : 'NO'}</strong></span>
      </div>

      {invoice.customerName && invoice.customerName.toLowerCase() !== 'cash customer' && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
          <div style={{ fontSize: '10px', lineHeight: 1.3 }}>
            <div>Party: <strong>{invoice.customerName.toUpperCase()}</strong></div>
            {invoice.customerMobile && <div>Mobile: {invoice.customerMobile}</div>}
            {invoice.customerGstin && <div>GSTIN: <strong>{invoice.customerGstin}</strong></div>}
            {invoice.customerAddress && <div>Address: {invoice.customerAddress}</div>}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

      {/* 3. Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '2px 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px dashed #000', fontSize: '10px', fontWeight: 800 }}>
            <th style={{ width: '50%', textAlign: 'left', paddingBottom: '2px' }}>Item</th>
            <th style={{ width: '14%', textAlign: 'right', paddingBottom: '2px' }}>Qty</th>
            <th style={{ width: '16%', textAlign: 'right', paddingBottom: '2px' }}>Rate</th>
            <th style={{ width: '20%', textAlign: 'right', paddingBottom: '2px' }}>Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const itemTotal = item.totalAmount || (item.unitRate * item.qty * (1 - (item.discountPct || 0) / 100));
            const metaDetails = [
              item.remark ? `"${item.remark}"` : '',
              item.pack ? item.pack : '',
              item.hsnCode ? `HSN:${item.hsnCode}` : '',
              item.discountPct ? `${item.discountPct}% Disc` : '',
              item.freeQty ? `+${item.freeQty} Free` : ''
            ].filter(Boolean).join(' | ');

            return (
              <tr key={item.id || idx} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                <td style={{ padding: '3px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', lineHeight: 1.2 }}>
                    {idx + 1}. {item.productName}
                  </div>
                  {metaDetails && (
                    <div style={{ fontSize: '9px', color: '#475569', marginTop: '1px' }}>
                      {metaDetails}
                    </div>
                  )}
                </td>
                <td style={{ padding: '3px 2px', textAlign: 'right', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '11px' }}>
                  {item.qty}
                </td>
                <td style={{ padding: '3px 2px', textAlign: 'right', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '11px' }}>
                  {item.unitRate.toFixed(2)}
                </td>
                <td style={{ padding: '3px 0', textAlign: 'right', verticalAlign: 'top', fontFamily: 'monospace', fontWeight: 800, fontSize: '11px' }}>
                  {itemTotal.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

      {/* 4. Totals Breakdown */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '2px' }}>
          <span>Items Total ({items.length}):</span>
          <span style={{ fontFamily: 'monospace' }}>₹{grossSubtotal.toFixed(2)}</span>
        </div>
        {invoice.totalDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '2px' }}>
            <span>Discount:</span>
            <span style={{ fontFamily: 'monospace' }}>-₹{invoice.totalDiscount.toFixed(2)}</span>
          </div>
        )}
        {invoice.freightAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '2px' }}>
            <span>Freight / Delivery:</span>
            <span style={{ fontFamily: 'monospace' }}>₹{invoice.freightAmount.toFixed(2)}</span>
          </div>
        )}
        {isGstInvoice && showGst && invoice.totalGst > 0 && (
          <>
            {invoice.cgstTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#333', marginBottom: '1px' }}>
                <span>&nbsp;&nbsp;CGST:</span>
                <span style={{ fontFamily: 'monospace' }}>₹{invoice.cgstTotal.toFixed(2)}</span>
              </div>
            )}
            {invoice.sgstTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#333', marginBottom: '1px' }}>
                <span>&nbsp;&nbsp;SGST:</span>
                <span style={{ fontFamily: 'monospace' }}>₹{invoice.sgstTotal.toFixed(2)}</span>
              </div>
            )}
            {invoice.igstTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#333', marginBottom: '1px' }}>
                <span>&nbsp;&nbsp;IGST:</span>
                <span style={{ fontFamily: 'monospace' }}>₹{invoice.igstTotal.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
        {invoice.roundOff !== 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#444', marginBottom: '2px' }}>
            <span>Round Off:</span>
            <span style={{ fontFamily: 'monospace' }}>{invoice.roundOff > 0 ? '+' : ''}{invoice.roundOff.toFixed(2)}</span>
          </div>
        )}

        {/* Grand Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900, padding: '3.5px 0', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000', margin: '4px 0' }}>
          <span>NET PAYABLE:</span>
          <span style={{ fontFamily: 'monospace' }}>₹{invoice.netPayable.toFixed(2)}</span>
        </div>

        {/* Paid & Balance */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 'bold' }}>
          <span>Paid ({invoice.paymentMode.toUpperCase()}):</span>
          <span style={{ fontFamily: 'monospace' }}>₹{(invoice.paidAmount || invoice.netPayable).toFixed(2)}</span>
        </div>
        {invoice.balanceAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 900, color: '#b91c1c', marginTop: '1px' }}>
            <span>BALANCE DUE (KHATA):</span>
            <span style={{ fontFamily: 'monospace' }}>₹{invoice.balanceAmount.toFixed(2)}</span>
          </div>
        )}
        {(invoice.transactionRef || invoice.upiReference) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#333', marginTop: '1px' }}>
            <span>Ref / UTR:</span>
            <span style={{ fontFamily: 'monospace' }}>{invoice.transactionRef || invoice.upiReference}</span>
          </div>
        )}
      </div>

      <div style={{ fontSize: '9px', marginTop: '3px', textTransform: 'capitalize' }}>
        Rs. <span style={{ fontWeight: 'bold' }}>{numberToWordsIndian(invoice.netPayable)}</span> only
      </div>

      {/* Bank & UPI Info */}
      {showBank && shopProfile.upiId && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
          <div style={{ textAlign: 'center', fontSize: '9.5px', lineHeight: 1.3 }}>
            <div>UPI Pay ID: <strong>{shopProfile.upiId}</strong></div>
            {shopProfile.bankName && shopProfile.accountNo && (
              <div style={{ fontSize: '8.5px', color: '#333' }}>
                {shopProfile.bankName} | A/C: {shopProfile.accountNo} | IFSC: {shopProfile.ifscCode}
              </div>
            )}
          </div>
        </>
      )}

      {/* Terms & Conditions */}
      {showTerms && termsList.length > 0 && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
          <div style={{ fontSize: '8px', color: '#444', lineHeight: 1.25 }}>
            <strong>Terms & Conditions:</strong>
            {termsList.map((t, idx) => (
              <div key={idx}>• {t}</div>
            ))}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
      <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '3px' }}>
        <div style={{ fontWeight: 900, letterSpacing: '0.3px' }}>*** THANK YOU! VISIT AGAIN ***</div>
        <div style={{ fontSize: '7.5px', color: '#666', marginTop: '1px' }}>
          Powered by WebRajya Invoice
        </div>
      </div>
    </div>
  );
};
