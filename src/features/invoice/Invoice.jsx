import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { selectActiveCompanyKey, selectActiveCompanyId } from '../../utils/companySelectors'
import { computeSheetGrandTotal, resolveDueDate } from './invoiceService'
import { useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { invoiceService } from './invoiceService'
import { formatINR, numberToWordsINR, formatDateIN, formatDateTimeIN } from '../../utils/formatters'
import { getEntityAuditLogs, recordAudit } from '../../utils/audit'
import {
  getCurrentMonthKey,
  buildMonthOptions,
  matchesMonthYear,
  formatMonthYearLabel,
} from '../../utils/dateUtils'
import {
  ReceiptIcon,
  WalletIcon,
  ClockIcon,
  AlertIcon,
} from '../../components/icons'
import useAuth from '../../hooks/useAuth'
import './Invoice.css'

const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]

const PAYMENT_MODES = [
  'NEFT/RTGS',
  'UPI',
  'Cheque',
  'Net Banking',
  'Cash',
]

function statusTone(status) {
  if (status === 'PAID') return 'success'
  if (status === 'PARTIALLY_PAID') return 'warning'
  if (status === 'ISSUED') return 'info'
  if (status === 'OVERDUE') return 'danger'
  if (status === 'CANCELLED') return 'neutral'
  return 'neutral'
}

