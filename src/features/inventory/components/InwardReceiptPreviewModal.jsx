import { useRef, useState } from 'react'
import html2pdf from 'html2pdf.js'
import { formatINR, numberToWordsINR, formatDateIN } from '../../../utils/formatters'
import { INWARD_RECEIPT_CONFIG } from '../config/inwardReceiptConfig'
import './InwardReceiptPreviewModal.css'

export default function InwardReceiptPreviewModal({
  isOpen,
  onClose,
  receiptData,
}) {
  const printAreaRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  if (!isOpen || !receiptData) return null

  const {
    receiptNo = 'GRN-2026-0001',
    receiptDate = new Date().toISOString().slice(0, 10),
    financialYear = '2026-27',
    company = {},
    supplier = {},
    material = {},
    receivedQuantity = 0,
    noOfContainers = '',
    rate = 0,
    totalAmount = 0,
    amountInWords = '',
    receivedBy = 'Stores Receiving',
    checkedBy = 'QC Quality Analyst',
    authorisedSignatory = 'Authorised Plant Head',
    remarks = '',
  } = receiptData

  const lineTotal = Number(totalAmount) || (Number(receivedQuantity) * Number(rate))
  const displayWords = amountInWords || numberToWordsINR(lineTotal)

  // Download PDF using html2pdf.js
  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return
    setDownloading(true)

    try {
      const element = printAreaRef.current
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `${receiptNo}_Raw_Material_Inward_Receipt.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }

      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('Error generating PDF:', err)
      // Fallback: trigger print dialog where user can choose Save as PDF
      window.print()
    } finally {
      setDownloading(false)
    }
  }

  // Print receipt
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="receipt-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="receipt-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Bar (Non-printable) */}
        <div className="receipt-action-bar no-print">
          <div className="receipt-action-title">
            <h3>Raw Material Inward Receipt Preview</h3>
            <span className="receipt-badge-grn">{receiptNo}</span>
          </div>

          <div className="receipt-action-buttons">
            <button
              type="button"
              className="receipt-btn-download"
              onClick={handleDownloadPdf}
              disabled={downloading}
              title="Download client-side PDF document"
            >
              <span>{downloading ? '⏳' : '📥'}</span>
              <span>{downloading ? 'Generating PDF…' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              className="receipt-btn-print"
              onClick={handlePrint}
              title="Print or Save as PDF via browser print"
            >
              <span>🖨️</span>
              <span>Print</span>
            </button>

            <button
              type="button"
              className="receipt-btn-close"
              onClick={onClose}
              aria-label="Close Preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Document Body */}
        <div className="receipt-scroll-body">
          {/* A4 Sheet Container */}
          <div
            id="inward-receipt-print-area"
            ref={printAreaRef}
            className="receipt-sheet"
          >
            {/* Header: Company Information & Document Meta */}
            <div className="receipt-header-row">
              <div className="receipt-company-info">
                <h1 className="receipt-company-title">
                  {company.name || INWARD_RECEIPT_CONFIG.company.name || 'Common Inventory'}
                </h1>
                {INWARD_RECEIPT_CONFIG.company.legal_name ? (
                  <p className="receipt-company-legal">
                    {INWARD_RECEIPT_CONFIG.company.legal_name}
                  </p>
                ) : null}
                <p className="receipt-company-address">
                  Address: {INWARD_RECEIPT_CONFIG.company.address || ''}
                </p>
                <p className="receipt-company-tax">
                  GSTIN: <strong>{INWARD_RECEIPT_CONFIG.company.gstin || ''}</strong> &bull; PAN: <strong>{INWARD_RECEIPT_CONFIG.company.pan || ''}</strong> &bull; State: <strong>{INWARD_RECEIPT_CONFIG.company.state || ''}</strong>
                </p>
                <p className="receipt-company-tax" style={{ fontSize: 11, color: '#64748b' }}>
                  Tel: {INWARD_RECEIPT_CONFIG.company.phone || ''} &bull; Email: {INWARD_RECEIPT_CONFIG.company.email || ''}
                </p>
              </div>

              <div className="receipt-doc-meta">
                <span className="receipt-doc-pill">
                  Raw Material Inward Receipt
                </span>
                <table className="receipt-meta-table">
                  <tbody>
                    <tr>
                      <td>Receipt (GRN) No:</td>
                      <td style={{ color: '#0284c7', fontFamily: 'monospace', fontSize: 13 }}>
                        {receiptNo}
                      </td>
                    </tr>
                    <tr>
                      <td>Receipt Date:</td>
                      <td>{formatDateIN(receiptDate)}</td>
                    </tr>
                    <tr>
                      <td>Financial Year:</td>
                      <td>FY {financialYear}</td>
                    </tr>
                    <tr>
                      <td>Supplier Invoice No:</td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {supplier.invoice_no || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Parties Details Grid */}
            <div className="receipt-parties-grid">
              {/* Supplier / Vendor Details */}
              <div className="receipt-party-card">
                <h4>Sourced From (Supplier / Vendor)</h4>
                <div className="receipt-party-name">
                  {supplier.name || 'Supplier'}
                </div>
                {supplier.code && supplier.code !== 'SUP-DIRECT' && (
                  <div className="receipt-party-line">
                    Vendor Code: <strong>{supplier.code}</strong>
                  </div>
                )}
                <div className="receipt-party-line">
                  Supplier Invoice #: <strong>{supplier.invoice_no || '—'}</strong>
                </div>
                <div className="receipt-party-line">
                  Supplier GSTIN: <strong>{INWARD_RECEIPT_CONFIG.supplier.gstin || ''}</strong>
                </div>
                <div className="receipt-party-line">
                  Address: {INWARD_RECEIPT_CONFIG.supplier.address || ''}
                </div>
                <div className="receipt-party-line">
                  Contact: {INWARD_RECEIPT_CONFIG.supplier.contact || ''}
                </div>
              </div>

              {/* Delivery / Store Receiving Details */}
              <div className="receipt-party-card">
                <h4>Receiving Destination / Consignee</h4>
                <div className="receipt-party-name">
                  {company.name || 'Common Inventory'}
                </div>
                <div className="receipt-party-line">
                  Department: <strong>Central Store &amp; Quarantine Depot</strong>
                </div>
                <div className="receipt-party-line">
                  Intake Purpose: <strong>Raw Material Intake &amp; Physical Balance Credit</strong>
                </div>
                <div className="receipt-party-line">
                  Storage Condition: <strong>Controlled Room Temp (15°C – 25°C)</strong>
                </div>
                <div className="receipt-party-line">
                  Current Status: <strong style={{ color: '#b45309' }}>Quarantined (QC Pending)</strong>
                </div>
              </div>
            </div>

            {/* Material Details Table */}
            <div className="receipt-table-wrap">
              <table className="receipt-items-table">
                <thead>
                  <tr>
                    <th className="receipt-col-idx">#</th>
                    <th className="receipt-col-code">Item Code</th>
                    <th className="receipt-col-name">Material / Chemical Name</th>
                    <th className="receipt-col-unit">Unit &amp; Pack Size</th>
                    <th className="receipt-col-cont">Containers</th>
                    <th className="receipt-col-qty">Received Qty</th>
                    <th className="receipt-col-rate">Rate / Unit (₹)</th>
                    <th className="receipt-col-total">Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="receipt-col-idx">1</td>
                    <td className="receipt-col-code-val">{material.code || 'ITM-0001'}</td>
                    <td className="receipt-col-name-val">
                      <div className="receipt-mat-name">{material.name || 'Raw Material'}</div>
                      <div className="receipt-mat-cat">
                        Category: {material.category || 'Raw Material / Chemical API'}
                      </div>
                    </td>
                    <td className="receipt-col-unit-val">
                      1 {material.display_unit || 'BAG'} = {material.pack_size || 25} {material.base_unit || 'KG'}
                    </td>
                    <td className="receipt-col-cont-val">
                      <strong>{noOfContainers || '—'}</strong>
                    </td>
                    <td className="receipt-col-qty-val">
                      {Number(receivedQuantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {material.base_unit || 'KG'}
                    </td>
                    <td className="receipt-col-rate-val">
                      {rate ? `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="receipt-col-total-val">
                      {rate ? `₹${Number(lineTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="receipt-summary-grid">
              <div className="receipt-words-box">
                <div className="receipt-words-label">Amount in Words:</div>
                <div className="receipt-words-val">
                  {rate ? displayWords : 'Rate not specified — Physical inventory intake only'}
                </div>
              </div>

              <div>
                <table className="receipt-totals-table">
                  <tbody>
                    <tr>
                      <td>Total Received Quantity:</td>
                      <td>
                        {Number(receivedQuantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                        {material.base_unit || 'KG'}
                      </td>
                    </tr>
                    <tr>
                      <td>Total Containers:</td>
                      <td>{noOfContainers || '—'}</td>
                    </tr>
                    {rate ? (
                      <>
                        <tr>
                          <td>Taxable Material Value:</td>
                          <td>₹{Number(lineTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="receipt-grand-total">
                          <td>Total Invoiced Amount:</td>
                          <td>₹{Number(lineTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </>
                    ) : (
                      <tr className="receipt-grand-total">
                        <td>Shipment Valuation:</td>
                        <td>Valuation as per Supplier Invoice #{supplier.invoice_no || '—'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quarantine & Verification Notice */}
            <div className="receipt-notes-notice">
              <strong>Quality &amp; Intake Notice: </strong>
              {remarks ||
                'Physical shipment intake verified against supplier delivery challan/invoice. All packaging containers inspected for seal integrity, absence of damage, and verified batch labels. Material has been credited into running stock ledger and placed in central store under quarantine pending mandatory Quality Control (QC) analytical verification.'}
            </div>

            {/* Signatures Row */}
            <div className="receipt-signatures-row">
              <div className="receipt-sign-box">
                <div className="receipt-sign-line" />
                <div className="receipt-sign-role">Received By</div>
                <div className="receipt-sign-name">
                  Stores Receiving Officer
                </div>
                <div className="receipt-sign-name" style={{ fontWeight: 600, color: '#334155' }}>
                  {receivedBy}
                </div>
              </div>

              <div className="receipt-sign-box">
                <div className="receipt-sign-line" />
                <div className="receipt-sign-role">Checked By (QC)</div>
                <div className="receipt-sign-name">
                  Quality Control Inspector
                </div>
                <div className="receipt-sign-name" style={{ color: '#94a3b8' }}>
                  Sampling &amp; Verification
                </div>
              </div>

              <div className="receipt-sign-box">
                <div className="receipt-sign-line" />
                <div className="receipt-sign-role">Authorised Signatory</div>
                <div className="receipt-sign-name">
                  For {company.name || 'CMHP Pharma'}
                </div>
                <div className="receipt-sign-name" style={{ fontWeight: 600, color: '#334155' }}>
                  {authorisedSignatory}
                </div>
              </div>
            </div>

            {/* Print Footer Stamp */}
            <div className="receipt-footer-stamp">
              <span>This is a computer-generated Goods Receipt Note (GRN) under CMHP ERP.</span>
              <span>Generated on: {new Date().toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
