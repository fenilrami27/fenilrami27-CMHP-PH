import { useState, useMemo, useRef, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import useWorkspace from '../../../hooks/useWorkspace'
import Button from '../../../components/Button'
import './StockTab.css'
import './StockLedger.css'
import './CommonInventory.css'

const FINANCIAL_YEARS = ['2026-27', '2025-26', '2024-25']

/* =========================================================
   SOURCE COMPANY HELPER (CMHP / TEJ / COMMON)
   ========================================================= */

function getLotSourceCompany(lot, allProducts = []) {
  // 1. Direct company ID check
  const compId = Number(lot.source_company_id || lot.company || lot.companyId)
  if (compId === 1) {
    return { id: 1, name: 'CMHP Pharma', badgeClass: 'source-badge-cmhp' }
  }
  if (compId === 2) {
    return { id: 2, name: 'Tej Biocare', badgeClass: 'source-badge-tej' }
  }

  // 2. String matching on source_company / supplier_name / mfg_company
  const compStr = String(
    lot.source_company || lot.mfg_company || lot.supplier_name || lot.company_name || ''
  ).toLowerCase()
  if (compStr.includes('tej')) {
    return { id: 2, name: 'Tej Biocare', badgeClass: 'source-badge-tej' }
  }
  if (compStr.includes('cmhp')) {
    return { id: 1, name: 'CMHP Pharma', badgeClass: 'source-badge-cmhp' }
  }
  if (compStr.includes('common')) {
    return { id: null, name: 'Common Inventory', badgeClass: 'source-badge-common' }
  }

  // 3. Fallback: match with product catalog
  const matchedProd = (allProducts || []).find(
    (p) => Number(p.id) === Number(lot.item_id || lot.item) || (lot.item_code && p.code === lot.item_code)
  )
  if (matchedProd) {
    const pCompId = Number(matchedProd.company || matchedProd.companyId)
    if (pCompId === 1) return { id: 1, name: 'CMHP Pharma', badgeClass: 'source-badge-cmhp' }
    if (pCompId === 2) return { id: 2, name: 'Tej Biocare', badgeClass: 'source-badge-tej' }
    const pStr = String(matchedProd.mfg_company || matchedProd.company_name || '').toLowerCase()
    if (pStr.includes('tej')) return { id: 2, name: 'Tej Biocare', badgeClass: 'source-badge-tej' }
    if (pStr.includes('cmhp')) return { id: 1, name: 'CMHP Pharma', badgeClass: 'source-badge-cmhp' }
  }

  return { id: null, name: 'Common Inventory', badgeClass: 'source-badge-common' }
}

/* =========================================================
   URGENCY & STATUS HELPERS
   ========================================================= */

function getOrderUrgency(deadline) {
  if (!deadline) return { status: 'none', label: 'No Deadline', className: '' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dead = new Date(deadline)
  dead.setHours(0, 0, 0, 0)
  const diffDays = Math.round((dead.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return {
      status: 'overdue',
      label: `Overdue by ${Math.abs(diffDays)}d`,
      className: 'stocks-urgency-badge stocks-urgency-overdue',
      diffDays,
    }
  }
  if (diffDays === 0) {
    return {
      status: 'due_today',
      label: 'Due today',
      className: 'stocks-urgency-badge stocks-urgency-due-today',
      diffDays,
    }
  }
  if (diffDays <= 7) {
    return {
      status: 'due_soon',
      label: `Due soon (${diffDays}d)`,
      className: 'stocks-urgency-badge stocks-urgency-due-soon',
      diffDays,
    }
  }
  return {
    status: 'on_track',
    label: `On track (${diffDays}d)`,
    className: 'stocks-urgency-badge stocks-urgency-on-track',
    diffDays,
  }
}

function getLotStockStatus(lot) {
  const stock = Number(lot.available_quantity || 0)
  const reorder = Number(lot.reorder_level || 0)

  if (stock <= 0) {
    return {
      status: 'OUT_OF_STOCK',
      label: 'Out of Stock',
      badgeClass: 'ci-badge ci-badge-out-of-stock',
    }
  }

  if (lot.expiry_date) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const exp = new Date(lot.expiry_date)
    exp.setHours(0, 0, 0, 0)
    const diffDays = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays >= 0 && diffDays <= 60) {
      return {
        status: 'EXPIRING_SOON',
        label: `Expiring Soon (${diffDays}d)`,
        badgeClass: 'ci-badge ci-badge-low-stock',
        diffDays,
      }
    }
  }

  if (stock <= reorder) {
    return {
      status: 'LOW_STOCK',
      label: 'Low Stock',
      badgeClass: 'ci-badge ci-badge-low-stock',
    }
  }

  return {
    status: 'IN_STOCK',
    label: 'In Stock',
    badgeClass: 'ci-badge ci-badge-in-stock',
  }
}

export default function StockTab() {
  const navigate = useNavigate()
  const { activeWorkspace } = useWorkspace()

  // Redux Selectors
  const erpState = useSelector((state) => state.erp || {})
  const allLots = useSelector((state) => state.erp?.lots || [])
  const commonProducts = useSelector((state) => state.erp?.commonProducts || [])
  const companyProducts = useSelector((state) => state.erp?.products || [])
  const commonRawMaterials = useSelector((state) => state.erp?.commonRawMaterials || [])
  const orders = useSelector((state) => state.erp?.orders || [])
  const transactions = useSelector((state) => state.erp?.transactions || [])
  const issueHistory = useSelector((state) => state.erp?.issueHistory || [])
  const stockReturns = useSelector((state) => state.erp?.stockReturns || [])

  // Combined product catalog for source matching and identification
  const allFinishedProducts = useMemo(() => {
    const list = []
    const seen = new Set()
    const rawList = [
      ...(commonProducts || []),
      ...(companyProducts || []),
      ...(erpState.byCompany?.cmhp?.products || []),
      ...(erpState.byCompany?.tej?.products || []),
    ]
    rawList.forEach((p) => {
      const key = String(p.code || p.id).toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push(p)
      }
    })
    return list
  }, [commonProducts, companyProducts, erpState])

  // Filter ONLY finished-product lots from Redux store (No Raw Materials)
  const finishedProductLots = useMemo(() => {
    return (allLots || []).filter((lot) => {
      // 1. Explicit item_type
      if (lot.item_type === 'MEDICINE' || lot.item_type === 'FINISHED_GOODS') return true
      if (lot.item_type === 'RAW_MATERIAL') return false

      // 2. Reject known raw materials
      const isRaw = (commonRawMaterials || []).some(
        (m) => Number(m.id) === Number(lot.item_id || lot.item) || (lot.item_code && m.code === lot.item_code)
      )
      if (isRaw) return false

      // 3. Match against finished products catalog
      const isProd = allFinishedProducts.some(
        (p) => Number(p.id) === Number(lot.item_id || lot.item) || (lot.item_code && p.code === lot.item_code)
      )
      if (isProd) return true

      // 4. Reject raw material categories
      const rawCategories = [
        'active api',
        'excipient',
        'solvent',
        'reagent',
        'packaging material',
        'chemical',
        'raw material',
      ]
      const cat = String(lot.category || '').toLowerCase()
      if (rawCategories.includes(cat)) return false

      // 5. Source type check
      if (lot.source_type === 'SUPPLIER') return false
      if (lot.source_type === 'MANUFACTURER') return true

      return true
    })
  }, [allLots, commonRawMaterials, allFinishedProducts])

  // Active Workspace / Scoped Company ID (1 for CMHP, 2 for Tej, null for Common Inventory)
  const scopedCompanyId = useMemo(() => {
    if (activeWorkspace === 'company_a' || erpState.activeCompanyId === 1) return 1
    if (activeWorkspace === 'company_b' || erpState.activeCompanyId === 2) return 2
    return null
  }, [activeWorkspace, erpState.activeCompanyId])

  // Workspace company scoping:
  // When a company is active -> show only that company's data; Common Inventory data stays shared
  // When Common Inventory is active -> show all finished products
  const workspaceScopedLots = useMemo(() => {
    return finishedProductLots.filter((lot) => {
      const source = getLotSourceCompany(lot, allFinishedProducts)
      if (scopedCompanyId === 1) {
        return source.id === 1 || source.id === null
      }
      if (scopedCompanyId === 2) {
        return source.id === 2 || source.id === null
      }
      return true
    })
  }, [finishedProductLots, scopedCompanyId, allFinishedProducts])

  // Filter States
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [selectedProductKey, setSelectedProductKey] = useState('ALL')
  const productDropdownRef = useRef(null)

  // Close product dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
        setProductDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search-filtered finished products for dropdown
  const searchableProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return allFinishedProducts
    const q = productSearchQuery.trim().toLowerCase()
    return allFinishedProducts.filter((p) => {
      const code = (p.code || '').toLowerCase()
      const name = (p.name || '').toLowerCase()
      const cat = (p.category || '').toLowerCase()
      return code.includes(q) || name.includes(q) || cat.includes(q)
    })
  }, [allFinishedProducts, productSearchQuery])

  const activeProduct = useMemo(() => {
    if (selectedProductKey === 'ALL') return null
    return (
      allFinishedProducts.find(
        (p) => String(p.id) === String(selectedProductKey) || p.code === selectedProductKey
      ) || null
    )
  }, [allFinishedProducts, selectedProductKey])

  // Financial Year & Date Range Filters
  const [financialYear, setFinancialYear] = useState('2026-27')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [categoryChip, setCategoryChip] = useState('ALL')
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL') // 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON'
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL') // 'ALL' | 'HAS_ORDER' | 'NO_ORDERS'
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  // Drawer Detail State
  const [selectedLot, setSelectedLot] = useState(null)

  // Map open customer orders & source company info to lots
  const lotsWithOrders = useMemo(() => {
    return workspaceScopedLots.map((lot) => {
      const sourceInfo = getLotSourceCompany(lot, allFinishedProducts)

      // Find customer orders matching this lot item
      const matchedOrders = (orders || []).filter((ord) => {
        const isOpen = !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(ord.status).toUpperCase())
        if (!isOpen) return false

        const byId = ord.product_id && (Number(ord.product_id) === Number(lot.item_id || lot.item))
        const byCode = ord.product_code && String(ord.product_code).toLowerCase() === String(lot.item_code).toLowerCase()
        const byName = ord.product_name && String(ord.product_name).toLowerCase() === String(lot.item_name).toLowerCase()
        const byLine = Array.isArray(ord.lines) && ord.lines.some((line) => {
          return (
            (line.product_id && Number(line.product_id) === Number(lot.item_id || lot.item)) ||
            (line.product_name && String(line.product_name).toLowerCase() === String(lot.item_name).toLowerCase())
          )
        })

        return byId || byCode || byName || byLine
      })

      // If lot already has explicit linked_orders in seed, merge them
      const linked = Array.isArray(lot.linked_orders) ? [...lot.linked_orders] : []
      matchedOrders.forEach((mo) => {
        if (!linked.some((lo) => lo.order_id === mo.id || lo.order_number === mo.number)) {
          linked.push({
            order_id: mo.id,
            order_number: mo.number,
            customer_name: mo.customer_name || 'Customer',
            ordered_quantity: Number(mo.quantity) || 0,
            delivery_deadline: mo.delivery_deadline || mo.delivery_date,
            status: mo.status,
          })
        }
      })

      return {
        ...lot,
        sourceInfo,
        activeOrders: linked,
        hasOrders: linked.length > 0,
      }
    })
  }, [workspaceScopedLots, orders, allFinishedProducts])

  // Dynamic filter lists
  const availableSourceCompanies = useMemo(() => {
    if (scopedCompanyId === 1) {
      return ['CMHP Pharma', 'Common Inventory']
    }
    if (scopedCompanyId === 2) {
      return ['Tej Biocare', 'Common Inventory']
    }
    return ['CMHP Pharma', 'Tej Biocare', 'Common Inventory']
  }, [scopedCompanyId])

  const finishedCategories = useMemo(() => {
    const set = new Set()
    lotsWithOrders.forEach((l) => {
      if (l.category && String(l.category).trim()) set.add(String(l.category).trim())
    })
    return Array.from(set).sort()
  }, [lotsWithOrders])

  // Filtered lots
  const filteredLots = useMemo(() => {
    return lotsWithOrders.filter((lot) => {
      // Product selector filter
      if (selectedProductKey !== 'ALL') {
        const isMatch =
          (lot.item_id && String(lot.item_id) === String(selectedProductKey)) ||
          (lot.item && String(lot.item) === String(selectedProductKey)) ||
          (lot.item_code && String(lot.item_code) === String(selectedProductKey))
        if (!isMatch) return false
      }

      // Date Range filter (using manufacture_date or received_date)
      const lotDate = lot.manufacture_date || lot.received_date || ''
      if (startDate && lotDate && lotDate < startDate) return false
      if (endDate && lotDate && lotDate > endDate) return false

      // Category chip filter
      if (categoryChip !== 'ALL') {
        if (lot.category !== categoryChip) return false
      }

      // Search (by item name, item code, lot/batch number, or source company)
      if (search.trim()) {
        const query = search.toLowerCase().trim()
        const matchName = String(lot.item_name || '').toLowerCase().includes(query)
        const matchCode = String(lot.item_code || '').toLowerCase().includes(query)
        const matchLot = String(lot.lot_number || '').toLowerCase().includes(query)
        const matchSource = String(lot.sourceInfo?.name || '').toLowerCase().includes(query)
        if (!matchName && !matchCode && !matchLot && !matchSource) return false
      }

      // Source Company filter (CMHP Pharma / Tej Biocare / Common Inventory)
      if (companyFilter !== 'ALL') {
        if (lot.sourceInfo?.name !== companyFilter) return false
      }

      // Stock status filter
      if (stockStatusFilter !== 'ALL') {
        const lotStatus = getLotStockStatus(lot)
        if (lotStatus.status !== stockStatusFilter) return false
      }

      // Order status filter
      if (orderStatusFilter === 'HAS_ORDER' && !lot.hasOrders) return false
      if (orderStatusFilter === 'NO_ORDERS' && lot.hasOrders) return false

      return true
    })
  }, [lotsWithOrders, selectedProductKey, startDate, endDate, categoryChip, search, companyFilter, stockStatusFilter, orderStatusFilter])

  // Summary Metrics - Updates live with filters
  const summaryMetrics = useMemo(() => {
    let totalStockQty = 0
    let lowStockCount = 0
    let itemsWithOpenOrders = 0
    const categoryQtyMap = {}

    filteredLots.forEach((l) => {
      const qty = Number(l.available_quantity || 0)
      totalStockQty += qty

      const cat = l.category || 'Finished Goods'
      categoryQtyMap[cat] = (categoryQtyMap[cat] || 0) + qty

      const st = getLotStockStatus(l)
      if (st.status === 'LOW_STOCK' || st.status === 'OUT_OF_STOCK') {
        lowStockCount++
      }

      if (l.hasOrders) {
        itemsWithOpenOrders++
      }
    })

    const topCategories = Object.entries(categoryQtyMap).slice(0, 3)

    return {
      totalStockQty,
      lowStockCount,
      itemsWithOpenOrders,
      topCategories,
      totalLots: filteredLots.length,
    }
  }, [filteredLots])

  // Clear filters
  const clearFilters = () => {
    setSelectedProductKey('ALL')
    setFinancialYear('2026-27')
    setStartDate('')
    setEndDate('')
    setCategoryChip('ALL')
    setSearch('')
    setCompanyFilter('ALL')
    setStockStatusFilter('ALL')
    setOrderStatusFilter('ALL')
    setPage(1)
  }

  const hasFilterActive = Boolean(
    selectedProductKey !== 'ALL' ||
    startDate ||
    endDate ||
    financialYear !== '2026-27' ||
    categoryChip !== 'ALL' ||
    search.trim() ||
    companyFilter !== 'ALL' ||
    stockStatusFilter !== 'ALL' ||
    orderStatusFilter !== 'ALL'
  )

  // Export filtered lots to CSV (Excel format)
  const handleExportExcel = () => {
    let csv = 'Product Code,Product Name,Lot Number,Source Company,Category,Batch Size,Available Qty,UOM,Expiry Date,Stock Status,Open Orders\n'
    filteredLots.forEach((lot) => {
      const pCode = (lot.item_code || '').replace(/"/g, '""')
      const pName = (lot.item_name || '').replace(/"/g, '""')
      const lotNum = (lot.lot_number || '').replace(/"/g, '""')
      const comp = (lot.sourceInfo?.name || '').replace(/"/g, '""')
      const cat = (lot.category || '').replace(/"/g, '""')
      const bSize = lot.batch_size || lot.quantity || ''
      const avail = lot.available_quantity || 0
      const uom = lot.uom || 'Pack'
      const exp = lot.expiry_date || ''
      const status = getLotStockStatus(lot).label
      const ordersCount = lot.activeOrders?.length || 0
      csv += `"${pCode}","${pName}","${lotNum}","${comp}","${cat}","${bSize}","${avail}","${uom}","${exp}","${status}","${ordersCount}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `Stocks_and_Lots_${financialYear}.csv`
    link.click()
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLots.length / pageSize))
  const paginatedLots = filteredLots.slice((page - 1) * pageSize, page * pageSize)

  // Movement history for selected lot in Drawer
  const selectedLotMovements = useMemo(() => {
    if (!selectedLot) return []
    const list = []

    // Check issue history
    ;(issueHistory || []).forEach((iss) => {
      if (Number(iss.lot_id) === Number(selectedLot.id) || iss.lot_number === selectedLot.lot_number) {
        list.push({
          type: 'ISSUE',
          ref: iss.issue_number,
          date: iss.date,
          qty: iss.quantity,
          to: iss.issued_to_name,
          by: iss.issued_by,
          remarks: iss.remarks,
        })
      }
    })

    // Check return history
    ;(stockReturns || []).forEach((ret) => {
      if (Number(ret.lot_id) === Number(selectedLot.id) || ret.lot_number === selectedLot.lot_number) {
        list.push({
          type: 'RETURN',
          ref: ret.return_number,
          date: ret.date,
          qty: ret.quantity,
          to: ret.return_to_label || ret.return_to,
          by: ret.created_by,
          status: ret.status,
          remarks: `${ret.reason}: ${ret.reason_notes}`,
        })
      }
    })

    // Add initial receipt
    list.push({
      type: 'RECEIPT',
      ref: `RCV-${selectedLot.lot_number}`,
      date: selectedLot.received_date || selectedLot.manufacture_date || '2026-01-01',
      qty: selectedLot.received_quantity || selectedLot.available_quantity,
      to: 'Central Quarantine / Store',
      by: 'Stores Receiving',
      remarks: 'Initial stock receipt and QC batch intake',
    })

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [selectedLot, issueHistory, stockReturns])

  return (
    <div className="stocks-container">
      {/* 1. Summary KPI Cards (Live updating with filters) */}
      <div className="stocks-summary-grid">
        {/* Card 1: Total Stock Quantity */}
        <div className="stocks-card">
          <div className="stocks-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📦
          </div>
          <div className="stocks-card-info">
            <span className="stocks-card-label">Total Finished Stock</span>
            <span className="stocks-card-value">
              {summaryMetrics.totalStockQty.toLocaleString('en-IN')}
            </span>
            <span className="stocks-card-subtext">
              Across {summaryMetrics.totalLots} matching finished lot{summaryMetrics.totalLots === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Card 2: Breakdown by Dosage Form Category */}
        <div className="stocks-card">
          <div className="stocks-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            🏷️
          </div>
          <div className="stocks-card-info">
            <span className="stocks-card-label">Dosage Forms Breakdown</span>
            <div className="stocks-category-breakdown">
              {summaryMetrics.topCategories && summaryMetrics.topCategories.length > 0 ? (
                summaryMetrics.topCategories.map(([cat, qty]) => (
                  <span key={cat} className="stocks-breakdown-pill">
                    {cat}: <strong>{qty.toLocaleString('en-IN')}</strong>
                  </span>
                ))
              ) : (
                <span className="stocks-card-subtext" style={{ margin: 0 }}>No stock recorded</span>
              )}
            </div>
            <span className="stocks-card-subtext">
              {hasFilterActive ? 'Filtered dosage view' : 'Finished Goods & Dosages'}
            </span>
          </div>
        </div>

        {/* Card 3: Low-Stock / Out-of-Stock Count */}
        <div className="stocks-card">
          <div className="stocks-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
            ⚠️
          </div>
          <div className="stocks-card-info">
            <span className="stocks-card-label">Low &amp; Out of Stock</span>
            <span className="stocks-card-value" style={{ color: summaryMetrics.lowStockCount > 0 ? '#ca8a04' : '#16a34a' }}>
              {summaryMetrics.lowStockCount}
            </span>
            <span className="stocks-card-subtext">
              {summaryMetrics.lowStockCount > 0 ? 'Lots at or below reorder threshold' : 'All lots healthy'}
            </span>
          </div>
        </div>

        {/* Card 4: Items with Open Orders */}
        <div className="stocks-card">
          <div className="stocks-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            📋
          </div>
          <div className="stocks-card-info">
            <span className="stocks-card-label">Items With Open Orders</span>
            <span className="stocks-card-value" style={{ color: '#16a34a' }}>
              {summaryMetrics.itemsWithOpenOrders}
            </span>
            <span className="stocks-card-subtext">
              Lots currently allocated to customer supply
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filter Section - Single White Rounded Card Matching Stock Ledger */}
      <div className="stocks-toolbar-card">
        {/* Row 1: Searchable item selector, Company, FY, Date Range, Search */}
        <div className="stocks-toolbar-row1">
          {/* Searchable Finished Product Combobox */}
          <div className="stock-searchable-select-wrap" ref={productDropdownRef}>
            <button
              type="button"
              className={`stock-select-trigger ${productDropdownOpen ? 'open' : ''}`}
              style={{ height: 40 }}
              onClick={() => setProductDropdownOpen((prev) => !prev)}
            >
              <div className="stock-trigger-content">
                {activeProduct ? (
                  <>
                    <span className="stock-trigger-code">{activeProduct.code || `PRD-${activeProduct.id}`}</span>
                    <span className="stock-trigger-name">{activeProduct.name}</span>
                    <span className="stock-trigger-sub">
                      (1 {activeProduct.display_unit || 'Pack'} = {activeProduct.pack_size || 1} {activeProduct.uom || activeProduct.base_unit || 'Unit'})
                    </span>
                  </>
                ) : (
                  <>
                    <span className="stock-trigger-code" style={{ background: '#f1f5f9', color: '#475569' }}>ALL</span>
                    <span className="stock-trigger-name">All Finished Products</span>
                    <span className="stock-trigger-sub">({allFinishedProducts.length} items)</span>
                  </>
                )}
              </div>
              <span className="stock-trigger-arrow">{productDropdownOpen ? '▴' : '▾'}</span>
            </button>

            {productDropdownOpen && (
              <div className="stock-select-dropdown">
                <div className="stock-select-search-box">
                  <span className="stock-search-icon">🔍</span>
                  <input
                    type="text"
                    className="stock-select-search-input"
                    placeholder="Search product name, code (e.g. Paracetamol, PRD-1001)..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  {productSearchQuery && (
                    <button
                      type="button"
                      className="stock-search-clear-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setProductSearchQuery('')
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="stock-select-options-list">
                  {/* Option: All Finished Products */}
                  <div
                    className={`stock-select-option ${selectedProductKey === 'ALL' ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedProductKey('ALL')
                      setProductDropdownOpen(false)
                      setProductSearchQuery('')
                      setPage(1)
                    }}
                  >
                    <span className="stock-option-code" style={{ background: '#f1f5f9', color: '#475569' }}>ALL</span>
                    <div className="stock-option-info">
                      <span className="stock-option-name">All Finished Products</span>
                      <span className="stock-option-meta">Show all products across inventory</span>
                    </div>
                    {selectedProductKey === 'ALL' && (
                      <span className="stock-option-check">✓</span>
                    )}
                  </div>

                  {searchableProducts.length === 0 ? (
                    <div className="stock-select-no-results">
                      <span>No matching products found for "{productSearchQuery}"</span>
                    </div>
                  ) : (
                    searchableProducts.map((p) => {
                      const pKey = String(p.id || p.code)
                      const isSelected = selectedProductKey === pKey
                      return (
                        <div
                          key={pKey}
                          className={`stock-select-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedProductKey(pKey)
                            setProductDropdownOpen(false)
                            setProductSearchQuery('')
                            setPage(1)
                          }}
                        >
                          <span className="stock-option-code">{p.code || `PRD-${p.id}`}</span>
                          <div className="stock-option-info">
                            <span className="stock-option-name">{p.name}</span>
                            <span className="stock-option-meta">
                              1 {p.display_unit || 'Pack'} = {p.pack_size || 1} {p.uom || p.base_unit || 'Unit'} &middot; {p.category || 'Finished Goods'}
                            </span>
                          </div>
                          {isSelected && <span className="stock-option-check">✓</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Source Company Filter (CMHP Pharma / Tej Biocare / Common Inventory) */}
          <select
            className="company-input"
            style={{ width: 170, height: 40 }}
            value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
          >
            <option value="ALL">
              {scopedCompanyId === 1
                ? 'All (CMHP & Common)'
                : scopedCompanyId === 2
                ? 'All (Tej & Common)'
                : 'All Source Companies'}
            </option>
            {availableSourceCompanies.map((comp) => (
              <option key={comp} value={comp}>{comp}</option>
            ))}
          </select>

          {/* Financial Year Selector */}
          <select
            className="company-input"
            style={{ width: 120, height: 40 }}
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
          >
            {FINANCIAL_YEARS.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>

          {/* Date Range Filters */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="date"
              className="company-input"
              style={{ width: 130, height: 40 }}
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              title="From Date"
            />
            <span style={{ color: '#94a3b8' }}>–</span>
            <input
              type="date"
              className="company-input"
              style={{ width: 130, height: 40 }}
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              title="To Date"
            />
          </div>

          {/* Search Input */}
          <input
            type="text"
            className="company-input"
            style={{ width: 180, flex: '1 1 180px', height: 40 }}
            placeholder="Search product, lot #, invoice..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Row 2: Action buttons row */}
        <div className="stocks-toolbar-row2">
          <button
            type="button"
            className="stock-btn-action stock-btn-inward"
            onClick={() => navigate('/inventory/orders')}
          >
            + View Orders
          </button>

          <button
            type="button"
            className="stock-btn-action stock-btn-outward"
            onClick={() => navigate('/inventory/issue-return')}
          >
            ⇄ Material Issue / Return
          </button>

          <select
            className="company-input"
            style={{ height: 38, width: 160, fontWeight: 600, fontSize: '12.5px', borderRadius: 8 }}
            value={stockStatusFilter}
            onChange={(e) => { setStockStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Stock Statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
            <option value="EXPIRING_SOON">Expiring Soon (≤ 60d)</option>
          </select>

          <select
            className="company-input"
            style={{ height: 38, width: 160, fontWeight: 600, fontSize: '12.5px', borderRadius: 8 }}
            value={orderStatusFilter}
            onChange={(e) => { setOrderStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Order Statuses</option>
            <option value="HAS_ORDER">Has Open Order</option>
            <option value="NO_ORDERS">No Orders</option>
          </select>

          <select
            className="company-input"
            style={{ height: 38, width: 110, fontWeight: 600, fontSize: '12.5px', borderRadius: 8 }}
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>

          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={handleExportExcel}
            title="Download CSV workbook for finished product lots"
          >
            📥 Export Excel
          </button>

          {hasFilterActive && (
            <button
              type="button"
              className="stock-btn-action stock-btn-secondary"
              onClick={clearFilters}
            >
              ✕ Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* 4. Lot-Wise Stock Table */}
      {filteredLots.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">{hasFilterActive ? '🔍' : '📦'}</div>
          <div className="ci-empty-title">
            {hasFilterActive ? 'No finished lots match your filters' : 'No finished product lots in stock'}
          </div>
          <p className="ci-empty-desc">
            {hasFilterActive
              ? 'Try adjusting your search query, source company, or clear filters to view available inventory.'
              : scopedCompanyId === 1
              ? 'No finished goods lots currently recorded for CMHP Pharma or Common Inventory. New production lots will appear here automatically.'
              : scopedCompanyId === 2
              ? 'No finished goods lots currently recorded for Tej Biocare or Common Inventory. New production lots will appear here automatically.'
              : 'No finished product lots received in common inventory yet. Batches will appear here once manufactured and released.'}
          </p>
          {hasFilterActive && (
            <Button type="button" variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="stocks-table-card">
          <div className="stocks-table-wrapper">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>Item Name &amp; Code</th>
                  <th>Category</th>
                  <th>Lot / Batch No.</th>
                  <th>Available Qty</th>
                  <th>Source Company</th>
                  <th>Mfg &amp; Expiry</th>
                  <th>Stock Status</th>
                  <th>Order Linkage &amp; Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLots.map((lot) => {
                  const stockStatus = getLotStockStatus(lot)
                  const primaryOrder = lot.activeOrders?.[0]
                  const urgency = primaryOrder ? getOrderUrgency(primaryOrder.delivery_deadline) : null

                  // Calculate coverage & shortfall for linked order
                  const orderedQty = primaryOrder ? Number(primaryOrder.ordered_quantity || 0) : 0
                  const availableQty = Number(lot.available_quantity || 0)
                  const isCovered = availableQty >= orderedQty
                  const shortfall = Math.max(0, orderedQty - availableQty)

                  return (
                    <tr
                      key={lot.id}
                      onClick={() => setSelectedLot(lot)}
                      title="Click to view complete lot details and order allocations"
                    >
                      {/* Item Name */}
                      <td>
                        <div className="stocks-item-cell">
                          <span className="stocks-item-name">{lot.item_name}</span>
                          <span className="stocks-item-code">{lot.item_code}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="ci-badge ci-badge-neutral" style={{ fontSize: 11 }}>
                          {lot.category}
                        </span>
                      </td>

                      {/* Lot / Batch No */}
                      <td>
                        <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                          {lot.lot_number}
                        </strong>
                      </td>

                      {/* Quantity + Unit */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: availableQty <= 0 ? '#dc2626' : '#0f172a' }}>
                            {availableQty.toLocaleString('en-IN')} {lot.uom || lot.uom_code}
                          </span>
                          {lot.received_quantity && (
                            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                              of {Number(lot.received_quantity).toLocaleString('en-IN')} rcvd
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Source Company */}
                      <td>
                        <span className={`stocks-source-badge ${lot.sourceInfo?.badgeClass || 'source-badge-common'}`}>
                          <span className="source-dot" />
                          {lot.sourceInfo?.name || 'Common Inventory'}
                        </span>
                      </td>

                      {/* Mfg & Expiry Dates */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
                          <span>Mfg: <strong>{lot.manufacture_date || '—'}</strong></span>
                          <span>Exp: <strong style={{ color: stockStatus.status === 'EXPIRING_SOON' ? '#b45309' : '#475569' }}>
                            {lot.expiry_date || '—'}
                          </strong></span>
                        </div>
                      </td>

                      {/* Stock Status Badge */}
                      <td>
                        <span className={stockStatus.badgeClass}>
                          {stockStatus.label}
                        </span>
                      </td>

                      {/* Order Linkage / Status */}
                      <td>
                        {lot.hasOrders && primaryOrder ? (
                          <div className="stocks-order-cell">
                            <div className="stocks-order-header">
                              <span className="stocks-order-no">#{primaryOrder.order_number}</span>
                              <span className="stocks-order-customer" title={primaryOrder.customer_name}>
                                {primaryOrder.customer_name}
                              </span>
                            </div>
                            <div className="stocks-order-meta">
                              <span style={{ fontSize: 11, color: '#334155' }}>
                                Ord: <strong>{orderedQty} {lot.uom || lot.uom_code}</strong>
                              </span>
                              {urgency && (
                                <span className={urgency.className}>
                                  {urgency.label}
                                </span>
                              )}
                            </div>
                            <div>
                              {isCovered ? (
                                <span className="stocks-coverage-badge stocks-coverage-covered">
                                  ✓ Stock Covered ({availableQty} / {orderedQty})
                                </span>
                              ) : (
                                <span className="stocks-coverage-badge stocks-coverage-shortfall">
                                  ✕ Shortfall of {shortfall} {lot.uom || lot.uom_code}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Clear "No Orders" state (Matches Raw Materials pattern) */
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="stocks-no-orders-badge">
                              ● No Orders
                            </span>
                            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                              Unallocated
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> – <strong>{Math.min(page * pageSize, filteredLots.length)}</strong> of <strong>{filteredLots.length}</strong> lots
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ minHeight: 32, padding: '4px 12px' }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ minHeight: 32, padding: '4px 12px' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          5. DETAIL DRAWER / PANEL (Requirement 6)
          ========================================================= */}
      {selectedLot && (
        <div className="stocks-drawer-backdrop" onClick={() => setSelectedLot(null)}>
          <div className="stocks-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="stocks-drawer-header">
              <div className="stocks-drawer-title-group">
                <h3>{selectedLot.item_name}</h3>
                <p>{selectedLot.item_code} • Lot #{selectedLot.lot_number}</p>
                <div className="stocks-drawer-badges">
                  <span className="ci-badge ci-badge-neutral">{selectedLot.category}</span>
                  <span className={getLotStockStatus(selectedLot).badgeClass}>
                    {getLotStockStatus(selectedLot).label}
                  </span>
                  <span className="ci-badge ci-badge-in-stock">QC: {selectedLot.qc_status || 'APPROVED'}</span>
                </div>
              </div>
              <button
                type="button"
                className="stocks-drawer-close"
                onClick={() => setSelectedLot(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Drawer Body */}
            <div className="stocks-drawer-body">
              {/* Section 1: Manufacturer & Source Information */}
              <div className="stocks-drawer-section">
                <h4>🏭 Manufacturing &amp; Intake Details</h4>
                <div className="stocks-info-grid">
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Source Company:</span>
                    <span className="stocks-info-val">
                      <span className={`stocks-source-badge ${selectedLot.sourceInfo?.badgeClass || 'source-badge-common'}`}>
                        <span className="source-dot" />
                        {selectedLot.sourceInfo?.name || 'Common Inventory'}
                      </span>
                    </span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Warehouse Location:</span>
                    <span className="stocks-info-val">{selectedLot.warehouse_location || 'Central Pharma Warehouse - Bay 1'}</span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Received Date:</span>
                    <span className="stocks-info-val">{selectedLot.received_date || '2026-02-15'}</span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">QC Release Status:</span>
                    <span className="stocks-info-val" style={{ color: '#16a34a' }}>
                      ✓ {selectedLot.qc_status || 'APPROVED'} (COA Verified)
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Lot Inventory Details */}
              <div className="stocks-drawer-section">
                <h4>📦 Stock &amp; Batch Metrics</h4>
                <div className="stocks-info-grid">
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Available Balance:</span>
                    <span className="stocks-info-val" style={{ fontSize: 16, color: '#0f172a' }}>
                      {Number(selectedLot.available_quantity).toLocaleString('en-IN')} {selectedLot.uom || selectedLot.uom_code}
                    </span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Initial Received Qty:</span>
                    <span className="stocks-info-val">
                      {Number(selectedLot.received_quantity || selectedLot.available_quantity).toLocaleString('en-IN')} {selectedLot.uom || selectedLot.uom_code}
                    </span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Manufacturing Date:</span>
                    <span className="stocks-info-val">{selectedLot.manufacture_date || '—'}</span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Expiry Date:</span>
                    <span className="stocks-info-val">{selectedLot.expiry_date || '—'}</span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Reorder Level:</span>
                    <span className="stocks-info-val">{selectedLot.reorder_level || 0} {selectedLot.uom || selectedLot.uom_code}</span>
                  </div>
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Batch Type:</span>
                    <span className="stocks-info-val">Finished Goods Formulation</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Customer Order Allocations (Complete Finished Goods Breakdown) */}
              <div className="stocks-drawer-section">
                <h4>📋 Customer Order Allocations</h4>
                {selectedLot.activeOrders && selectedLot.activeOrders.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedLot.activeOrders.map((ord, idx) => {
                      const urgency = getOrderUrgency(ord.delivery_deadline)
                      const isCov = Number(selectedLot.available_quantity) >= Number(ord.ordered_quantity)
                      const diff = Math.max(0, Number(ord.ordered_quantity) - Number(selectedLot.available_quantity))

                      return (
                        <div
                          key={idx}
                          style={{
                            padding: 12,
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                              #{ord.order_number}
                            </span>
                            <span className={urgency.className}>
                              {urgency.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Customer: <strong>{ord.customer_name}</strong></span>
                            <span>Pack-By: <strong>{ord.delivery_deadline || '—'}</strong></span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                            <span style={{ fontSize: 12 }}>
                              Ordered: <strong>{ord.ordered_quantity} {selectedLot.uom || selectedLot.uom_code}</strong>
                            </span>
                            {isCov ? (
                              <span className="stocks-coverage-badge stocks-coverage-covered">
                                ✓ Fully Covered
                              </span>
                            ) : (
                              <span className="stocks-coverage-badge stocks-coverage-shortfall">
                                ✕ Shortfall: {diff} {selectedLot.uom || selectedLot.uom_code}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* No Orders State */
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 8, textAlign: 'center' }}>
                    <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>📦</span>
                    <strong style={{ fontSize: 13, color: '#334155' }}>No Active Orders Linked</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                      There are currently no customer sales orders demanding this lot. Entire stock is unallocated and available for new sales dispatches.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 4: Lot-wise Movement Breakdown */}
              <div className="stocks-drawer-section">
                <h4>⇄ Lot Movement &amp; Audit Trail</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedLotMovements.map((mov, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        background: '#ffffff',
                        border: '1px solid #f1f5f9',
                        borderRadius: 6,
                        fontSize: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: mov.type === 'RECEIPT' ? '#16a34a' : mov.type === 'ISSUE' ? '#2563eb' : '#dc2626' }}>
                          {mov.type}: {mov.ref}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          {mov.date} • {mov.to}
                        </span>
                        {mov.remarks && (
                          <span style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                            {mov.remarks}
                          </span>
                        )}
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                        {mov.qty} {selectedLot.uom || selectedLot.uom_code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="stocks-drawer-footer">
              <Button
                variant="secondary"
                onClick={() => {
                  const targetLot = selectedLot
                  setSelectedLot(null)
                  navigate('/inventory/issue-return', { state: { preselectLot: targetLot, preselectTab: 'issue' } })
                }}
              >
                Issue From This Lot
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const targetLot = selectedLot
                  setSelectedLot(null)
                  navigate('/inventory/issue-return', { state: { preselectLot: targetLot, preselectTab: 'return' } })
                }}
              >
                Return Defective Stock
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}