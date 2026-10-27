import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import CsvImportModal from '../components/CsvImportModal'
import {
  addCommonProduct,
  editCommonProduct,
  deleteCommonProduct,
  bulkImportCommonProducts,
  selectDosageForms,
} from '../../../store/erpSlice'
import { logAudit } from '../../../utils/audit'
import { confirmAction } from '../../../utils/confirmAction'
import { previewDocumentNumber, commitDocumentNumber } from '../../../utils/documentNumbers'
import { DOSAGE_FORMS, DEFAULT_DOSAGE_FORM } from '../../../constants/dosageForms'
import './CommonInventory.css'

const DEFAULT_UOMS = ['Pack', 'Box', 'Bottle', 'Vial', 'Tube', 'Strip', 'Piece']

const EMPTY_FORM = {
  code: '',
  name: '',
  category: DEFAULT_DOSAGE_FORM,
  uom: 'Pack',
  current_stock: 0,
  reorder_level: 0,
  unit_cost: 0,
  description: '',
}

export default function CommonProductsTab({ role }) {
  const dispatch = useDispatch()
  const commonProducts = useSelector((state) => state.erp?.commonProducts || [])

  // Filter Bar State (Exact layout and behaviour as Orders page)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [uomFilter, setUomFilter] = useState('ALL')
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

  const reduxDosageForms = useSelector(selectDosageForms)
  const dosageForms = reduxDosageForms && reduxDosageForms.length ? reduxDosageForms : DOSAGE_FORMS

  // Dynamic filter options built from data in Redux (empty/All if no data yet)
  const categoryOptions = useMemo(() => {
    const set = new Set(dosageForms)
    commonProducts.forEach((p) => {
      const cat = p.category || p.dosage_form || p.type
      if (cat && String(cat).trim()) set.add(String(cat).trim())
    })
    return Array.from(set)
  }, [commonProducts, dosageForms])

  const uomOptions = useMemo(() => {
    const set = new Set()
    commonProducts.forEach((p) => {
      if (p.uom && String(p.uom).trim()) set.add(String(p.uom).trim())
    })
    return Array.from(set).sort()
  }, [commonProducts])

  // Clear filters handler (used only in empty state)
  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('ALL')
    setUomFilter('ALL')
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
    const nextCode = previewDocumentNumber('PRODUCT')
    setForm({
      ...EMPTY_FORM,
      code: nextCode || '',
    })
    setError('')
    setModalOpen(true)
  }

  // Open Edit Form modal on row Edit click
  const openEdit = (product) => {
    setEditing(product)
    setForm({
      code: product.code || '',
      name: product.name || '',
      category: product.category || 'Tablets',
      uom: product.uom || 'Pack',
      current_stock: product.current_stock ?? 0,
      reorder_level: product.reorder_level ?? 0,
      unit_cost: product.unit_cost ?? 0,
      description: product.description || '',
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

  // Save Product (Create or Edit)
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
      setError('Product Code is required.')
      return
    }
    if (!name) {
      setError('Product Name is required.')
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
    const duplicate = commonProducts.find(
      (p) =>
        p.code?.toLowerCase() === code.toLowerCase() &&
        (!editing || p.id !== editing.id)
    )
    if (duplicate) {
      setError(`A product with code "${code}" already exists. Please use a unique code.`)
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
      description: form.description.trim(),
    }

    if (editing) {
      dispatch(editCommonProduct({ id: editing.id, payload }))
      logAudit({
        module: 'INVENTORY',
        entity_type: 'Common Product',
        entity_id: code,
        action: 'PRODUCT_EDITED',
        description: `Updated product ${name} (${code})`,
        changes: [
          { field: 'name', old_value: editing.name, new_value: name },
          { field: 'category', old_value: editing.category, new_value: form.category },
          { field: 'current_stock', old_value: editing.current_stock, new_value: currentStock },
          { field: 'unit_cost', old_value: editing.unit_cost, new_value: unitCost },
          { field: 'reorder_level', old_value: editing.reorder_level, new_value: reorderLevel },
        ],
      })
      setSuccess(`Product "${name}" updated successfully.`)
    } else {
      commitDocumentNumber('PRODUCT')
      dispatch(addCommonProduct(payload))
      logAudit({
        module: 'INVENTORY',
        entity_type: 'Common Product',
        entity_id: code,
        action: 'PRODUCT_ADDED',
        description: `Added product ${name} (${code})`,
      })
      setSuccess(`Product "${name}" created successfully.`)
    }

    closeModal()
  }

  // Delete Product
  const handleDelete = (product) => {
    confirmAction(
      `Are you sure you want to delete product "${product.name}" (${product.code})?`,
      () => {
        dispatch(deleteCommonProduct({ id: product.id }))
        logAudit({
          module: 'INVENTORY',
          entity_type: 'Common Product',
          entity_id: product.code,
          action: 'PRODUCT_DELETED',
          description: `Deleted product ${product.name} (${product.code})`,
        })
        setSuccess(`Product "${product.name}" deleted.`)
      }
    )
  }

  // Bulk CSV Import
  const handleBulkImport = (records) => {
    dispatch(bulkImportCommonProducts(records))
    setSuccess(`Successfully imported ${records.length} products.`)
    setPage(1)
  }

  // Filter and Sort Products
  const filteredProducts = useMemo(() => {
    return commonProducts
      .filter((p) => {
        if (!search.trim()) return true
        const s = search.trim().toLowerCase()
        return (
          p.name?.toLowerCase().includes(s) ||
          p.code?.toLowerCase().includes(s)
        )
      })
      .filter((p) => {
        if (categoryFilter === 'ALL') return true
        return p.category === categoryFilter
      })
      .filter((p) => {
        if (uomFilter === 'ALL') return true
        return p.uom === uomFilter
      })
      .filter((p) => {
        if (stockFilter === 'ALL') return true
        const stock = Number(p.current_stock || 0)
        const reorder = Number(p.reorder_level || 0)
        if (stockFilter === 'OUT') return stock <= 0
        if (stockFilter === 'LOW') return stock > 0 && stock <= reorder
        if (stockFilter === 'IN') return stock > reorder
        return true
      })
      .filter((p) => {
        if (!startDate && !endDate) return true
        const itemDate = p.created_at ? p.created_at.slice(0, 10) : ''
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
          case 'current_stock':
            valA = Number(a.current_stock || 0)
            valB = Number(b.current_stock || 0)
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
            valA = Number(a.current_stock || 0) * Number(a.unit_cost || 0)
            valB = Number(b.current_stock || 0) * Number(b.unit_cost || 0)
            return sortDirection === 'asc' ? valA - valB : valB - valA
          case 'name':
          default:
            valA = a.name || ''
            valB = b.name || ''
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        }
      })
  }, [
    commonProducts,
    search,
    categoryFilter,
    uomFilter,
    stockFilter,
    startDate,
    endDate,
    sortField,
    sortDirection,
  ])

  // Summary Metrics (Updates live with filters)
  const summaryMetrics = useMemo(() => {
    let total = filteredProducts.length
    let inStock = 0
    let lowStock = 0
    let outOfStock = 0
    let totalStockValue = 0

    filteredProducts.forEach((p) => {
      const stock = Number(p.current_stock || 0)
      const reorder = Number(p.reorder_level || 0)
      const cost = Number(p.unit_cost || 0)
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
  }, [filteredProducts])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const paginatedProducts = filteredProducts.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  const getStockStatus = (product) => {
    const stock = Number(product.current_stock || 0)
    const reorder = Number(product.reorder_level || 0)
    if (stock <= 0) {
      return { label: 'Out of Stock', className: 'ci-badge ci-badge-out-of-stock' }
    }
    if (stock <= reorder) {
      return { label: 'Low Stock', className: 'ci-badge ci-badge-low-stock' }
    }
    return { label: 'In Stock', className: 'ci-badge ci-badge-in-stock' }
  }

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
    uomFilter !== 'ALL' ||
    stockFilter !== 'ALL' ||
    startDate ||
    endDate
  )

  return (
    <div className="ci-container">
      {/* 1. Header Toolbar */}
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Common Inventory – Products</h2>
          <p>Shared product formulations, finished goods, and stock across CMHP Pharma and Tej Biocare.</p>
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
            + Add Product
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
            📦
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Products</span>
            <span className="ci-card-value">{summaryMetrics.total}</span>
            {hasFilterActive && (
              <span className="ci-card-subtext">of {commonProducts.length} total</span>
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
            <span className="ci-card-subtext">Adequate quantity</span>
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
          placeholder="Search by product code or name…"
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

        {/* 3. All UOM */}
        <select
          value={uomFilter}
          onChange={(e) => {
            setUomFilter(e.target.value)
            setPage(1)
          }}
          className="company-input"
          style={{ width: 150 }}
        >
          <option value="ALL">All UOM</option>
          {uomOptions.map((u) => (
            <option key={u} value={u}>{u}</option>
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

      {/* 4. Products Table / Empty States */}
      {commonProducts.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">📦</div>
          <div className="ci-empty-title">No products added yet</div>
          <p className="ci-empty-desc">
            Your Common Inventory products list is empty. Add your first product manually or import from a CSV file.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="button" variant="primary" onClick={openCreate}>
              + Add Product
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCsvModalOpen(true)}>
              📥 Import CSV
            </Button>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🔍</div>
          <div className="ci-empty-title">No products match your filters</div>
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
                    Product Code {renderSortIndicator('code')}
                  </th>
                  <th className="ci-th-sortable" onClick={() => handleSort('name')}>
                    Product Name {renderSortIndicator('name')}
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
                    Current Stock {renderSortIndicator('current_stock')}
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
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((p) => {
                  const status = getStockStatus(p)
                  const stockValue = Number(p.current_stock || 0) * Number(p.unit_cost || 0)

                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.code}</strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                        {p.description && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td>{p.category}</td>
                      <td>{p.uom}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {Number(p.current_stock || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'right', color: '#64748b' }}>
                        {Number(p.reorder_level || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        ₹{Number(p.unit_cost || 0).toLocaleString('en-IN', {
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
                      <td>
                        <span className={status.className}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => openEdit(p)}
                          style={{ marginRight: 6 }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="small"
                          onClick={() => handleDelete(p)}
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
              {Math.min(page * pageSize, filteredProducts.length)} of {filteredProducts.length} products
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

      {/* 5. Add / Edit Product Modal (Only rendered when modalOpen is true) */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={closeModal}
          title={editing ? 'Edit Common Product' : 'Add Common Product'}
          maxWidth="620px"
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <Alert type="error" message={error} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Product Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. PRD-1001"
                  className="company-input"
                  required
                />
              </div>

              <div className="company-field">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Paracetamol 500mg"
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
                  {!dosageForms.includes(form.category) && form.category && (
                    <option value={form.category}>{form.category}</option>
                  )}
                  {dosageForms.map((cat) => (
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="company-field">
                <label>Current Stock</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.current_stock}
                  onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  className="company-input"
                />
              </div>

              <div className="company-field">
                <label>Reorder Level</label>
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

            <div className="company-field">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Enter product details, specifications, packaging notes..."
                className="company-input"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                {editing ? 'Update Product' : 'Create Product'}
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
          type="products"
          onImport={handleBulkImport}
        />
      )}
    </div>
  )
}
