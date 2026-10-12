import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import Button from '../../../components/Button'
import './StockTab.css'
import './CommonInventory.css'

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

  // Redux Selectors
  const lots = useSelector((state) => state.erp?.lots || [])
  const orders = useSelector((state) => state.erp?.orders || [])
  const transactions = useSelector((state) => state.erp?.transactions || [])
  const issueHistory = useSelector((state) => state.erp?.issueHistory || [])
  const stockReturns = useSelector((state) => state.erp?.stockReturns || [])

  // Filter States
  const [categoryChip, setCategoryChip] = useState('ALL') // 'ALL' | 'MEDICINE' | 'RAW_MATERIAL' | Specific category string
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL') // 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON'
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL') // 'ALL' | 'HAS_ORDER' | 'NO_ORDERS'
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  // Drawer Detail State
  const [selectedLot, setSelectedLot] = useState(null)

  // Dynamic filter lists
  const availableCompanies = useMemo(() => {
    const set = new Set()
    lots.forEach((l) => {
      const comp = l.source_company || l.supplier_name
      if (comp && String(comp).trim()) set.add(String(comp).trim())
    })
    return Array.from(set).sort()
  }, [lots])

  const specificCategories = useMemo(() => {
    const set = new Set()
    lots.forEach((l) => {
      if (l.category && String(l.category).trim()) set.add(String(l.category).trim())
    })
    return Array.from(set).sort()
  }, [lots])

  // Map open orders to lots
  const lotsWithOrders = useMemo(() => {
    return lots.map((lot) => {
      // Find orders matching this lot item
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
        activeOrders: linked,
        hasOrders: linked.length > 0,
      }
    })
  }, [lots, orders])

  // Filtered lots
  const filteredLots = useMemo(() => {
    return lotsWithOrders.filter((lot) => {
      // Category chip filter
      if (categoryChip === 'MEDICINE') {
        if (lot.item_type !== 'MEDICINE') return false
      } else if (categoryChip === 'RAW_MATERIAL') {
        if (lot.item_type !== 'RAW_MATERIAL') return false
      } else if (categoryChip !== 'ALL') {
        if (lot.category !== categoryChip) return false
      }

      // Search (by item name, item code, or lot/batch number)
      if (search.trim()) {
        const query = search.toLowerCase().trim()
        const matchName = String(lot.item_name || '').toLowerCase().includes(query)
        const matchCode = String(lot.item_code || '').toLowerCase().includes(query)
        const matchLot = String(lot.lot_number || '').toLowerCase().includes(query)
        const matchSource = String(lot.source_company || lot.supplier_name || '').toLowerCase().includes(query)
        if (!matchName && !matchCode && !matchLot && !matchSource) return false
      }

      // Manufacturer / Supplier Company filter
      if (companyFilter !== 'ALL') {
        const comp = lot.source_company || lot.supplier_name
        if (comp !== companyFilter) return false
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
  }, [lotsWithOrders, categoryChip, search, companyFilter, stockStatusFilter, orderStatusFilter])

  // Summary Metrics - Updates live with filters
  const summaryMetrics = useMemo(() => {
    let totalStockQty = 0
    let medicineStockQty = 0
    let rawMaterialStockQty = 0
    let lowStockCount = 0
    let itemsWithOpenOrders = 0
    let medicineLotsCount = 0
    let rawMaterialLotsCount = 0

    filteredLots.forEach((l) => {
      const qty = Number(l.available_quantity || 0)
      totalStockQty += qty

      if (l.item_type === 'MEDICINE') {
        medicineStockQty += qty
        medicineLotsCount++
      } else {
        rawMaterialStockQty += qty
        rawMaterialLotsCount++
      }

      const st = getLotStockStatus(l)
      if (st.status === 'LOW_STOCK' || st.status === 'OUT_OF_STOCK') {
        lowStockCount++
      }

      if (l.hasOrders) {
        itemsWithOpenOrders++
      }
    })

    return {
      totalStockQty,
      medicineStockQty,
      rawMaterialStockQty,
      lowStockCount,
      itemsWithOpenOrders,
      medicineLotsCount,
      rawMaterialLotsCount,
      totalLots: filteredLots.length,
    }
  }, [filteredLots])

  // Clear filters
  const clearFilters = () => {
    setCategoryChip('ALL')
    setSearch('')
    setCompanyFilter('ALL')
    setStockStatusFilter('ALL')
    setOrderStatusFilter('ALL')
    setPage(1)
  }

  const hasFilterActive = Boolean(
    categoryChip !== 'ALL' ||
    search.trim() ||
    companyFilter !== 'ALL' ||
    stockStatusFilter !== 'ALL' ||
    orderStatusFilter !== 'ALL'
  )

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
      {/* 1. Header Toolbar */}
      <div className="stocks-header">
        <div className="stocks-header-titles">
          <h2>Inventory — Stocks &amp; Lots</h2>
          <p>
            Real-time batch &amp; lot tracking across medicines (finished goods) and raw materials, complete with customer order linkage and fulfillment coverage.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/inventory/issue-return')}
          >
            ⇄ Material Issue / Return
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate('/inventory/orders')}
          >
            + View Orders
          </Button>
        </div>
      </div>

      {/* 2. Summary KPI Cards (Live updating with filters) */}
      <div className="stocks-summary-grid">
        {/* Card 1: Total Stock Quantity */}
        <div className="stocks-card">
          <div className="stocks-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📦
          </div>
          <div className="stocks-card-info">
            <span className="stocks-card-label">Total Stock Quantity</span>
            <span className="stocks-card-value">
              {summaryMetrics.totalStockQty.toLocaleString('en-IN')}
            </span>
            <span className="stocks-card-subtext">
              Across {summaryMetrics.totalLots} matching lot{summaryMetrics.totalLots === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Card 2: Breakdown by Category */}
        <div className="stocks-card">
          <div className="stocks-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            🏷️
          </div>
          <div className="stocks-card-info">
            <span className="stocks-card-label">Category Breakdown</span>
            <div className="stocks-category-breakdown">
              <span className="stocks-breakdown-pill">
                Medicines: <strong>{summaryMetrics.medicineStockQty.toLocaleString('en-IN')}</strong> ({summaryMetrics.medicineLotsCount} lots)
              </span>
              <span className="stocks-breakdown-pill">
                Raw Materials: <strong>{summaryMetrics.rawMaterialStockQty.toLocaleString('en-IN')}</strong> ({summaryMetrics.rawMaterialLotsCount} lots)
              </span>
            </div>
            <span className="stocks-card-subtext">
              {hasFilterActive ? 'Filtered category view' : 'Finished Goods & Ingredients'}
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

      {/* 3. Filter Section */}
      <div className="stocks-filter-card">
        {/* Category Tabs / Chips */}
        <div className="stocks-chips-row">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginRight: 4 }}>
            Category:
          </span>
          <button
            type="button"
            className={`stocks-chip ${categoryChip === 'ALL' ? 'active' : ''}`}
            onClick={() => { setCategoryChip('ALL'); setPage(1); }}
          >
            All Items <span className="chip-count">{lots.length}</span>
          </button>
          <button
            type="button"
            className={`stocks-chip ${categoryChip === 'MEDICINE' ? 'active' : ''}`}
            onClick={() => { setCategoryChip('MEDICINE'); setPage(1); }}
          >
            💊 Medicines (Finished Goods) <span className="chip-count">{lots.filter((l) => l.item_type === 'MEDICINE').length}</span>
          </button>
          <button
            type="button"
            className={`stocks-chip ${categoryChip === 'RAW_MATERIAL' ? 'active' : ''}`}
            onClick={() => { setCategoryChip('RAW_MATERIAL'); setPage(1); }}
          >
            🧪 Raw Materials <span className="chip-count">{lots.filter((l) => l.item_type === 'RAW_MATERIAL').length}</span>
          </button>
          {specificCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`stocks-chip ${categoryChip === cat ? 'active' : ''}`}
              onClick={() => { setCategoryChip(cat); setPage(1); }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Dropdown Filters & Search */}
        <div className="stocks-inputs-row">
          <input
            type="search"
            placeholder="Search by item name, code, lot/batch #, company…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="company-input stocks-search-input"
          />

          {/* Manufacturer / Supplier Company Filter */}
          <select
            value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
            className="company-input stocks-select-input"
          >
            <option value="ALL">All Companies / Suppliers</option>
            {availableCompanies.map((comp) => (
              <option key={comp} value={comp}>{comp}</option>
            ))}
          </select>

          {/* Stock Status Filter */}
          <select
            value={stockStatusFilter}
            onChange={(e) => { setStockStatusFilter(e.target.value); setPage(1); }}
            className="company-input stocks-select-input"
          >
            <option value="ALL">All Stock Statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
            <option value="EXPIRING_SOON">Expiring Soon (≤ 60d)</option>
          </select>

          {/* Order Status Filter */}
          <select
            value={orderStatusFilter}
            onChange={(e) => { setOrderStatusFilter(e.target.value); setPage(1); }}
            className="company-input stocks-select-input"
          >
            <option value="ALL">All Order Statuses</option>
            <option value="HAS_ORDER">Has Open Order</option>
            <option value="NO_ORDERS">No Orders</option>
          </select>

          {/* Rows Per Page */}
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="company-input"
            style={{ width: 110 }}
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>

          {/* Clear Filters Button */}
          {hasFilterActive && (
            <button
              type="button"
              className="stocks-clear-btn"
              onClick={clearFilters}
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* 4. Lot-Wise Stock Table */}
      {filteredLots.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🔍</div>
          <div className="ci-empty-title">No lots match your filters</div>
          <p className="ci-empty-desc">
            Try adjusting your search terms or clearing filters to see the full pharmaceutical inventory.
          </p>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
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
                  const isMedicine = lot.item_type === 'MEDICINE'
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
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="stocks-company-tag">
                            {lot.source_company || lot.supplier_name}
                          </span>
                          <span className="stocks-role-subtext">
                            {isMedicine ? '🏭 Manufacturer' : '🚚 Supplier'}
                          </span>
                        </div>
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
                <h4>🏭 {selectedLot.item_type === 'MEDICINE' ? 'Manufacturing & Intake Details' : 'Supplier & Material Origin'}</h4>
                <div className="stocks-info-grid">
                  <div className="stocks-info-item">
                    <span className="stocks-info-label">Source Company:</span>
                    <span className="stocks-info-val" style={{ color: '#2563eb' }}>
                      {selectedLot.source_company || selectedLot.supplier_name}
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', marginLeft: 4 }}>
                        ({selectedLot.item_type === 'MEDICINE' ? 'Manufacturer' : 'Supplier'})
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
                    <span className="stocks-info-val">{selectedLot.item_type === 'MEDICINE' ? 'Finished Goods Formulation' : 'Active Raw Ingredient'}</span>
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