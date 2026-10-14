import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import { updateStockRequestStatus } from '../../../store/erpSlice'
import { logAudit } from '../../../utils/audit'
import './StockTab.css'
import './CommonInventory.css'

export default function StockRequestsTab({ role }) {
  const dispatch = useDispatch()
  const currentUser = useSelector((state) => state.auth?.user || {})
  const stockRequests = useSelector((state) => state.erp?.stockRequests || [])

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [fulfillModalReq, setFulfillModalReq] = useState(null)
  const [fulfilledQtyInput, setFulfilledQtyInput] = useState('')
  const [fulfillNotes, setFulfillNotes] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = stockRequests.length
    const requested = stockRequests.filter((r) => r.status === 'Requested').length
    const inProgress = stockRequests.filter((r) => r.status === 'In Progress').length
    const fulfilled = stockRequests.filter((r) => r.status === 'Fulfilled').length
    return { total, requested, inProgress, fulfilled }
  }, [stockRequests])

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return (stockRequests || []).filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const reqNum = String(r.requestNumber || r.id || '').toLowerCase()
        const ordNum = String(r.orderNumber || '').toLowerCase()
        const prod = String(r.product || r.productName || '').toLowerCase()
        const mat = String(r.materialName || '').toLowerCase()
        const code = String(r.materialCode || '').toLowerCase()
        if (
          !reqNum.includes(q) &&
          !ordNum.includes(q) &&
          !prod.includes(q) &&
          !mat.includes(q) &&
          !code.includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [stockRequests, statusFilter, search])

  // Change status to "In Progress"
  const handleMarkInProgress = (req) => {
    dispatch(
      updateStockRequestStatus({
        id: req.id,
        status: 'In Progress',
        notes: `Marked in-progress by ${currentUser?.username || 'Inventory Team'}`,
      })
    )
    logAudit({
      module: 'INVENTORY',
      entity_type: 'StockRequest',
      entity_id: req.requestNumber || req.id,
      action: 'STOCK_REQUEST_IN_PROGRESS',
      description: `Stock request for ${req.materialName} marked In Progress`,
      company: req.company || 1,
      user: currentUser?.username || 'Inventory Team',
      role: role || 'INVENTORY_MANAGER',
    })
    setSuccess(`Stock request ${req.requestNumber || req.id} is now In Progress.`)
  }

  // Open fulfill modal
  const openFulfillModal = (req) => {
    setFulfillModalReq(req)
    setFulfilledQtyInput(String(req.shortageQuantity || req.requiredQuantity || ''))
    setFulfillNotes('')
    setError('')
  }

  // Submit fulfillment
  const handleConfirmFulfillment = (e) => {
    e.preventDefault()
    if (!fulfillModalReq) return

    const qty = Number(fulfilledQtyInput)
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid stock quantity to replenish.')
      return
    }

    dispatch(
      updateStockRequestStatus({
        id: fulfillModalReq.id,
        status: 'Fulfilled',
        fulfilledStock: qty,
        notes: fulfillNotes.trim() || `Replenished ${qty} ${fulfillModalReq.unit} by Inventory Team`,
      })
    )

    logAudit({
      module: 'INVENTORY',
      entity_type: 'StockRequest',
      entity_id: fulfillModalReq.requestNumber || fulfillModalReq.id,
      action: 'STOCK_REQUEST_FULFILLED',
      description: `Fulfilled stock request for ${fulfillModalReq.materialName} (+${qty} ${fulfillModalReq.unit}). Store Manager notified.`,
      company: fulfillModalReq.company || 1,
      user: currentUser?.username || 'Inventory Team',
      role: role || 'INVENTORY_MANAGER',
    })

    setSuccess(
      `Stock request ${fulfillModalReq.requestNumber || fulfillModalReq.id} fulfilled! Added ${qty} ${fulfillModalReq.unit} to Inventory. Store Manager notified.`
    )
    setFulfillModalReq(null)
  }

  return (
    <div className="ci-container" style={{ padding: '0 0 24px' }}>
      {/* Alert Banners */}
      {success && (
        <Alert variant="success" onClose={() => setSuccess('')} style={{ marginBottom: 16 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" onClose={() => setError('')} style={{ marginBottom: 16 }}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="ci-cards-grid" style={{ marginBottom: 20 }}>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📋
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Requests</span>
            <span className="ci-card-value">{metrics.total}</span>
            <span className="ci-card-subtext">Order material requisitions</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            ⏳
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Requested (Pending)</span>
            <span className="ci-card-value" style={{ color: '#d97706' }}>
              {metrics.requested}
            </span>
            <span className="ci-card-subtext">Awaiting procurement/stock</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            ⚡
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">In Progress</span>
            <span className="ci-card-value" style={{ color: '#0284c7' }}>
              {metrics.inProgress}
            </span>
            <span className="ci-card-subtext">Under allocation</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
            ✓
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Fulfilled</span>
            <span className="ci-card-value" style={{ color: '#166534' }}>
              {metrics.fulfilled}
            </span>
            <span className="ci-card-subtext">Stock replenished</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        className="inv-filters-bar"
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
          background: '#ffffff',
          padding: 14,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <input
          type="search"
          placeholder="Search by Request #, Order #, Product, or Raw Material…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="company-input"
          style={{ minWidth: 260, flex: 2 }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="company-input"
          style={{ width: 160 }}
        >
          <option value="ALL">All Statuses</option>
          <option value="Requested">Requested (Pending)</option>
          <option value="In Progress">In Progress</option>
          <option value="Fulfilled">Fulfilled</option>
        </select>

        {(search || statusFilter !== 'ALL') && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSearch('')
              setStatusFilter('ALL')
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Requests Table */}
      {filteredRequests.length === 0 ? (
        <div className="ci-empty-card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="ci-empty-icon" style={{ fontSize: 36, marginBottom: 12 }}>
            📦
          </div>
          <h3 className="ci-empty-title" style={{ margin: '0 0 8px', color: '#1e293b' }}>
            {stockRequests.length === 0
              ? 'No Stock Requests Yet'
              : 'No Requests Match Filter'}
          </h3>
          <p className="ci-empty-desc" style={{ color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
            {stockRequests.length === 0
              ? 'When raw material shortages are detected in Sales Orders, Store Managers can send replenishment requests. They will appear here for the Inventory team to fulfill.'
              : 'Try clearing your search keyword or selecting "All Statuses" to see other requests.'}
          </p>
        </div>
      ) : (
        <div className="ci-table-card">
          <div className="ci-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Request #</th>
                  <th>Order # / Product</th>
                  <th>Raw Material</th>
                  <th>Batch No.</th>
                  <th style={{ textAlign: 'right' }}>Req Qty</th>
                  <th style={{ textAlign: 'right' }}>Available</th>
                  <th style={{ textAlign: 'right' }}>Shortage</th>
                  <th>Requested By</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const isPending = req.status === 'Requested'
                  const isInProgress = req.status === 'In Progress'
                  const isFulfilled = req.status === 'Fulfilled'

                  const statusBadgeStyle = isFulfilled
                    ? { bg: '#dcfce7', color: '#166534', border: '#86efac' }
                    : isInProgress
                    ? { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' }
                    : { bg: '#fef3c7', color: '#92400e', border: '#fde68a' }

                  return (
                    <tr key={req.id}>
                      <td>
                        <strong>{req.requestNumber || req.id}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {req.date ? new Date(req.date).toLocaleDateString() : '—'}
                        </div>
                      </td>
                      <td>
                        <strong>{req.orderNumber || 'Pending Order'}</strong>
                        <div style={{ fontSize: 12, color: '#475569' }}>
                          {req.product || req.productName || '—'}
                        </div>
                      </td>
                      <td>
                        <strong>{req.materialName || '—'}</strong>
                        {req.materialCode && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Code: {req.materialCode}
                          </div>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: 12, padding: '2px 4px', background: '#f1f5f9', borderRadius: 4 }}>
                          {req.batchNo || '—'}
                        </code>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {req.requiredQuantity} {req.unit}
                      </td>
                      <td style={{ textAlign: 'right', color: '#64748b' }}>
                        {req.availableQuantity} {req.unit}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong style={{ color: '#dc2626' }}>
                          {req.shortageQuantity} {req.unit}
                        </strong>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {req.requestedBy || 'Store Manager'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {req.requestedByRole || 'Store Manager'}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            background: statusBadgeStyle.bg,
                            color: statusBadgeStyle.color,
                            border: `1px solid ${statusBadgeStyle.border}`,
                          }}
                        >
                          {isFulfilled ? '✓ Fulfilled' : isInProgress ? '● In Progress' : '⏳ Requested'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isPending && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => handleMarkInProgress(req)}
                            style={{ marginRight: 6 }}
                          >
                            In Progress
                          </Button>
                        )}
                        {!isFulfilled && (
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() => openFulfillModal(req)}
                            style={{
                              backgroundColor: '#16a34a',
                              borderColor: '#15803d',
                              fontWeight: 600,
                            }}
                          >
                            Fulfill &amp; Add Stock
                          </Button>
                        )}
                        {isFulfilled && (
                          <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                            Stock Added ✓
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fulfillment Modal */}
      {fulfillModalReq && (
        <Modal
          title={`Fulfill Stock Request — ${fulfillModalReq.requestNumber || fulfillModalReq.id}`}
          isOpen={Boolean(fulfillModalReq)}
          onClose={() => setFulfillModalReq(null)}
        >
          <form onSubmit={handleConfirmFulfillment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <div><strong>Raw Material:</strong> {fulfillModalReq.materialName} ({fulfillModalReq.materialCode})</div>
              <div><strong>Order Reference:</strong> Order #{fulfillModalReq.orderNumber} ({fulfillModalReq.product})</div>
              <div><strong>Reported Shortage:</strong> <span style={{ color: '#dc2626', fontWeight: 700 }}>{fulfillModalReq.shortageQuantity} {fulfillModalReq.unit}</span></div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Quantity to Add to Inventory ({fulfillModalReq.unit}) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                className="company-input"
                style={{ width: '100%', fontSize: 16, fontWeight: 700 }}
                value={fulfilledQtyInput}
                onChange={(e) => setFulfilledQtyInput(e.target.value)}
              />
              <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 4 }}>
                Adding this quantity will update current stock in Inventory and clear the shortage for the Sales Order.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Resolution / GRN Notes (Optional)
              </label>
              <input
                type="text"
                className="company-input"
                style={{ width: '100%' }}
                placeholder="e.g. Inward received via GRN-2026-0082"
                value={fulfillNotes}
                onChange={(e) => setFulfillNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button type="button" variant="secondary" onClick={() => setFulfillModalReq(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                style={{ backgroundColor: '#16a34a', borderColor: '#15803d', fontWeight: 600 }}
              >
                Confirm Fulfillment &amp; Notify Store Manager
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
