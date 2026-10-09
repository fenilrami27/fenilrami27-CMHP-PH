import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import {
  addOrder,
  editOrder,
  deleteOrder,
  setOrderStatus,
} from '../../../store/erpSlice'
import { logAudit } from '../../../utils/audit'
import { confirmAction } from '../../../utils/confirmAction'
import { previewDocumentNumber, commitDocumentNumber } from '../../../utils/documentNumbers'
import {
  selectFormulas,
  selectActiveCompanyId,
  selectActiveCompanyKey,
} from '../../../utils/companySelectors'
import { checkFormulaStockAvailability, selectItemStock } from '../../../utils/stockSelectors'
import { operationsService } from '../../operations/operationsService'
import { store } from '../../../store/store'

const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
]

const STATUS_LABELS = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  IN_PRODUCTION: 'In Production',
  QC_PENDING: 'QC Pending',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const STATUS_COLORS = {
  DRAFT: { bg: '#f1f5f9', color: '#475569' },
  CONFIRMED: { bg: '#e0f2fe', color: '#0369a1' },
  IN_PRODUCTION: { bg: '#fef3c7', color: '#b45309' },
  QC_PENDING: { bg: '#fef9c3', color: '#a16207' },
  DISPATCHED: { bg: '#ede9fe', color: '#6d28d9' },
  DELIVERED: { bg: '#dcfce7', color: '#15803d' },
  COMPLETED: { bg: '#dcfce7', color: '#15803d' },
  CANCELLED: { bg: '#fee2e2', color: '#b91c1c' },
}

