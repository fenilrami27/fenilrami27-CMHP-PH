import { useEffect, useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import useAuth from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import HeroBanner from '../../components/HeroBanner'
import {
  selectFormulaApprovals,
  selectActiveCompanyId,
  selectActiveCompanyKey,
} from '../../utils/companySelectors'
import { decideFormulaApproval, updateOrderQaStatus } from '../../store/erpSlice'
import { resolveOrderDosageForm } from '../production/productionService'
import BmrRequisitionDocument from '../../components/BmrRequisitionDocument'
import {
  exportFormulaPrint,
  exportFormulaExcel,
} from '../../utils/formulaExport'
import { printElement } from '../../utils/printDocument'
import { formatDateIN, formatDateTimeIN } from '../../utils/formatters'
import { recordAudit } from '../../utils/audit'
import './Quality.css'
import '../inventory/tabs/CommonInventory.css'

const TABS = [
  { key: 'formula_approvals', label: 'Formula Approvals' },
  { key: 'production_qa', label: 'Production QA' },
]

const FORMULA_STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'DECLINED']

const DECLINE_CATEGORIES = [
  'Stoichiometric Discrepancy',
  'Ingredient Out of Spec',
  'Excipient Ratio Mismatch',
  'Regulatory Non-Compliance',
  'Dosage / Potency Issue',
  'Missing Certificate of Analysis (COA)',
  'Other Analytical Variance',
]

