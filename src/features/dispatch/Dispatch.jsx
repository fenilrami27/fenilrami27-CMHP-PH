import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { selectActiveCompanyKey, selectActiveCompanyId } from '../../utils/companySelectors'
import { computeSheetGrandTotal } from '../invoice/invoiceService'
import {
  getCurrentMonthKey,
  buildMonthOptions,
  matchesMonthYear,
  matchesDateRange,
  formatDisplayDate,
  formatMonthYearLabel,
} from '../../utils/dateUtils'
import { formatINR } from '../../utils/formatters'
import { recordAudit } from '../../utils/audit'
import { addNotification, updateOrderProductionStatus, addDispatch } from '../../store/erpSlice'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Alert from '../../components/Alert'
import {
  TruckIcon,
  ClipboardIcon,
  ReceiptIcon,
  ClockIcon,
} from '../../components/icons'
import useAuth from '../../hooks/useAuth'
import './Dispatch.css'

function StatusBadge({ type, value, extraText }) {
  const val = String(value || 'Pending').toLowerCase()
  let badgeClass = 'badge-pending'

  if (val === 'done' || val === 'paid' || val === 'yes' || val === 'completed') {
    badgeClass = 'badge-done'
  } else if (val === 'in progress' || val === 'partial' || val === 'in process') {
    badgeClass = 'badge-progress'
  } else if (val === 'pending') {
    badgeClass = type === 'payment' ? 'badge-pending-warn' : 'badge-pending'
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <span className={`stage-badge ${badgeClass}`}>
        {value}
      </span>
      {extraText && (
        <span className="dispatch-date-badge">
          {extraText}
        </span>
      )}
    </div>
  )
}