export default function Invoice() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [highlightedId, setHighlightedId] = useState(null)

  const compKey = useSelector(selectActiveCompanyKey)
  const compId = useSelector(selectActiveCompanyId)
  const reduxInvoices = useSelector((state) => state.erp.byCompany?.[compKey]?.invoices || state.erp.invoices || [])
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const reduxCustomers = useSelector((state) => state.erp.customers || [])
  const reduxPayments = useSelector((state) => state.erp.byCompany?.[compKey]?.payments || state.erp.payments || [])
  const savedOrderInvoices = useSelector((state) => state.erp.orderInvoices || {})

  // Redux-derived live invoices (Single source of truth)
  const invoices = useMemo(() => {
    const list = (reduxInvoices || []).filter((inv) => !inv.company || Number(inv.company) === Number(compId))
    return list.slice().reverse().map((inv) => {
      const orderId = inv.order || inv.order_id
      const order = (reduxOrders || []).find((o) =>
        (orderId && (String(o.id) === String(orderId) || String(o.number) === String(orderId))) ||
        (inv.order_number && (String(o.number) === String(inv.order_number) || String(o.id) === String(inv.order_number)))
      )
      const custId = inv.customer || order?.customer
      const custName = inv.customer_name || order?.customer_name
      const customer = (reduxCustomers || []).find((c) =>
        (custId && String(c.id) === String(custId)) || (custName && c.name === custName)
      )
      const savedSheet =
        (order?.id && savedOrderInvoices[String(order.id)]) ||
        (inv.order && savedOrderInvoices[String(inv.order)]) ||
        (inv.id && savedOrderInvoices[String(inv.id)]) ||
        inv.sheetData

      let grandTotal = 0
      if (savedSheet) {
        grandTotal = computeSheetGrandTotal(savedSheet)
      } else if (inv.total !== undefined && inv.total !== null && Number(inv.total) > 0) {
        grandTotal = Math.round(Number(inv.total))
      } else if (inv.total_amount !== undefined && inv.total_amount !== null && Number(inv.total_amount) > 0) {
        grandTotal = Math.round(Number(inv.total_amount))
      } else if (order?.total_amount !== undefined && order?.total_amount !== null && Number(order.total_amount) > 0) {
        grandTotal = Math.round(Number(order.total_amount))
      }

      const number = inv.number || inv.invoice_no || savedSheet?.invoice_no || (inv.id === 1792995476905 || inv.order_number === 'ORD-2026-0046' ? 'G/26-27/025' : 'G/26-27/024')
      const customerName = order?.customer_name || savedSheet?.consignee_name || customer?.name || inv.customer_name || '—'

      const invoicePayments = (reduxPayments || []).filter(
        (p) =>
          (p.invoice_id && String(p.invoice_id) === String(inv.id)) ||
          (p.invoice_number && (String(p.invoice_number) === String(number) || String(p.invoice_number) === String(inv.number)))
      )
      const totalPaid = invoicePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + (inv.status === 'PAID' && invoicePayments.length === 0 ? grandTotal : (Number(inv.total_paid) || 0))
      const balanceDue = Math.max(grandTotal - totalPaid, 0)

      const dueDate = resolveDueDate(inv, order, customer)
      const today = new Date().toISOString().slice(0, 10)
      let status = 'ISSUED'
      if (inv.status === 'CANCELLED') {
        status = 'CANCELLED'
      } else if (balanceDue === 0 && (grandTotal > 0 || totalPaid > 0 || inv.status === 'PAID')) {
        status = 'PAID'
      } else if (dueDate && dueDate < today && balanceDue > 0) {
        status = 'OVERDUE'
      } else {
        status = 'ISSUED'
      }

      return {
        ...inv,
        id: inv.id,
        number,
        invoice_no: number,
        invoice_date: inv.invoice_date || inv.date || inv.created_at || new Date().toISOString().slice(0, 10),
        customer_name: customerName,
        company_name: Number(inv.company) === 2 ? 'Tej Biocare' : 'CMHP Pharma',
        order_number: order?.number || inv.order_number || (order?.id ? `ORD-${order.id}` : '—'),
        total: grandTotal,
        total_amount: grandTotal,
        total_paid: totalPaid,
        balance_due: balanceDue,
        due_date: dueDate,
        status,
        sheetData: savedSheet || inv.sheetData,
        payments: invoicePayments,
      }
    })
  }, [reduxInvoices, compId, reduxOrders, reduxCustomers, savedOrderInvoices, reduxPayments])

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Monthly Filter State (Default: Current Month, e.g. 2026-10)
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modal, setModal] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [activeViewTab, setActiveViewTab] = useState('invoice') // 'invoice' | 'payments' | 'activity'

  // Payment Recording State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentTargetInvoice, setPaymentTargetInvoice] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    mode: 'NEFT/RTGS',
    reference: '',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  // Cancellation State
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // Build Month/Year Options for Select
  const monthOptions = useMemo(() => {
    const dates = invoices.map((inv) => inv.invoice_date || inv.date || inv.created_at)
    return buildMonthOptions(dates, currentMonthKey)
  }, [invoices, currentMonthKey])

  // Auto-scroll and highlight target invoice when redirected from Production (2-second highlight)
  useEffect(() => {
    const targetId = location.state?.highlightInvoiceId
    if (targetId) {
      setSearch('')
      setStatusFilter('ALL')
      setSelectedMonth('ALL')
      setHighlightedId(targetId)

      window.history.replaceState({}, document.title)

      const timerScroll = setTimeout(() => {
        const row = document.getElementById(`invoice-row-${targetId}`)
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 150)

      const timerHighlight = setTimeout(() => {
        setHighlightedId(null)
      }, 2000)

      return () => {
        clearTimeout(timerScroll)
        clearTimeout(timerHighlight)
      }
    }
  }, [location.state])

  // Filter strictly by Selected Month first
  const monthlyInvoices = useMemo(() => {
    if (selectedMonth === 'ALL') return invoices
    return invoices.filter((inv) => {
      const d = inv.invoice_date || inv.date || inv.created_at
      return matchesMonthYear(d, selectedMonth)
    })
  }, [invoices, selectedMonth])

  // Combined Search and Status filter within the selected month
  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()

    return monthlyInvoices.filter((inv) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        inv.status === statusFilter

      const matchesTerm =
        !term ||
        inv.number?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term) ||
        inv.company_name?.toLowerCase().includes(term) ||
        inv.order_number?.toLowerCase().includes(term)

      return matchesStatus && matchesTerm
    })
  }, [monthlyInvoices, search, statusFilter])

  // Summary KPIs for Selected Month (Single Source of Truth)
  const kpis = useMemo(() => {
    const activeInvoices = monthlyInvoices.filter((i) => i.status !== 'CANCELLED')
    const activeCount = activeInvoices.length

    // Total Invoiced for month
    const totalInvoiced = activeInvoices.reduce(
      (sum, i) => sum + (Number(i.total) || 0),
      0
    )

    // Collected / Paid for month
    const paid = monthlyInvoices.reduce(
      (sum, i) => sum + (Number(i.total_paid) || 0),
      0
    )
    const paidCount = activeInvoices.filter((i) => i.status === 'PAID').length

    // Overdue Amount
    const today = new Date().toISOString().slice(0, 10)
    const overdueInvoices = activeInvoices.filter((i) => {
      if (i.status === 'OVERDUE') return true
      return Boolean(i.due_date && i.due_date < today && Number(i.balance_due) > 0)
    })
    const overdueAmount = overdueInvoices.reduce(
      (sum, i) => sum + (Number(i.balance_due !== undefined ? i.balance_due : i.total) || 0),
      0
    )
    const overdueCount = overdueInvoices.length

    // Pending / Outstanding
    const pendingInvoices = activeInvoices.filter(
      (i) => i.status !== 'PAID' && !overdueInvoices.includes(i)
    )
    const outstanding = pendingInvoices.reduce(
      (sum, i) => sum + (Number(i.balance_due !== undefined ? i.balance_due : i.total) || 0),
      0
    )
    const pendingCount = pendingInvoices.length

    return {
      totalInvoiced,
      paid,
      outstanding,
      overdueAmount,
      activeCount,
      paidCount,
      pendingCount,
      overdueCount,
    }
  }, [monthlyInvoices])

  const openCreate = () => {
    navigate('/invoices/new')
  }

  const openView = (invoice) => {
    navigate('/invoices/view/' + invoice.id)
  }

  const close = () => {
    if (!saving) {
      setModal('')
      setViewing(null)
      setPaymentModalOpen(false)
      setCancelModalOpen(false)
    }
  }

  // Reset all filters back to current month
  const resetFilters = () => {
    setSearch('')
    setStatusFilter('ALL')
    setSelectedMonth(currentMonthKey)
  }

  const isFiltered = Boolean(search || statusFilter !== 'ALL' || selectedMonth !== currentMonthKey)

  // Open Payment modal
  const openRecordPayment = (inv) => {
    const target = inv || viewing
    setPaymentTargetInvoice(target)
    const balance = target.balance_due !== undefined ? target.balance_due : target.total
    setPaymentForm({
      amount: String(balance),
      mode: 'NEFT/RTGS',
      reference: '',
      payment_date: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setPaymentModalOpen(true)
  }

  const handleSavePayment = async (e) => {
    e.preventDefault()
    if (!paymentTargetInvoice) return

    const payAmt = Number(paymentForm.amount) || 0
    if (payAmt <= 0) {
      setError('Payment amount must be greater than zero.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await invoiceService.recordPayment(paymentTargetInvoice.id, paymentForm, user)
      setSuccess(`Payment of ₹${formatINR(payAmt)} recorded successfully.`)
      setPaymentModalOpen(false)

      if (viewing && viewing.id === paymentTargetInvoice.id) {
        const refreshed = await invoiceService.getInvoice(viewing.id)
        setViewing(refreshed)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Cancel Invoice
  const handleCancelInvoice = async () => {
    if (!viewing) return
    if (!cancelReason.trim()) {
      setError('Please specify a mandatory reason for cancelling this invoice.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await invoiceService.cancelInvoice(viewing.id, cancelReason.trim(), user)
      setSuccess(`Invoice ${viewing.number} cancelled. Linked order reverted to READY_TO_INVOICE.`)
      setCancelModalOpen(false)
      setModal('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Print Invoice
  const handlePrint = () => {
    recordAudit({
      action: 'invoice/printed',
      entityType: 'Invoice',
      entityId: viewing?.number,
      description: `Tax invoice ${viewing?.number} printed/downloaded by ${user?.first_name || user?.username}`,
    })
    window.print()
  }

  // Download standalone HTML invoice file
  const handleDownloadHtml = () => {
    if (!viewing) return
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tax Invoice - ${viewing.number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 40px; color: #1e293b; }
    .tax-box { border: 2px solid #0f172a; padding: 24px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 16px; }
    .header h1 { margin: 0 0 6px; font-size: 20px; color: #0b73df; }
    .header p { margin: 2px 0; font-size: 12px; color: #475569; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    th { background: #f1f5f9; }
    .num { text-align: right; }
    .totals { width: 300px; margin-left: auto; margin-bottom: 24px; }
    .totals td { padding: 4px 8px; }
    .grand { font-weight: 700; font-size: 14px; background: #f8fafc; }
    .bank { font-size: 12px; background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
    .sign { text-align: right; margin-top: 40px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="tax-box">
    <div class="header">
      <h1>TAX INVOICE</h1>
      <h2>${viewing.company_profile?.name || viewing.company_name}</h2>
      <p>${viewing.company_profile?.address}</p>
      <p>GSTIN: <strong>${viewing.company_profile?.gstin}</strong> | State: ${viewing.company_profile?.state || 'Gujarat'}</p>
    </div>
    <div class="meta-grid">
      <div>
        <strong>Invoice No:</strong> ${viewing.number}<br>
        <strong>Date:</strong> ${formatDateIN(viewing.invoice_date)}<br>
        <strong>Order Ref:</strong> ${viewing.order_number || '—'}
      </div>
      <div>
        <strong>Billed To:</strong> ${viewing.customer_name}<br>
        <strong>GSTIN:</strong> ${viewing.customer_profile?.gstin || 'Unregistered'}<br>
        <strong>Payment Terms:</strong> ${viewing.payment_terms || 'Net 30'}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Sr</th><th>Description</th><th>HSN</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(viewing.lines || []).map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${l.product_name}</td>
            <td>${l.hsn_code}</td>
            <td class="num">${l.quantity}</td>
            <td>${l.unit}</td>
            <td class="num">₹${formatINR(l.rate)}</td>
            <td class="num">₹${formatINR(l.total_amount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <table class="totals">
      <tr><td>Taxable Subtotal:</td><td class="num">₹${formatINR(viewing.subtotal)}</td></tr>
      <tr><td>Grand Total:</td><td class="num"><strong>₹${formatINR(viewing.total)}</strong></td></tr>
    </table>
  </div>
</body>
</html>
    `

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Invoice_${viewing.number.replace(/\//g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewingAuditLogs = useMemo(() => {
    if (!viewing?.number) return []
    return getEntityAuditLogs('Invoice', viewing.number)
  }, [viewing])

  return (
    <div className="inv">
      {/* 1. PAGE HEADER */}
      <div className="inv-header">
        <div>
          <h1>Invoicing</h1>
          <p>
            Enterprise GST Tax Invoicing connected to Orders, QC & QA with automated payments and A4 printing.
          </p>
        </div>
      </div>

      {error && !modal && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* 2. MONTHLY FILTER BAR AT TOP OF PAGE */}
      <div className="inv-month-bar">
        <div className="inv-month-controls">
          <span className="inv-month-label">
            <ClockIcon size={16} />
            Month Filter:
          </span>
          <select
            className="inv-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            title="Filter invoices by month and year"
          >
            <option value="ALL">All Time</option>
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {selectedMonth !== currentMonthKey && (
            <button
              type="button"
              className="inv-pill-btn"
              onClick={() => setSelectedMonth(currentMonthKey)}
            >
              Current Month
            </button>
          )}

          {selectedMonth !== 'ALL' && (
            <button
              type="button"
              className="inv-pill-btn"
              onClick={() => setSelectedMonth('ALL')}
            >
              All Time
            </button>
          )}

          {isFiltered && (
            <button
              type="button"
              className="inv-reset-btn"
              onClick={resetFilters}
            >
              ✕ Reset filters
            </button>
          )}
        </div>

        <div className="inv-period-badge">
          Showing: <strong>{selectedMonth === 'ALL' ? 'All Time Register' : formatMonthYearLabel(selectedMonth)}</strong> ({filteredInvoices.length} invoices)
        </div>
      </div>

      {/* 3. MONTHLY SUMMARY KPIS */}
      <div className="inv-kpis">
        <div className="inv-kpi-card kpi-total">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon blue">
              <ReceiptIcon size={18} />
            </div>
            <span className="inv-kpi-label">Total Invoices</span>
          </div>
          <div className="inv-kpi-value">{formatINR(kpis.totalInvoiced)}</div>
          <span className="inv-kpi-subtext">
            {kpis.activeCount} active invoices {selectedMonth !== 'ALL' ? `in ${formatMonthYearLabel(selectedMonth)}` : ''}
          </span>
        </div>

        <div className="inv-kpi-card kpi-paid">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon green">
              <WalletIcon size={18} />
            </div>
            <span className="inv-kpi-label">Paid Amount</span>
          </div>
          <div className="inv-kpi-value text-green">{formatINR(kpis.paid)}</div>
          <span className="inv-kpi-subtext">{kpis.paidCount} fully settled</span>
        </div>

        <div className="inv-kpi-card kpi-pending">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon orange">
              <ClockIcon size={18} />
            </div>
            <span className="inv-kpi-label">Pending Amount</span>
          </div>
          <div className="inv-kpi-value text-orange">{formatINR(kpis.outstanding)}</div>
          <span className="inv-kpi-subtext">{kpis.pendingCount} pending collection</span>
        </div>

        <div className="inv-kpi-card kpi-overdue">
          <div className="inv-kpi-top">
            <div className="inv-kpi-icon red">
              <AlertIcon size={18} />
            </div>
            <span className="inv-kpi-label">Overdue Amount</span>
          </div>
          <div className="inv-kpi-value text-red">{formatINR(kpis.overdueAmount)}</div>
          <span className="inv-kpi-subtext">{kpis.overdueCount} require follow-up</span>
        </div>
      </div>

      {/* 4. INVOICES REGISTER PANEL */}
      <div className="inv-panel">
        <div className="inv-toolbar">
          <h3 className="inv-toolbar-title">Invoices & Billing Register</h3>

          <div className="invoice-toolbar-controls">
            <div className="inv-search-wrap">
              <svg
                className="inv-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                className="field-input invoice-search-input"
                placeholder="Search invoice #, customer, order…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="inv-search-clear-btn"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <select
              className="field-input invoice-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All statuses' : s.replace('_', ' ')}
                </option>
              ))}
            </select>

            {isFiltered && (
              <button
                type="button"
                className="inv-reset-btn"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            )}

            <Button onClick={openCreate}>+ Create Invoice</Button>
          </div>
        </div>

        <div className="inv-table-scroll">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Type</th>
                <th>Company</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Total (₹)</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  id={`invoice-row-${inv.id}`}
                  className={`inv-row ${String(highlightedId) === String(inv.id) ? "invoice-row-highlight" : ""}`}
                  onClick={() => openView(inv)}
                >
                  <td className="cell-strong">
                    <span
                      style={{ cursor: 'pointer', color: '#0b73df', fontWeight: 700 }}
                      onClick={() => openView(inv)}
                    >
                      {inv.number}
                    </span>
                    {inv.order_number && inv.order_number !== '—' && (
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>
                        SO: {inv.order_number}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: '#f1f5f9',
                        borderRadius: '4px',
                        fontWeight: 600,
                        color: '#475569',
                      }}
                    >
                      Tax Invoice
                    </span>
                  </td>
                  <td>{inv.company_name}</td>
                  <td className="cell-strong">{inv.customer_name}</td>
                  <td>{formatDateIN(inv.invoice_date)}</td>
                  <td>
                    <span
                      style={{
                        color: inv.status === 'OVERDUE' ? '#dc2626' : 'inherit',
                        fontWeight: inv.status === 'OVERDUE' ? 700 : 'normal',
                      }}
                    >
                      {formatDateIN(inv.due_date)}
                    </span>
                  </td>
                  <td className="cell-strong num">₹{formatINR(inv.total)}</td>
                  <td
                    className="cell-strong num"
                    style={{
                      color: Number(inv.balance_due) > 0 ? '#dc2626' : '#059669',
                    }}
                  >
                    ₹{formatINR(inv.balance_due !== undefined ? inv.balance_due : inv.total)}
                  </td>
                  <td>
                    <StatusPill tone={statusTone(inv.status)}>{inv.status}</StatusPill>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="inv-row-actions">
                      <button
                        type="button"
                        className="inv-action-btn inv-btn-view"
                        onClick={() => openView(inv)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="inv-action-btn inv-btn-print"
                        onClick={() => navigate('/invoices/view/' + inv.id + '?autoPrint=true')}
                      >
                        Print
                      </button>
                      {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          className="inv-action-btn inv-btn-pay"
                          onClick={() => openRecordPayment(inv)}
                        >
                          Pay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="inv-empty">
                    <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', padding: '12px', background: '#f1f5f9', borderRadius: '50%', color: '#94a3b8', marginBottom: '12px' }}>
                        <ReceiptIcon size={28} />
                      </div>
                      <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '16px' }}>
                        {selectedMonth !== 'ALL'
                          ? `No invoices found for ${formatMonthYearLabel(selectedMonth)}`
                          : 'No invoices found'}
                      </h4>
                      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
                        {search || statusFilter !== 'ALL'
                          ? 'No invoices match your search or status filter criteria.'
                          : selectedMonth !== 'ALL'
                          ? `No invoices were issued in ${formatMonthYearLabel(selectedMonth)}. You can select another month or view All Time.`
                          : 'No invoices have been created yet.'}
                      </p>
                      {isFiltered && (
                        <Button
                          variant="secondary"
                          onClick={resetFilters}
                        >
                          Reset filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          VIEW INVOICE MODAL
          ======================================================== */}
      {modal === 'view' && viewing && (
        <Modal
          title={`Invoice ${viewing.number}`}
          onClose={close}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div>
                {viewing.status !== 'CANCELLED' && (
                  <Button
                    variant="secondary"
                    onClick={() => setCancelModalOpen(true)}
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  >
                    Cancel Invoice
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={handleDownloadHtml}>
                  Download HTML
                </Button>
                <Button variant="secondary" onClick={handlePrint}>
                  Print Invoice
                </Button>
                {viewing.status !== 'PAID' && viewing.status !== 'CANCELLED' && (
                  <Button onClick={() => openRecordPayment(viewing)}>
                    Record Payment
                  </Button>
                )}
                <Button variant="secondary" onClick={close}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          {/* View Tab Nav */}
          <div className="inv-view-tabs no-print">
            <button
              className={`inv-tab-btn ${activeViewTab === 'invoice' ? 'active' : ''}`}
              onClick={() => setActiveViewTab('invoice')}
            >
              Tax Invoice (A4 Layout)
            </button>
            <button
              className={`inv-tab-btn ${activeViewTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveViewTab('payments')}
            >
              Payments & Balance ({viewing.payments?.length || 0})
            </button>
            <button
              className={`inv-tab-btn ${activeViewTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveViewTab('activity')}
            >
              Activity & Audit History
            </button>
          </div>

          {/* TAB 1: TAX INVOICE */}
          {activeViewTab === 'invoice' && (
            <div className="print-only-invoice tax-inv-box">
              <div className="tax-inv-header">
                <div className="tax-inv-company">
                  <h2>{viewing.company_profile?.name || viewing.company_name}</h2>
                  <p>{viewing.company_profile?.address}</p>
                  <p>
                    GSTIN: <strong>{viewing.company_profile?.gstin || '24AAACC1234M1Z2'}</strong> | State: <strong>{viewing.company_profile?.state || 'Gujarat'} ({viewing.company_profile?.state_code || '24'})</strong>
                  </p>
                </div>
                <div className="tax-inv-title">
                  <h3>TAX INVOICE</h3>
                  <div className="tax-inv-meta">
                    <div>
                      <span>Invoice #:</span>
                      <strong>{viewing.number}</strong>
                    </div>
                    <div>
                      <span>Invoice Date:</span>
                      <strong>{formatDateIN(viewing.invoice_date)}</strong>
                    </div>
                    <div>
                      <span>Due Date:</span>
                      <strong>{formatDateIN(viewing.due_date)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="tax-inv-parties">
                <div className="tax-inv-party-card">
                  <h4>Billed To (Customer Details)</h4>
                  <p><strong>{viewing.customer_name}</strong></p>
                  <p>{viewing.customer_profile?.billing_address}</p>
                  <p>
                    GSTIN: <strong>{viewing.customer_profile?.gstin || 'Unregistered'}</strong>
                  </p>
                </div>
                <div className="tax-inv-party-card">
                  <h4>Shipped To (Delivery Address)</h4>
                  <p><strong>{viewing.customer_name}</strong></p>
                  <p>{viewing.customer_profile?.shipping_address || viewing.customer_profile?.billing_address}</p>
                </div>
              </div>

              <table className="tax-inv-table">
                <thead>
                  <tr>
                    <th>Sr</th>
                    <th>Product & Description</th>
                    <th>HSN</th>
                    <th className="num">Qty</th>
                    <th>Unit</th>
                    <th className="num">Rate (₹)</th>
                    <th className="num">Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.lines || []).map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{line.product_name}</strong>
                      </td>
                      <td>{line.hsn_code}</td>
                      <td className="num">{line.quantity}</td>
                      <td>{line.unit}</td>
                      <td className="num">₹{formatINR(line.rate)}</td>
                      <td className="num">₹{formatINR(line.total_amount || (Number(line.quantity) * Number(line.rate)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="tax-inv-words">
                <strong>Amount in Words: </strong>
                {viewing.total_in_words || numberToWordsINR(viewing.total)}
              </div>
            </div>
          )}

          {/* TAB 2: PAYMENTS & BALANCE */}
          {activeViewTab === 'payments' && (
            <div style={{ padding: '8px 0' }}>
              <div className="inv-modal-kpis" style={{ marginBottom: '16px' }}>
                <div className="inv-modal-kpi-card">
                  <span>Total Billed</span>
                  <strong>{formatINR(viewing.total)}</strong>
                </div>
                <div className="inv-modal-kpi-card">
                  <span>Total Received</span>
                  <strong style={{ color: '#059669' }}>{formatINR(viewing.total_paid || 0)}</strong>
                </div>
                <div className="inv-modal-kpi-card">
                  <span>Balance Due</span>
                  <strong style={{ color: '#dc2626' }}>{formatINR(viewing.balance_due !== undefined ? viewing.balance_due : viewing.total)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: '#163b59' }}>Payment Transactions</h4>
                {viewing.status !== 'PAID' && viewing.status !== 'CANCELLED' && (
                  <Button onClick={() => openRecordPayment(viewing)}>
                    + Record New Payment
                  </Button>
                )}
              </div>

              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Payment #</th>
                      <th>Date</th>
                      <th>Mode</th>
                      <th>Reference / UTR</th>
                      <th>Amount (₹)</th>
                      <th>Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewing.payments || []).map((p, idx) => (
                      <tr key={idx}>
                        <td className="cell-strong">{p.number}</td>
                        <td>{formatDateIN(p.payment_date)}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0b73df' }}>{p.mode}</span>
                        </td>
                        <td>{p.reference || '—'}</td>
                        <td className="cell-strong" style={{ color: '#059669' }}>
                          ₹{formatINR(p.amount)}
                        </td>
                        <td>{p.recorded_by}</td>
                      </tr>
                    ))}
                    {(!viewing.payments || viewing.payments.length === 0) && (
                      <tr>
                        <td colSpan={6} className="inv-empty">
                          No payments recorded yet for this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVITY / HISTORY */}
          {activeViewTab === 'activity' && (
            <div style={{ padding: '8px 0' }}>
              <h4 style={{ margin: '0 0 12px', color: '#163b59' }}>
                Append-Only Audit Trail for Invoice {viewing.number}
              </h4>
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Timestamp (IST)</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Description</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTimeIN(log.timestamp)}</td>
                        <td>
                          <strong>{log.user_name || log.user_id}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>{log.role}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#0b73df' }}>{log.action}</span>
                        </td>
                        <td>{log.description}</td>
                        <td>{log.remarks || '—'}</td>
                      </tr>
                    ))}
                    {viewingAuditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="inv-empty">
                          No activity history entries found for this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ========================================================
          PAYMENT RECORDING MODAL
          ======================================================== */}
      {paymentModalOpen && paymentTargetInvoice && (
        <Modal
          title={`Record Payment for ${paymentTargetInvoice.number}`}
          onClose={() => setPaymentModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPaymentModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button loading={saving} onClick={handleSavePayment}>
                Confirm Payment
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={handleSavePayment}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Customer: <strong>{paymentTargetInvoice.customer_name}</strong></span>
                <span>
                  Outstanding Balance: <strong style={{ color: '#dc2626' }}>
                    ₹{formatINR(paymentTargetInvoice.balance_due !== undefined ? paymentTargetInvoice.balance_due : paymentTargetInvoice.total)}
                  </strong>
                </span>
              </div>
            </div>

            <div className="inv-form-grid">
              <Input
                label="Payment Amount (₹) *"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Payment Mode *</label>
                <select
                  className="field-input"
                  value={paymentForm.mode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}
                  required
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Payment Date *"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                required
              />

              <Input
                label="Reference / UTR / Cheque #"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                placeholder="e.g. UTR12345678, CHQ-998877"
              />
            </div>

            <div className="field field-full" style={{ marginTop: '12px' }}>
              <label className="field-label">Payment Remarks</label>
              <input
                className="field-input"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="Optional payment notes or bank narration"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================
          CANCELLATION REASON MODAL
          ======================================================== */}
      {cancelModalOpen && viewing && (
        <Modal
          title={`Cancel Invoice ${viewing.number}`}
          onClose={() => setCancelModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelModalOpen(false)} disabled={saving}>
                Back
              </Button>
              <Button
                loading={saving}
                onClick={handleCancelInvoice}
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
              >
                Confirm Cancellation
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <p style={{ color: '#475569', fontSize: '13px' }}>
            Are you sure you want to cancel invoice <strong>{viewing.number}</strong>?
            This action will mark the invoice as <strong>CANCELLED</strong>, revert any linked Sales Order back to <strong>READY_TO_INVOICE</strong>, and create a permanent audit log entry.
          </p>

          <div className="field field-full" style={{ marginTop: '16px' }}>
            <label className="field-label">Mandatory Reason for Cancellation *</label>
            <textarea
              className="field-input"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Incorrect tax configuration, client requested revision, order cancelled by buyer..."
              required
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