export default function CommonOrdersTab({ role, isCompanyScoped = false }) {
  const dispatch = useDispatch()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const activeCompanyKey = useSelector(selectActiveCompanyKey)
  const formulas = useSelector(selectFormulas)

  const rawOrders = useSelector((state) => {
    if (isCompanyScoped) {
      const key = activeCompanyKey || (activeCompanyId === 2 ? 'tej' : 'cmhp')
      const compId = Number(activeCompanyId) || 1
      const list = []
      if (Array.isArray(state.erp?.byCompany?.[key]?.orders)) {
        list.push(...state.erp.byCompany[key].orders)
      }
      if (Array.isArray(state.erp?.orders)) {
        state.erp.orders.forEach((o) => {
          if (Number(o.company) === compId && !list.some((existing) => existing.id === o.id)) {
            list.push(o)
          }
        })
      }
      return list
    }

    const list = []
    if (Array.isArray(state.erp?.orders)) list.push(...state.erp.orders)
    if (state.erp?.byCompany) {
      Object.values(state.erp.byCompany).forEach((co) => {
        if (Array.isArray(co?.orders)) list.push(...co.orders)
      })
    }
    // Deduplicate by ID
    const map = new Map()
    list.forEach((ord) => {
      if (ord && ord.id) map.set(ord.id, ord)
    })
    return Array.from(map.values())
  })

  const customers = useSelector((state) => state.erp?.customers || [])
  const commonProducts = useSelector((state) => state.erp?.commonProducts || [])

  // Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL') // 'ALL' | '1' | '2'
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [deadlineToFilter, setDeadlineToFilter] = useState('ALL') // 'ALL' | 'OVERDUE' | 'WEEK' | 'MONTH'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Produce Batch (Formula BOM) Modal State
  const [produceModalOrder, setProduceModalOrder] = useState(null)
  const [produceQuantity, setProduceQuantity] = useState(1000)
  const [produceFormulaId, setProduceFormulaId] = useState('')
  const [produceError, setProduceError] = useState('')
  const [saving, setSaving] = useState(false)

  // Modals
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [orderForm, setOrderForm] = useState({
    number: '',
    company: isCompanyScoped ? Number(activeCompanyId) || 1 : 1,
    customer: '',
    customer_name: '',
    order_date: new Date().toISOString().slice(0, 10),
    delivery_deadline: '',
    status: 'DRAFT',
    total_amount: 0,
    lines: [],
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Helper to get customer name
  const getCustomerName = (ord) => {
    if (ord.customer_name) return ord.customer_name
    if (ord.customer) {
      const cust = customers.find((c) => Number(c.id) === Number(ord.customer))
      if (cust) return cust.name
    }
    return 'Direct Customer'
  }

  // Calculate deadline status and diff in days
  const getDeadlineAnalysis = (deadline, status) => {
    if (!deadline) return { diffDays: Infinity, label: 'No Deadline', status: 'normal' }
    if (status === 'DELIVERED' || status === 'COMPLETED') {
      return { diffDays: 0, label: 'Delivered', status: 'done' }
    }
    if (status === 'CANCELLED') {
      return { diffDays: 0, label: 'Cancelled', status: 'done' }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dead = new Date(deadline)
    dead.setHours(0, 0, 0, 0)

    const diffDays = Math.round((dead.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { diffDays, label: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`, status: 'overdue' }
    }
    if (diffDays === 0) {
      return { diffDays, label: 'Due today', status: 'due-soon' }
    }
    if (diffDays <= 7) {
      return { diffDays, label: `${diffDays} day${diffDays === 1 ? '' : 's'} left`, status: 'due-soon' }
    }
    return { diffDays, label: `${diffDays} days left`, status: 'normal' }
  }

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let total = 0
    let pending = 0
    let inProgress = 0
    let completed = 0
    let dueSoon = 0
    let overdue = 0

    rawOrders.forEach((o) => {
      total++
      const st = String(o.status || 'DRAFT').toUpperCase()
      if (['DRAFT', 'PENDING', 'CONFIRMED'].includes(st)) pending++
      if (['IN_PRODUCTION', 'PRODUCTION', 'QC_PENDING', 'PROCESSING', 'DISPATCHED'].includes(st)) inProgress++
      if (['DELIVERED', 'COMPLETED'].includes(st)) completed++

      const deadline = o.delivery_deadline || o.delivery_date
      const analysis = getDeadlineAnalysis(deadline, st)
      if (analysis.status === 'overdue') overdue++
      if (analysis.status === 'due-soon') dueSoon++
    })

    return { total, pending, inProgress, completed, dueSoon, overdue }
  }, [rawOrders])

  // Filtered and Sorted Orders (Default: nearest deadline first)
  const filteredOrders = useMemo(() => {
    return rawOrders
      .filter((o) => {
        if (!search) return true
        const s = search.toLowerCase()
        const custName = getCustomerName(o).toLowerCase()
        const ordNo = String(o.number || '').toLowerCase()
        return ordNo.includes(s) || custName.includes(s)
      })
      .filter((o) => {
        if (companyFilter === 'ALL') return true
        return Number(o.company) === Number(companyFilter)
      })
      .filter((o) => {
        if (statusFilter === 'ALL') return true
        return String(o.status || 'DRAFT').toUpperCase() === statusFilter
      })
      .filter((o) => {
        const deadline = o.delivery_deadline || o.delivery_date
        const st = String(o.status || 'DRAFT').toUpperCase()
        const analysis = getDeadlineAnalysis(deadline, st)

        if (deadlineToFilter === 'OVERDUE') return analysis.status === 'overdue'
        if (deadlineToFilter === 'WEEK') return analysis.status === 'due-soon' || analysis.diffDays <= 7
        if (deadlineToFilter === 'MONTH') return analysis.diffDays <= 30 && analysis.diffDays >= 0
        return true
      })
      .filter((o) => {
        if (!startDate && !endDate) return true
        const ordDate = o.order_date || ''
        if (startDate && ordDate < startDate) return false
        if (endDate && ordDate > endDate) return false
        return true
      })
      .sort((a, b) => {
        // Nearest deadline first
        const deadA = a.delivery_deadline || a.delivery_date || '9999-12-31'
        const deadB = b.delivery_deadline || b.delivery_date || '9999-12-31'
        return deadA.localeCompare(deadB)
      })
  }, [rawOrders, search, companyFilter, statusFilter, deadlineToFilter, startDate, endDate, customers])

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1
  const paginatedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize)

  // Status Change handler
  const handleQuickStatusChange = (orderId, newStatus) => {
    const existing = rawOrders.find((o) => o.id === orderId)
    const oldStatus = existing?.status || 'DRAFT'

    dispatch(setOrderStatus({ id: orderId, status: newStatus }))

    logAudit({
      module: 'ORDERS',
      entity_type: 'Order',
      entity_id: existing?.number || String(orderId),
      action: 'ORDER_STATUS_CHANGED',
      description: `Changed status of Order #${existing?.number || orderId} from ${oldStatus} to ${newStatus}`,
      changes: [{ field: 'status', old_value: oldStatus, new_value: newStatus }],
      company: existing?.company,
    })

    setSuccess(`Order #${existing?.number || orderId} status changed to ${STATUS_LABELS[newStatus] || newStatus}.`)
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder({ ...selectedOrder, status: newStatus })
    }
  }

  // Produce Batch from Order Handlers
  const openProduceModal = (order) => {
    setError('')
    setSuccess('')
    setProduceError('')
    setProduceModalOrder(order)
    const qty = Number(order.batch_size || order.quantity || order.lines?.[0]?.quantity) || 1000
    setProduceQuantity(qty)

    const matchingFormula = (formulas || []).find((f) => {
      const pName = order.product_name || order.lines?.[0]?.product_name || ''
      const fName = f.name || ''
      return (
        String(f.product_id) === String(order.product_id || order.product) ||
        fName.toLowerCase().includes(pName.toLowerCase()) ||
        pName.toLowerCase().includes(fName.toLowerCase())
      )
    })
    setProduceFormulaId(matchingFormula ? matchingFormula.id : (formulas?.[0]?.id || ''))
  }

  const currentProduceFormula = useMemo(() => {
    if (!produceModalOrder) return null
    if (produceFormulaId) {
      const f = (formulas || []).find((item) => String(item.id) === String(produceFormulaId))
      if (f) return f
    }
    const match = (formulas || []).find((f) => {
      const pName = produceModalOrder.product_name || produceModalOrder.lines?.[0]?.product_name || ''
      const fName = f.name || ''
      return (
        String(f.product_id) === String(produceModalOrder.product_id || produceModalOrder.product) ||
        fName.toLowerCase().includes(pName.toLowerCase()) ||
        pName.toLowerCase().includes(fName.toLowerCase())
      )
    })
    return match || formulas?.[0] || null
  }, [produceModalOrder, produceFormulaId, formulas])

  const produceStockCheck = useMemo(() => {
    if (!produceModalOrder || !currentProduceFormula) {
      return { canProduce: false, materials: [], hasShortage: false, totalShortageCount: 0 }
    }
    const erpState = store.getState()?.erp || {}
    return checkFormulaStockAvailability(
      erpState,
      currentProduceFormula,
      Number(produceQuantity) || 1000,
      currentProduceFormula.base_unit || 'kg'
    )
  }, [produceModalOrder, currentProduceFormula, produceQuantity])

  const handleStartProductionFromOrder = async () => {
    if (!produceModalOrder || !currentProduceFormula) return
    if (!produceStockCheck.canProduce) {
      setProduceError('Cannot start production: One or more raw materials have insufficient stock in inventory.')
      return
    }

    try {
      setSaving(true)
      const compId = produceModalOrder.company || activeCompanyId || 1
      const compKey = Number(compId) === 2 ? 'tej' : 'cmhp'
      const finalBatchNum = commitDocumentNumber('BATCH', compId)

      await operationsService.produceBatchFromOrder({
        orderId: produceModalOrder.id,
        orderNumber: produceModalOrder.number,
        batchNumber: finalBatchNum,
        productId: produceModalOrder.product_id || produceModalOrder.product || currentProduceFormula.product_id,
        productCode: produceModalOrder.product_code || '',
        productName: produceModalOrder.product_name || currentProduceFormula.name,
        plannedQuantity: Number(produceQuantity) || 1000,
        company: compId,
        companyKey: compKey,
        materialsToIssue: produceStockCheck.materials.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          requiredAmount: m.requiredAmount,
          issuedQuantity: m.requiredAmount,
          remark: `${m.requiredAmount.toFixed(2)} KG (${Math.ceil(m.requiredAmount / 25)} Bag)`,
        })),
      })

      setSuccess(`Production started for Batch #${finalBatchNum}. Raw materials issued outward from stock ledger and routed to QC.`)
      setProduceModalOrder(null)
      if (detailModalOpen && selectedOrder?.id === produceModalOrder.id) {
        setDetailModalOpen(false)
      }
    } catch (err) {
      setProduceError(err?.message || 'Failed to start production.')
    } finally {
      setSaving(false)
    }
  }

  // Delete Order handler
  const handleDeleteOrder = (order) => {
    confirmAction(
      `Are you sure you want to delete Order #${order.number || order.id}?`,
      () => {
        dispatch(deleteOrder({ id: order.id }))
        logAudit({
          module: 'ORDERS',
          entity_type: 'Order',
          entity_id: order.number || String(order.id),
          action: 'ORDER_DELETED',
          description: `Deleted order #${order.number || order.id}`,
          company: order.company,
        })
        setSuccess(`Order #${order.number || order.id} deleted.`)
        if (detailModalOpen && selectedOrder?.id === order.id) setDetailModalOpen(false)
      }
    )
  }

  // Open Create Order
  const openCreateOrder = () => {
    const defaultCo = isCompanyScoped ? Number(activeCompanyId) || 1 : 1
    const nextNum = previewDocumentNumber('ORDER', defaultCo)
    setOrderForm({
      number: nextNum,
      company: defaultCo,
      customer: customers[0]?.id || '',
      customer_name: customers[0]?.name || '',
      order_date: new Date().toISOString().slice(0, 10),
      delivery_deadline: '',
      status: 'DRAFT',
      total_amount: 0,
      lines: [
        {
          product_name: commonProducts[0]?.name || '',
          quantity: 100,
          unit_price: commonProducts[0]?.unit_cost || 0,
        },
      ],
    })
    setError('')
    setAddModalOpen(true)
  }

  // Open Edit Order
  const openEditOrder = (order) => {
    setSelectedOrder(order)
    setOrderForm({
      number: order.number || '',
      company: order.company || 1,
      customer: order.customer || '',
      customer_name: getCustomerName(order),
      order_date: order.order_date || new Date().toISOString().slice(0, 10),
      delivery_deadline: order.delivery_deadline || order.delivery_date || '',
      status: order.status || 'DRAFT',
      total_amount: order.total_amount || 0,
      lines: order.lines && order.lines.length ? order.lines : [
        {
          product_name: order.product_name || 'Standard Product',
          quantity: order.quantity || 100,
          unit_price: order.price || 0,
        },
      ],
    })
    setError('')
    setEditModalOpen(true)
  }

  // Save new order
  const handleSaveNewOrder = (e) => {
    e.preventDefault()
    const targetComp = orderForm.company || (isCompanyScoped ? Number(activeCompanyId) || 1 : 1)
    const num = commitDocumentNumber('ORDER', targetComp)
    const calculatedTotal = orderForm.lines.reduce(
      (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
      0
    )

    const payload = {
      ...orderForm,
      number: num,
      total_amount: calculatedTotal || Number(orderForm.total_amount) || 0,
      delivery_deadline: orderForm.delivery_deadline,
      delivery_date: orderForm.delivery_deadline,
    }

    dispatch(addOrder(payload))

    logAudit({
      module: 'ORDERS',
      entity_type: 'Order',
      entity_id: num,
      action: 'ORDER_CREATED',
      description: `Created Order #${num} for ${orderForm.customer_name || 'Customer'}`,
      company: orderForm.company,
    })

    setSuccess(`Order #${num} created successfully.`)
    setAddModalOpen(false)
  }

  // Save edit order
  const handleSaveEditOrder = (e) => {
    e.preventDefault()
    if (!selectedOrder) return

    const calculatedTotal = orderForm.lines.reduce(
      (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
      0
    )

    const payload = {
      ...orderForm,
      total_amount: calculatedTotal || Number(orderForm.total_amount) || 0,
      delivery_deadline: orderForm.delivery_deadline,
      delivery_date: orderForm.delivery_deadline,
    }

    dispatch(editOrder({ id: selectedOrder.id, payload }))

    logAudit({
      module: 'ORDERS',
      entity_type: 'Order',
      entity_id: selectedOrder.number || String(selectedOrder.id),
      action: 'ORDER_EDITED',
      description: `Updated Order #${selectedOrder.number || selectedOrder.id}`,
      company: selectedOrder.company,
    })

    setSuccess(`Order #${selectedOrder.number || selectedOrder.id} updated successfully.`)
    setEditModalOpen(false)
  }

  return (
    <div className="inv-panel">
      {/* Top Header */}
      <div className="inv-toolbar" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3>{isCompanyScoped ? 'Sales Orders' : 'Aggregated Orders'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5a738e' }}>
            {isCompanyScoped
              ? 'Company sales orders, formula BOM production execution, delivery tracking and quality control.'
              : 'Consolidated order view across CMHP Pharma and Tej Biocare with Common Inventory stock check.'}
          </p>
        </div>
        <Button type="button" onClick={openCreateOrder}>
          + Create Order
        </Button>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Top Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          margin: '16px 0',
        }}
      >
        <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Orders</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
            {summaryMetrics.total}
          </div>
        </div>

        <div style={{ background: '#f0f9ff', padding: '14px 16px', borderRadius: 10, border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 600 }}>Pending</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0369a1', marginTop: 4 }}>
            {summaryMetrics.pending}
          </div>
        </div>

        <div style={{ background: '#fefce8', padding: '14px 16px', borderRadius: 10, border: '1px solid #fef08a' }}>
          <div style={{ fontSize: 12, color: '#ca8a04', fontWeight: 600 }}>In Progress</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#a16207', marginTop: 4 }}>
            {summaryMetrics.inProgress}
          </div>
        </div>

        <div style={{ background: '#f0fdf4', padding: '14px 16px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Completed</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d', marginTop: 4 }}>
            {summaryMetrics.completed}
          </div>
        </div>

        <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: 10, border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>Due Soon (&lt;7d)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#b45309', marginTop: 4 }}>
            {summaryMetrics.dueSoon}
          </div>
        </div>

        <div style={{ background: '#fef2f2', padding: '14px 16px', borderRadius: 10, border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Overdue</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>
            {summaryMetrics.overdue}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="inv-filters-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search by order # or customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ minWidth: 220, flex: 1 }}
        />

        {!isCompanyScoped && (
          <select
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value)
              setPage(1)
            }}
            className="company-input"
            style={{ width: 160 }}
          >
            <option value="ALL">All Companies</option>
            <option value="1">CMHP Pharma</option>
            <option value="2">Tej Biocare</option>
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 150 }}
        >
          <option value="ALL">All Statuses</option>
          {ORDER_STATUSES.map((st) => (
            <option key={st} value={st}>{STATUS_LABELS[st] || st}</option>
          ))}
        </select>

        <select
          value={deadlineToFilter}
          onChange={(e) => {
            setDeadlineToFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 160 }}
        >
          <option value="ALL">All Deadlines</option>
          <option value="OVERDUE">🔴 Overdue Orders</option>
          <option value="WEEK">🟡 Due This Week</option>
          <option value="MONTH">🗓️ Due This Month</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
            className="company-input"
            title="Start Order Date"
            style={{ width: 130 }}
          />
          <span style={{ color: '#94a3b8' }}>-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
            className="company-input"
            title="End Order Date"
            style={{ width: 130 }}
          />
        </div>

        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value))
            setPage(1)
          }}
          className="company-input"
          style={{ width: 110 }}
        >
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <div className="inv-empty" style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: 8 }}>
          <p style={{ fontSize: 15, color: '#64748b', margin: 0 }}>
            {rawOrders.length === 0
              ? 'No orders found in the system yet. Click "+ Create Order" to record an order.'
              : 'No orders match your filter criteria.'}
          </p>
        </div>
      ) : (
        <>
          <div className="inv-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Order #</th>
                  {!isCompanyScoped && <th>Company</th>}
                  <th>Customer</th>
                  <th>Order Date</th>
                  <th>Deadline</th>
                  <th>Deadline Status</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((ord) => {
                  const companyId = Number(ord.company) || 1
                  const isTej = companyId === 2
                  const companyBadgeStyle = isTej
                    ? { bg: '#e0e7ff', color: '#3730a3', name: 'Tej Biocare' }
                    : { bg: '#fef3c7', color: '#92400e', name: 'CMHP Pharma' }

                  const deadline = ord.delivery_deadline || ord.delivery_date
                  const analysis = getDeadlineAnalysis(deadline, ord.status)
                  const st = String(ord.status || 'DRAFT').toUpperCase()
                  const stColor = STATUS_COLORS[st] || STATUS_COLORS.DRAFT

                  return (
                    <tr key={ord.id}>
                      <td><strong>{ord.number || `ORD-${ord.id}`}</strong></td>
                      {!isCompanyScoped && (
                        <td>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              background: companyBadgeStyle.bg,
                              color: companyBadgeStyle.color,
                            }}
                          >
                            {companyBadgeStyle.name}
                          </span>
                        </td>
                      )}
                      <td>{getCustomerName(ord)}</td>
                      <td>{ord.order_date || '—'}</td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              analysis.status === 'overdue'
                                ? '#dc2626'
                                : analysis.status === 'due-soon'
                                ? '#d97706'
                                : '#334155',
                          }}
                        >
                          {deadline || '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background:
                              analysis.status === 'overdue'
                                ? '#fee2e2'
                                : analysis.status === 'due-soon'
                                ? '#fef3c7'
                                : '#f1f5f9',
                            color:
                              analysis.status === 'overdue'
                                ? '#991b1b'
                                : analysis.status === 'due-soon'
                                ? '#92400e'
                                : '#475569',
                            fontWeight: 600,
                          }}
                        >
                          {analysis.label}
                        </span>
                      </td>
                      <td>
                        <strong>
                          ₹{Number(ord.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </strong>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            background: stColor.bg,
                            color: stColor.color,
                          }}
                        >
                          {STATUS_LABELS[st] || st}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(!ord.status || ord.status === 'DRAFT' || ord.status === 'CONFIRMED') && (
                          <Button
                            variant="secondary"
                            size="small"
                            style={{
                              marginRight: 6,
                              backgroundColor: '#ecfdf5',
                              color: '#047857',
                              borderColor: '#a7f3d0',
                              fontWeight: 600,
                            }}
                            onClick={() => openProduceModal(ord)}
                            title="Produce batch automatically from formula BOM"
                          >
                            Produce (BOM)
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            setSelectedOrder(ord)
                            setDetailModalOpen(true)
                          }}
                          style={{ marginRight: 6 }}
                        >
                          Details
                        </Button>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => openEditOrder(ord)}
                          style={{ marginRight: 6 }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="small"
                          onClick={() => handleDeleteOrder(ord)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span style={{ padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Order Detail Modal with Common Inventory Availability Check */}
      {detailModalOpen && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={selectedOrder ? `Order Details: #${selectedOrder.number || selectedOrder.id}` : 'Order Details'}
        >
        {selectedOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Meta info */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                background: '#f8fafc',
                padding: 14,
                borderRadius: 8,
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Company</span>
                <div style={{ fontWeight: 600 }}>
                  {Number(selectedOrder.company) === 2 ? 'Tej Biocare' : 'CMHP Pharma'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Customer</span>
                <div style={{ fontWeight: 600 }}>{getCustomerName(selectedOrder)}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Order Date</span>
                <div style={{ fontWeight: 600 }}>{selectedOrder.order_date || '—'}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Delivery Deadline</span>
                <div style={{ fontWeight: 600 }}>
                  {selectedOrder.delivery_deadline || selectedOrder.delivery_date || '—'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Total Amount</span>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                  ₹{Number(selectedOrder.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Status</span>
                <div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: STATUS_COLORS[selectedOrder.status]?.bg || '#f1f5f9',
                      color: STATUS_COLORS[selectedOrder.status]?.color || '#475569',
                    }}
                  >
                    {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Status Change */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Change Status:</span>
              {ORDER_STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleQuickStatusChange(selectedOrder.id, st)}
                  disabled={selectedOrder.status === st}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '1px solid #cbd5e1',
                    background: selectedOrder.status === st ? '#2563eb' : '#fff',
                    color: selectedOrder.status === st ? '#fff' : '#334155',
                    cursor: selectedOrder.status === st ? 'default' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {STATUS_LABELS[st] || st}
                </button>
              ))}
            </div>

            {/* Line Items & Stock Availability Check */}
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#1e293b' }}>
                Order Line Items &amp; Common Inventory Stock Availability:
              </h4>

              {(() => {
                const lines =
                  selectedOrder.lines && selectedOrder.lines.length
                    ? selectedOrder.lines
                    : [
                        {
                          product_name: selectedOrder.product_name || 'Standard Product',
                          quantity: selectedOrder.quantity || 100,
                          unit_price: selectedOrder.price || 0,
                        },
                      ]

                return (
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Product</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Required Qty</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Common Inv Stock</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Availability Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => {
                          const pName = line.product_name || line.name || `Item ${idx + 1}`
                          const reqQty = Number(line.quantity || 0)

                          // Look up in commonProducts
                          const matchedProduct = commonProducts.find(
                            (cp) =>
                              cp.name?.toLowerCase() === pName.toLowerCase() ||
                              cp.code?.toLowerCase() === (line.code || '').toLowerCase()
                          )

                          const availableStock = matchedProduct ? Number(matchedProduct.current_stock || 0) : 0
                          const isAvailable = matchedProduct && availableStock >= reqQty
                          const shortage = reqQty - availableStock

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{pName}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{reqQty}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <strong>{matchedProduct ? availableStock : '0 (Not in inventory)'}</strong>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isAvailable ? (
                                  <span
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      background: '#dcfce7',
                                      color: '#15803d',
                                    }}
                                  >
                                    ✓ In Stock (Available: {availableStock})
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      background: '#fee2e2',
                                      color: '#b91c1c',
                                    }}
                                  >
                                    ⚠️ Shortage of {shortage > 0 ? shortage : reqQty} (Available: {availableStock})
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                ₹{Number(line.unit_price || line.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              {selectedOrder && (!selectedOrder.status || selectedOrder.status === 'DRAFT' || selectedOrder.status === 'CONFIRMED') && (
                <Button
                  type="button"
                  style={{
                    backgroundColor: '#10b981',
                    borderColor: '#10b981',
                    color: '#fff',
                    fontWeight: 600,
                    marginRight: 'auto',
                  }}
                  onClick={() => {
                    const ord = selectedOrder
                    setDetailModalOpen(false)
                    openProduceModal(ord)
                  }}
                >
                  ⚡ Produce Batch (Formula BOM)
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
        </Modal>
      )}

      {/* Create Order Modal */}
      {addModalOpen && (
        <Modal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          title="Create New Order"
        >
        <form onSubmit={handleSaveNewOrder} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <Alert type="error" message={error} />}

          <div style={{ display: 'grid', gridTemplateColumns: isCompanyScoped ? '1fr' : '1fr 1fr', gap: 12 }}>
            {!isCompanyScoped && (
              <div className="company-field">
                <label>Company *</label>
                <select
                  className="company-input"
                  value={orderForm.company}
                  onChange={(e) => setOrderForm({ ...orderForm, company: Number(e.target.value) })}
                >
                  <option value={1}>CMHP Pharma</option>
                  <option value={2}>Tej Biocare</option>
                </select>
              </div>
            )}

            <div className="company-field">
              <label>Customer *</label>
              <select
                className="company-input"
                value={orderForm.customer}
                onChange={(e) => {
                  const cust = customers.find((c) => String(c.id) === e.target.value)
                  setOrderForm({
                    ...orderForm,
                    customer: e.target.value,
                    customer_name: cust ? cust.name : '',
                  })
                }}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Order Date *"
              type="date"
              value={orderForm.order_date}
              onChange={(e) => setOrderForm({ ...orderForm, order_date: e.target.value })}
              required
            />
            <Input
              label="Delivery Deadline *"
              type="date"
              value={orderForm.delivery_deadline}
              onChange={(e) => setOrderForm({ ...orderForm, delivery_deadline: e.target.value })}
              required
            />
          </div>

          <div className="company-field">
            <label>Product Name *</label>
            <input
              type="text"
              className="company-input"
              value={orderForm.lines[0]?.product_name || ''}
              onChange={(e) => {
                const lines = [...orderForm.lines]
                lines[0] = { ...lines[0], product_name: e.target.value }
                setOrderForm({ ...orderForm, lines })
              }}
              placeholder="Select or enter product name"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Order Quantity *"
              type="number"
              min="1"
              value={orderForm.lines[0]?.quantity || 100}
              onChange={(e) => {
                const lines = [...orderForm.lines]
                lines[0] = { ...lines[0], quantity: Number(e.target.value) }
                setOrderForm({ ...orderForm, lines })
              }}
              required
            />
            <Input
              label="Unit Price (₹) *"
              type="number"
              step="0.01"
              min="0"
              value={orderForm.lines[0]?.unit_price || 0}
              onChange={(e) => {
                const lines = [...orderForm.lines]
                lines[0] = { ...lines[0], unit_price: Number(e.target.value) }
                setOrderForm({ ...orderForm, lines })
              }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Order
            </Button>
          </div>
        </form>
        </Modal>
      )}

      {/* Edit Order Modal */}
      {editModalOpen && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={selectedOrder ? `Edit Order #${selectedOrder.number || selectedOrder.id}` : 'Edit Order'}
        >
        <form onSubmit={handleSaveEditOrder} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <Alert type="error" message={error} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Delivery Deadline *"
              type="date"
              value={orderForm.delivery_deadline}
              onChange={(e) => setOrderForm({ ...orderForm, delivery_deadline: e.target.value })}
              required
            />
            <div className="company-field">
              <label>Status</label>
              <select
                className="company-input"
                value={orderForm.status}
                onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value })}
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>{STATUS_LABELS[st] || st}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="company-field">
            <label>Product Name</label>
            <input
              type="text"
              className="company-input"
              value={orderForm.lines[0]?.product_name || ''}
              onChange={(e) => {
                const lines = [...orderForm.lines]
                lines[0] = { ...lines[0], product_name: e.target.value }
                setOrderForm({ ...orderForm, lines })
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={orderForm.lines[0]?.quantity || 1}
              onChange={(e) => {
                const lines = [...orderForm.lines]
                lines[0] = { ...lines[0], quantity: Number(e.target.value) }
                setOrderForm({ ...orderForm, lines })
              }}
            />
            <Input
              label="Unit Price (₹)"
              type="number"
              step="0.01"
              min="0"
              value={orderForm.lines[0]?.unit_price || 0}
              onChange={(e) => {
                const lines = [...orderForm.lines]
                lines[0] = { ...lines[0], unit_price: Number(e.target.value) }
                setOrderForm({ ...orderForm, lines })
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Update Order
            </Button>
          </div>
        </form>
        </Modal>
      )}

      {/* Produce Batch (Formula BOM) Modal */}
      {produceModalOrder && (
        <Modal
          isOpen={Boolean(produceModalOrder)}
          onClose={() => setProduceModalOrder(null)}
          title={`Produce Batch: Order #${produceModalOrder.number || produceModalOrder.id}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <div><strong>Customer:</strong> {getCustomerName(produceModalOrder)}</div>
              <div><strong>Ordered Item:</strong> {produceModalOrder.product_name || produceModalOrder.lines?.[0]?.product_name || 'Pharmaceutical Formulation'}</div>
              <div><strong>Delivery Due Date:</strong> {produceModalOrder.delivery_deadline || produceModalOrder.delivery_date || 'Not specified'}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Batch Quantity (to produce)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={produceQuantity}
                  onChange={(e) => setProduceQuantity(e.target.value)}
                  placeholder="Batch quantity"
                />
              </div>
              <div className="company-field">
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  BOM Formula
                </label>
                <select
                  className="company-input"
                  value={currentProduceFormula?.id || ''}
                  onChange={(e) => setProduceFormulaId(e.target.value)}
                  style={{ width: '100%', height: 38 }}
                >
                  {(formulas || []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Base: {f.base_quantity} {f.base_unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {produceError && <Alert type="error" message={produceError} />}

            {/* Formula Raw Materials Availability Check */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155' }}>
                  Raw Material Requirements &amp; Live Stock Verification
                </h4>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Formula Base: {currentProduceFormula?.base_quantity || 100} {currentProduceFormula?.base_unit || 'g'} | Scale: {produceStockCheck.scaleFactor ? produceStockCheck.scaleFactor.toFixed(2) : '1.0'}x
                </span>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Material</th>
                      <th style={{ padding: '8px 12px' }}>Base Qty</th>
                      <th style={{ padding: '8px 12px' }}>Required Qty</th>
                      <th style={{ padding: '8px 12px' }}>Stock Available</th>
                      <th style={{ padding: '8px 12px' }}>Shortage</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produceStockCheck.materials.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                          No raw materials defined for this formula. Select or create a formula revision in Products.
                        </td>
                      </tr>
                    ) : (
                      produceStockCheck.materials.map((m, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: m.isSufficient ? 'white' : '#fff1f2' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.name}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{m.baseQuantity} {m.unit}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{m.requiredAmount.toFixed(2)} {m.unit}</td>
                          <td style={{ padding: '8px 12px', color: m.isSufficient ? '#16a34a' : '#e11d48', fontWeight: 600 }}>
                            {m.availableStock.toFixed(2)} {m.unit}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#e11d48', fontWeight: 700 }}>
                            {m.shortage > 0 ? `-${m.shortage.toFixed(2)} ${m.unit}` : '0'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: m.isSufficient ? '#dcfce7' : '#fee2e2',
                              color: m.isSufficient ? '#15803d' : '#b91c1c',
                            }}>
                              {m.isSufficient ? 'In Stock' : 'SHORTAGE'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shortage warning or green confirmation */}
            {produceStockCheck.hasShortage ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 12, borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
                <strong>⚠️ Production Blocked:</strong> Stock is insufficient for {produceStockCheck.totalShortageCount} raw material(s). Inward stock into inventory before issuing to production.
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 12, borderRadius: 6, color: '#166534', fontSize: 13 }}>
                <strong>✓ Stock Verified:</strong> All required raw materials are available in inventory. Starting production will issue materials outward from the Stock Ledger and schedule QC inspection.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setProduceModalOrder(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={produceStockCheck.hasShortage || saving || produceStockCheck.materials.length === 0}
                onClick={handleStartProductionFromOrder}
                style={{
                  backgroundColor: produceStockCheck.hasShortage ? '#cbd5e1' : '#16a34a',
                  cursor: produceStockCheck.hasShortage ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Issuing Materials...' : produceStockCheck.hasShortage ? 'Production Blocked (Shortage)' : 'Start Production & Issue Materials'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
