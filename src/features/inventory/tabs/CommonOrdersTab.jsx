import { useState, useMemo, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import {
  addOrder,
  editOrder,
  deleteOrder,
  setOrderStatus,
  confirmSampleQuantity,
  updateSampleQuantity,
  selectDosageForms,
} from '../../../store/erpSlice'
import { dispatchNotification } from '../../../utils/notifications'
import { logAudit } from '../../../utils/audit'
import { confirmAction } from '../../../utils/confirmAction'
import { commitDocumentNumber } from '../../../utils/documentNumbers'
import {
  selectFormulas,
  selectActiveCompanyId,
  selectActiveCompanyKey,
} from '../../../utils/companySelectors'
import { checkFormulaStockAvailability } from '../../../utils/stockSelectors'
import { operationsService } from '../../operations/operationsService'
import { store } from '../../../store/store'
import { storage } from '../../../utils/storage'
import OrderDetailModal from '../../operations/components/OrderDetailModal'
import {
  getOrderRole,
  canCreateOrders,
  canEditOrders,
  canDeleteOrders,
  canApproveOrders,
  filterOrderEditPayload,
  ORDER_ROLES,
} from '../../operations/orderPermissions'
import {
  getSectionAStatus,
  getSectionBStatus,
  getSectionCStatus,
} from '../../operations/orderConstants'

const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'QC_PENDING',
  'QA_PENDING',
  'IN_PRODUCTION',
  'READY_TO_INVOICE',
  'INVOICED',
  'DISPATCHED',
  'DELIVERED',
  'PAID',
  'COMPLETED',
  'CANCELLED',
]

const STATUS_LABELS = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  QC_PENDING: 'QC Pending',
  QA_PENDING: 'QA Pending',
  IN_PRODUCTION: 'In Production',
  READY_TO_INVOICE: 'Ready to Invoice',
  INVOICED: 'Invoiced',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const STATUS_COLORS = {
  DRAFT: { bg: '#f1f5f9', color: '#475569' },
  CONFIRMED: { bg: '#e0f2fe', color: '#0369a1' },
  QC_PENDING: { bg: '#fef9c3', color: '#a16207' },
  QA_PENDING: { bg: '#fef3c7', color: '#b45309' },
  IN_PRODUCTION: { bg: '#fef3c7', color: '#b45309' },
  READY_TO_INVOICE: { bg: '#e0e7ff', color: '#4338ca' },
  INVOICED: { bg: '#ede9fe', color: '#6d28d9' },
  DISPATCHED: { bg: '#ede9fe', color: '#6d28d9' },
  DELIVERED: { bg: '#dcfce7', color: '#15803d' },
  PAID: { bg: '#dcfce7', color: '#15803d' },
  COMPLETED: { bg: '#dcfce7', color: '#15803d' },
  CANCELLED: { bg: '#fee2e2', color: '#b91c1c' },
}