export default function Quality() {
  const { user } = useAuth()
  const dispatch = useDispatch()
  const [tab, setTab] = useState('production_qa')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ========================================================
  // PRODUCTION QA REDUX STATE & FILTERING
  // ========================================================
  const compKey = useSelector(selectActiveCompanyKey)
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const reduxCustomers = useSelector((state) => state.erp.customers || [])

  // Production Orders live-synced from Redux
  const productionOrders = useMemo(() => {
    return (reduxOrders || []).map((order) => {
      const dosage_form = resolveOrderDosageForm(order)
      const cust = reduxCustomers.find((c) => String(c.id) === String(order.customer))
      return {
        ...order,
        customer_name: order.customer_name || cust?.name || 'Direct Customer',
        dosage_form,
        dosageForm: dosage_form,
        bmr_status: order.bmr_status || 'NO',
        production_status: order.production_status || 'In Planning',
        packaging_status: order.packaging_status || 'Pending',
        qa_status: order.qa_status || 'Pending',
        qa_remark: order.qa_remark || '',
        qa_confirmed_by: order.qa_confirmed_by || '',
        qa_confirmed_at: order.qa_confirmed_at || '',
        supply_by_date: order.supply_by_date || order.planned_mfg_date || order.delivery_deadline || '—',
      }
    })
  }, [reduxOrders, reduxCustomers])

  // Filters for Production QA
  const [qaSearch, setQaSearch] = useState('')
  const [qaProdStatusFilter, setQaProdStatusFilter] = useState('ALL')
  const [qaDecisionFilter, setQaDecisionFilter] = useState('ALL')

  // Pagination for Production QA
  const [qaPage, setQaPage] = useState(1)
  const qaPageSize = 10

  const filteredQaOrders = useMemo(() => {
    const term = qaSearch.trim().toLowerCase()
    return productionOrders.filter((order) => {
      const matchesSearch =
        !term ||
        String(order.number || order.id || '').toLowerCase().includes(term) ||
        String(order.product_name || '').toLowerCase().includes(term) ||
        String(order.batch_no || '').toLowerCase().includes(term) ||
        String(order.customer_name || '').toLowerCase().includes(term)

      const matchesProd =
        qaProdStatusFilter === 'ALL' ||
        (order.production_status || 'In Planning') === qaProdStatusFilter

      const matchesQa =
        qaDecisionFilter === 'ALL' ||
        (order.qa_status || 'Pending') === qaDecisionFilter

      return matchesSearch && matchesProd && matchesQa
    })
  }, [productionOrders, qaSearch, qaProdStatusFilter, qaDecisionFilter])

  const paginatedQaOrders = useMemo(() => {
    const start = (qaPage - 1) * qaPageSize
    return filteredQaOrders.slice(start, start + qaPageSize)
  }, [filteredQaOrders, qaPage, qaPageSize])

  const totalQaPages = Math.ceil(filteredQaOrders.length / qaPageSize) || 1

  // Order Review Row States (orderId -> { decision: 'Approved' | 'Issue', remark: '' })
  const [rowReviews, setRowReviews] = useState({})
  const [editingOrderIds, setEditingOrderIds] = useState({})
  const [confirmQaDialog, setConfirmQaDialog] = useState(null) // { order, decision, remark }
  const [rowError, setRowError] = useState({})

  const handleDecisionSelect = (orderId, decision) => {
    setRowReviews((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        decision,
      },
    }))
    setRowError((prev) => ({ ...prev, [orderId]: '' }))
  }

  const handleRemarkChange = (orderId, remark) => {
    setRowReviews((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        remark,
      },
    }))
    if (remark.trim()) {
      setRowError((prev) => ({ ...prev, [orderId]: '' }))
    }
  }

  const handleStartEdit = (order) => {
    setEditingOrderIds((prev) => ({ ...prev, [order.id]: true }))
    setRowReviews((prev) => ({
      ...prev,
      [order.id]: {
        decision: order.qa_status === 'Issue' ? 'Issue' : 'Approved',
        remark: order.qa_remark || '',
      },
    }))
  }

  const handleCancelEdit = (orderId) => {
    setEditingOrderIds((prev) => ({ ...prev, [orderId]: false }))
    setRowError((prev) => ({ ...prev, [orderId]: '' }))
  }

  const handleOpenConfirmDialog = (order) => {
    const rev = rowReviews[order.id] || {
      decision: order.qa_status === 'Issue' ? 'Issue' : 'Approved',
      remark: order.qa_remark || '',
    }
    const decision = rev.decision || 'Approved'
    const remark = (rev.remark || '').trim()

    if (decision === 'Issue' && !remark) {
      setRowError((prev) => ({ ...prev, [order.id]: 'Remark is mandatory when reporting an Issue.' }))
      return
    }

    setRowError((prev) => ({ ...prev, [order.id]: '' }))
    setConfirmQaDialog({
      order,
      decision,
      remark,
    })
  }

  const handleFinalConfirmQa = () => {
    if (!confirmQaDialog) return
    const { order, decision, remark } = confirmQaDialog
    const loggedInName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || 'QA Officer')
    const now = new Date().toISOString()

    dispatch(
      updateOrderQaStatus({
        id: order.id,
        qa_status: decision,
        qa_remark: remark,
        confirmed_by: loggedInName,
        confirmed_at: now,
      })
    )

    recordAudit({
      action: 'qa/productionOrderDecision',
      entityType: 'Order',
      entityId: order.id,
      payload: {
        orderNumber: order.number || order.id,
        decision,
        remark,
        confirmed_by: loggedInName,
        confirmed_at: now,
      },
    })

    setEditingOrderIds((prev) => ({ ...prev, [order.id]: false }))
    setConfirmQaDialog(null)
    setSuccess(`Order #${order.number || order.id} marked as ${decision} successfully!`)
    setTimeout(() => setSuccess(''), 3000)
  }

  // ========================================================
  // FORMULA APPROVALS (QC & QA CERTIFICATION)
  // ========================================================
  const formulaApprovals = useSelector(selectFormulaApprovals)
  const activeCompanyId = useSelector(selectActiveCompanyId)

  const [formulaSearch, setFormulaSearch] = useState('')
  const [formulaStatusFilter, setFormulaStatusFilter] = useState('ALL')
  const [reviewFormulaModal, setReviewFormulaModal] = useState(null)
  const [approveDialogModal, setApproveDialogModal] = useState(null)
  const [qcApprovalRemarks, setQcApprovalRemarks] = useState('')
  const [approverInputName, setApproverInputName] = useState('')
  const [declineDialogModal, setDeclineDialogModal] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declinerInputName, setDeclinerInputName] = useState('')
  const [declineCategory, setDeclineCategory] = useState('Stoichiometric Discrepancy')
  const [declineValidationError, setDeclineValidationError] = useState('')

  const totalFormulaRequests = formulaApprovals.length
  const pendingFormulaApprovals = useMemo(
    () => formulaApprovals.filter((a) => a.status === 'PENDING').length,
    [formulaApprovals]
  )
  const approvedFormulaApprovals = useMemo(
    () => formulaApprovals.filter((a) => a.status === 'APPROVED').length,
    [formulaApprovals]
  )
  const declinedFormulaApprovals = useMemo(
    () => formulaApprovals.filter((a) => a.status === 'DECLINED').length,
    [formulaApprovals]
  )

  const filteredFormulaRequests = useMemo(() => {
    return formulaApprovals
      .filter((req) => {
        if (formulaStatusFilter !== 'ALL' && req.status !== formulaStatusFilter) {
          return false
        }
        if (formulaSearch.trim()) {
          const q = formulaSearch.toLowerCase().trim()
          return (
            String(req.id || '').toLowerCase().includes(q) ||
            String(req.productName || '').toLowerCase().includes(q) ||
            String(req.productCode || '').toLowerCase().includes(q) ||
            String(req.formulaName || '').toLowerCase().includes(q) ||
            String(req.submittedBy || '').toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1
        return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
      })
  }, [formulaApprovals, formulaStatusFilter, formulaSearch])

  const handleOpenApproveModal = (req) => {
    const loggedInFullName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || '')
    const defaultApprover = (loggedInFullName && loggedInFullName.toLowerCase() !== String(req.submittedBy || '').toLowerCase())
      ? loggedInFullName
      : 'Dr. R. K. Mehta'
    setApproverInputName(defaultApprover)
    setQcApprovalRemarks('')
    setApproveDialogModal(req)
  }

  const handleConfirmApprove = () => {
    if (!approveDialogModal) return
    if (approveDialogModal.status !== 'PENDING') {
      setError('This formula calculation has already been decided.')
      return
    }
    const approverName = approverInputName.trim() || 'Dr. R. K. Mehta'
    const approverRole = 'QA Manager'
    const now = new Date().toISOString()

    dispatch(
      decideFormulaApproval({
        id: approveDialogModal.id,
        decision: 'APPROVED',
        remarks: qcApprovalRemarks.trim() || 'Calculations verified against pharmacopeia stoichiometric specifications. Formulation approved for BMR issuance.',
        decidedBy: approverName,
        decidedByRole: approverRole,
        decidedAt: now,
      })
    )

    recordAudit({
      action: 'qc/formulaApproved',
      entityType: 'FormulaApproval',
      entityId: approveDialogModal.id,
      payload: {
        productName: approveDialogModal.productName,
        batchQuantity: approveDialogModal.batchQuantity,
        batchUnit: approveDialogModal.batchUnit,
        scaleFactor: approveDialogModal.scaleFactor,
        decidedBy: approverName,
        decidedByRole: approverRole,
        at: now,
      },
    })

    setSuccess(`Formula calculation for ${approveDialogModal.productName} (${approveDialogModal.id}) successfully approved!`)
    setApproveDialogModal(null)
    if (reviewFormulaModal?.id === approveDialogModal.id) {
      setReviewFormulaModal((prev) => ({
        ...prev,
        status: 'APPROVED',
        decidedBy: approverName,
        decidedByRole: approverRole,
        decidedAt: now,
        decisionRemarks: qcApprovalRemarks.trim() || 'Calculations verified against pharmacopeia stoichiometric specifications.',
      }))
    }
  }

  const handleOpenDeclineModal = (req) => {
    const loggedInFullName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || '')
    const defaultDecliner = (loggedInFullName && loggedInFullName.toLowerCase() !== String(req.submittedBy || '').toLowerCase())
      ? loggedInFullName
      : 'Pooja Varma'
    setDeclinerInputName(defaultDecliner)
    setDeclineReason('')
    setDeclineCategory('Stoichiometric Discrepancy')
    setDeclineValidationError('')
    setDeclineDialogModal(req)
  }

  const handleConfirmDecline = () => {
    if (!declineDialogModal) return
    if (declineDialogModal.status !== 'PENDING') {
      setError('This formula calculation has already been decided.')
      return
    }
    if (!declineReason.trim() || declineReason.trim().length < 5) {
      setDeclineValidationError('A specific analytical decline reason is mandatory (minimum 5 characters).')
      return
    }

    const declinerName = declinerInputName.trim() || 'Pooja Varma'
    const declinerRole = 'QC In-Charge'
    const now = new Date().toISOString()

    dispatch(
      decideFormulaApproval({
        id: declineDialogModal.id,
        decision: 'DECLINED',
        reason: declineReason.trim(),
        declineCategory: declineCategory,
        decidedBy: declinerName,
        decidedByRole: declinerRole,
        decidedAt: now,
      })
    )

    recordAudit({
      action: 'qc/formulaDeclined',
      entityType: 'FormulaApproval',
      entityId: declineDialogModal.id,
      payload: {
        productName: declineDialogModal.productName,
        category: declineCategory,
        reason: declineReason.trim(),
        decidedBy: declinerName,
        decidedByRole: declinerRole,
        at: now,
      },
    })

    setSuccess(`Formula calculation for ${declineDialogModal.productName} declined. Reason logged and returned to production for revision.`)
    setDeclineDialogModal(null)
    if (reviewFormulaModal?.id === declineDialogModal.id) {
      setReviewFormulaModal((prev) => ({
        ...prev,
        status: 'DECLINED',
        decidedBy: declinerName,
        decidedByRole: declinerRole,
        decidedAt: now,
        declineReason: declineReason.trim(),
        declineCategory: declineCategory,
      }))
    }
  }

  // Summary Metrics
  const pendingQaCount = productionOrders.filter((o) => (o.qa_status || 'Pending') === 'Pending').length
  const approvedQaCount = productionOrders.filter((o) => o.qa_status === 'Approved').length
  const issueQaCount = productionOrders.filter((o) => o.qa_status === 'Issue').length

  return (
    <div>
      <PageHeader
        title="Quality Control & QA Release"
        subtitle="Master formulation approvals and production order QA clearance."
      />

      {/* Summary KPI Cards */}
      <div className="ci-summary-grid" style={{ marginBottom: 18 }}>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>📦</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Orders</span>
            <span className="ci-card-value">{productionOrders.length}</span>
            <span className="ci-card-subtext">In Production</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>⏳</div>
          <div className="ci-card-info">
            <span className="ci-card-label">QA Pending</span>
            <span className="ci-card-value" style={{ color: '#ca8a04' }}>{pendingQaCount}</span>
            <span className="ci-card-subtext">Awaiting sign-off</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>✓</div>
          <div className="ci-card-info">
            <span className="ci-card-label">QA Approved</span>
            <span className="ci-card-value" style={{ color: '#16a34a' }}>{approvedQaCount}</span>
            <span className="ci-card-subtext">Cleared by QA</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠️</div>
          <div className="ci-card-info">
            <span className="ci-card-label">QA Issues</span>
            <span className="ci-card-value" style={{ color: '#dc2626' }}>{issueQaCount}</span>
            <span className="ci-card-subtext">Flagged for rework</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>📋</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Formula Approvals</span>
            <span className="ci-card-value" style={{ color: '#7c3aed' }}>{pendingFormulaApprovals}</span>
            <span className="ci-card-subtext">Pending stoichiometric</span>
          </div>
        </div>
      </div>

      <div className="inv-tabs">
        {TABS.map((item) => {
          const isApprovals = item.key === 'formula_approvals'
          const count = isApprovals ? pendingFormulaApprovals : pendingQaCount
          return (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'inv-tab active' : 'inv-tab'}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              {count > 0 && <span className="tab-pending-badge">{count}</span>}
            </button>
          )
        })}
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* ========================================================
          NEW PRODUCTION QA TAB
          ======================================================== */}
      {tab === 'production_qa' && (
        <div className="inv-panel">
          {/* Filter Bar */}
          <div className="qc-filter-toolbar">
            <div className="qc-search-wrapper">
              <svg className="qc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                className="qc-filter-input"
                placeholder="Search by Order #, Product, Batch, Customer..."
                value={qaSearch}
                onChange={(e) => {
                  setQaSearch(e.target.value)
                  setQaPage(1)
                }}
              />
              {qaSearch && (
                <button
                  type="button"
                  className="qc-search-clear-btn"
                  onClick={() => {
                    setQaSearch('')
                    setQaPage(1)
                  }}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <select
              className="qc-filter-select"
              value={qaProdStatusFilter}
              onChange={(e) => {
                setQaProdStatusFilter(e.target.value)
                setQaPage(1)
              }}
            >
              <option value="ALL">Production: All</option>
              <option value="In Planning">In Planning</option>
              <option value="In Process">In Process</option>
              <option value="Completed">Completed</option>
            </select>

            <select
              className="qc-filter-select"
              value={qaDecisionFilter}
              onChange={(e) => {
                setQaDecisionFilter(e.target.value)
                setQaPage(1)
              }}
            >
              <option value="ALL">QA Status: All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Issue">Issue</option>
            </select>

            {(qaSearch || qaProdStatusFilter !== 'ALL' || qaDecisionFilter !== 'ALL') ? (
              <button
                type="button"
                className="qc-filter-reset-btn"
                onClick={() => {
                  setQaSearch('')
                  setQaProdStatusFilter('ALL')
                  setQaDecisionFilter('ALL')
                  setQaPage(1)
                }}
              >
                Reset
              </button>
            ) : <div />}

            <div className="qc-filter-count">
              Showing {filteredQaOrders.length} of {productionOrders.length} orders
            </div>
          </div>

          {/* Orders Table */}
          <div className="prod-qa-table-container">
            {filteredQaOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <h3>No production orders found</h3>
                <p>
                  {productionOrders.length === 0
                    ? 'No orders exist in the Production module yet.'
                    : 'No orders match your filter criteria.'}
                </p>
              </div>
            ) : (
              <table className="prod-qa-table">
                <thead>
                  <tr>
                    <th className="qc-col-order">Order #</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="qc-col-batch">Batch</th>
                    <th>Customer</th>
                    <th>Qty</th>
                    <th>Order Date</th>
                    <th>Supply-by Date</th>
                    <th>Production Status</th>
                    <th>QA Status</th>
                    <th>Remark</th>
                    <th className="qc-col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedQaOrders.map((order) => {
                    const isEditing = editingOrderIds[order.id] || (order.qa_status === 'Pending' && !order.qa_confirmed_by)
                    const revState = rowReviews[order.id] || {
                      decision: order.qa_status === 'Issue' ? 'Issue' : 'Approved',
                      remark: order.qa_remark || '',
                    }
                    const activeDecision = revState.decision || (order.qa_status === 'Issue' ? 'Issue' : 'Approved')
                    const err = rowError[order.id] || ''

                    return (
                      <tr key={order.id} className="qc-table-row">
                        {/* 1. Order # */}
                        <td className="qc-cell-nowrap">
                          <strong style={{ color: '#0284c7' }}>
                            #{order.number || order.id}
                          </strong>
                        </td>

                        {/* 2. Product */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {order.product_name || 'Oral Liquid Formulation'}
                          </div>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {order.product_code || 'OL-001'}
                          </span>
                        </td>

                        {/* 3. Type */}
                        <td>
                          <span className={`dosage-badge dosage-${(order.dosage_form || 'Liquid').toLowerCase()}`}>
                            {order.dosage_form || 'Liquid'}
                          </span>
                        </td>

                        {/* 4. Batch */}
                        <td className="qc-cell-nowrap">
                          <span style={{ fontWeight: 700, background: '#f1f5f9', padding: '3px 7px', borderRadius: 4 }}>
                            {order.batch_no || 'AH2602'}
                          </span>
                        </td>

                        {/* 5. Customer */}
                        <td>{order.customer_name}</td>

                        {/* 6. Qty */}
                        <td><strong>{order.batch_size || '1000 LTR'}</strong></td>

                        {/* 7. Order Date */}
                        <td>{order.order_date || '—'}</td>

                        {/* 8. Supply-by Date */}
                        <td>{order.supply_by_date}</td>

                        {/* 9. Production Status (read-only, live) */}
                        <td>
                          <StatusPill tone={order.production_status === 'Completed' ? 'success' : order.production_status === 'In Process' ? 'info' : 'warning'}>
                            {order.production_status || 'In Planning'}
                          </StatusPill>
                        </td>

                        {/* 10. QA Status Badge */}
                        <td>
                          <span className={`prod-qa-badge prod-qa-${(order.qa_status || 'Pending').toLowerCase()}`}>
                            {order.qa_status || 'Pending'}
                          </span>
                        </td>

                        {/* 11. Remark */}
                        <td>
                          {order.qa_remark ? (
                            <span title={order.qa_remark} style={{ fontSize: 12, color: order.qa_status === 'Issue' ? '#dc2626' : '#334155' }}>
                              {order.qa_remark.length > 30 ? `${order.qa_remark.slice(0, 30)}…` : order.qa_remark}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>

                        {/* 12. Action Area */}
                        <td>
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {/* Decision Selector */}
                                <div className="prod-qa-decision-toggle">
                                  <button
                                    type="button"
                                    className={`prod-qa-decision-btn ${activeDecision === 'Approved' ? 'active-approved' : ''}`}
                                    onClick={() => handleDecisionSelect(order.id, 'Approved')}
                                  >
                                    ✓ Approved
                                  </button>
                                  <button
                                    type="button"
                                    className={`prod-qa-decision-btn ${activeDecision === 'Issue' ? 'active-issue' : ''}`}
                                    onClick={() => handleDecisionSelect(order.id, 'Issue')}
                                  >
                                    ⚠️ Issue
                                  </button>
                                </div>

                                {/* Remark input */}
                                <input
                                  type="text"
                                  className="prod-qa-remark-input"
                                  placeholder={activeDecision === 'Issue' ? 'Issue remark (required)...' : 'Remark (optional)...'}
                                  value={revState.remark !== undefined ? revState.remark : order.qa_remark}
                                  onChange={(e) => handleRemarkChange(order.id, e.target.value)}
                                />

                                {/* Confirm Button */}
                                <button
                                  type="button"
                                  className="prod-qa-btn-confirm"
                                  onClick={() => handleOpenConfirmDialog(order)}
                                >
                                  Confirm
                                </button>

                                {order.qa_confirmed_by && (
                                  <button
                                    type="button"
                                    className="prod-qa-btn-edit"
                                    onClick={() => handleCancelEdit(order.id)}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>

                              {err && (
                                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                                  {err}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                <div>Confirmed by: <strong>{order.qa_confirmed_by || 'QA Officer'}</strong></div>
                                <div>on {order.qa_confirmed_at ? formatDateTimeIN(order.qa_confirmed_at) : '—'}</div>
                              </div>
                              <button
                                type="button"
                                className="prod-qa-btn-edit"
                                onClick={() => handleStartEdit(order)}
                              >
                                Edit / Re-review
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {filteredQaOrders.length > qaPageSize && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Showing {(qaPage - 1) * qaPageSize + 1} to{' '}
                {Math.min(qaPage * qaPageSize, filteredQaOrders.length)} of {filteredQaOrders.length} orders
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="prod-qa-btn-edit"
                  disabled={qaPage === 1}
                  onClick={() => setQaPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontWeight: 700, padding: '5px 8px' }}>
                  {qaPage} / {totalQaPages}
                </span>
                <button
                  type="button"
                  className="prod-qa-btn-edit"
                  disabled={qaPage >= totalQaPages}
                  onClick={() => setQaPage((p) => Math.min(totalQaPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          FORMULA APPROVALS (QC & QA CERTIFICATION)
          ======================================================== */}
      {tab === 'formula_approvals' && (
        <div className="inv-panel">
          {/* Header & Subtitle */}
          <div className="qc-formula-header-block">
            <div className="qc-formula-title-area">
              <h3 style={{ margin: '0 0 6px 0', color: '#123f61' }}>
                Master Formulation Stoichiometric Approvals
              </h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '13.5px' }}>
                Review live batch formulation calculation engine snapshots, verify stoichiometric ratios, and approve or decline with documented findings.
              </p>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="qc-formula-kpi-grid">
            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#f0f9ff', color: '#0369a1' }}>📑</div>
              <div className="kpi-content">
                <span className="kpi-label">Total Requests</span>
                <span className="kpi-value" style={{ color: '#0369a1' }}>{totalFormulaRequests}</span>
                <span className="kpi-sub">All submissions</span>
              </div>
            </div>

            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#fef3c7', color: '#b45309' }}>⏳</div>
              <div className="kpi-content">
                <span className="kpi-label">Pending QC Review</span>
                <span className="kpi-value" style={{ color: '#b45309' }}>{pendingFormulaApprovals}</span>
                <span className="kpi-sub">Action required</span>
              </div>
            </div>

            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#dcfce7', color: '#15803d' }}>✓</div>
              <div className="kpi-content">
                <span className="kpi-label">Approved Formulas</span>
                <span className="kpi-value" style={{ color: '#15803d' }}>{approvedFormulaApprovals}</span>
                <span className="kpi-sub">BMR Certified</span>
              </div>
            </div>

            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>✕</div>
              <div className="kpi-content">
                <span className="kpi-label">Declined Formulations</span>
                <span className="kpi-value" style={{ color: '#b91c1c' }}>{declinedFormulaApprovals}</span>
                <span className="kpi-sub">Returned with findings</span>
              </div>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="qc-filter-toolbar qc-formula-toolbar">
            <div className="qc-search-wrapper">
              <svg className="qc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                className="qc-filter-input"
                placeholder="Search by Request ID, Product, Formula, or Submitter..."
                value={formulaSearch}
                onChange={(e) => setFormulaSearch(e.target.value)}
              />
              {formulaSearch && (
                <button
                  type="button"
                  className="qc-search-clear-btn"
                  onClick={() => setFormulaSearch('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <select
              className="qc-filter-select"
              value={formulaStatusFilter}
              onChange={(e) => setFormulaStatusFilter(e.target.value)}
            >
              {FORMULA_STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'Status: All' : s}
                </option>
              ))}
            </select>

            <div />

            {(formulaSearch || formulaStatusFilter !== 'ALL') ? (
              <button
                type="button"
                className="qc-filter-reset-btn"
                onClick={() => {
                  setFormulaSearch('')
                  setFormulaStatusFilter('ALL')
                }}
              >
                Reset
              </button>
            ) : <div />}

            <div className="qc-filter-count">
              Showing {filteredFormulaRequests.length} of {formulaApprovals.length} formulas
            </div>
          </div>

          {/* Table */}
          <div className="qc-table-wrapper" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', marginTop: '14px' }}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Request ID</th>
                  <th>Product Details</th>
                  <th>Master Formula &amp; Revision</th>
                  <th style={{ width: '130px' }}>Target Batch Qty</th>
                  <th style={{ width: '100px' }}>Ingredients</th>
                  <th>Submitted By</th>
                  <th style={{ width: '110px' }}>QC Status</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFormulaRequests.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                      <div style={{ fontWeight: 600, color: '#123f61', fontSize: '15px' }}>
                        No Formula Approval Requests Found
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                        {formulaSearch || formulaStatusFilter !== 'ALL'
                          ? 'No requests match your current search and filter criteria.'
                          : 'No formula calculations have been submitted for QC approval yet.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredFormulaRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <span className="req-id-tag">{req.id}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#123f61' }}>{req.productName}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Code: <strong>{req.productCode}</strong> • Form: {req.dosageForm || 'Liquid'}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#334155' }}>{req.formulaName}</div>
                        <div style={{ fontSize: '12px', color: '#0f766e', fontWeight: 500 }}>
                          {req.revisionName} (Base: {req.formulaBaseQuantity} {req.formulaBaseUnit})
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {req.batchQuantity} {req.batchUnit}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {req.scaleFactor}× Scale
                        </div>
                      </td>
                      <td>
                        <span className="ingredient-count-badge">
                          {req.materialsCount || req.materials?.length || 0} Materials
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#334155' }}>{req.submittedBy}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {formatDateIN(req.submittedAt)}
                        </div>
                      </td>
                      <td>
                        {req.status === 'APPROVED' ? (
                          <div>
                            <span className="qc-status-pill pill-approved">✓ Approved</span>
                            <div style={{ fontSize: '11px', color: '#15803d', marginTop: '3px', fontWeight: 600 }}>
                              {req.decidedBy || 'QA Manager'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                              {formatDateIN(req.decidedAt)}
                            </div>
                          </div>
                        ) : req.status === 'DECLINED' ? (
                          <div>
                            <span className="qc-status-pill pill-declined">✕ Declined</span>
                            <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '3px', fontWeight: 600 }}>
                              {req.decidedBy || 'QC In-Charge'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                              {formatDateIN(req.decidedAt)}
                            </div>
                          </div>
                        ) : (
                          <span className="qc-status-pill pill-pending">⏳ Pending QC</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant={req.status === 'PENDING' ? 'primary' : 'secondary'}
                          onClick={() => setReviewFormulaModal(req)}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          Review Formula →
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ORDER QC INSPECTION
          ======================================================== */}
      {/* ========================================================
          MODAL: FORMULA APPROVAL REVIEW (BMR DOCUMENT SLIP)
          ======================================================== */}
      {reviewFormulaModal && (
        <Modal
          title={`Formula Stoichiometric Audit Review — ${reviewFormulaModal.id}`}
          maxWidth="920px"
          onClose={() => setReviewFormulaModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportFormulaExcel({
                      product: {
                        name: reviewFormulaModal.productName,
                        code: reviewFormulaModal.productCode,
                      },
                      formula: {
                        name: reviewFormulaModal.formulaName,
                        base_quantity: reviewFormulaModal.formulaBaseQuantity,
                        base_unit: reviewFormulaModal.formulaBaseUnit,
                      },
                      revision: { name: reviewFormulaModal.revisionName },
                      materials: reviewFormulaModal.materials || [],
                      batchQty: reviewFormulaModal.batchQuantity,
                      batchUnit: reviewFormulaModal.batchUnit,
                      scaleFactor: reviewFormulaModal.scaleFactor,
                      approval: reviewFormulaModal,
                      companyName: activeCompanyId === 2 ? 'TEJ BIOCARE HEALTHCARE PVT. LTD.' : 'CMHP PHARMACEUTICALS PVT. LTD.',
                    })
                  }
                >
                  📊 Export Excel (.xls)
                </Button>
                <Button variant="secondary" onClick={() => exportFormulaPrint('bmr-requisition-print-doc')}>
                  🖨️ Print / Save PDF
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button variant="secondary" onClick={() => setReviewFormulaModal(null)}>
                  Close
                </Button>

                {reviewFormulaModal.status === 'PENDING' && (
                  <>
                    <Button
                      variant="danger"
                      onClick={() => handleOpenDeclineModal(reviewFormulaModal)}
                    >
                      ✕ Decline Formulation
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleOpenApproveModal(reviewFormulaModal)}
                    >
                      ✓ Approve Formulation
                    </Button>
                  </>
                )}
              </div>
            </div>
          }
        >
          <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '10px 4px' }}>
            <BmrRequisitionDocument
              product={{
                name: reviewFormulaModal.productName,
                code: reviewFormulaModal.productCode,
                dosage_form: reviewFormulaModal.dosageForm,
              }}
              formula={{
                name: reviewFormulaModal.formulaName,
                base_quantity: reviewFormulaModal.formulaBaseQuantity,
                base_unit: reviewFormulaModal.formulaBaseUnit,
              }}
              revision={{ name: reviewFormulaModal.revisionName }}
              materials={reviewFormulaModal.materials || []}
              batchQty={reviewFormulaModal.batchQuantity}
              batchUnit={reviewFormulaModal.batchUnit}
              scaleFactor={reviewFormulaModal.scaleFactor}
              approval={reviewFormulaModal}
              companyName={activeCompanyId === 2 ? 'TEJ BIOCARE HEALTHCARE PVT. LTD.' : 'CMHP PHARMACEUTICALS PVT. LTD.'}
              companyCode={activeCompanyId === 2 ? 'TEJ' : 'CMHP'}
              department={
                ['Liquid', 'Syrup', 'Drops', 'Oil', 'Syrups', 'Suspension'].includes(reviewFormulaModal.dosageForm)
                  ? 'PRODUCTION ( ORAL LIQUID DEPARTMENT )'
                  : 'PRODUCTION ( ORAL SOLID DOSAGE DEPARTMENT )'
              }
            />
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: APPROVE FORMULA DIALOG
          ======================================================== */}
      {approveDialogModal && (
        <Modal
          title={`Approve Master Formulation — ${approveDialogModal.id}`}
          onClose={() => setApproveDialogModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setApproveDialogModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmApprove}>
                ✓ Confirm &amp; Certify Formula
              </Button>
            </div>
          }
        >
          <div>
            <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: '#334155' }}>
              You are certifying that the stoichiometric scaling for{' '}
              <strong>{approveDialogModal.productName}</strong> ({approveDialogModal.batchQuantity}{' '}
              {approveDialogModal.batchUnit}) meets all pharmaceutical quality standards and BMR release criteria.
            </p>

            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Formula:</span>
                <span style={{ fontWeight: 600 }}>{approveDialogModal.formulaName}</span>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Revision:</span>
                <span style={{ fontWeight: 600 }}>{approveDialogModal.revisionName}</span>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Batch Scale:</span>
                <span style={{ fontWeight: 700, color: '#0f766e' }}>{approveDialogModal.scaleFactor}× Multiplier</span>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                QA Approving Officer / Authorized Signatory Name <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                className="field-input"
                value={approverInputName}
                onChange={(e) => setApproverInputName(e.target.value)}
                placeholder="e.g. Dr. R. K. Mehta"
                style={{ width: '100%' }}
                required
              />
              <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '3px' }}>
                Prepared By: <strong>{approveDialogModal.submittedBy}</strong> ({approveDialogModal.submittedByRole || 'Production Chemist'}). Approval sign-off must be performed by a designated QA/QC authority.
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                QC Approval Remarks / BMR Release Endorsement (Optional)
              </label>
              <textarea
                className="field-input"
                rows="3"
                placeholder="e.g. Stoichiometric calculations verified against SOP/QA/04/F-02/00. Formula approved for commercial production."
                value={qcApprovalRemarks}
                onChange={(e) => setQcApprovalRemarks(e.target.value)}
              />
            </div>

            <Alert type="info">
              Approval will unlock official BMR Requisition Slip issuance and reflect live in the Products module.
            </Alert>
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: DECLINE FORMULA DIALOG (MANDATORY REASON)
          ======================================================== */}
      {declineDialogModal && (
        <Modal
          title={`Decline Formulation Calculation — ${declineDialogModal.id}`}
          onClose={() => setDeclineDialogModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setDeclineDialogModal(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDecline}>
                ✕ Confirm Decline &amp; Log Finding
              </Button>
            </div>
          }
        >
          <div>
            {declineValidationError && (
              <div style={{ marginBottom: 12 }}>
                <Alert type="error">{declineValidationError}</Alert>
              </div>
            )}

            <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: '#7f1d1d' }}>
              Declining will return this formula calculation to Production with documented non-compliance findings. A detailed analytical reason is strictly required.
            </p>

            <div className="field field-full" style={{ marginBottom: 14 }}>
              <label className="field-label">QC Reviewing Officer Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                type="text"
                className="field-input"
                value={declinerInputName}
                onChange={(e) => setDeclinerInputName(e.target.value)}
                placeholder="e.g. Pooja Varma"
                style={{ width: '100%' }}
                required
              />
            </div>

            <div className="field field-full" style={{ marginBottom: 14 }}>
              <label className="field-label">Discrepancy Category <span style={{ color: '#dc2626' }}>*</span></label>
              <select
                className="field-input"
                value={declineCategory}
                onChange={(e) => setDeclineCategory(e.target.value)}
              >
                {DECLINE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field-full" style={{ marginBottom: 14 }}>
              <label className="field-label">
                Analytical Decline Reason <span style={{ color: '#dc2626' }}>* (Mandatory)</span>
              </label>
              <textarea
                className="field-input"
                rows="4"
                placeholder="Describe specific stoichiometric errors, out-of-spec ingredient ratios, pharmacopeial limits exceeded, or required formula adjustments..."
                value={declineReason}
                onChange={(e) => {
                  setDeclineReason(e.target.value)
                  if (declineValidationError && e.target.value.trim().length >= 5) {
                    setDeclineValidationError('')
                  }
                }}
                required
              />
              <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: 4, display: 'block' }}>
                Minimum 5 characters. This statement will be permanently recorded in the formula audit log.
              </span>
            </div>

            <Alert type="warning">
              Production will receive this finding and be prompted to adjust base active weights, excipients, or batch parameters before resubmitting.
            </Alert>
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: CONFIRM PRODUCTION QA DECISION
          ======================================================== */}
      {confirmQaDialog && (
        <Modal
          title="Confirm QA Decision"
          onClose={() => setConfirmQaDialog(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setConfirmQaDialog(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmQaDialog.decision === 'Issue' ? 'danger' : 'primary'}
                onClick={handleFinalConfirmQa}
              >
                Confirm &amp; Save
              </Button>
            </div>
          }
        >
          <div style={{ padding: '8px 4px' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>
              Mark Order #{confirmQaDialog.order.number || confirmQaDialog.order.id} as{' '}
              <span
                style={{
                  color: confirmQaDialog.decision === 'Issue' ? '#dc2626' : '#16a34a',
                  fontWeight: 700,
                }}
              >
                {confirmQaDialog.decision}
              </span>?
            </p>

            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Product:</span>{' '}
                <strong>{confirmQaDialog.order.product_name}</strong> ({confirmQaDialog.order.batch_no || 'N/A'})
              </div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Customer:</span>{' '}
                <strong>{confirmQaDialog.order.customer_name}</strong>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#64748b' }}>Quantity:</span>{' '}
                <strong>{confirmQaDialog.order.batch_size}</strong>
              </div>
            </div>

            {confirmQaDialog.remark ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  QA Remark:
                </label>
                <div style={{ background: confirmQaDialog.decision === 'Issue' ? '#fef2f2' : '#f0fdf4', padding: '10px 12px', borderRadius: 6, border: `1px solid ${confirmQaDialog.decision === 'Issue' ? '#fecaca' : '#bbf7d0'}`, fontSize: 13, color: confirmQaDialog.decision === 'Issue' ? '#991b1b' : '#166534' }}>
                  {confirmQaDialog.remark}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 12px' }}>
                No remark entered (optional for Approved).
              </p>
            )}

            <Alert type={confirmQaDialog.decision === 'Issue' ? 'warning' : 'info'}>
              {confirmQaDialog.decision === 'Issue'
                ? 'Flagging an Issue will notify production staff and display the remark directly in the Production table.'
                : 'Approving confirms QA clearance for this order.'}
            </Alert>
          </div>
        </Modal>
      )}
    </div>
  )
}