export default function Dispatch() {
  const dispatch = useDispatch()
  const { user } = useAuth()
  const compKey = useSelector(selectActiveCompanyKey)
  const compId = useSelector(selectActiveCompanyId)

  // Redux Sources of Truth
  const reduxOrders = useSelector((state) => state.erp.byCompany?.[compKey]?.orders || state.erp.orders || [])
  const reduxInvoices = useSelector((state) => state.erp.byCompany?.[compKey]?.invoices || state.erp.invoices || [])
  const reduxPayments = useSelector((state) => state.erp.byCompany?.[compKey]?.payments || state.erp.payments || [])
  const reduxDispatches = useSelector((state) => state.erp.byCompany?.[compKey]?.dispatches || state.erp.dispatches || [])
  const reduxCustomers = useSelector((state) => state.erp.customers || [])
  const reduxProducts = useSelector((state) => state.erp.products || [])
  const savedOrderInvoices = useSelector((state) => state.erp.orderInvoices || {})

  // Active Tab: Dispatched (default) | Ready for Dispatch | In Progress | All Orders
  const [activeTab, setActiveTab] = useState('DISPATCHED')

  // Search & Filters
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('ALL')
  const [productFilter, setProductFilter] = useState('ALL')
  const [prodStatusFilter, setProdStatusFilter] = useState('ALL')
  const [invStatusFilter, setInvStatusFilter] = useState('ALL')
  const [payStatusFilter, setPayStatusFilter] = useState('ALL')
  const [pkgStatusFilter, setPkgStatusFilter] = useState('ALL')
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState('ALL')

  // Table Sorting & Pagination
  const [sortField, setSortField] = useState('orderDate')
  const [sortDirection, setSortDirection] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Modals
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null)
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null)
  const [dispatchFormData, setDispatchFormData] = useState({
    dispatch_date: new Date().toISOString().slice(0, 10),
    carrier: '',
    tracking_no: '',
    delivery_challan: '',
    remarks: '',
  })
  const [savingDispatch, setSavingDispatch] = useState(false)
  const [notificationMsg, setNotificationMsg] = useState({ type: '', text: '' })

  // Derive All Orders Live From State (Single Source of Truth)
  const derivedOrders = useMemo(() => {
    // Filter orders scoped to current active company
    const list = reduxOrders.filter((o) => !o.company || Number(o.company) === Number(compId))

    return list.map((order) => {
      const orderNumber = order.number || (order.id ? `ORD-${order.id}` : '—')
      const cust = reduxCustomers.find(
        (c) => String(c.id) === String(order.customer) || c.name === order.customer_name
      )
      const customerName = order.customer_name || cust?.name || '—'

      // Product(s) derivation
      let productNames = order.product_name || ''
      if (Array.isArray(order.lines) && order.lines.length > 0) {
        const names = order.lines.map((l) => l.product_name || l.product).filter(Boolean)
        if (names.length > 0) {
          productNames = names.join(', ')
        }
      }
      if (!productNames) productNames = 'Pharmaceutical Product'

      const orderDate = order.order_date || order.created_at?.slice(0, 10) || '—'

      // STAGE 1: Order Created (Done)
      const stageOrderCreated = {
        status: 'Done',
        date: orderDate,
        by: order.created_by || 'Sales Admin',
      }

      // STAGE 2: Production (Done / In Progress / Pending)
      const pRaw = (order.production_status || 'In Planning').toLowerCase()
      let prodStatus = 'Pending'
      if (
        pRaw === 'completed' ||
        order.status === 'PRODUCTION_COMPLETED' ||
        order.status === 'PACKED' ||
        order.status === 'DISPATCHED'
      ) {
        prodStatus = 'Done'
      } else if (pRaw === 'in process' || order.status === 'IN_PRODUCTION') {
        prodStatus = 'In Progress'
      } else {
        prodStatus = 'Pending'
      }
      const stageProduction = {
        status: prodStatus,
        rawStatus: order.production_status || 'In Planning',
        bmrStatus: order.bmr_status || 'NO',
        qaStatus: order.qa_status || 'Pending',
        remark: order.production_remark || '',
        date: order.planned_mfg_date || order.supply_by_date || orderDate,
        by: 'Production Chemist',
      }

      // STAGE 3: Invoice (Done / Pending)
      const linkedInvoice = reduxInvoices.find(
        (inv) =>
          (inv.order && String(inv.order) === String(order.id)) ||
          (inv.order_number && String(inv.order_number) === String(orderNumber)) ||
          (inv.order_id && String(inv.order_id) === String(order.id)) ||
          (order.batch_no && (inv.batch === order.batch_no || inv.batch_no === order.batch_no))
      )
      const savedSheet = savedOrderInvoices[String(order.id)] || linkedInvoice?.sheetData
      const hasInvoice = Boolean((linkedInvoice && linkedInvoice.status !== 'CANCELLED') || savedSheet || order.status === 'INVOICED')
      const invoiceNumber = linkedInvoice?.number || linkedInvoice?.invoice_no || savedSheet?.invoice_no || (hasInvoice ? 'Generated' : '')
      const invoiceDate = linkedInvoice?.invoice_date || linkedInvoice?.date || savedSheet?.invoice_date || order.invoiced_at || '—'
      const invoiceTotal = linkedInvoice?.total || (savedSheet ? computeSheetGrandTotal(savedSheet) : (Number(order.total_amount) || 0))

      const stageInvoice = {
        status: hasInvoice ? 'Done' : 'Pending',
        invoiceNumber,
        invoiceDate,
        invoiceTotal,
        invoiceId: linkedInvoice?.id,
        by: linkedInvoice?.created_by || 'Billing Officer',
      }

      // STAGE 4: Payment (Paid / Partial / Pending)
      let payStatus = 'Pending'
      let totalPaid = 0
      let balanceDue = invoiceTotal

      if (hasInvoice && linkedInvoice) {
        const invPayments = (reduxPayments || []).filter(
          (p) =>
            (p.invoice_id && String(p.invoice_id) === String(linkedInvoice.id)) ||
            (p.invoice_number && String(p.invoice_number) === String(linkedInvoice.number))
        )
        totalPaid =
          invPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) +
          (linkedInvoice.status === 'PAID' && invPayments.length === 0 ? Number(invoiceTotal) : (Number(linkedInvoice.total_paid) || 0))
        balanceDue = Math.max(invoiceTotal - totalPaid, 0)

        if (linkedInvoice.status === 'PAID' || (invoiceTotal > 0 && balanceDue === 0)) {
          payStatus = 'Paid'
        } else if (totalPaid > 0) {
          payStatus = 'Partial'
        } else {
          payStatus = 'Pending'
        }
      }

      const stagePayment = {
        status: payStatus,
        totalPaid,
        balanceDue,
        by: 'Accounts Officer',
      }

      // STAGE 5: Packaging (Done / Pending)
      const pkgRaw = (order.packaging_status || 'Pending').toLowerCase()
      let pkgStatus = 'Pending'
      if (pkgRaw === 'completed' || order.status === 'PACKED' || order.status === 'DISPATCHED') {
        pkgStatus = 'Done'
      } else if (pkgRaw === 'in process' || order.status === 'PACKAGING') {
        pkgStatus = 'In Progress'
      } else {
        pkgStatus = 'Pending'
      }

      const stagePackaging = {
        status: pkgStatus,
        rawStatus: order.packaging_status || 'Pending',
        date: order.packaged_at || order.planned_mfg_date || '—',
        by: 'Packaging Supervisor',
      }

      // STAGE 6: Dispatch (Done / Pending with Dispatch Date)
      const linkedDispatch = (reduxDispatches || []).find(
        (d) =>
          (d.order_id && String(d.order_id) === String(order.id)) ||
          (d.order && String(d.order) === String(order.id)) ||
          (d.order_number && String(d.order_number) === String(orderNumber)) ||
          (d.dispatch_number && String(d.dispatch_number) === String(order.dispatch_number))
      )
      const isDispatched = order.dispatch_status === 'YES' || order.status === 'DISPATCHED' || Boolean(linkedDispatch)
      const dispatchDate =
        order.dispatch_date ||
        order.dispatched_at?.slice(0, 10) ||
        linkedDispatch?.dispatch_date ||
        linkedDispatch?.date ||
        linkedDispatch?.created_at?.slice(0, 10) ||
        (isDispatched ? orderDate : '')

      const stageDispatch = {
        status: isDispatched ? 'Done' : 'Pending',
        dispatchDate: isDispatched ? dispatchDate : '',
        dispatchNumber: linkedDispatch?.dispatch_number || order.dispatch_number || (isDispatched ? `DC-${order.id}` : ''),
        carrier: linkedDispatch?.carrier || linkedDispatch?.transporter_name || 'Standard Surface Logistics',
        trackingNo: linkedDispatch?.tracking_no || linkedDispatch?.vehicle_no || '—',
        by: linkedDispatch?.dispatched_by || 'Stores Dispatch Chemist',
      }

      // Can be dispatched if packaging is Done and not yet Dispatched
      const canMarkDispatched = stagePackaging.status === 'Done' && !isDispatched

      return {
        id: order.id,
        rawOrder: order,
        orderNumber,
        customerName,
        productNames,
        orderDate,
        batchNo: order.batch_no || '—',
        quantity: order.batch_size || order.quantity || 1,
        totalAmount: order.total_amount || invoiceTotal,
        stageOrderCreated,
        stageProduction,
        stageInvoice,
        stagePayment,
        stagePackaging,
        stageDispatch,
        isDispatched,
        canMarkDispatched,
      }
    })
  }, [reduxOrders, reduxInvoices, reduxPayments, reduxDispatches, savedOrderInvoices, reduxCustomers, compId])

  // Month Options for Selector
  const monthOptions = useMemo(() => {
    const dates = derivedOrders.map((o) => o.orderDate)
    return buildMonthOptions(dates, currentMonthKey)
  }, [derivedOrders, currentMonthKey])

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return derivedOrders.filter((order) => {
      // 1. Tab View Filter
      if (activeTab === 'DISPATCHED' && !order.isDispatched) return false
      if (activeTab === 'READY' && (!order.canMarkDispatched || order.isDispatched)) return false
      if (activeTab === 'IN_PROGRESS' && order.isDispatched) return false

      // 2. Search Filter (order no, customer, product, invoice no)
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchesQ =
          order.orderNumber.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q) ||
          order.productNames.toLowerCase().includes(q) ||
          order.stageInvoice.invoiceNumber.toLowerCase().includes(q)
        if (!matchesQ) return false
      }

      // 3. Month + Year Filter
      if (selectedMonth !== 'ALL') {
        const d = order.isDispatched && order.stageDispatch.dispatchDate ? order.stageDispatch.dispatchDate : order.orderDate
        if (!matchesMonthYear(d, selectedMonth)) return false
      }

      // 4. Custom Date Range Filter
      if (fromDate || toDate) {
        const d = order.isDispatched && order.stageDispatch.dispatchDate ? order.stageDispatch.dispatchDate : order.orderDate
        if (!matchesDateRange(d, fromDate, toDate)) return false
      }

      // 5. Customer & Product Dropdowns
      if (customerFilter !== 'ALL' && order.customerName !== customerFilter) return false
      if (productFilter !== 'ALL' && !order.productNames.toLowerCase().includes(productFilter.toLowerCase())) return false

      // 6. Stage Status Filters
      if (prodStatusFilter !== 'ALL' && order.stageProduction.status !== prodStatusFilter) return false
      if (invStatusFilter !== 'ALL' && order.stageInvoice.status !== invStatusFilter) return false
      if (payStatusFilter !== 'ALL' && order.stagePayment.status !== payStatusFilter) return false
      if (pkgStatusFilter !== 'ALL' && order.stagePackaging.status !== pkgStatusFilter) return false
      if (dispatchStatusFilter !== 'ALL' && order.stageDispatch.status !== dispatchStatusFilter) return false

      return true
    })
  }, [
    derivedOrders,
    activeTab,
    search,
    selectedMonth,
    fromDate,
    toDate,
    customerFilter,
    productFilter,
    prodStatusFilter,
    invStatusFilter,
    payStatusFilter,
    pkgStatusFilter,
    dispatchStatusFilter,
  ])

  // Sorting
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let valA = a[sortField] || ''
      let valB = b[sortField] || ''

      if (sortField === 'orderNumber') {
        valA = a.orderNumber
        valB = b.orderNumber
      } else if (sortField === 'customer') {
        valA = a.customerName
        valB = b.customerName
      } else if (sortField === 'product') {
        valA = a.productNames
        valB = b.productNames
      } else if (sortField === 'orderDate') {
        valA = a.orderDate
        valB = b.orderDate
      } else if (sortField === 'production') {
        valA = a.stageProduction.status
        valB = b.stageProduction.status
      } else if (sortField === 'invoice') {
        valA = a.stageInvoice.status
        valB = b.stageInvoice.status
      } else if (sortField === 'payment') {
        valA = a.stagePayment.status
        valB = b.stagePayment.status
      } else if (sortField === 'packaging') {
        valA = a.stagePackaging.status
        valB = b.stagePackaging.status
      } else if (sortField === 'dispatch') {
        valA = a.stageDispatch.status
        valB = b.stageDispatch.status
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredOrders, sortField, sortDirection])

  // Pagination Slice
  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedOrders.slice(start, start + pageSize)
  }, [sortedOrders, currentPage, pageSize])

  // Top KPI metrics
  const kpis = useMemo(() => {
    const total = derivedOrders.length
    const dispatched = derivedOrders.filter((o) => o.isDispatched).length
    const pendingDispatch = derivedOrders.filter((o) => !o.isDispatched).length
    const paymentPending = derivedOrders.filter((o) => o.stagePayment.status !== 'Paid').length

    return {
      total,
      dispatched,
      pendingDispatch,
      paymentPending,
    }
  }, [derivedOrders])

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      DISPATCHED: derivedOrders.filter((o) => o.isDispatched).length,
      READY: derivedOrders.filter((o) => o.canMarkDispatched).length,
      IN_PROGRESS: derivedOrders.filter((o) => !o.isDispatched).length,
      ALL: derivedOrders.length,
    }
  }, [derivedOrders])

  // Unique customers and products for filter dropdowns
  const uniqueCustomers = useMemo(() => {
    const set = new Set(derivedOrders.map((o) => o.customerName).filter((c) => c && c !== '—'))
    return Array.from(set).sort()
  }, [derivedOrders])

  const uniqueProducts = useMemo(() => {
    const set = new Set()
    reduxProducts.forEach((p) => {
      if (p.name) set.add(p.name)
    })
    derivedOrders.forEach((o) => {
      if (o.productNames) set.add(o.productNames)
    })
    return Array.from(set).sort()
  }, [reduxProducts, derivedOrders])

  // Sorting click handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  // Reset all filters
  const resetFilters = () => {
    setSearch('')
    setSelectedMonth('ALL')
    setFromDate('')
    setToDate('')
    setCustomerFilter('ALL')
    setProductFilter('ALL')
    setProdStatusFilter('ALL')
    setInvStatusFilter('ALL')
    setPayStatusFilter('ALL')
    setPkgStatusFilter('ALL')
    setDispatchStatusFilter('ALL')
    setCurrentPage(1)
  }

  const isFiltered = Boolean(
    search ||
    selectedMonth !== currentMonthKey ||
    fromDate ||
    toDate ||
    customerFilter !== 'ALL' ||
    productFilter !== 'ALL' ||
    prodStatusFilter !== 'ALL' ||
    invStatusFilter !== 'ALL' ||
    payStatusFilter !== 'ALL' ||
    pkgStatusFilter !== 'ALL' ||
    dispatchStatusFilter !== 'ALL'
  )

  // Export filtered list to CSV
  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      setNotificationMsg({ type: 'warning', text: 'No rows available to export.' })
      return
    }

    const headers = [
      'Order No.',
      'Customer',
      'Product(s)',
      'Order Date',
      'Order Created',
      'Production',
      'Invoice',
      'Payment',
      'Packaging',
      'Dispatch Status',
      'Dispatch Date',
    ]

    const rows = filteredOrders.map((o) => [
      `"${o.orderNumber}"`,
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.productNames.replace(/"/g, '""')}"`,
      `"${o.orderDate}"`,
      `"${o.stageOrderCreated.status}"`,
      `"${o.stageProduction.status}"`,
      `"${o.stageInvoice.status}"`,
      `"${o.stagePayment.status}"`,
      `"${o.stagePackaging.status}"`,
      `"${o.stageDispatch.status}"`,
      `"${o.stageDispatch.dispatchDate || '—'}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Dispatch_Orders_Register_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)

    recordAudit({
      action: 'dispatch/exported_csv',
      entityType: 'Dispatch',
      entityId: activeTab,
      description: `Exported ${filteredOrders.length} dispatch rows to CSV.`,
    })
  }

  // Open "Mark as Dispatched" confirmation modal
  const openDispatchModal = (order, e) => {
    if (e) e.stopPropagation()
    setDispatchModalOrder(order)
    setDispatchFormData({
      dispatch_date: new Date().toISOString().slice(0, 10),
      carrier: 'Standard Surface Logistics',
      tracking_no: `LR-${Math.floor(100000 + Math.random() * 900000)}`,
      delivery_challan: `DC-26-27-${String(order.id).slice(-4)}`,
      remarks: 'Goods packed in tamper-evident sealed cartons and handed over to carrier.',
    })
  }

  // Confirm Dispatch action
  const handleConfirmDispatch = async (e) => {
    e.preventDefault()
    if (!dispatchModalOrder) return

    setSavingDispatch(true)
    try {
      const order = dispatchModalOrder
      const dispatchDate = dispatchFormData.dispatch_date || new Date().toISOString().slice(0, 10)

      // 1. Dispatch action to Redux store
      dispatch(
        addDispatch({
          order_id: order.id,
          order_number: order.orderNumber,
          customer_name: order.customerName,
          product_name: order.productNames,
          dispatch_number: dispatchFormData.delivery_challan,
          dispatch_date: dispatchDate,
          carrier: dispatchFormData.carrier,
          vehicle_no: dispatchFormData.tracking_no,
          remarks: dispatchFormData.remarks,
          dispatched_by: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Stores Officer',
        })
      )

      // 2. Mark order status as DISPATCHED in Redux
      dispatch(
        updateOrderProductionStatus({
          id: order.id,
          dispatch: 'YES',
          packaging_status: 'Completed',
          status: 'DISPATCHED',
          dispatch_date: dispatchDate,
        })
      )

      // 3. Central Audit Log
      recordAudit({
        action: 'order/dispatched',
        entityType: 'Order',
        entityId: order.orderNumber,
        description: `Order #${order.orderNumber} dispatched to ${order.customerName} under DC #${dispatchFormData.delivery_challan}.`,
      })

      // 4. Central In-App Notification
      dispatch(
        addNotification({
          category: 'order',
          type: 'order',
          title: 'Order Dispatched',
          message: `Order #${order.orderNumber} for ${order.customerName} has been officially dispatched.`,
          severity: 'success',
        })
      )

      setNotificationMsg({
        type: 'success',
        text: `Order #${order.orderNumber} marked as Dispatched successfully!`,
      })
      setTimeout(() => setNotificationMsg({ type: '', text: '' }), 4000)

      setDispatchModalOrder(null)
    } catch (err) {
      setNotificationMsg({
        type: 'error',
        text: err.message || 'Failed to dispatch order.',
      })
    } finally {
      setSavingDispatch(false)
    }
  }

  return (
    <div className="dispatch-page">
      {/* 1. PAGE HEADER */}
      <div className="dispatch-header">
        <div className="dispatch-header-title">
          <h1>Dispatch & Order Progress</h1>
          <p>
            Real-time stage-wise progress from Customer Order to Production, Invoicing, Packaging, and Outward Dispatch.
          </p>
        </div>
        <div className="dispatch-header-actions">
          <button type="button" className="dispatch-export-btn" onClick={handleExportCsv}>
            <ReceiptIcon size={16} />
            Export to CSV
          </button>
        </div>
      </div>

      {notificationMsg.text && (
        <Alert type={notificationMsg.type === 'error' ? 'error' : 'success'}>
          {notificationMsg.text}
        </Alert>
      )}

      {/* 2. KPI CARDS */}
      <div className="dispatch-kpis">
        <div className="dispatch-kpi-card kpi-orders">
          <div className="dispatch-kpi-top">
            <div className="dispatch-kpi-icon blue">
              <ClipboardIcon size={18} />
            </div>
            <span className="dispatch-kpi-label">Total Orders</span>
          </div>
          <div className="dispatch-kpi-value">{kpis.total}</div>
          <span className="dispatch-kpi-subtext">Active process register</span>
        </div>

        <div className="dispatch-kpi-card kpi-dispatched">
          <div className="dispatch-kpi-top">
            <div className="dispatch-kpi-icon green">
              <TruckIcon size={18} />
            </div>
            <span className="dispatch-kpi-label">Dispatched</span>
          </div>
          <div className="dispatch-kpi-value" style={{ color: '#059669' }}>
            {kpis.dispatched}
          </div>
          <span className="dispatch-kpi-subtext">Fulfilled & outward delivered</span>
        </div>

        <div className="dispatch-kpi-card kpi-pending">
          <div className="dispatch-kpi-top">
            <div className="dispatch-kpi-icon orange">
              <ClockIcon size={18} />
            </div>
            <span className="dispatch-kpi-label">Pending Dispatch</span>
          </div>
          <div className="dispatch-kpi-value" style={{ color: '#d97706' }}>
            {kpis.pendingDispatch}
          </div>
          <span className="dispatch-kpi-subtext">In-flight across manufacturing</span>
        </div>

        <div className="dispatch-kpi-card kpi-payment">
          <div className="dispatch-kpi-top">
            <div className="dispatch-kpi-icon red">
              <ReceiptIcon size={18} />
            </div>
            <span className="dispatch-kpi-label">Payment Pending</span>
          </div>
          <div className="dispatch-kpi-value" style={{ color: '#dc2626' }}>
            {kpis.paymentPending}
          </div>
          <span className="dispatch-kpi-subtext">Partial or awaiting collection</span>
        </div>
      </div>

      {/* 3. TABS BAR */}
      <div className="dispatch-tabs-bar">
        <button
          type="button"
          className={`dispatch-tab-btn ${activeTab === 'DISPATCHED' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('DISPATCHED')
            setCurrentPage(1)
          }}
        >
          Dispatched
          <span className="dispatch-tab-count">{tabCounts.DISPATCHED}</span>
        </button>

        <button
          type="button"
          className={`dispatch-tab-btn ${activeTab === 'READY' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('READY')
            setCurrentPage(1)
          }}
        >
          Ready for Dispatch
          <span className="dispatch-tab-count">{tabCounts.READY}</span>
        </button>

        <button
          type="button"
          className={`dispatch-tab-btn ${activeTab === 'IN_PROGRESS' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('IN_PROGRESS')
            setCurrentPage(1)
          }}
        >
          In Progress
          <span className="dispatch-tab-count">{tabCounts.IN_PROGRESS}</span>
        </button>

        <button
          type="button"
          className={`dispatch-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('ALL')
            setCurrentPage(1)
          }}
        >
          All Orders
          <span className="dispatch-tab-count">{tabCounts.ALL}</span>
        </button>
      </div>

      {/* 4. FILTER BAR CARD CONTAINER */}
      <div className="dispatch-filter-card">
        <div className="dispatch-filter-bar">
          {/* 1. Search */}
          <div className="dispatch-search-box">
            <svg
              className="dispatch-search-icon"
              width="15"
              height="15"
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
              type="text"
              className="dispatch-search-input"
              placeholder="Search order, customer, product..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
            />
            {search && (
              <button
                type="button"
                className="dispatch-search-clear"
                onClick={() => {
                  setSearch('')
                  setCurrentPage(1)
                }}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* 2. Month/Year */}
          <select
            className="dispatch-filter-select dispatch-select-month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value)
              setCurrentPage(1)
            }}
            title="Month & Year"
          >
            <option value="ALL">All Time</option>
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* 3. From and To date */}
          <div className="dispatch-date-group">
            <span className="dispatch-date-label">From:</span>
            <input
              type="date"
              className="dispatch-date-input"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setCurrentPage(1)
              }}
              title="From Date"
            />
            <span className="dispatch-date-label">To:</span>
            <input
              type="date"
              className="dispatch-date-input"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setCurrentPage(1)
              }}
              title="To Date"
            />
          </div>

          {/* 4. Customers */}
          <select
            className="dispatch-filter-select dispatch-select-customer"
            value={customerFilter}
            onChange={(e) => {
              setCustomerFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Customer"
          >
            <option value="ALL">Customer</option>
            {uniqueCustomers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* 5. Products */}
          <select
            className="dispatch-filter-select dispatch-select-product"
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Product"
          >
            <option value="ALL">Product</option>
            {uniqueProducts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* 6. Production */}
          <select
            className="dispatch-filter-select dispatch-select-prod-status"
            value={prodStatusFilter}
            onChange={(e) => {
              setProdStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Production Status"
          >
            <option value="ALL">Production</option>
            <option value="Done">Done</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending">Pending</option>
          </select>

          {/* 7. Invoice */}
          <select
            className="dispatch-filter-select dispatch-select-inv-status"
            value={invStatusFilter}
            onChange={(e) => {
              setInvStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Invoice Status"
          >
            <option value="ALL">Invoice</option>
            <option value="Done">Done</option>
            <option value="Pending">Pending</option>
          </select>

          {/* 8. Payment */}
          <select
            className="dispatch-filter-select dispatch-select-pay-status"
            value={payStatusFilter}
            onChange={(e) => {
              setPayStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Payment Status"
          >
            <option value="ALL">Payment</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Pending">Pending</option>
          </select>

          {/* 9. Packaging */}
          <select
            className="dispatch-filter-select dispatch-select-pkg-status"
            value={pkgStatusFilter}
            onChange={(e) => {
              setPkgStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Packaging Status"
          >
            <option value="ALL">Packaging</option>
            <option value="Done">Done</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending">Pending</option>
          </select>

          {/* 10. Dispatch */}
          <select
            className="dispatch-filter-select dispatch-select-disp-status"
            value={dispatchStatusFilter}
            onChange={(e) => {
              setDispatchStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            title="Dispatch Status"
          >
            <option value="ALL">Dispatch</option>
            <option value="Done">Done</option>
            <option value="Pending">Pending</option>
          </select>

          {/* 11. Reset button */}
          {isFiltered && (
            <button
              type="button"
              className="dispatch-reset-btn"
              onClick={resetFilters}
              title="Reset all filters"
            >
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      {/* 5. TABLE */}
      <div className="dispatch-panel">
        <div className="dispatch-table-wrap">
          <table className="dispatch-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('orderNumber')}>
                  Order No. {sortField === 'orderNumber' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('customer')}>
                  Customer {sortField === 'customer' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('product')}>
                  Product(s) {sortField === 'product' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('orderDate')}>
                  Order Date {sortField === 'orderDate' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Order Created</th>
                <th className="sortable" onClick={() => handleSort('production')}>
                  Production {sortField === 'production' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('invoice')}>
                  Invoice {sortField === 'invoice' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('payment')}>
                  Payment {sortField === 'payment' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('packaging')}>
                  Packaging {sortField === 'packaging' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('dispatch')}>
                  Dispatch {sortField === 'dispatch' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrderDetails(order)}
                  title="Click to view stage timeline"
                >
                  {/* Column 1: Order No */}
                  <td className="dispatch-order-cell">
                    <span>{order.orderNumber}</span>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>
                      Batch: {order.batchNo}
                    </span>
                  </td>

                  {/* Column 2: Customer */}
                  <td className="dispatch-cust-cell" title={order.customerName}>
                    {order.customerName}
                  </td>

                  {/* Column 3: Product(s) */}
                  <td className="dispatch-prod-cell" title={order.productNames}>
                    <div>{order.productNames}</div>
                    <span style={{ fontSize: 10, color: '#64748b' }}>
                      Qty: {order.quantity}
                    </span>
                  </td>

                  {/* Column 4: Order Date */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {formatDisplayDate(order.orderDate)}
                  </td>

                  {/* Column 5: Order Created */}
                  <td>
                    <StatusBadge type="order" value={order.stageOrderCreated.status} />
                  </td>

                  {/* Column 6: Production */}
                  <td>
                    <StatusBadge type="production" value={order.stageProduction.status} />
                  </td>

                  {/* Column 7: Invoice */}
                  <td>
                    <StatusBadge
                      type="invoice"
                      value={order.stageInvoice.status}
                      extraText={order.stageInvoice.invoiceNumber || undefined}
                    />
                  </td>

                  {/* Column 8: Payment */}
                  <td>
                    <StatusBadge
                      type="payment"
                      value={order.stagePayment.status}
                      extraText={
                        order.stagePayment.status === 'Paid'
                          ? `₹${formatINR(order.totalAmount)}`
                          : order.stagePayment.status === 'Partial'
                          ? `Paid ₹${formatINR(order.stagePayment.totalPaid)}`
                          : undefined
                      }
                    />
                  </td>

                  {/* Column 9: Packaging */}
                  <td>
                    <StatusBadge type="packaging" value={order.stagePackaging.status} />
                  </td>

                  {/* Column 10: Dispatch */}
                  <td>
                    <StatusBadge
                      type="dispatch"
                      value={order.stageDispatch.status}
                      extraText={
                        order.stageDispatch.status === 'Done'
                          ? formatDisplayDate(order.stageDispatch.dispatchDate)
                          : undefined
                      }
                    />
                  </td>

                  {/* Action Column */}
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    {order.canMarkDispatched ? (
                      <button
                        type="button"
                        className="btn-dispatch-action"
                        onClick={(e) => openDispatchModal(order, e)}
                        title="Packaging is complete. Mark this order as dispatched."
                      >
                        Mark as Dispatched
                      </button>
                    ) : order.isDispatched ? (
                      <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                        ✓ Dispatched
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        In Process
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="dispatch-empty-state">
                      <div className="dispatch-empty-icon">
                        <TruckIcon size={28} />
                      </div>
                      <h3>
                        {selectedMonth !== 'ALL'
                          ? `No orders found for ${formatMonthYearLabel(selectedMonth)}`
                          : 'No matching orders found'}
                      </h3>
                      <p>
                        {isFiltered
                          ? 'No orders match your filter criteria. Try clearing the search or resetting filters.'
                          : 'Orders created in the Orders module will appear here with live tracking across all stages.'}
                      </p>
                      {isFiltered && (
                        <button type="button" className="dispatch-reset-btn" onClick={resetFilters}>
                          Reset All Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 6. PAGINATION */}
        <div className="dispatch-pagination">
          <div>
            Showing <strong>{filteredOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong>{Math.min(currentPage * pageSize, filteredOrders.length)}</strong> of{' '}
            <strong>{filteredOrders.length}</strong> orders
          </div>

          <div className="dispatch-page-controls">
            <select
              className="dispatch-filter-select"
              style={{ height: 32, padding: '0 24px 0 8px' }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>

            <button
              type="button"
              className="dispatch-page-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              ‹
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              if (totalPages > 6 && Math.abs(pg - currentPage) > 2 && pg !== 1 && pg !== totalPages) {
                return null
              }
              return (
                <button
                  key={pg}
                  type="button"
                  className={`dispatch-page-btn ${currentPage === pg ? 'active' : ''}`}
                  onClick={() => setCurrentPage(pg)}
                >
                  {pg}
                </button>
              )
            })}

            <button
              type="button"
              className="dispatch-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          7. DETAILS TIMELINE MODAL / DRAWER
          ======================================================== */}
      {selectedOrderDetails && (
        <Modal
          title={`Order Progress Timeline: #${selectedOrderDetails.orderNumber}`}
          onClose={() => setSelectedOrderDetails(null)}
          footer={
            <Button variant="secondary" onClick={() => setSelectedOrderDetails(null)}>
              Close
            </Button>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Customer</span>
                <strong style={{ fontSize: 14, color: '#0f172a' }}>{selectedOrderDetails.customerName}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Product Formulation</span>
                <strong style={{ fontSize: 14, color: '#0f172a' }}>{selectedOrderDetails.productNames}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Order Date</span>
                <strong>{formatDisplayDate(selectedOrderDetails.orderDate)}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Batch / Quantity</span>
                <strong>{selectedOrderDetails.batchNo} ({selectedOrderDetails.quantity})</strong>
              </div>
            </div>
          </div>

          <div className="dispatch-timeline">
            {/* Step 1: Order Created */}
            <div className="timeline-step">
              <div className="timeline-node done">✓</div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">1. Sales Order Created</span>
                  <span className="stage-badge badge-done">Done</span>
                </div>
                <div className="timeline-meta">
                  <span>Date: <strong>{formatDisplayDate(selectedOrderDetails.stageOrderCreated.date)}</strong></span>
                  <span>Recorded By: <strong>{selectedOrderDetails.stageOrderCreated.by}</strong></span>
                </div>
              </div>
            </div>

            {/* Step 2: Production */}
            <div className="timeline-step">
              <div className={`timeline-node ${selectedOrderDetails.stageProduction.status === 'Done' ? 'done' : selectedOrderDetails.stageProduction.status === 'In Progress' ? 'in-progress' : 'pending'}`}>
                {selectedOrderDetails.stageProduction.status === 'Done' ? '✓' : '2'}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">2. Manufacturing & Quality (QC/QA)</span>
                  <StatusBadge type="production" value={selectedOrderDetails.stageProduction.status} />
                </div>
                <div className="timeline-meta">
                  <span>Production Status: <strong>{selectedOrderDetails.stageProduction.rawStatus}</strong></span>
                  <span>BMR Status: <strong>{selectedOrderDetails.stageProduction.bmrStatus === 'YES' ? 'Filled / Active' : 'Pending'}</strong></span>
                  <span>QA Release: <strong>{selectedOrderDetails.stageProduction.qaStatus}</strong></span>
                  {selectedOrderDetails.stageProduction.remark && (
                    <span>Remark: <em>{selectedOrderDetails.stageProduction.remark}</em></span>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Invoicing */}
            <div className="timeline-step">
              <div className={`timeline-node ${selectedOrderDetails.stageInvoice.status === 'Done' ? 'done' : 'pending'}`}>
                {selectedOrderDetails.stageInvoice.status === 'Done' ? '✓' : '3'}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">3. GST Tax Invoicing</span>
                  <StatusBadge type="invoice" value={selectedOrderDetails.stageInvoice.status} />
                </div>
                <div className="timeline-meta">
                  <span>Invoice No: <strong>{selectedOrderDetails.stageInvoice.invoiceNumber || 'Not generated yet'}</strong></span>
                  {selectedOrderDetails.stageInvoice.status === 'Done' && (
                    <>
                      <span>Invoice Date: <strong>{formatDisplayDate(selectedOrderDetails.stageInvoice.invoiceDate)}</strong></span>
                      <span>Total Invoice Amount: <strong>₹{formatINR(selectedOrderDetails.stageInvoice.invoiceTotal)}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Step 4: Payment */}
            <div className="timeline-step">
              <div className={`timeline-node ${selectedOrderDetails.stagePayment.status === 'Paid' ? 'done' : selectedOrderDetails.stagePayment.status === 'Partial' ? 'in-progress' : 'pending'}`}>
                {selectedOrderDetails.stagePayment.status === 'Paid' ? '✓' : '4'}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">4. Payment Settlement</span>
                  <StatusBadge type="payment" value={selectedOrderDetails.stagePayment.status} />
                </div>
                <div className="timeline-meta">
                  <span>Amount Paid: <strong style={{ color: '#059669' }}>₹{formatINR(selectedOrderDetails.stagePayment.totalPaid)}</strong></span>
                  <span>Outstanding Balance: <strong style={{ color: '#dc2626' }}>₹{formatINR(selectedOrderDetails.stagePayment.balanceDue)}</strong></span>
                </div>
              </div>
            </div>

            {/* Step 5: Packaging */}
            <div className="timeline-step">
              <div className={`timeline-node ${selectedOrderDetails.stagePackaging.status === 'Done' ? 'done' : selectedOrderDetails.stagePackaging.status === 'In Progress' ? 'in-progress' : 'pending'}`}>
                {selectedOrderDetails.stagePackaging.status === 'Done' ? '✓' : '5'}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">5. Finished Goods Packaging</span>
                  <StatusBadge type="packaging" value={selectedOrderDetails.stagePackaging.status} />
                </div>
                <div className="timeline-meta">
                  <span>Packaging Status: <strong>{selectedOrderDetails.stagePackaging.rawStatus}</strong></span>
                  <span>Supervised By: <strong>{selectedOrderDetails.stagePackaging.by}</strong></span>
                </div>
              </div>
            </div>

            {/* Step 6: Dispatch */}
            <div className="timeline-step">
              <div className={`timeline-node ${selectedOrderDetails.stageDispatch.status === 'Done' ? 'done' : 'pending'}`}>
                {selectedOrderDetails.stageDispatch.status === 'Done' ? '✓' : '6'}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">6. Dispatch & Outward Delivery</span>
                  <StatusBadge type="dispatch" value={selectedOrderDetails.stageDispatch.status} />
                </div>
                <div className="timeline-meta">
                  {selectedOrderDetails.stageDispatch.status === 'Done' ? (
                    <>
                      <span>Dispatch Date: <strong>{formatDisplayDate(selectedOrderDetails.stageDispatch.dispatchDate)}</strong></span>
                      <span>Challan / DC #: <strong>{selectedOrderDetails.stageDispatch.dispatchNumber}</strong></span>
                      <span>Carrier: <strong>{selectedOrderDetails.stageDispatch.carrier}</strong></span>
                      <span>Tracking / Vehicle: <strong>{selectedOrderDetails.stageDispatch.trackingNo}</strong></span>
                      <span>Dispatched By: <strong>{selectedOrderDetails.stageDispatch.by}</strong></span>
                    </>
                  ) : (
                    <span>
                      {selectedOrderDetails.canMarkDispatched
                        ? 'Packaging completed. Order is ready to be dispatched!'
                        : 'Awaiting completion of previous production and packaging stages.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================
          8. "MARK AS DISPATCHED" CONFIRMATION MODAL
          ======================================================== */}
      {dispatchModalOrder && (
        <Modal
          title={`Mark Order #${dispatchModalOrder.orderNumber} as Dispatched`}
          onClose={() => setDispatchModalOrder(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDispatchModalOrder(null)} disabled={savingDispatch}>
                Cancel
              </Button>
              <Button loading={savingDispatch} onClick={handleConfirmDispatch} style={{ background: '#10b981', borderColor: '#059669' }}>
                Confirm Dispatch
              </Button>
            </>
          }
        >
          <form onSubmit={handleConfirmDispatch}>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <div>Customer: <strong>{dispatchModalOrder.customerName}</strong></div>
              <div>Product: <strong>{dispatchModalOrder.productNames}</strong> (Batch: {dispatchModalOrder.batchNo})</div>
              <div>Packaging Status: <strong style={{ color: '#059669' }}>✓ Completed</strong></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
              <Input
                label="Dispatch Date *"
                type="date"
                value={dispatchFormData.dispatch_date}
                onChange={(e) => setDispatchFormData({ ...dispatchFormData, dispatch_date: e.target.value })}
                required
              />

              <Input
                label="Delivery Challan / DC #"
                value={dispatchFormData.delivery_challan}
                onChange={(e) => setDispatchFormData({ ...dispatchFormData, delivery_challan: e.target.value })}
                placeholder="e.g. DC-26-27-0042"
                required
              />

              <Input
                label="Carrier / Transporter"
                value={dispatchFormData.carrier}
                onChange={(e) => setDispatchFormData({ ...dispatchFormData, carrier: e.target.value })}
                placeholder="e.g. Blue Dart, SafeXpress"
              />

              <Input
                label="LR / Vehicle / Tracking No"
                value={dispatchFormData.tracking_no}
                onChange={(e) => setDispatchFormData({ ...dispatchFormData, tracking_no: e.target.value })}
                placeholder="e.g. GJ-01-AB-1234 or LR-998877"
              />
            </div>

            <div className="field">
              <label className="field-label">Dispatch Remarks / Notes</label>
              <textarea
                className="field-input"
                rows={2}
                value={dispatchFormData.remarks}
                onChange={(e) => setDispatchFormData({ ...dispatchFormData, remarks: e.target.value })}
                placeholder="Dispatched in good condition..."
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
