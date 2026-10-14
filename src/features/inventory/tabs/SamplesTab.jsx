import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import './SamplesTab.css'

const ITEMS_PER_PAGE = 10

export default function SamplesTab({ role }) {
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'history'
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [productFilter, setProductFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [sortField, setSortField] = useState('')
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1)

  const companies = useSelector((state) => state.erp?.companies || [])
  const products = useSelector((state) => state.erp?.products || [])
  const orders = useSelector((state) => state.erp?.orders || [])
  const transactions = useSelector((state) => state.erp?.transactions || [])

  const companyMap = useMemo(() => {
    const map = {}
    companies.forEach((c) => {
      map[c.id] = c.name
    })
    return map
  }, [companies])

  // Extract all batch-wise sample records from real orders and transactions
  const batchRecords = useMemo(() => {
    const records = []
    const seenKeys = new Set()

    // 1. From transactions with type SAMPLE or reason Sample
    transactions.forEach((t) => {
      if (
        t.transaction_type === 'SAMPLE' ||
        String(t.reason).toLowerCase() === 'sample'
      ) {
        const key = `${t.order_number}-${t.batch_number}-${t.product_name}-${t.created_at}`
        seenKeys.add(key)
        records.push({
          id: `tx-${t.id}`,
          date: t.created_at ? t.created_at.slice(0, 10) : '',
          rawDate: t.created_at || '',
          orderNo: t.order_number || (t.order_id ? `ORD-${t.order_id}` : '—'),
          batchNo: t.batch_number || '—',
          product: t.product_name || '—',
          productCode: t.product_code || '',
          companyId: t.company || null,
          companyName: companyMap[t.company] || 'Company A',
          sampleQty: Number(t.quantity || t.outward_quantity || 0),
          recordedBy: t.created_by || 'Admin',
        })
      }
    })

    // 2. From orders with confirmed sample_quantity > 0
    orders.forEach((o) => {
      if (Number(o.sample_quantity || 0) > 0) {
        const orderNo = o.number || `ORD-${o.id}`
        const batchNo = o.batch_no || '—'
        const productName = o.product_name || 'Product'
        const rawDate = o.sample_recorded_at || o.order_date || ''
        const key = `${orderNo}-${batchNo}-${productName}-${rawDate}`

        if (!seenKeys.has(key)) {
          records.push({
            id: `ord-${o.id}`,
            date: rawDate ? rawDate.slice(0, 10) : '',
            rawDate: rawDate,
            orderNo: orderNo,
            batchNo: batchNo,
            product: productName,
            productCode: o.product_code || '',
            companyId: o.company || null,
            companyName: companyMap[o.company] || (o.company_code ? `Company ${o.company_code}` : 'Company A'),
            sampleQty: Number(o.sample_quantity),
            recordedBy: o.sample_recorded_by || 'Admin',
          })
        }
      }
    })

    // Sort newest first by default
    return records.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
  }, [transactions, orders, companyMap])

  // Aggregate product-wise sample summary from real records
  const productSummaries = useMemo(() => {
    const map = new Map()

    // Base on registered products
    products.forEach((p) => {
      map.set(p.name, {
        productName: p.name,
        productCode: p.code || '—',
        type: p.type || 'Medicine',
        companyId: p.company || 1,
        companyName: companyMap[p.company] || 'Company A',
        totalSampleQty: Number(p.total_samples || 0),
      })
    })

    // Sum all sample quantities from batch records
    batchRecords.forEach((b) => {
      const existing = map.get(b.product)
      if (existing) {
        // If not already accumulated via product total_samples
        if (existing.totalSampleQty === 0) {
          existing.totalSampleQty += b.sampleQty
        }
        if (!existing.productCode && b.productCode) {
          existing.productCode = b.productCode
        }
      } else {
        map.set(b.product, {
          productName: b.product,
          productCode: b.productCode || '—',
          type: 'Medicine',
          companyId: b.companyId || 1,
          companyName: b.companyName,
          totalSampleQty: b.sampleQty,
        })
      }
    })

    // Only return products that have sample quantity > 0 (or all finished products)
    const list = Array.from(map.values())
    return list.filter((p) => p.totalSampleQty > 0)
  }, [products, batchRecords, companyMap])

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalProducts = productSummaries.length

    let totalUnits = 0
    let thisMonthUnits = 0

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    batchRecords.forEach((r) => {
      totalUnits += r.sampleQty
      if (r.rawDate) {
        const d = new Date(r.rawDate)
        if (
          !Number.isNaN(d.getTime()) &&
          d.getFullYear() === currentYear &&
          d.getMonth() === currentMonth
        ) {
          thisMonthUnits += r.sampleQty
        }
      }
    })

    return {
      totalProducts,
      totalUnits,
      thisMonthUnits,
    }
  }, [productSummaries, batchRecords])

  // Filtered Product Summaries
  const filteredProductSummaries = useMemo(() => {
    return productSummaries
      .filter((p) => {
        if (companyFilter !== 'ALL' && String(p.companyId) !== String(companyFilter)) {
          return false
        }
        if (productFilter !== 'ALL' && p.productName !== productFilter) {
          return false
        }
        if (search.trim()) {
          const q = search.toLowerCase()
          const matchName = p.productName.toLowerCase().includes(q)
          const matchCode = p.productCode.toLowerCase().includes(q)
          if (!matchName && !matchCode) return false
        }
        return true
      })
      .sort((a, b) => {
        if (!sortField) return 0
        const valA = a[sortField] ?? ''
        const valB = b[sortField] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA
        }
        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
  }, [productSummaries, companyFilter, productFilter, search, sortField, sortOrder])

  // Filtered Batch Records
  const filteredBatchRecords = useMemo(() => {
    return batchRecords
      .filter((b) => {
        if (companyFilter !== 'ALL' && String(b.companyId) !== String(companyFilter)) {
          return false
        }
        if (productFilter !== 'ALL' && b.product !== productFilter) {
          return false
        }
        if (fromDate) {
          if (b.date && b.date < fromDate) return false
        }
        if (toDate) {
          if (b.date && b.date > toDate) return false
        }
        if (search.trim()) {
          const q = search.toLowerCase()
          const matchProd = b.product.toLowerCase().includes(q)
          const matchOrder = b.orderNo.toLowerCase().includes(q)
          const matchBatch = b.batchNo.toLowerCase().includes(q)
          if (!matchProd && !matchOrder && !matchBatch) return false
        }
        return true
      })
      .sort((a, b) => {
        if (!sortField) return 0
        const valA = a[sortField] ?? ''
        const valB = b[sortField] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA
        }
        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
  }, [batchRecords, companyFilter, productFilter, fromDate, toDate, search, sortField, sortOrder])

  // Toggle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Active items for pagination
  const currentList =
    activeTab === 'summary' ? filteredProductSummaries : filteredBatchRecords
  const totalPages = Math.ceil(currentList.length / ITEMS_PER_PAGE) || 1
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return currentList.slice(start, start + ITEMS_PER_PAGE)
  }, [currentList, currentPage])

  // Reset all filters
  const handleResetFilters = () => {
    setSearch('')
    setCompanyFilter('ALL')
    setProductFilter('ALL')
    setFromDate('')
    setToDate('')
    setCurrentPage(1)
  }

  // CSV Export
  const handleExportCSV = () => {
    let headers = []
    let rows = []

    if (activeTab === 'summary') {
      headers = ['Product Name', 'Product Code', 'Type', 'Company', 'Total Sample Quantity']
      rows = filteredProductSummaries.map((r) => [
        `"${r.productName}"`,
        `"${r.productCode}"`,
        `"${r.type}"`,
        `"${r.companyName}"`,
        r.totalSampleQty,
      ])
    } else {
      headers = ['Date', 'Order No', 'Batch No', 'Product', 'Sample Quantity', 'Recorded By']
      rows = filteredBatchRecords.map((r) => [
        `"${r.date}"`,
        `"${r.orderNo}"`,
        `"${r.batchNo}"`,
        `"${r.product}"`,
        r.sampleQty,
        `"${r.recordedBy}"`,
      ])
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `cmhp_samples_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Distinct products for filter
  const distinctProductNames = useMemo(() => {
    const set = new Set()
    products.forEach((p) => set.add(p.name))
    batchRecords.forEach((b) => set.add(b.product))
    return Array.from(set).filter(Boolean)
  }, [products, batchRecords])

  return (
    <div className="samples-container">
      {/* Top Summary Cards */}
      <div className="samples-metrics-grid">
        <div className="samples-metric-card">
          <div className="samples-metric-icon">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 2v7.31" />
              <path d="M14 9.3V2" />
              <path d="M8.5 2h7" />
              <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
              <path d="M5.52 16h12.96" />
            </svg>
          </div>
          <div className="samples-metric-body">
            <span className="samples-metric-value">{metrics.totalProducts}</span>
            <span className="samples-metric-label">Products with Samples</span>
          </div>
        </div>

        <div className="samples-metric-card">
          <div className="samples-metric-icon green">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m7.5 4.27 9 5.15" />
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <div className="samples-metric-body">
            <span className="samples-metric-value">{metrics.totalUnits}</span>
            <span className="samples-metric-label">Total Sample Units</span>
          </div>
        </div>

        <div className="samples-metric-card">
          <div className="samples-metric-icon purple">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
          </div>
          <div className="samples-metric-body">
            <span className="samples-metric-value">{metrics.thisMonthUnits}</span>
            <span className="samples-metric-label">Sample Units This Month</span>
          </div>
        </div>
      </div>

      {/* Tabs and CSV Export Toolbar */}
      <div className="samples-nav-bar">
        <div className="samples-subtabs">
          <button
            type="button"
            className={`samples-subtab-btn ${
              activeTab === 'summary' ? 'is-active' : ''
            }`}
            onClick={() => {
              setActiveTab('summary')
              setSortField('')
              setCurrentPage(1)
            }}
          >
            Product-wise Summary
          </button>
          <button
            type="button"
            className={`samples-subtab-btn ${
              activeTab === 'history' ? 'is-active' : ''
            }`}
            onClick={() => {
              setActiveTab('history')
              setSortField('')
              setCurrentPage(1)
            }}
          >
            Batch-wise History
          </button>
        </div>

        <div className="samples-actions-group">
          <button
            type="button"
            className="samples-csv-btn"
            onClick={handleExportCSV}
            title="Export to CSV"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="samples-filter-bar">
        <input
          type="search"
          className="samples-search"
          placeholder={
            activeTab === 'summary'
              ? 'Search product or code...'
              : 'Search product, order # or batch #...'
          }
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
        />

        <select
          className="samples-select"
          value={companyFilter}
          onChange={(e) => {
            setCompanyFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">All Companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          className="samples-select"
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value)
            setCurrentPage(1)
          }}
        >
          <option value="ALL">All Products</option>
          {distinctProductNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {activeTab === 'history' && (
          <div className="samples-date-filter">
            <span>From:</span>
            <input
              type="date"
              className="samples-date-input"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setCurrentPage(1)
              }}
            />
            <span>To:</span>
            <input
              type="date"
              className="samples-date-input"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
        )}

        {(search || companyFilter !== 'ALL' || productFilter !== 'ALL' || fromDate || toDate) && (
          <button
            type="button"
            className="samples-reset-btn"
            onClick={handleResetFilters}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Table Content */}
      <div className="inv-panel">
        <div className="inv-table-scroll">
          {activeTab === 'summary' ? (
            <table className="inv-table">
              <thead>
                <tr>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('productName')}
                  >
                    Product Name
                    {sortField === 'productName' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('productCode')}
                  >
                    Product Code
                    {sortField === 'productCode' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th>Type</th>
                  <th>Company</th>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('totalSampleQty')}
                  >
                    Total Sample Quantity
                    {sortField === 'totalSampleQty' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="inv-empty" style={{ padding: '32px 16px' }}>
                      No finished medicine product samples recorded yet.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((row, idx) => (
                    <tr key={`${row.productName}-${idx}`}>
                      <td className="cell-strong">{row.productName}</td>
                      <td>{row.productCode}</td>
                      <td>{row.type}</td>
                      <td>{row.companyName}</td>
                      <td>
                        <span className="sample-qty-pill">
                          {row.totalSampleQty} units
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="inv-table">
              <thead>
                <tr>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('date')}
                  >
                    Date
                    {sortField === 'date' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('orderNo')}
                  >
                    Order No.
                    {sortField === 'orderNo' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('batchNo')}
                  >
                    Batch No.
                    {sortField === 'batchNo' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('product')}
                  >
                    Product
                    {sortField === 'product' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th
                    className="sortable-th"
                    onClick={() => handleSort('sampleQty')}
                  >
                    Sample Quantity
                    {sortField === 'sampleQty' && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="inv-empty" style={{ padding: '32px 16px' }}>
                      No batch sample movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date || '—'}</td>
                      <td className="cell-strong">{row.orderNo}</td>
                      <td>{row.batchNo}</td>
                      <td>{row.product}</td>
                      <td>
                        <span className="sample-qty-pill">
                          {row.sampleQty} units
                        </span>
                      </td>
                      <td>{row.recordedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {currentList.length > ITEMS_PER_PAGE && (
          <div className="samples-pagination">
            <span style={{ fontSize: 13, color: 'var(--ref-muted)' }}>
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, currentList.length)} of{' '}
              {currentList.length} records
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="samples-page-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="samples-page-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
