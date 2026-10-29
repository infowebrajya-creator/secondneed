import React, { useMemo } from 'react';
import { Invoice, ShopProfile, PrintCopyType } from '../../types';
import { numberToWordsIndian } from '../../utils/numberToWords';

interface A5PrintInvoiceProps {
  invoice: Invoice;
  shopProfile: ShopProfile;
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

export const A5PrintInvoice: React.FC<A5PrintInvoiceProps> = ({ invoice, shopProfile, copyType = 'original' }) => {
  const isGstInvoice = invoice.invoiceType === 'gst';
  const isBillOfSupply = invoice.invoiceType === 'bill_of_supply';
  const isChallan = invoice.invoiceType === 'delivery_challan';
  const isCreditNote = invoice.invoiceType === 'credit_note';
  const isQuotation = invoice.invoiceType === 'quotation';

  const docTitle = 
    isCreditNote ? 'CREDIT NOTE' :
    isChallan ? 'DELIVERY CHALLAN' :
    isBillOfSupply ? 'BILL OF SUPPLY' :
    isQuotation ? 'QUOTATION / PROFORMA' :
    isGstInvoice ? 'TAX INVOICE' : 'RETAIL CASH MEMO';

  const docNoLabel = 
    isCreditNote ? 'Credit Note No.' :
    isChallan ? 'Challan No.' :
    isBillOfSupply ? 'Bill of Supply No.' :
    isQuotation ? 'Quotation No.' :
    isGstInvoice ? 'Invoice No.' : 'Estimate No.';

  const formattedDate = formatDateDDMMYYYY(invoice.date);

  const copyLabel = 
    isChallan ? (
      copyType === 'duplicate' ? 'DUPLICATE FOR TRANSPORTER' :
      copyType === 'triplicate' ? 'TRIPLICATE FOR CONSIGNER' :
      'ORIGINAL FOR CONSIGNEE'
    ) : (
      copyType === 'duplicate' ? 'DUPLICATE FOR TRANSPORTER' :
      copyType === 'triplicate' ? 'TRIPLICATE FOR SUPPLIER' :
      'ORIGINAL FOR RECIPIENT'
    );

  const items = invoice.items || [];
  const minRows = 14;
  const paddingRowsCount = Math.max(0, minRows - items.length);

  const termsList = shopProfile.termsAndConditions
    ? shopProfile.termsAndConditions.split('\n').filter(t => t.trim() !== '')
    : ['Goods once sold will not be taken back without bill.', 'All disputes subject to local jurisdiction only.'];

  const grossSubtotal = invoice.subtotal + (invoice.totalDiscount || 0);
  const isPartyGiven = invoice.customerName && invoice.customerName.trim().toLowerCase() !== 'cash customer';

  // Compute GST Tax Slab Breakdown (Rule 46(k) & (l))
  const taxSlabs = useMemo(() => {
    const map = new Map<string, {
      hsn: string;
      rate: number;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
    }>();

    for (const it of items) {
      const hsn = it.hsnCode || '4820';
      const rate = Number(it.gstRate ?? 12);
      const key = `${hsn}_${rate}`;
      const taxable = Number(it.taxableAmount || (it.unitRate * it.qty * (1 - (it.discountPct || 0) / 100)) || 0);
      const itemTax = Number(it.totalAmount ? it.totalAmount - taxable : (taxable * rate / 100));
      const cgst = invoice.isInterstate ? 0 : itemTax / 2;
      const sgst = invoice.isInterstate ? 0 : itemTax / 2;
      const igst = invoice.isInterstate ? itemTax : 0;

      if (!map.has(key)) {
        map.set(key, { hsn, rate, taxable, cgst, sgst, igst, total: itemTax });
      } else {
        const row = map.get(key)!;
        row.taxable += taxable;
        row.cgst += cgst;
        row.sgst += sgst;
        row.igst += igst;
        row.total += itemTax;
      }
    }
    return Array.from(map.values());
  }, [items, invoice.isInterstate]);

  const stateDisplayName = shopProfile.state || 'Madhya Pradesh (23)';
  const placeOfSupplyText = invoice.placeOfSupply || (invoice.isInterstate ? 'Inter-State Supply' : stateDisplayName);

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
        fontSize: '8px',
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
      {/* 1. TOP TITLE & STATUTORY COPY INDICATOR (RULE 48) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '2px 5px',
          borderBottom: '1px solid #000000',
          backgroundColor: '#f8fafc',
          flexShrink: 0
        }}
      >
        <div style={{ fontSize: '7.5px', fontWeight: 800, textTransform: 'uppercase', color: '#334155' }}>
          GSTIN: <strong>{shopProfile.gstin || 'UNREGISTERED'}</strong>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>
          <div>{docTitle}</div>
          {isBillOfSupply && (
            <div style={{ fontSize: '6.5px', fontWeight: 'bold', color: '#b45309', textTransform: 'none', letterSpacing: 'normal' }}>
              Composition taxable person, not eligible to collect tax on supplies
            </div>
          )}
          {isCreditNote && invoice.originalInvoiceNumber && (
            <div style={{ fontSize: '6.5px', fontWeight: 'bold', color: '#b91c1c', textTransform: 'none', letterSpacing: 'normal' }}>
              Against Tax Invoice #{invoice.originalInvoiceNumber} Dated: {formatDateDDMMYYYY(invoice.originalInvoiceDate || '')}
            </div>
          )}
          {isChallan && (
            <div style={{ fontSize: '6.5px', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'none', letterSpacing: 'normal' }}>
              Transportation of Goods Without Issue of Invoice (Rule 55){invoice.challanPurpose ? ` • Purpose: ${invoice.challanPurpose.replace(/_/g, ' ').toUpperCase()}` : ''}
            </div>
          )}
        </div>
        <div style={{ fontSize: '7.5px', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #000', padding: '1px 4px', borderRadius: '2px' }}>
          {copyLabel}
        </div>
      </div>

      {/* 2. TWO-COLUMN STATUTORY HEADER: SUPPLIER (SELLER) & RECIPIENT (BUYER) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderBottom: '1px solid #000000',
          flexShrink: 0
        }}
      >
        {/* SUPPLIER DETAILS (RULE 46(a) - ALWAYS VISIBLE) */}
        <div style={{ width: '50%', padding: '3px 5px', borderRight: '1px solid #000000', lineHeight: 1.2 }}>
          <div style={{ fontSize: '7px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Details of Supplier (Seller):</div>
          <div style={{ fontWeight: 900, fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
            {shopProfile.shopName || 'Retail Store'}
          </div>
          <div style={{ fontSize: '8px', fontWeight: 600 }}>{shopProfile.address || ''}</div>
          <div style={{ fontSize: '7.5px' }}>
            {shopProfile.phone && <span>Ph: {shopProfile.phone} </span>}
            {shopProfile.email && <span>| {shopProfile.email}</span>}
          </div>
          <div style={{ fontSize: '7.5px', fontWeight: 700 }}>State: {stateDisplayName}</div>
        </div>

        {/* RECIPIENT DETAILS (RULE 46(d)(e)) & INVOICE METADATA */}
        <div style={{ width: '50%', padding: '3px 5px', lineHeight: 1.2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
              <span>Details of Recipient (Buyer):</span>
              <span><strong>{docNoLabel}: #{invoice.invoiceNumber}</strong></span>
            </div>
            <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>
              {isPartyGiven ? `M/s ${invoice.customerName.trim().toUpperCase()}` : 'CASH CUSTOMER (WALK-IN)'}
            </div>
            {isPartyGiven && invoice.customerAddress && (
              <div style={{ fontSize: '7.5px' }}>{invoice.customerAddress}</div>
            )}
            <div style={{ fontSize: '7.5px' }}>
              {isPartyGiven && invoice.customerMobile && <span>Ph: {invoice.customerMobile} </span>}
              {isPartyGiven && invoice.customerGstin && <span>| GSTIN: <strong>{invoice.customerGstin}</strong></span>}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px', borderTop: '1px dashed #cbd5e1', paddingTop: '1.5px', marginTop: '1.5px' }}>
            <span>Date: <strong>{formattedDate}</strong> {invoice.time || ''}</span>
            <span>POS: <strong>{placeOfSupplyText}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. ITEMS TABLE (RULE 46(f)(g)(h)(i)(j)) */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}>
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '4%', textAlign: 'center', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 1px', fontSize: '7.5px', fontWeight: 800 }}>S.</th>
              <th style={{ width: '33%', textAlign: 'left', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 3px', fontSize: '7.5px', fontWeight: 800 }}>Item Description</th>
              <th style={{ width: '8%', textAlign: 'center', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 1px', fontSize: '7.5px', fontWeight: 800 }}>HSN</th>
              <th style={{ width: '6%', textAlign: 'center', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 1px', fontSize: '7.5px', fontWeight: 800 }}>Unit</th>
              <th style={{ width: '7%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '7.5px', fontWeight: 800 }}>Qty</th>
              <th style={{ width: '8%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '7.5px', fontWeight: 800 }}>Rate</th>
              <th style={{ width: '8%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '7.5px', fontWeight: 800 }}>MRP</th>
              <th style={{ width: '6%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '7.5px', fontWeight: 800 }}>Dis%</th>
              <th style={{ width: '9%', textAlign: 'right', borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 2px', fontSize: '7.5px', fontWeight: 800 }}>Taxable</th>
              <th style={{ width: '11%', textAlign: 'right', borderBottom: '1px solid #000', padding: '2px 3px', fontSize: '7.5px', fontWeight: 800 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const taxableVal = item.taxableAmount || (item.unitRate * item.qty * (1 - (item.discountPct || 0) / 100));
              const itemTotal = item.totalAmount || taxableVal;
              const unitLabel = item.unit || 'Pcs';
              const hsnLabel = item.hsnCode || '4820';

              return (
                <tr key={item.id || index} style={{ height: '13px', maxHeight: '13px' }}>
                  <td style={{ textAlign: 'center', borderRight: '1px solid #000', fontFamily: 'monospace', fontSize: '7.5px' }}>{index + 1}</td>
                  <td style={{ borderRight: '1px solid #000', padding: '1px 3px', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '7.5px' }}>
                    {item.productName}
                    {item.freeQty ? <span style={{ color: '#047857', fontWeight: 'bold' }}> (+{item.freeQty} Free)</span> : ''}
                  </td>
                  <td style={{ textAlign: 'center', borderRight: '1px solid #000', fontFamily: 'monospace', fontSize: '7px' }}>
                    {hsnLabel}
                  </td>
                  <td style={{ textAlign: 'center', borderRight: '1px solid #000', fontSize: '7px', textTransform: 'uppercase' }}>
                    {unitLabel}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '7.5px' }}>
                    {item.qty.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '7.5px' }}>
                    {item.unitRate.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '7.5px' }}>
                    {item.mrp.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '7.5px' }}>
                    {(item.discountPct || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', borderRight: '1px solid #000', paddingRight: '2px', fontFamily: 'monospace', fontSize: '7.5px' }}>
                    {taxableVal.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '3px', fontFamily: 'monospace', fontWeight: 700, fontSize: '7.5px' }}>
                    {itemTotal.toFixed(2)}
                  </td>
                </tr>
              );
            })}

            {/* Continuous Vertical Padding Rows */}
            {Array.from({ length: paddingRowsCount }).map((_, pIdx) => (
              <tr key={`pad-${pIdx}`} style={{ height: '13px', maxHeight: '13px' }}>
                <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
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

            {/* Spacer Row to touch bottom footer */}
            <tr style={{ height: '100%' }}>
              <td style={{ borderRight: '1px solid #000' }}>&nbsp;</td>
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

      {/* 4. GST TAX SLAB BREAKDOWN SUMMARY (RULE 46(k) & (l)) */}
      {isGstInvoice && taxSlabs.length > 0 && (
        <div style={{ borderTop: '1px solid #000000', padding: '1px 3px', backgroundColor: '#fdfdfd', flexShrink: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.5px', fontFamily: 'monospace' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #000', fontWeight: 800, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '1px' }}>HSN/SAC</th>
                <th style={{ textAlign: 'right', padding: '1px' }}>Taxable Val</th>
                {!invoice.isInterstate ? (
                  <>
                    <th style={{ textAlign: 'right', padding: '1px' }}>CGST Rate</th>
                    <th style={{ textAlign: 'right', padding: '1px' }}>CGST Amt</th>
                    <th style={{ textAlign: 'right', padding: '1px' }}>SGST Rate</th>
                    <th style={{ textAlign: 'right', padding: '1px' }}>SGST Amt</th>
                  </>
                ) : (
                  <>
                    <th style={{ textAlign: 'right', padding: '1px' }}>IGST Rate</th>
                    <th style={{ textAlign: 'right', padding: '1px' }}>IGST Amt</th>
                  </>
                )}
                <th style={{ textAlign: 'right', padding: '1px' }}>Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {taxSlabs.map((s, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'left', padding: '0.5px 1px' }}>{s.hsn}</td>
                  <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{s.taxable.toFixed(2)}</td>
                  {!invoice.isInterstate ? (
                    <>
                      <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{(s.rate / 2).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{s.cgst.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{(s.rate / 2).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{s.sgst.toFixed(2)}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{s.rate.toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', padding: '0.5px 1px' }}>{s.igst.toFixed(2)}</td>
                    </>
                  )}
                  <td style={{ textAlign: 'right', padding: '0.5px 1px', fontWeight: 700 }}>{s.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. FOOTER SECTION: WORDS, REMARKS, TERMS & GRAND TOTAL */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #000000', display: 'flex', width: '100%', boxSizing: 'border-box' }}>
        {/* LEFT COLUMN: WORDS, STATUTORY REVERSE CHARGE DECLARATION, TERMS, BANK */}
        <div style={{ width: '60%', borderRight: '1px solid #000000', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
          <div style={{ padding: '2px 5px', fontSize: '8px', fontWeight: 'bold', lineHeight: 1.15, borderBottom: '1px solid #000' }}>
            Rs. <span style={{ textTransform: 'capitalize' }}>{numberToWordsIndian(invoice.netPayable)}</span> only
          </div>

          <div style={{ padding: '2px 5px', fontSize: '7.5px', borderBottom: '1px solid #000', backgroundColor: '#fcfcfc' }}>
            <div>Tax Payable on Reverse Charge (RCM): <strong>{invoice.reverseCharge ? 'YES' : 'NO'}</strong></div>
            {invoice.notes && <div>Remark: <strong>{invoice.notes}</strong></div>}
          </div>

          {/* BANK & UPI INFO */}
          {shopProfile.bankName && shopProfile.accountNo && (
            <div style={{ padding: '2px 5px', fontSize: '7px', borderBottom: '1px solid #000', lineHeight: 1.2 }}>
              <div>Bank: <strong>{shopProfile.bankName}</strong> | A/C: <strong>{shopProfile.accountNo}</strong></div>
              <div>IFSC: <strong>{shopProfile.ifscCode}</strong> {shopProfile.upiId ? `| UPI ID: ${shopProfile.upiId}` : ''}</div>
            </div>
          )}

          {/* TERMS & CONDITIONS */}
          <div style={{ padding: '2px 5px', fontSize: '6.5px', lineHeight: 1.2 }}>
            <div style={{ fontWeight: 800, textTransform: 'uppercase' }}>Terms & Conditions:</div>
            {termsList.slice(0, 3).map((t, idx) => (
              <div key={idx}>• {t}</div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: FINANCIAL TOTALS & AUTHORISED SIGNATORY */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', fontFamily: 'monospace' }}>
          <div style={{ padding: '2px 5px', fontSize: '9px', borderBottom: '1px solid #000000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
              <span>SUB TOTAL:</span>
              <span>{grossSubtotal.toFixed(2)}</span>
            </div>
            {invoice.totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px', color: '#b91c1c' }}>
                <span>DISCOUNT:</span>
                <span>-{invoice.totalDiscount.toFixed(2)}</span>
              </div>
            )}
            {invoice.freightAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                <span>FREIGHT:</span>
                <span>{invoice.freightAmount.toFixed(2)}</span>
              </div>
            )}
            {isGstInvoice && invoice.totalGst > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                <span>TOTAL GST:</span>
                <span>{invoice.totalGst.toFixed(2)}</span>
              </div>
            )}
            {invoice.roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                <span>ROUND OFF:</span>
                <span>{invoice.roundOff > 0 ? '+' : ''}{invoice.roundOff.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #000000', paddingTop: '2px', marginTop: '1.5px', fontSize: '11px', fontWeight: 900 }}>
              <span>NET PAYABLE:</span>
              <span>₹{invoice.netPayable.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ padding: '8px 5px 3px 5px', textAlign: 'right', fontSize: '7.5px', fontWeight: 800, fontFamily: 'Arial, sans-serif' }}>
            <div>For {shopProfile.shopName || 'Retail Store'}</div>
            <div style={{ height: '14px' }}></div>
            <div>Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
};
