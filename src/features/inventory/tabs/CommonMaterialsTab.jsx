import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import CsvImportModal from '../components/CsvImportModal'
import {
  addCommonRawMaterial,
  editCommonRawMaterial,
  deleteCommonRawMaterial,
  bulkImportCommonRawMaterials,
} from '../../../store/erpSlice'
import { logAudit } from '../../../utils/audit'
import { confirmAction } from '../../../utils/confirmAction'
import { previewDocumentNumber, commitDocumentNumber } from '../../../utils/documentNumbers'
import { selectItemStock } from '../../../utils/stockSelectors'
import './CommonInventory.css'

const DEFAULT_CATEGORIES = [
  'Active API',
  'Excipient',
  'Solvent',
  'Reagent',
  'Packaging Material',
  'Chemical',
  'Raw Material',
]

const DEFAULT_UOMS = ['KG', 'GM', 'LTR', 'ML', 'MG', 'Drum', 'Can', 'Pack', 'Box', 'Piece']

const EMPTY_FORM = {
  code: '',
  name: '',
  category: 'Active API',
  uom: 'KG',
  current_stock: 0,
  reorder_level: 0,
  unit_cost: 0,
  supplier: '',
  batch_no: '',
  expiry_date: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
}

export default function CommonMaterialsTab({ role }) {
  const dispatch = useDispatch()
  const commonMaterials = useSelector((state) => state.erp?.commonRawMaterials || [])
  const stockLedgerEntries = useSelector((state) => state.erp?.stockLedgerEntries || [])

  // Filter Bar State (Exact layout and behaviour as Orders page)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [stockFilter, setStockFilter] = useState('ALL') // 'ALL' | 'IN' | 'LOW' | 'OUT'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  // Column Header Sorting State
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' | 'desc'

  // Modal State (Default closed - NEVER open on load)
  const [modalOpen, setModalOpen] = useState(false)
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Alerts
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Dynamic filter options built from data in Redux (empty/All if no data yet)
  const categoryOptions = useMemo(() => {
    const set = new Set()
    commonMaterials.forEach((m) => {
      if (m.category && String(m.category).trim()) set.add(String(m.category).trim())
    })
    return Array.from(set).sort()
  }, [commonMaterials])

  const supplierOptions = useMemo(() => {
    const set = new Set()
    commonMaterials.forEach((m) => {
      if (m.supplier && String(m.supplier).trim()) set.add(String(m.supplier).trim())
    })
    return Array.from(set).sort()
  }, [commonMaterials])

  // Clear filters handler (used only in empty state)
  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('ALL')
    setSupplierFilter('ALL')
    setStockFilter('ALL')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  // Handle column header click for sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Open Create Form modal on button click only
  const openCreate = () => {
    setEditing(null)
    const nextCode = previewDocumentNumber('ITEM')
    setForm({
      ...EMPTY_FORM,
      code: nextCode || '',
    })
    setError('')
    setModalOpen(true)
  }

  // Open Edit Form modal on row Edit click
  const openEdit = (material) => {
    setEditing(material)
    const currentStockVal = selectItemStock(
      { erp: { stockLedgerEntries, commonRawMaterials } },
      material
    )
    setForm({
      code: material.code || '',
      name: material.name || '',
      category: material.category || 'Active API',
      uom: material.uom || 'KG',
      current_stock: currentStockVal !== undefined ? currentStockVal : (material.current_stock ?? 0),
      reorder_level: material.reorder_level ?? 0,
      unit_cost: material.unit_cost ?? 0,
      supplier: material.supplier || '',
      batch_no: material.batch_no || '',
      expiry_date: material.expiry_date || '',
      description: material.description || '',
      date: new Date().toISOString().slice(0, 10),
    })
    setError('')
    setModalOpen(true)
  }

  // Close modal and reset form
  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  // Save Raw Material (Create or Edit)
  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const code = form.code.trim()
    const name = form.name.trim()
    const currentStock = Number(form.current_stock)
    const reorderLevel = Number(form.reorder_level)
    const unitCost = Number(form.unit_cost)

    // Validation
    if (!code) {
      setError('Material Code is required.')
      return
    }
    if (!name) {
      setError('Material Name is required.')
      return
    }
    if (Number.isNaN(currentStock) || currentStock < 0) {
      setError('Current Stock must be a non-negative number.')
      return
    }
    if (Number.isNaN(reorderLevel) || reorderLevel < 0) {
      setError('Reorder Level must be a non-negative number.')
      return
    }
    if (Number.isNaN(unitCost) || unitCost < 0) {
      setError('Unit Cost must be a non-negative number.')
      return
    }

    // Duplicate Code check
    const duplicate = commonMaterials.find(
      (m) =>
        m.code?.toLowerCase() === code.toLowerCase() &&
        (!editing || m.id !== editing.id)
    )
    if (duplicate) {
      setError(`A raw material with code "${code}" already exists. Please use a unique code.`)
      return
    }

    const payload = {
      code,
      name,
      category: form.category,
      uom: form.uom,
      current_stock: currentStock,
      reorder_level: reorderLevel,
      unit_cost: unitCost,
      supplier: form.supplier.trim(),
      batch_no: form.batch_no.trim(),
      expiry_date: form.expiry_date || null,
      description: form.description.trim(),
      date: form.date || new Date().toISOString().slice(0, 10),
    }

    if (editing) {
      const oldStock = Number(
        selectItemStock({ erp: { stockLedgerEntries, commonRawMaterials } }, editing)
      )
      const stockChanged = currentStock !== oldStock

      dispatch(editCommonRawMaterial({ id: editing.id, payload }))
      logAudit({
        module: 'INVENTORY',
        entity_type: 'Common Raw Material',
        entity_id: code,
        action: 'RAW_MATERIAL_EDITED',
        description: `Updated raw material ${name} (${code})`,
        changes: [
          { field: 'name', old_value: editing.name, new_value: name },
          { field: 'category', old_value: editing.category, new_value: form.category },
          { field: 'current_stock', old_value: oldStock, new_value: currentStock },
          { field: 'unit_cost', old_value: editing.unit_cost, new_value: unitCost },
          { field: 'supplier', old_value: editing.supplier, new_value: form.supplier },
        ],
      })

      if (stockChanged) {
        const variance = currentStock - oldStock
        logAudit({
          module: 'STOCK_LEDGER',
          entity_type: 'Stock Ledger',
          entity_id: code,
          action: 'STOCK_ADJUSTMENT',
          details: `Stock adjusted for ${name} (${code}): was ${oldStock}, now ${currentStock} ${form.uom} (Variance: ${variance > 0 ? '+' : ''}${variance} ${form.uom})`,
          description: `Stock adjusted for ${name} (${code}): was ${oldStock}, now ${currentStock}`,
        })
      }

      setSuccess(`Raw material "${name}" updated successfully.`)
    } else {
      commitDocumentNumber('ITEM')
      dispatch(addCommonRawMaterial(payload))
      logAudit({
        module: 'INVENTORY',
        entity_type: 'Common Raw Material',
        entity_id: code,
        action: 'RAW_MATERIAL_ADDED',
        description: `Added raw material ${name} (${code})`,
      })
      if (currentStock > 0) {
        logAudit({
          module: 'STOCK_LEDGER',
          entity_type: 'Stock Ledger',
          entity_id: code,
          action: 'OPENING_STOCK_POSTED',
          details: `Opening stock of ${currentStock} ${form.uom} posted to Stock Ledger for material ${code} [Ref: Opening stock ${code}]`,
          description: `Opening stock of ${currentStock} ${form.uom} posted for ${name} (${code})`,
        })
      }
      setSuccess(`Raw material "${name}" created successfully.`)
    }

    closeModal()
  }

  // Delete Raw Material
  const handleDelete = (material) => {
    confirmAction(
      `Are you sure you want to delete raw material "${material.name}" (${material.code})?`,
      () => {
        dispatch(deleteCommonRawMaterial({ id: material.id }))
        logAudit({
          module: 'INVENTORY',
          entity_type: 'Common Raw Material',
          entity_id: material.code,
          action: 'RAW_MATERIAL_DELETED',
          description: `Deleted raw material ${material.name} (${material.code})`,
        })
        setSuccess(`Raw material "${material.name}" deleted.`)
      }
    )
  }

  // Bulk CSV Import
  const handleBulkImport = (records) => {
    dispatch(bulkImportCommonRawMaterials(records))
    setSuccess(`Successfully imported ${records.length} raw materials.`)
    setPage(1)
  }

  // Helper to get live stock strictly from Stock Ledger
  const getMaterialStock = (m) => {
    return selectItemStock(
      { erp: { stockLedgerEntries, commonRawMaterials: commonMaterials } },
      m
    )
  }

  const getStockStatus = (material) => {
    const stock = getMaterialStock(material)
    const reorder = Number(material.reorder_level || 0)
    if (stock <= 0) {
      return { label: 'Out of Stock', className: 'ci-badge ci-badge-out-of-stock', stock }
    }
    if (stock <= reorder) {
      return { label: 'Low Stock', className: 'ci-badge ci-badge-low-stock', stock }
    }
    return { label: 'In Stock', className: 'ci-badge ci-badge-in-stock', stock }
  }

  // Filter and Sort Raw Materials
  const filteredMaterials = useMemo(() => {
    return commonMaterials
      .filter((m) => {
        if (!search.trim()) return true
        const s = search.trim().toLowerCase()
        return (
          m.name?.toLowerCase().includes(s) ||
          m.code?.toLowerCase().includes(s) ||
          m.supplier?.toLowerCase().includes(s)
        )
      })
      .filter((m) => {
        if (categoryFilter === 'ALL') return true
        return m.category === categoryFilter
      })
      .filter((m) => {
        if (supplierFilter === 'ALL') return true
        return m.supplier === supplierFilter
      })
      .filter((m) => {
        if (stockFilter === 'ALL') return true
        const stock = getMaterialStock(m)
        const reorder = Number(m.reorder_level || 0)
        if (stockFilter === 'OUT') return stock <= 0
        if (stockFilter === 'LOW') return stock > 0 && stock <= reorder
        if (stockFilter === 'IN') return stock > reorder
        return true
      })
      .filter((m) => {
        if (!startDate && !endDate) return true
        const itemDate = m.created_at ? m.created_at.slice(0, 10) : ''
        if (!itemDate) return true
        if (startDate && itemDate < startDate) return false
        if (endDate && itemDate > endDate) return false
        return true
      })
      .sort((a, b) => {
        let valA
        let valB
        switch (sortField) {
          case 'code':
            valA = a.code || ''
            valB = b.code || ''
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
          case 'category':
            valA = a.category || ''
            valB = b.category || ''
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
          case 'uom':
            valA = a.uom || ''
            valB = b.uom || ''
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
          case 'supplier':
            valA = a.supplier || ''
            valB = b.supplier || ''
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
          case 'current_stock':
            valA = getMaterialStock(a)
            valB = getMaterialStock(b)
            return sortDirection === 'asc' ? valA - valB : valB - valA
          case 'reorder_level':
            valA = Number(a.reorder_level || 0)
            valB = Number(b.reorder_level || 0)
            return sortDirection === 'asc' ? valA - valB : valB - valA
          case 'unit_cost':
            valA = Number(a.unit_cost || 0)
            valB = Number(b.unit_cost || 0)
            return sortDirection === 'asc' ? valA - valB : valB - valA
          case 'stock_value':
            valA = getMaterialStock(a) * Number(a.unit_cost || 0)
            valB = getMaterialStock(b) * Number(b.unit_cost || 0)
            return sortDirection === 'asc' ? valA - valB : valB - valA
          case 'expiry_date':
            valA = a.expiry_date || '9999-12-31'
            valB = b.expiry_date || '9999-12-31'
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
          case 'name':
          default:
            valA = a.name || ''
            valB = b.name || ''
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        }
      })
  }, [
    commonMaterials,
    stockLedgerEntries,
    search,
    categoryFilter,
    supplierFilter,
    stockFilter,
    startDate,
    endDate,
    sortField,
    sortDirection,
  ])

  // Summary Metrics (Updates live with filters & single source of truth)
  const summaryMetrics = useMemo(() => {
    let total = filteredMaterials.length
    let inStock = 0
    let lowStock = 0
    let outOfStock = 0
    let totalStockValue = 0

    filteredMaterials.forEach((m) => {
      const stock = getMaterialStock(m)
      const reorder = Number(m.reorder_level || 0)
      const cost = Number(m.unit_cost || 0)
      totalStockValue += stock * cost

      if (stock <= 0) {
        outOfStock++
      } else if (stock <= reorder) {
        lowStock++
      } else {
        inStock++
      }
    })

    return { total, inStock, lowStock, outOfStock, totalStockValue }
  }, [filteredMaterials, stockLedgerEntries, commonMaterials])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / pageSize))
  const paginatedMaterials = filteredMaterials.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  // Sort indicator helper
  const renderSortIndicator = (field) => {
    if (sortField !== field) return null
    return (
      <span className="ci-sort-indicator">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  const hasFilterActive = Boolean(
    search.trim() ||
    categoryFilter !== 'ALL' ||
    supplierFilter !== 'ALL' ||
    stockFilter !== 'ALL' ||
    startDate ||
    endDate
  )

  return (
    <div className="ci-container">
      {/* 1. Header Toolbar */}
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Common Inventory – Raw Materials</h2>
          <p>Shared active pharmaceutical ingredients, excipients, solvents, and packaging supplies.</p>
        </div>
        <div className="ci-header-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCsvModalOpen(true)}
          >
            📥 Import CSV
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={openCreate}
          >
            + Add Raw Material
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* 2. Summary Cards Grid */}
      <div className="ci-summary-grid">
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            🧪
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Raw Materials</span>
            <span className="ci-card-value">{summaryMetrics.total}</span>
            {hasFilterActive && (
              <span className="ci-card-subtext">of {commonMaterials.length} total</span>
            )}
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            ✓
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">In Stock</span>
            <span className="ci-card-value" style={{ color: '#16a34a' }}>
              {summaryMetrics.inStock}
            </span>
            <span className="ci-card-subtext">Adequate inventory</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
            ⚠️
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Low Stock</span>
            <span className="ci-card-value" style={{ color: '#ca8a04' }}>
              {summaryMetrics.lowStock}
            </span>
            <span className="ci-card-subtext">At or below reorder</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
            ✕
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Out of Stock</span>
            <span className="ci-card-value" style={{ color: '#dc2626' }}>
              {summaryMetrics.outOfStock}
            </span>
            <span className="ci-card-subtext">Zero inventory</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            ₹
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Stock Value</span>
            <span className="ci-card-value" style={{ color: '#7c3aed', fontSize: 18 }}>
              ₹{summaryMetrics.totalStockValue.toLocaleString('en-IN', {
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="ci-card-subtext">Stock × Unit Cost</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Bar (Exactly matches Orders filter bar style, box sizes & spacing) */}
      <div className="inv-filters-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* 1. Search Box */}
        <input
          type="search"
          placeholder="Search by material code or name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ minWidth: 220, flex: 1.5 }}
        />

        {/* 2. All Categories */}
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 150 }}
        >
          <option value="ALL">All Categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* 3. All Suppliers */}
        <select
          value={supplierFilter}
          onChange={(e) => {
            setSupplierFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 150 }}
        >
          <option value="ALL">All Suppliers</option>
          {supplierOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* 4. All Stock Status */}
        <select
          value={stockFilter}
          onChange={(e) => {
            setStockFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 150 }}
        >
          <option value="ALL">All Stock Status</option>
          <option value="IN">In Stock</option>
          <option value="LOW">Low Stock</option>
          <option value="OUT">Out of Stock</option>
        </select>

        {/* 5 & 6. From Date – To Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
            className="company-input"
            title="From date"
            style={{ width: 130 }}
          />
          <span style={{ color: '#94a3b8' }}>–</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
            className="company-input"
            title="To date"
            style={{ width: 130 }}
          />
        </div>

        {/* 7. Rows Per Page */}
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
          <option value={100}>100 / page</option>
        </select>
      </div>

      {/* 4. Raw Materials Table / Empty States */}
      {commonMaterials.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🧪</div>
          <div className="ci-empty-title">No raw materials added yet</div>
          <p className="ci-empty-desc">
            Your Common Inventory raw materials catalog is empty. Add materials manually or import from a CSV file.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="button" variant="primary" onClick={openCreate}>
              + Add Raw Material
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCsvModalOpen(true)}>
              📥 Import CSV
            </Button>
          </div>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🔍</div>
          <div className="ci-empty-title">No raw materials match your filters</div>
          <p className="ci-empty-desc">
            Try adjusting or clearing your search keywords and dropdown filters to see results.
          </p>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="ci-table-card">
          <div className="ci-table-wrapper">
            <table className="ci-table">
              <thead>
                <tr>
                  <th className="ci-th-sortable" onClick={() => handleSort('code')}>
                    Material Code {renderSortIndicator('code')}
                  </th>
                  <th className="ci-th-sortable" onClick={() => handleSort('name')}>
                    Material Name {renderSortIndicator('name')}
                  </th>
                  <th className="ci-th-sortable" onClick={() => handleSort('category')}>
                    Category {renderSortIndicator('category')}
                  </th>
                  <th className="ci-th-sortable" onClick={() => handleSort('uom')}>
                    UOM {renderSortIndicator('uom')}
                  </th>
                  <th
                    className="ci-th-sortable"
                    style={{ textAlign: 'right' }}
                    onClick={() => handleSort('current_stock')}
                  >
                    Available Qty {renderSortIndicator('current_stock')}
                  </th>
                  <th
                    className="ci-th-sortable"
                    style={{ textAlign: 'right' }}
                    onClick={() => handleSort('reorder_level')}
                  >
                    Reorder Level {renderSortIndicator('reorder_level')}
                  </th>
                  <th
                    className="ci-th-sortable"
                    style={{ textAlign: 'right' }}
                    onClick={() => handleSort('unit_cost')}
                  >
                    Unit Cost (₹) {renderSortIndicator('unit_cost')}
                  </th>
                  <th
                    className="ci-th-sortable"
                    style={{ textAlign: 'right' }}
                    onClick={() => handleSort('stock_value')}
                  >
                    Stock Value (₹) {renderSortIndicator('stock_value')}
                  </th>
                  <th className="ci-th-sortable" onClick={() => handleSort('supplier')}>
                    Supplier {renderSortIndicator('supplier')}
                  </th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMaterials.map((m) => {
                  const status = getStockStatus(m)
                  const stockValue = Number(status.stock || 0) * Number(m.unit_cost || 0)

                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.code}</strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{m.name}</div>
                        {m.expiry_date && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Exp: {m.expiry_date}
                          </div>
                        )}
                      </td>
                      <td>{m.category}</td>
                      <td>{m.uom}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: status.stock <= 0 ? '#dc2626' : '#0f172a' }}>
                        {Number(status.stock || 0).toLocaleString('en-IN')} {m.uom || 'KG'}
                      </td>
                      <td style={{ textAlign: 'right', color: '#64748b' }}>
                        {Number(m.reorder_level || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        ₹{Number(m.unit_cost || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        ₹{stockValue.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td>{m.supplier || '—'}</td>
                      <td>
                        <span className={status.className}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => openEdit(m)}
                          style={{ marginRight: 6 }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="small"
                          onClick={() => handleDelete(m)}
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
          <div className="ci-pagination-bar">
            <span className="ci-pagination-info">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filteredMaterials.length)} of {filteredMaterials.length} raw materials
            </span>

            <div className="ci-pagination-controls">
              <span style={{ fontSize: 13, color: '#64748b', marginRight: 4 }}>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="company-input"
                style={{ height: 32, minHeight: 32, padding: '0 6px', fontSize: 12, width: 90 }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              <Button
                variant="secondary"
                size="small"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span style={{ padding: '0 8px', fontSize: 13, fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="small"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Add / Edit Raw Material Modal (Only rendered when modalOpen is true) */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={closeModal}
          title={editing ? 'Edit Raw Material' : 'Add Common Raw Material'}
          maxWidth="640px"
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <Alert type="error" message={error} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Material Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. MAT-1001"
                  className="company-input"
                  required
                />
              </div>

              <div className="company-field">
                <label>Material Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Paracetamol API Pure"
                  className="company-input"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="company-input"
                >
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="company-field">
                <label>Unit of Measure (UOM)</label>
                <select
                  value={form.uom}
                  onChange={(e) => setForm({ ...form, uom: e.target.value })}
                  className="company-input"
                >
                  {DEFAULT_UOMS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="company-input"
                  title="Date of saving"
                />
              </div>

              <div className="company-field">
                <label>Current Stock ({form.uom || 'KG'})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.current_stock}
                  onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  className="company-input"
                  placeholder="0"
                />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  This will be recorded as the opening stock in the Stock Ledger.
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Reorder Level ({form.uom || 'KG'})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.reorder_level}
                  onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                  className="company-input"
                />
              </div>

              <div className="company-field">
                <label>Unit Cost (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                  className="company-input"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Supplier</label>
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="Supplier name"
                  className="company-input"
                />
              </div>

              <div className="company-field">
                <label>Batch / Lot No</label>
                <input
                  type="text"
                  value={form.batch_no}
                  onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                  placeholder="e.g. BATCH-01"
                  className="company-input"
                />
              </div>

              <div className="company-field">
                <label>Expiry Date</label>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                  className="company-input"
                />
              </div>
            </div>

            <div className="company-field">
              <label>Description / Notes</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Storage conditions, purity specs, handling precautions..."
                className="company-input"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                {editing ? 'Update Raw Material' : 'Create Raw Material'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. CSV Import Modal */}
      {csvModalOpen && (
        <CsvImportModal
          isOpen={csvModalOpen}
          onClose={() => setCsvModalOpen(false)}
          type="materials"
          onImport={handleBulkImport}
        />
      )}
    </div>
  )
}