export default function CommonOrdersTab({
  role,
  isCompanyScoped = false,
  initialMode = null,
  initialOrderId = null,
}) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const activeCompanyKey = useSelector(selectActiveCompanyKey)
  const formulas = useSelector(selectFormulas)

  const currentUser = storage.getUser()
  const userRole = getOrderRole(currentUser)

  const userCanCreate = canCreateOrders(currentUser)
  const userCanDelete = canDeleteOrders(currentUser)
  const userCanApprove = canApproveOrders(currentUser)

  const ordersSlice = useSelector((state) => state.erp?.orders)
  const byCompanySlice = useSelector((state) => state.erp?.byCompany)

  const rawOrders = useMemo(() => {
    if (isCompanyScoped) {
      const key = activeCompanyKey || (activeCompanyId === 2 ? 'tej' : 'cmhp')
      const compId = Number(activeCompanyId) || 1
      const list = []
      if (Array.isArray(byCompanySlice?.[key]?.orders)) {
        list.push(...byCompanySlice[key].orders)
      }
      if (Array.isArray(ordersSlice)) {
        ordersSlice.forEach((o) => {
          if (o && Number(o.company) === compId && !list.some((existing) => existing?.id === o.id)) {
            list.push(o)
          }
        })
      }
      return list
    }

    const list = []
    if (Array.isArray(ordersSlice)) list.push(...ordersSlice)
    if (byCompanySlice) {
      Object.values(byCompanySlice).forEach((co) => {
        if (Array.isArray(co?.orders)) list.push(...co.orders)
      })
    }
    // Deduplicate by ID
    const map = new Map()
    list.forEach((ord) => {
      if (ord && ord.id) map.set(ord.id, ord)
    })
    return Array.from(map.values())
  }, [isCompanyScoped, activeCompanyKey, activeCompanyId, ordersSlice, byCompanySlice])

  // Role-based stage filtering
  const roleScopedOrders = useMemo(() => {
    if ([ORDER_ROLES.ADMIN, ORDER_ROLES.MANAGER, ORDER_ROLES.STORE_MANAGER].includes(userRole)) {
      return rawOrders
    }
    if (userRole === ORDER_ROLES.QC) {
      return rawOrders.filter((o) =>
        ['QC_PENDING', 'QC_APPROVED', 'QC_REJECTED', 'IN_PRODUCTION'].includes(
          String(o.status || '').toUpperCase()
        )
      )
    }
    if (userRole === ORDER_ROLES.QA) {
      return rawOrders.filter((o) =>
        ['QA_PENDING', 'QA_APPROVED', 'QC_APPROVED', 'IN_PRODUCTION'].includes(
          String(o.status || '').toUpperCase()
        )
      )
    }
    if (userRole === ORDER_ROLES.ACCOUNTS) {
      return rawOrders.filter((o) =>
        ['READY_TO_INVOICE', 'INVOICED', 'DELIVERED', 'PAID', 'COMPLETED'].includes(
          String(o.status || '').toUpperCase()
        )
      )
    }
    if (userRole === ORDER_ROLES.DISPATCH) {
      return rawOrders.filter((o) =>
        ['READY_TO_INVOICE', 'INVOICED', 'DISPATCHED', 'DELIVERED'].includes(
          String(o.status || '').toUpperCase()
        )
      )
    }
    return rawOrders
  }, [rawOrders, userRole])

  const customers = useSelector((state) => state.erp?.customers || [])
  const dosageForms = useSelector(selectDosageForms)

  // Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL') // 'ALL' | '1' | '2'
  const [typeFilter, setTypeFilter] = useState('ALL')
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
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderModalMode, setOrderModalMode] = useState('create') // 'create' | 'edit' | 'view'
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Sample Quantity Modal State
  const [sampleModalOrder, setSampleModalOrder] = useState(null)
  const [sampleInputVal, setSampleInputVal] = useState(0)
  const [sampleError, setSampleError] = useState('')

  // Handle deep-link initialMode
  useEffect(() => {
    if (initialMode === 'create' && canCreateOrders(currentUser)) {
      setSelectedOrder(null)
      setOrderModalMode('create')
      setOrderModalOpen(true)
    } else if (initialMode === 'edit' && initialOrderId) {
      const found = rawOrders.find(
        (o) => String(o.id) === String(initialOrderId) || String(o.number) === String(initialOrderId)
      )
      if (found && canEditOrders(currentUser, found)) {
        setSelectedOrder(found)
        setOrderModalMode('edit')
        setOrderModalOpen(true)
      }
    }
  }, [initialMode, initialOrderId, rawOrders, currentUser])

  // Helper to get customer name
  const getCustomerName = (ord) => {
    if (!ord) return 'Direct Customer'
    if (ord.customer_name && typeof ord.customer_name === 'string') return ord.customer_name
    if (ord.customer && typeof ord.customer === 'object' && ord.customer.name) return String(ord.customer.name)
    if (ord.customer && Array.isArray(customers)) {
      const cust = customers.find((c) => Number(c.id) === Number(ord.customer))
      if (cust) return cust.name
    }
    if (typeof ord.customer === 'string' && ord.customer.trim()) return ord.customer
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

    roleScopedOrders.forEach((o) => {
      total++
      const st = String(o.status || 'DRAFT').toUpperCase()
      if (['DRAFT', 'PENDING', 'CONFIRMED', 'QC_PENDING', 'QA_PENDING'].includes(st)) pending++
      if (['IN_PRODUCTION', 'PRODUCTION', 'PROCESSING', 'DISPATCHED'].includes(st)) inProgress++
      if (['READY_TO_INVOICE', 'INVOICED', 'DELIVERED', 'PAID', 'COMPLETED'].includes(st)) completed++

      const deadline = o.delivery_deadline || o.delivery_date
      const analysis = getDeadlineAnalysis(deadline, st)
      if (analysis.status === 'overdue') overdue++
      if (analysis.status === 'due-soon') dueSoon++
    })

    return { total, pending, inProgress, completed, dueSoon, overdue }
  }, [roleScopedOrders])

  // Filtered and Sorted Orders (Default: nearest deadline first)
  const filteredOrders = useMemo(() => {
    return roleScopedOrders
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
        if (typeFilter === 'ALL') return true
        const ordType = String(o.product_type || o.type || o.dosage_form || o.dosageForm || '').toLowerCase()
        return ordType === typeFilter.toLowerCase()
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
        return String(deadA).localeCompare(String(deadB))
      })
  }, [rawOrders, search, companyFilter, typeFilter, statusFilter, deadlineToFilter, startDate, endDate, customers])

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
      if (orderModalOpen && selectedOrder?.id === produceModalOrder.id) {
        setOrderModalOpen(false)
      }
    } catch (err) {
      setProduceError(err?.message || 'Failed to start production.')
    } finally {
      setSaving(false)
    }
  }

  // Sample Quantity Modal Handlers
  const openSampleModal = (ord) => {
    setSampleModalOrder(ord)
    setSampleInputVal(ord.sample_quantity !== undefined ? ord.sample_quantity : 0)
    setSampleError('')
  }

  const handleConfirmSample = () => {
    if (!sampleModalOrder) return
    const val = Number(sampleInputVal)
    const totalProduced = Number(
      sampleModalOrder.qa_approved_qty ||
      sampleModalOrder.produced_quantity ||
      sampleModalOrder.quantity ||
      100
    )

    if (isNaN(val) || !Number.isInteger(val)) {
      setSampleError('Sample quantity must be a whole number (no decimals).')
      return
    }
    if (val < 0) {
      setSampleError('Sample quantity cannot be negative (minimum is 0).')
      return
    }
    if (val > totalProduced) {
      setSampleError(`Sample quantity cannot exceed total produced quantity (${totalProduced} pcs).`)
      return
    }

    const isEdit = Boolean(sampleModalOrder.sample_confirmed)
    const isAdminUser = Boolean(
      currentUser?.is_superuser === true ||
      userRole === ORDER_ROLES.ADMIN ||
      currentUser?.role === 'SUPER_ADMIN'
    )

    if (isEdit && !isAdminUser) {
      setSampleError('Permission denied: Confirmed sample quantities can only be edited by Admin.')
      return
    }

    if (isEdit) {
      dispatch(updateSampleQuantity({
        orderId: sampleModalOrder.id,
        sampleQuantity: val,
        user: currentUser,
      }))
      logAudit({
        module: 'INVENTORY',
        entity_type: 'Sample',
        entity_id: `Order #${sampleModalOrder.number || sampleModalOrder.id}`,
        action: 'SAMPLE_UPDATED',
        description: `Admin updated sample quantity for Order #${sampleModalOrder.number || sampleModalOrder.id} to ${val} pcs`,
        company: sampleModalOrder.company,
        user: currentUser?.username || currentUser?.email || 'Admin',
        role: userRole,
      })
      dispatchNotification({
        category: 'inventory',
        title: 'Sample Quantity Updated',
        message: `Admin updated sample quantity for Order #${sampleModalOrder.number || sampleModalOrder.id} to ${val} units. Remaining ${totalProduced - val} units for packaging.`,
        severity: 'info',
        link: '/inventory/samples',
        referenceId: String(sampleModalOrder.id),
        targetRoles: ['SUPER_ADMIN', 'STORES_MANAGER', 'MANAGEMENT'],
      })
      setSuccess(`Sample quantity for Order #${sampleModalOrder.number || sampleModalOrder.id} updated to ${val} pcs.`)
    } else {
      dispatch(confirmSampleQuantity({
        orderId: sampleModalOrder.id,
        sampleQuantity: val,
        user: currentUser,
      }))
      logAudit({
        module: 'INVENTORY',
        entity_type: 'Sample',
        entity_id: `Order #${sampleModalOrder.number || sampleModalOrder.id}`,
        action: 'SAMPLE_CONFIRMED',
        description: `Confirmed sample quantity of ${val} pcs for Order #${sampleModalOrder.number || sampleModalOrder.id}`,
        company: sampleModalOrder.company,
        user: currentUser?.username || currentUser?.email || 'User',
        role: userRole,
      })
      dispatchNotification({
        category: 'inventory',
        title: 'Sample Quantity Confirmed',
        message: `Sample quantity confirmed: ${val} units kept as samples for Order #${sampleModalOrder.number || sampleModalOrder.id}. Remaining ${totalProduced - val} units routed to packaging.`,
        severity: 'info',
        link: '/inventory/samples',
        referenceId: String(sampleModalOrder.id),
        targetRoles: ['SUPER_ADMIN', 'STORES_MANAGER', 'MANAGEMENT'],
      })
      setSuccess(`Sample quantity confirmed: ${val} pcs deducted for testing/retention; ${totalProduced - val} pcs ready for packaging.`)
    }

    setSampleModalOrder(null)
  }

  // Delete Order handler
  const handleDeleteOrder = (order) => {
    if (!canDeleteOrders(currentUser)) {
      setError('Access Denied: Only Admin roles can delete orders.')
      return
    }
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
          user: currentUser?.username || currentUser?.email || 'User',
          role: userRole,
        })
        setSuccess(`Order #${order.number || order.id} deleted.`)
        if (orderModalOpen && selectedOrder?.id === order.id) setOrderModalOpen(false)
      }
    )
  }

  // Open Create Order (Admin only)
  const openCreateOrder = () => {
    if (!canCreateOrders(currentUser)) {
      setError('Access Denied: Only Admin can create orders.')
      return
    }
    setError('')
    setSelectedOrder(null)
    setOrderModalMode('create')
    setOrderModalOpen(true)
  }

  // Open Edit Order (Role-specific section permissions)
  const openEditOrder = (order) => {
    if (!canEditOrders(currentUser, order)) {
      setError('Access Denied: Your role does not have permission to edit orders.')
      return
    }
    setError('')
    setSelectedOrder(order)
    setOrderModalMode('edit')
    setOrderModalOpen(true)
  }

  // Open View Order (All roles)
  const openViewOrder = (order) => {
    setError('')
    setSelectedOrder(order)
    setOrderModalMode('view')
    setOrderModalOpen(true)
  }

  // Handle Save from OrderDetailModal (Create or Edit)
  const handleSaveOrderFromModal = (modalFormData, section = 'all') => {
    if (orderModalMode === 'create') {
      if (!canCreateOrders(currentUser)) {
        setError('Access Denied: Only Admin can create orders.')
        return
      }

      const targetComp = Number(modalFormData.company_id) || (isCompanyScoped ? Number(activeCompanyId) || 1 : 1)
      const num = commitDocumentNumber('ORDER', targetComp)
      const calculatedTotal = (modalFormData.lines || []).reduce(
        (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
        0
      )

      const newOrderPayload = {
        ...modalFormData,
        id: Date.now(),
        number: num,
        company: targetComp,
        order_number: num,
        product_type: modalFormData.product_type,
        type: modalFormData.product_type,
        dosage_form: modalFormData.product_type,
        dosageForm: modalFormData.product_type,
        order_date: modalFormData.date_of_order || new Date().toISOString().slice(0, 10),
        delivery_deadline: modalFormData.planned_mfg_date,
        delivery_date: modalFormData.planned_mfg_date,
        status: modalFormData.materials_allocated ? 'CONFIRMED' : 'DRAFT',
        total_amount: calculatedTotal,
        quantity: Number(modalFormData.lines?.[0]?.quantity) || 100,
        price: Number(modalFormData.lines?.[0]?.unit_price) || 0,
      }

      dispatch(addOrder(newOrderPayload))

      logAudit({
        module: 'ORDERS',
        entity_type: 'Order',
        entity_id: num,
        action: 'ORDER_CREATED',
        description: `Created Order #${num} for ${modalFormData.customer_name || 'Customer'} [Product: ${modalFormData.product_name}]`,
        company: targetComp,
        user: currentUser?.username || currentUser?.email || 'Admin',
        role: userRole,
      })

      setSuccess(`Order #${num} created successfully.`)
      setOrderModalOpen(false)
      if (initialMode) {
        navigate('/orders', { replace: true })
      }
    } else {
      // Edit existing order
      if (!selectedOrder) return
      if (!canEditOrders(currentUser, selectedOrder)) {
        setError('Access Denied: Your role does not have permission to edit this order.')
        return
      }

      const filteredPayload = filterOrderEditPayload(modalFormData, currentUser, selectedOrder)
      const calculatedTotal = (modalFormData.lines || []).reduce(
        (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
        0
      )

      const shouldAdvanceToConfirmed =
        section === 'C' &&
        modalFormData.materials_allocated &&
        selectedOrder.status === 'DRAFT'

      const updated = {
        ...selectedOrder,
        ...filteredPayload,
        product_type: modalFormData.product_type || selectedOrder.product_type || selectedOrder.type,
        type: modalFormData.product_type || selectedOrder.type || selectedOrder.product_type,
        dosage_form: modalFormData.product_type || selectedOrder.dosage_form || selectedOrder.product_type,
        dosageForm: modalFormData.product_type || selectedOrder.dosageForm || selectedOrder.product_type,
        status: shouldAdvanceToConfirmed ? 'CONFIRMED' : (filteredPayload.status || selectedOrder.status),
        total_amount: calculatedTotal || selectedOrder.total_amount || 0,
        delivery_deadline: modalFormData.planned_mfg_date || selectedOrder.delivery_deadline,
        delivery_date: modalFormData.planned_mfg_date || selectedOrder.delivery_date,
        order_date: modalFormData.date_of_order || selectedOrder.order_date,
      }

      dispatch(editOrder({ id: selectedOrder.id, payload: updated }))

      const changes = []
      if (selectedOrder.product_name !== updated.product_name) {
        changes.push({
          field: 'product_name',
          old_value: `${selectedOrder.product_name || 'None'} (${selectedOrder.product_code || ''})`,
          new_value: `${updated.product_name} (${updated.product_code || ''})`,
        })
      }
      if (selectedOrder.status !== updated.status) {
        changes.push({ field: 'status', old_value: selectedOrder.status, new_value: updated.status })
      }
      if (selectedOrder.batch_no !== updated.batch_no && updated.batch_no) {
        changes.push({ field: 'batch_no', old_value: selectedOrder.batch_no || 'None', new_value: updated.batch_no })
      }
      if (selectedOrder.packing_type !== updated.packing_type && updated.packing_type) {
        changes.push({ field: 'packing_type', old_value: selectedOrder.packing_type || 'None', new_value: updated.packing_type })
      }
      if (selectedOrder.mrp_for_printing !== updated.mrp_for_printing && updated.mrp_for_printing) {
        changes.push({ field: 'mrp_for_printing', old_value: selectedOrder.mrp_for_printing || '0', new_value: updated.mrp_for_printing })
      }

      const productChanged = selectedOrder.product_name !== updated.product_name
      const logDescription = productChanged
        ? `Updated Order #${selectedOrder.number || selectedOrder.id}: Product changed from "${selectedOrder.product_name}" to "${updated.product_name}"`
        : `Updated Order #${selectedOrder.number || selectedOrder.id} [Section ${section}]`

      logAudit({
        module: 'ORDERS',
        entity_type: 'Order',
        entity_id: selectedOrder.number || String(selectedOrder.id),
        action: 'ORDER_EDITED',
        description: logDescription,
        changes,
        company: selectedOrder.company,
        user: currentUser?.username || currentUser?.email || 'User',
        role: userRole,
      })

      setSuccess(`Order #${selectedOrder.number || selectedOrder.id} updated successfully.`)
      setSelectedOrder(updated)
      setOrderModalOpen(false)
      if (initialMode) {
        navigate('/orders', { replace: true })
      }
    }
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
        {userCanCreate && (
          <Button type="button" onClick={openCreateOrder}>
            + Create Order
          </Button>
        )}
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
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 140 }}
          title="Filter by Type"
        >
          <option value="ALL">All Types</option>
          {dosageForms.map((df) => (
            <option key={df} value={df}>{df}</option>
          ))}
        </select>

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
                  <th>Product</th>
                  <th>Company</th>
                  <th>Date of Order</th>
                  <th>Planned Mfg Date</th>
                  <th>Batch No.</th>
                  <th>Section Badges</th>
                  <th>Customer</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Sample Qty</th>
                  <th>Packaging Qty</th>
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

                  const deadline = ord.planned_mfg_date || ord.delivery_deadline || ord.delivery_date
                  const st = String(ord.status || 'DRAFT').toUpperCase()
                  const stColor = STATUS_COLORS[st] || STATUS_COLORS.DRAFT

                  const secA = getSectionAStatus(ord)
                  const secB = getSectionBStatus(ord)
                  const secC = getSectionCStatus(ord)

                  const productName =
                    (typeof ord.product_name === 'string' && ord.product_name) ||
                    (typeof ord.product === 'string' && ord.product) ||
                    (ord.product && typeof ord.product === 'object' && ord.product.name) ||
                    (ord.lines?.[0]?.product_name) ||
                    '—'

                  return (
                    <tr key={ord.id}>
                      <td>
                        <strong>{ord.number || ord.order_number || `ORD-${ord.id}`}</strong>
                      </td>
                      <td>
                        <strong>{productName}</strong>
                        {ord.product_code && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Code: {ord.product_code}
                          </div>
                        )}
                        {(ord.product_type || ord.type || ord.dosage_form) && (
                          <div style={{ fontSize: 11, color: '#0369a1', marginTop: 2, fontWeight: 500 }}>
                            Type: {ord.product_type || ord.type || ord.dosage_form}
                          </div>
                        )}
                      </td>
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
                          {ord.company_name || companyBadgeStyle.name}
                        </span>
                      </td>
                      <td>{ord.date_of_order || ord.order_date || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#334155' }}>
                          {deadline || '—'}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: 12, padding: '2px 4px', background: '#f1f5f9', borderRadius: 4 }}>
                          {ord.batch_no || '—'}
                        </code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: secA === 'Completed' ? '#dcfce7' : '#fef3c7',
                              color: secA === 'Completed' ? '#166534' : '#92400e',
                              fontWeight: 600,
                            }}
                          >
                            <span>A (Admin):</span>
                            <span>{secA === 'Completed' ? '✓' : '●'} {secA}</span>
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: secB === 'Completed' ? '#dcfce7' : '#fef3c7',
                              color: secB === 'Completed' ? '#166534' : '#92400e',
                              fontWeight: 600,
                            }}
                          >
                            <span>B (Mgr):</span>
                            <span>{secB === 'Completed' ? '✓' : '●'} {secB}</span>
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: secC === 'Completed' ? '#dcfce7' : '#fef3c7',
                              color: secC === 'Completed' ? '#166534' : '#92400e',
                              fontWeight: 600,
                            }}
                          >
                            <span>C (Store):</span>
                            <span>{secC === 'Completed' ? '✓' : '●'} {secC}</span>
                          </span>
                        </div>
                      </td>
                      <td>{getCustomerName(ord)}</td>
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
                      <td>
                        {ord.sample_confirmed ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 700,
                              background: '#f5f3ff',
                              color: '#7c3aed',
                              border: '1px solid #ddd6fe',
                            }}
                          >
                            {ord.sample_quantity} pcs
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td>
                        {ord.sample_confirmed ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 700,
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                            }}
                          >
                            {ord.packaging_quantity} pcs
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {/* Sample / Packaging Button */}
                        <Button
                          variant="secondary"
                          size="small"
                          style={{
                            marginRight: 6,
                            backgroundColor: ord.sample_confirmed ? '#f5f3ff' : '#eff6ff',
                            color: ord.sample_confirmed ? '#6d28d9' : '#1d4ed8',
                            borderColor: ord.sample_confirmed ? '#ddd6fe' : '#bfdbfe',
                            fontWeight: 600,
                          }}
                          onClick={() => openSampleModal(ord)}
                          title="Manage Sample Quantity & Packaging Allocation"
                        >
                          {ord.sample_confirmed ? `Sample: ${ord.sample_quantity}` : 'Sample / Packaging'}
                        </Button>
                        {userCanApprove && ord.status === 'DRAFT' && (
                          <Button
                            variant="secondary"
                            size="small"
                            style={{
                              marginRight: 6,
                              backgroundColor: '#f0fdf4',
                              color: '#15803d',
                              borderColor: '#86efac',
                              fontWeight: 600,
                            }}
                            onClick={async () => {
                              try {
                                await operationsService.confirmOrder(ord.id, storage.getUser())
                                setSuccess(`Order #${ord.number || ord.id} confirmed and routed to Quality Control (QC inspection generated).`)
                              } catch (err) {
                                setError(err?.message || 'Failed to confirm order')
                              }
                            }}
                            title="Confirm order and route to Quality Control for inspection"
                          >
                            Confirm (QC)
                          </Button>
                        )}
                        {userCanApprove && (!ord.status || ['DRAFT', 'CONFIRMED', 'PENDING', 'QC_PENDING', 'QA_PENDING', 'QC_APPROVED'].includes(ord.status)) && (
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
                          onClick={() => openViewOrder(ord)}
                          style={{ marginRight: 6 }}
                        >
                          Details
                        </Button>
                        {canEditOrders(currentUser, ord) && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => openEditOrder(ord)}
                            style={{ marginRight: 6 }}
                          >
                            Edit
                          </Button>
                        )}
                        {userCanDelete && (
                          <Button
                            variant="danger"
                            size="small"
                            onClick={() => handleDeleteOrder(ord)}
                          >
                            Delete
                          </Button>
                        )}
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

      {/* Three-Section Order Modal (Add, Edit, View) with RBAC */}
      {orderModalOpen && (
        <OrderDetailModal
          isOpen={orderModalOpen}
          mode={orderModalMode}
          order={selectedOrder}
          activeCompanyId={isCompanyScoped ? Number(activeCompanyId) || 1 : 1}
          currentUser={currentUser}
          onClose={() => {
            setOrderModalOpen(false)
            if (initialMode) {
              navigate('/orders', { replace: true })
            }
          }}
          onSaveOrder={handleSaveOrderFromModal}
        />
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

      {/* Sample Quantity & Packaging Modal */}
      {sampleModalOrder && (
        <Modal
          title={
            sampleModalOrder.sample_confirmed
              ? `Edit Sample Quantity — Order #${sampleModalOrder.number || sampleModalOrder.id}`
              : `Confirm Sample Quantity — Order #${sampleModalOrder.number || sampleModalOrder.id}`
          }
          isOpen={Boolean(sampleModalOrder)}
          onClose={() => setSampleModalOrder(null)}
        >
          {(() => {
            const totalProduced = Number(
              sampleModalOrder.qa_approved_qty ||
              sampleModalOrder.produced_quantity ||
              sampleModalOrder.quantity ||
              100
            )
            const sampleNum = Number(sampleInputVal) || 0
            const remainingForPackaging = Math.max(0, totalProduced - sampleNum)
            const isConfirmed = Boolean(sampleModalOrder.sample_confirmed)
            const isAdmin = Boolean(
              currentUser?.is_superuser === true ||
              userRole === ORDER_ROLES.ADMIN ||
              currentUser?.role === 'SUPER_ADMIN'
            )
            const isReadOnly = isConfirmed && !isAdmin

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sampleError && (
                  <Alert variant="danger">
                    {sampleError}
                  </Alert>
                )}

                {isConfirmed && !isAdmin && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: 12, borderRadius: 6, fontSize: 13 }}>
                    🔒 <strong>Sample Confirmed:</strong> Sample quantity has already been confirmed for this order. Only Administrators can edit confirmed sample quantities.
                  </div>
                )}

                {isConfirmed && isAdmin && (
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', padding: 12, borderRadius: 6, fontSize: 13 }}>
                    ⚡ <strong>Admin Edit Mode:</strong> Modifying the sample quantity will automatically update the sellable stock, record a Stock Ledger movement, and log an audit entry.
                  </div>
                )}

                {/* Order Details summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Product</span>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>
                      {sampleModalOrder.product_name || sampleModalOrder.product || '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Batch Number</span>
                    <code style={{ fontSize: 12, padding: '2px 4px', background: '#e2e8f0', borderRadius: 4 }}>
                      {sampleModalOrder.batch_no || '—'}
                    </code>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Customer</span>
                    <span style={{ fontSize: 13 }}>{getCustomerName(sampleModalOrder)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Order Stage</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{sampleModalOrder.status || 'READY_TO_INVOICE'}</span>
                  </div>
                </div>

                {/* Calculation Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12, alignItems: 'center' }}>
                  {/* Read-only Total Produced */}
                  <div style={{ background: '#f1f5f9', padding: 14, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block' }}>
                      Total Produced (Read-only)
                    </span>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                      {totalProduced} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>pcs</span>
                    </div>
                  </div>

                  {/* Sample Input */}
                  <div style={{ background: '#faf5ff', padding: 14, borderRadius: 8, border: '1px solid #d8b4fe' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Sample Quantity (Pieces)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={totalProduced}
                      step="1"
                      disabled={isReadOnly}
                      value={sampleInputVal}
                      onChange={(e) => {
                        setSampleInputVal(e.target.value)
                        setSampleError('')
                      }}
                      className="company-input"
                      style={{
                        width: '100%',
                        fontSize: 18,
                        fontWeight: 700,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #c084fc',
                        background: isReadOnly ? '#f1f5f9' : '#ffffff',
                      }}
                      placeholder="e.g. 5 or 10"
                    />
                  </div>

                  {/* Live Remaining for Packaging */}
                  <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #86efac' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', display: 'block' }}>
                      Remaining for Packaging
                    </span>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginTop: 4 }}>
                      {remainingForPackaging} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>pcs</span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                  ℹ️ <strong>Business Rule:</strong> Samples (typically 5–10 pieces) are retained for lab retention and statutory quality control. Only the remaining {remainingForPackaging} pieces proceed to packaging, dispatch and invoicing. Samples are unbilled and recorded as an outward movement in the Stock Ledger.
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button type="button" variant="secondary" onClick={() => setSampleModalOrder(null)}>
                    {isReadOnly ? 'Close' : 'Cancel'}
                  </Button>
                  {!isReadOnly && (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleConfirmSample}
                      style={{
                        backgroundColor: '#7c3aed',
                        borderColor: '#6d28d9',
                        fontWeight: 600,
                      }}
                    >
                      {isConfirmed ? 'Save Changes (Admin)' : 'Confirm Sample Quantity'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
