import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { productionService } from './productionService'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { DOSAGE_FORMS } from '../../constants/dosageForms'
import { selectDosageForms } from '../../store/erpSlice'
import './Production.css'
import '../invoice/Invoice.css'

function money(value) {
  const n = Number(value) || 0
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function statusTone(status) {
  if (status === 'COMPLETED' || status === 'PAID' || status === 'DISPATCHED') return 'success'
  if (status === 'IN_PRODUCTION' || status === 'In Process' || status === 'PACKAGING') return 'info'
  if (status === 'In Planning' || status === 'Pending') return 'warning'
  return 'neutral'
}

export default function Production() {
  const navigate = useNavigate()
  const reduxDosageForms = useSelector(selectDosageForms)
  const dosageForms = reduxDosageForms && reduxDosageForms.length ? reduxDosageForms : DOSAGE_FORMS
  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Search & Filters in a single row
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [prodStatusFilter, setProdStatusFilter] = useState('ALL')
  const [pkgStatusFilter, setPkgStatusFilter] = useState('ALL')
  const [dispatchFilter, setDispatchFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Invoice Modal
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [invoiceSaving, setInvoiceSaving] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [orderList, invoiceList] = await Promise.all([
        productionService.getOrders(),
        productionService.getInvoices(),
      ])
      setOrders(orderList || [])
      setInvoices(invoiceList || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Update order production status in Redux
  const handleUpdate = async (orderId, updates) => {
    try {
      setOrders((prev) =>
        prev.map((o) => (String(o.id) === String(orderId) ? { ...o, ...updates } : o))
      )
      await productionService.updateProduction({
        id: orderId,
        ...updates,
      })
      setSuccess('Production status updated successfully')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // Open Invoice in project's exact format
  const handleOpenInvoice = (order) => {
    const existing = invoices.find(
      (inv) => String(inv.order) === String(order.id) || inv.batch === order.batch_no
    )
    if (existing) {
      setViewingInvoice(existing)
      return
    }

    const quantity = Number(String(order.batch_size || '100').replace(/[^0-9.]/g, '')) || 100
    const rate = Number(String(order.mrp_for_printing || '150').replace(/[^0-9.]/g, '')) || 150
    const lineTotal = quantity * rate
    const taxPercent = 18
    const taxAmount = (lineTotal * taxPercent) / 100
    const total = lineTotal + taxAmount

    const prefilled = {
      isNew: true,
      company: order.company,
      company_name: order.company_name || 'CMHP Pharma',
      customer: order.customer,
      customer_name: order.customer_name || 'Direct Customer',
      order: order.id,
      order_number: order.number || `ORD-${order.id}`,
      batch: order.batch_no,
      number: `INV-${order.number || order.id}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      subtotal: lineTotal,
      total: total,
      total_amount: total,
      status: 'ISSUED',
      notes: `Invoice pre-filled for Order #${order.number || order.id} (Batch: ${order.batch_no || 'N/A'})`,
      lines: [
        {
          id: `line-${order.id}`,
          product: order.product || 1,
          product_name: order.product_name || order.product_code || 'Oral Liquid Formulation',
          description: `${order.product_name || 'Oral Liquid Formulation'} - Batch ${order.batch_no || 'N/A'}`,
          quantity: String(quantity),
          rate: String(rate),
        },
      ],
      orderRef: order,
    }
    setViewingInvoice(prefilled)
  }

  // Save generated invoice
  const handleSaveInvoice = async () => {
    if (!viewingInvoice) return
    setInvoiceSaving(true)
    try {
      const created = await productionService.createInvoiceFromOrder(viewingInvoice.orderRef || viewingInvoice)
      setViewingInvoice(created)
      setInvoices((prev) => [created, ...prev])
      setSuccess(`Invoice ${created.number} saved in Redux!`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setInvoiceSaving(false)
    }
  }

  // Filtering
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesSearch =
        !term ||
        String(order.number || '').toLowerCase().includes(term) ||
        String(order.product_name || '').toLowerCase().includes(term) ||
        String(order.batch_no || '').toLowerCase().includes(term) ||
        String(order.customer_name || '').toLowerCase().includes(term)

      const orderType = String(order.dosage_form || order.dosageForm || order.product_type || order.type || 'Liquid').toLowerCase()
      const matchesType =
        typeFilter === 'ALL' || orderType === typeFilter.toLowerCase()

      const matchesProd =
        prodStatusFilter === 'ALL' ||
        (order.production_status || 'In Planning') === prodStatusFilter

      const matchesPkg =
        pkgStatusFilter === 'ALL' ||
        (order.packaging_status || 'Pending') === pkgStatusFilter

      const matchesDispatch =
        dispatchFilter === 'ALL' ||
        (order.dispatch_status || 'NO') === dispatchFilter

      const orderDate = order.order_date || ''
      const matchesFrom = !fromDate || (orderDate && orderDate >= fromDate)
      const matchesTo = !toDate || (orderDate && orderDate <= toDate)

      return matchesSearch && matchesType && matchesProd && matchesPkg && matchesDispatch && matchesFrom && matchesTo
    })
  }, [orders, search, typeFilter, prodStatusFilter, pkgStatusFilter, dispatchFilter, fromDate, toDate])

  // Pagination slice
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  return (
    <div className="prod-page">
      {/* HEADER */}
      <div className="prod-header">
        <h1>Production Management</h1>
        <p>
          Order-wise manufacturing tracking, digital 19-page BMR management, packaging status, dispatch, and invoicing.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '10px 14px', background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16 }}>
          {success}
        </div>
      )}

      {/* STATS STRIP */}
      <div className="prod-stats-strip">
        <div className="prod-stat-card">
          <span className="prod-stat-label">Total Orders</span>
          <span className="prod-stat-value">{orders.length}</span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">In Planning</span>
          <span className="prod-stat-value" style={{ color: '#d97706' }}>
            {orders.filter((o) => (o.production_status || 'In Planning') === 'In Planning').length}
          </span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">In Process</span>
          <span className="prod-stat-value" style={{ color: '#0284c7' }}>
            {orders.filter((o) => o.production_status === 'In Process').length}
          </span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">Completed</span>
          <span className="prod-stat-value" style={{ color: '#16a34a' }}>
            {orders.filter((o) => o.production_status === 'Completed').length}
          </span>
        </div>
        <div className="prod-stat-card">
          <span className="prod-stat-label">Dispatched</span>
          <span className="prod-stat-value" style={{ color: '#7c3aed' }}>
            {orders.filter((o) => o.dispatch_status === 'YES').length}
          </span>
        </div>
      </div>

      {/* FILTER BAR (Small rounded boxes in a single row) */}
      <div className="prod-filter-bar">
        <input
          type="text"
          className="prod-filter-input prod-filter-search"
          placeholder="Search by Order #, Product, Batch, Customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
        />

        <select
          className="prod-filter-select"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setCurrentPage(1)
          }}
          title="Filter by Dosage Form / Type"
        >
          <option value="ALL">All Types</option>
          {dosageForms.map((df) => (
            <option key={df} value={df}>
              {df}
            </option>
          ))}
        </select>

        <select
          className="prod-filter-select"
          value={prodStatusFilter}
          onChange={(e) => {
            setProdStatusFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">Production: All</option>
          <option value="In Planning">In Planning</option>
          <option value="In Process">In Process</option>
          <option value="Completed">Completed</option>
        </select>

        <select
          className="prod-filter-select"
          value={pkgStatusFilter}
          onChange={(e) => {
            setPkgStatusFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">Packaging: All</option>
          <option value="Pending">Pending</option>
          <option value="In Process">In Process</option>
          <option value="Completed">Completed</option>
        </select>

        <select
          className="prod-filter-select"
          value={dispatchFilter}
          onChange={(e) => {
            setDispatchFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">Dispatch: All</option>
          <option value="YES">Dispatch: Yes</option>
          <option value="NO">Dispatch: No</option>
        </select>

        <div className="prod-filter-date-group">
          <span className="prod-filter-date-label">From:</span>
          <input
            type="date"
            className="prod-filter-input prod-filter-date-input"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        <div className="prod-filter-date-group">
          <span className="prod-filter-date-label">To:</span>
          <input
            type="date"
            className="prod-filter-input prod-filter-date-input"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        {(search || typeFilter !== 'ALL' || prodStatusFilter !== 'ALL' || pkgStatusFilter !== 'ALL' || dispatchFilter !== 'ALL' || fromDate || toDate) && (
          <button
            type="button"
            className="prod-filter-reset"
            onClick={() => {
              setSearch('')
              setTypeFilter('ALL')
              setProdStatusFilter('ALL')
              setPkgStatusFilter('ALL')
              setDispatchFilter('ALL')
              setFromDate('')
              setToDate('')
              setCurrentPage(1)
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ORDERS TABLE */}
      <div className="prod-table-container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
            Loading production orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="prod-empty-state">
            <h3>No production orders found</h3>
            <p>
              {orders.length === 0
                ? 'No sales orders exist for this company yet. Orders created in the Orders module will automatically appear here.'
                : 'No orders match your filter criteria.'}
            </p>
          </div>
        ) : (
          <>
            <table className="prod-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Product</th>
                  <th>Batch No.</th>
                  <th>Customer</th>
                  <th>Quantity</th>
                  <th>Order Date</th>
                  <th>Supply-By Date</th>
                  <th>BMR Status</th>
                  <th>Production Status</th>
                  <th>Remark</th>
                  <th>Packaging Status</th>
                  <th>Dispatch</th>
                  <th>Invoice</th>
                  <th>BMR Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const bmrStatus = order.bmr_status || 'NO'
                  const prodStatus = order.production_status || 'In Planning'
                  const pkgStatus = order.packaging_status || 'Pending'
                  const dispatchStatus = order.dispatch_status || 'NO'
                  const dosageForm = order.dosage_form || order.dosageForm || order.product_type || order.type || 'Liquid'

                  return (
                    <tr key={order.id}>
                      {/* 1. Order No */}
                      <td>
                        <strong style={{ color: '#0284c7' }}>
                          #{order.number || order.id}
                        </strong>
                      </td>

                      {/* 2. Product */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {order.product_name || 'Oral Liquid Formulation'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {order.product_code || 'OL-001'}
                          </span>
                          <span className={`dosage-badge dosage-${dosageForm.toLowerCase()}`}>
                            {dosageForm}
                          </span>
                        </div>
                      </td>

                      {/* 3. Batch No */}
                      <td>
                        <span style={{ fontWeight: 700, background: '#f1f5f9', padding: '3px 8px', borderRadius: 4 }}>
                          {order.batch_no || 'AH2602'}
                        </span>
                      </td>

                      {/* 4. Customer */}
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {order.customer_name || 'Direct Customer'}
                        </div>
                      </td>

                      {/* 5. Quantity */}
                      <td>
                        <strong>{order.batch_size || '1000 LTR'}</strong>
                      </td>

                      {/* 6. Order Date */}
                      <td>{order.order_date || '—'}</td>

                      {/* 7. Supply-By Date */}
                      <td>{order.supply_by_date || order.planned_mfg_date || order.delivery_deadline || '—'}</td>

                      {/* 8. BMR Status (Yes / No toggle) */}
                      <td>
                        <div className="prod-row-yn">
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${bmrStatus === 'YES' ? 'active-yes' : ''}`}
                            onClick={() => handleUpdate(order.id, { bmr_status: 'YES' })}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${bmrStatus === 'NO' ? 'active-no' : ''}`}
                            onClick={() => handleUpdate(order.id, { bmr_status: 'NO' })}
                          >
                            No
                          </button>
                        </div>
                      </td>

                      {/* 9. Production Status (In Process / Completed / In Planning) */}
                      <td>
                        <select
                          className="prod-table-select"
                          value={prodStatus}
                          onChange={(e) => handleUpdate(order.id, { production_status: e.target.value })}
                        >
                          <option value="In Planning">In Planning</option>
                          <option value="In Process">In Process</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* 10. Remark (text input per order) */}
                      <td>
                        <input
                          type="text"
                          className="prod-table-input"
                          placeholder="Type remark..."
                          defaultValue={order.production_remark || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (order.production_remark || '')) {
                              handleUpdate(order.id, { remark: e.target.value })
                            }
                          }}
                        />
                      </td>

                      {/* 11. Packaging Status (Pending / In Process / Completed) */}
                      <td>
                        <select
                          className="prod-table-select"
                          value={pkgStatus}
                          onChange={(e) => handleUpdate(order.id, { packaging_status: e.target.value })}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Process">In Process</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* 12. Dispatch (Yes / No buttons) */}
                      <td>
                        <div className="prod-row-yn">
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${dispatchStatus === 'YES' ? 'active-yes' : ''}`}
                            onClick={() => handleUpdate(order.id, { dispatch: 'YES' })}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={`prod-row-yn-btn ${dispatchStatus === 'NO' ? 'active-no' : ''}`}
                            onClick={() => handleUpdate(order.id, { dispatch: 'NO' })}
                          >
                            No
                          </button>
                        </div>
                      </td>

                      {/* 13. Invoice (Button opening project invoice format) */}
                      <td>
                        <button
                          type="button"
                          className="prod-action-btn-inv"
                          onClick={() => handleOpenInvoice(order)}
                        >
                          🧾 Invoice
                        </button>
                      </td>

                      {/* 14. BMR Action Button */}
                      <td>
                        <button
                          type="button"
                          className="prod-action-btn-bmr"
                          onClick={() => navigate(`/production/bmr/${order.id}`)}
                        >
                          📄 BMR
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* PAGINATION */}
            <div className="prod-pagination">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="prod-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontWeight: 700, margin: '0 6px' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="prod-page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* INVOICE MODAL (Project's Exact Existing Invoice Format) */}
      {viewingInvoice && (
        <Modal
          title={`Invoice ${viewingInvoice.number || ''}`}
          onClose={() => setViewingInvoice(null)}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
              {viewingInvoice.isNew && (
                <Button
                  onClick={handleSaveInvoice}
                  disabled={invoiceSaving}
                >
                  {invoiceSaving ? 'Saving...' : '💾 Save to Invoices'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => window.print()}
              >
                🖨️ Print Invoice
              </Button>
              <Button
                variant="secondary"
                onClick={() => setViewingInvoice(null)}
              >
                Close
              </Button>
            </div>
          }
        >
          <div className="invoice-doc">
            <div className="invoice-doc-header">
              <div>
                <h3>{viewingInvoice.company_name}</h3>
                <p>Company Batch: {viewingInvoice.batch || '—'}</p>
                <p>Order Reference: #{viewingInvoice.order || '—'}</p>
              </div>
              <StatusPill tone={statusTone(viewingInvoice.status)}>
                {viewingInvoice.status || 'DRAFT'}
              </StatusPill>
            </div>

            <div className="invoice-doc-meta">
              <div>
                <span>Bill to</span>
                <strong>{viewingInvoice.customer_name}</strong>
              </div>
              <div>
                <span>Invoice date</span>
                <strong>{viewingInvoice.invoice_date}</strong>
              </div>
              <div>
                <span>Due date</span>
                <strong>{viewingInvoice.due_date || '—'}</strong>
              </div>
            </div>

            <table className="inv-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 110 }}>Rate (₹)</th>
                  <th style={{ width: 120 }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {(viewingInvoice.lines || []).map((line, idx) => (
                  <tr key={idx}>
                    <td>{line.description || line.product_name || '—'}</td>
                    <td>{line.quantity}</td>
                    <td>₹ {money(line.rate)}</td>
                    <td>₹ {money((Number(line.quantity) || 0) * (Number(line.rate) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="invoice-doc-totals">
              <div>
                <span>Subtotal</span>
                <strong>₹ {money(viewingInvoice.subtotal)}</strong>
              </div>
              <div>
                <span>Tax ({viewingInvoice.tax_percent || 18}%)</span>
                <strong>₹ {money(viewingInvoice.tax_amount)}</strong>
              </div>
              <div className="invoice-grand-total">
                <span>Total</span>
                <strong>₹ {money(viewingInvoice.total)}</strong>
              </div>
            </div>

            {viewingInvoice.notes && (
              <div className="invoice-doc-notes">
                <span>Notes</span>
                <p>{viewingInvoice.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
