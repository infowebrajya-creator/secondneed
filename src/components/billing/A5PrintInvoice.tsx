import React from 'react';
import { Invoice, ShopProfile } from '../../types';
import { numberToWordsIndian } from '../../utils/numberToWords';

interface A5PrintInvoiceProps {
  invoice: Invoice;
  shopProfile: ShopProfile;
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

export const A5PrintInvoice: React.FC<A5PrintInvoiceProps> = ({ invoice, shopProfile }) => {
  const isGstInvoice = invoice.invoiceType === 'gst';
  const isQuotation = invoice.invoiceType === 'quotation';
  const docTitle = isQuotation ? 'QUOTATION / PROFORMA' : isGstInvoice ? 'TAX INVOICE' : 'CREDIT ESTIMATE';
  const docNoLabel = isQuotation ? 'Quotation No.' : isGstInvoice ? 'Invoice No.' : 'Estimate No.';
  const formattedDate = formatDateDDMMYYYY(invoice.date);

  const items = invoice.items || [];
  const minRows = 24;
  const paddingRowsCount = Math.max(0, minRows - items.length);

  const termsList = shopProfile.termsAndConditions
    ? shopProfile.termsAndConditions.split('\n').filter(t => t.trim() !== '')
    : ['Goods once sold will not be taken back or exchanged.', 'All disputes subject to Jurisdiction only.'];

  const grossSubtotal = invoice.subtotal + (invoice.totalDiscount || 0);

  const isPartyGiven = invoice.customerName && invoice.customerName.trim().toLowerCase() !== 'cash customer';
  const partyLine1 = isPartyGiven ? `M/s ${invoice.customerName.trim().toUpperCase()}` : `M/s ${shopProfile.shopName || 'Retail Store'}`;
  const partyLine2 = isPartyGiven
    ? (invoice.customerAddress ? invoice.customerAddress.trim().toUpperCase() : '')
    : (shopProfile.address || '');

  return (
    <div
      style={{
        width: '140mm',
        minHeight: '200mm',
        maxHeight: '202mm',
        border: '1px solid #000000',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        fontSize: '8.5px',
        lineHeight: 1.15,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        margin: '0 auto',
        userSelect: 'none'
      }}
      id="a5-print-document"
    >
      {/* 1. TOP HEADER (EXACT MARG 3-COLUMN COMPACT LAYOUT) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '3px 5px 2px 5px',
          borderBottom: '1px solid #000000',
          flexShrink: 0
        }}
      >
        <div style={{ width: '42%', lineHeight: 1.2 }}>
          <div style={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
            {partyLine1}
          </div>
          <div style={{ fontSize: '8.5px', fontWeight: 600, textTransform: 'uppercase' }}>
            {partyLine2}
          </div>
          {isPartyGiven && invoice.customerMobile && (
            <div style={{ fontSize: '8px', color: '#222' }}>Ph: {invoice.customerMobile}</div>
          )}
          {isPartyGiven && invoice.customerGstin && (
            <div style={{ fontSize: '8px', color: '#222' }}>GSTIN: {invoice.customerGstin}</div>
          )}
        </div>

        <div style={{ width: '28%', textAlign: 'center' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 900,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              textDecoration: 'underline',
              paddingTop: '1px'
            }}
          >
            {docTitle}
          </div>
          {isPartyGiven && (
            <div style={{ fontSize: '7.5px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', marginTop: '1px' }}>
              M/s {shopProfile.shopName || 'Retail Store'}
            </div>
          )}
        </div>

        <div style={{ width: '30%', textAlign: 'right', fontFamily: 'monospace', fontSize: '9.5px', lineHeight: 1.25 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: 'bold' }}>{docNoLabel} :</span>
            <span style={{ fontWeight: 'bold' }}>{invoice.invoiceNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: 'bold' }}>Date :</span>
            <span style={{ fontWeight: 'bold' }}>{formattedDate}</span>
          </div>
          {invoice.time && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2px', fontSize: '8px', color: '#333' }}>
              <span>Time :</span>
              <span>{invoice.time}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. TABLE CONTAINER */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}>
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '4%', textAlign: 'center', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>S.</th>
              <th style={{ width: '44%', textAlign: 'left', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 3px', fontSize: '8.5px', fontWeight: 800 }}>Item Description</th>
              <th style={{ width: '7%', textAlign: 'center', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>REMARK</th>
              <th style={{ width: '7%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>Qty.</th>
              <th style={{ width: '6%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>FREE</th>
              <th style={{ width: '8%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>Rate</th>
              <th style={{ width: '8%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>MRP</th>
              <th style={{ width: '6%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '8.5px', fontWeight: 800 }}>DIS%</th>
              <th style={{ width: '10%', textAlign: 'right', borderBottom: '1px solid #000', padding: '2px 3px', fontSize: '8.5px', fontWeight: 800 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const remarkText = item.remark || item.pack || (item.hsnCode ? `HSN:${item.hsnCode}` : '');
              const itemTotal = item.totalAmount || (item.unitRate * item.qty * (1 - (item.discountPct || 0) / 100));
              return (
                <tr key={item.id || index} style={{ height: '13.5px', maxHeight: '13.5px' }}>
                  <td style={{ textAlign: 'center', borderRight: '1px solid #000', fontFamily: 'monospace', fontSize: '8px' }}>{index + 1}</td>
                  <td style={{ borderRight: '1px solid #000', padding: '1px 3px', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '8px' }}>
                    {item.productName}
                  </td>
                  <td style={{ textAlign: 'center', borderRight: '1px solid #000', fontSize: '7.5px', textTransform: 'uppercase' }}>
                    {remarkText || ''}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '8px' }}>
                    {item.qty.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '8px' }}>
                    {(item.freeQty || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '8px' }}>
                    {item.unitRate.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '8px' }}>
                    {item.mrp.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '8px' }}>
                    {(item.discountPct || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '3px', fontFamily: 'monospace', fontWeight: 700, fontSize: '8px' }}>
                    {itemTotal.toFixed(2)}
                  </td>
                </tr>
              );
            })}

            {/* Continuous Vertical Padding Rows */}
            {Array.from({ length: paddingRowsCount }).map((_, pIdx) => (
              <tr key={`pad-${pIdx}`} style={{ height: '13.5px', maxHeight: '13.5px' }}>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}

            {/* Spacer Row to Touch Footer */}
            <tr style={{ height: '100%' }}>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 3. FOOTER (MARG EXACT 2-COLUMN SPLIT) */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #000000', display: 'flex', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: '61%', borderRight: '1px solid #000000', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
          <div style={{ padding: '2.5px 5px', fontSize: '8.5px', fontWeight: 'bold', lineHeight: 1.2 }}>
            Rs. <span style={{ textTransform: 'capitalize' }}>{numberToWordsIndian(invoice.netPayable)}</span> only
          </div>

          <div style={{ borderTop: '1px solid #000000', borderBottom: '1px solid #000000', padding: '2px 5px', fontSize: '9px', fontWeight: 800, fontFamily: 'Arial, monospace, sans-serif', backgroundColor: '#fafafa' }}>
            Remark : {invoice.notes || ''}
          </div>

          <div style={{ padding: '3px 5px 3px 5px', fontSize: '7.5px', lineHeight: 1.25 }}>
            <div style={{ textDecoration: 'underline', fontWeight: 800, fontSize: '8px', textTransform: 'uppercase', marginBottom: '1px' }}>
              Terms & Conditions
            </div>
            {termsList.map((t, idx) => (
              <div key={idx}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ width: '39%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', fontFamily: 'monospace' }}>
          <div style={{ padding: '2.5px 5px', fontSize: '10px', borderBottom: '1px solid #000000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '1px' }}>
              <span>SUB TOTAL</span>
              <span>{grossSubtotal.toFixed(2)}</span>
            </div>
            {invoice.totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '1px' }}>
                <span>DISCOUNT</span>
                <span>{invoice.totalDiscount.toFixed(2)}</span>
              </div>
            )}
            {invoice.freightAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '1px' }}>
                <span>FRIGHT</span>
                <span>{invoice.freightAmount.toFixed(2)}</span>
              </div>
            )}
            {isGstInvoice && invoice.totalGst > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '1px' }}>
                <span>GST TAX</span>
                <span>{invoice.totalGst.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #000000', paddingTop: '2px', marginTop: '1.5px', fontSize: '11px', fontWeight: 900 }}>
              <span>GRAND TOTAL</span>
              <span>{invoice.netPayable.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ padding: '12px 6px 3px 6px', textAlign: 'right', fontSize: '8.5px', fontWeight: 800, fontFamily: 'Arial, sans-serif' }}>
            Authorised signatory
          </div>
        </div>
      </div>
    </div>
  );
};
