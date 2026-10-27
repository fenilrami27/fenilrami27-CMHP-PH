import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { selectItemStock } from '../../../utils/stockSelectors'
import './CommonInventory.css'

export default function OverviewTab() {
  const erpState = useSelector((state) => state.erp || {})
  const commonProducts = erpState.commonProducts || []
  const commonMaterials = erpState.commonRawMaterials || []
  const lots = erpState.lots || []
  const orders = erpState.orders || []

  // Metrics calculation
  const metrics = useMemo(() => {
    // Products valuation & health
    let productsValuation = 0
    let productsInStock = 0
    let productsLowStock = 0
    let productsOutOfStock = 0

    commonProducts.forEach((p) => {
      const stock = Number(p.current_stock || 0)
      const reorder = Number(p.reorder_level || 0)
      const cost = Number(p.unit_cost || 0)
      productsValuation += stock * cost

      if (stock <= 0) productsOutOfStock++
      else if (stock <= reorder) productsLowStock++
      else productsInStock++
    })

    // Materials valuation & health
    let materialsValuation = 0
    let materialsInStock = 0
    let materialsLowStock = 0
    let materialsOutOfStock = 0

    commonMaterials.forEach((m) => {
      const stock = selectItemStock(erpState, m)
      const reorder = Number(m.reorder_level || 0)
      const cost = Number(m.unit_cost || 0)
      materialsValuation += stock * cost

      if (stock <= 0) materialsOutOfStock++
      else if (stock <= reorder) materialsLowStock++
      else materialsInStock++
    })

    const totalValuation = productsValuation + materialsValuation
    const totalLowStock = productsLowStock + materialsLowStock
    const totalOutOfStock = productsOutOfStock + materialsOutOfStock

    // Lots QC & Expiry
    const pendingQcLots = lots.filter((l) => l.qc_status === 'PENDING').length
    const rejectedOrQuarantineLots = lots.filter(
      (l) => l.qc_status === 'REJECTED' || l.qc_status === 'QUARANTINE'
    ).length
    const approvedLots = lots.filter((l) => l.qc_status === 'APPROVED').length

    const now = new Date()
    const expiringLots30Days = lots.filter((l) => {
      if (!l.expiry_date) return false
      const days = (new Date(`${l.expiry_date}T00:00:00`) - now) / 86400000
      return days >= 0 && days <= 30
    }).length

    const expiringLots90Days = lots.filter((l) => {
      if (!l.expiry_date) return false
      const days = (new Date(`${l.expiry_date}T00:00:00`) - now) / 86400000
      return days > 30 && days <= 90
    }).length

    return {
      productsCount: commonProducts.length,
      productsInStock,
      productsLowStock,
      productsOutOfStock,
      productsValuation,
      materialsCount: commonMaterials.length,
      materialsInStock,
      materialsLowStock,
      materialsOutOfStock,
      materialsValuation,
      totalValuation,
      totalLowStock,
      totalOutOfStock,
      pendingQcLots,
      rejectedOrQuarantineLots,
      approvedLots,
      expiringLots30Days,
      expiringLots90Days,
      ordersCount: orders.length,
    }
  }, [commonProducts, commonMaterials, lots, orders])

  // Critical Attention Items (items that are out of stock or low stock)
  const criticalItems = useMemo(() => {
    const list = []
    commonProducts.forEach((p) => {
      const stock = Number(p.current_stock || 0)
      const reorder = Number(p.reorder_level || 0)
      if (stock <= 0) {
        list.push({ type: 'Product', code: p.code, name: p.name, stock, reorder, status: 'Out of Stock', level: 'danger' })
      } else if (stock <= reorder) {
        list.push({ type: 'Product', code: p.code, name: p.name, stock, reorder, status: 'Low Stock', level: 'warning' })
      }
    })
    commonMaterials.forEach((m) => {
      const stock = selectItemStock(erpState, m)
      const reorder = Number(m.reorder_level || 0)
      if (stock <= 0) {
        list.push({ type: 'Raw Material', code: m.code, name: m.name, stock, reorder, status: 'Out of Stock', level: 'danger' })
      } else if (stock <= reorder) {
        list.push({ type: 'Raw Material', code: m.code, name: m.name, stock, reorder, status: 'Low Stock', level: 'warning' })
      }
    })
    return list.slice(0, 5)
  }, [commonProducts, commonMaterials])

  return (
    <div className="ci-container">
      {/* 1. Header Toolbar */}
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Inventory Overview &amp; Analytics</h2>
          <p>
            Real-time pharmaceutical inventory metrics, stock valuation, and quality control across CMHP Pharma &amp; Tej Biocare.
          </p>
        </div>
        <div className="ci-header-actions">
          <Link to="/inventory/products" className="ci-quick-link" style={{ padding: '8px 14px' }}>
            Products Catalog →
          </Link>
          <Link to="/inventory/materials" className="ci-quick-link" style={{ padding: '8px 14px' }}>
            Raw Materials Store →
          </Link>
          <Link to="/inventory/orders" className="ci-quick-link" style={{ padding: '8px 14px', background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
            View Orders →
          </Link>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards Grid (Matches Products design) */}
      <div className="ci-summary-grid">
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📦
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Finished Products</span>
            <span className="ci-card-value">{metrics.productsCount}</span>
            <span className="ci-card-subtext">
              {metrics.productsInStock} in stock &middot; {metrics.productsOutOfStock} out
            </span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            🧪
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Raw Materials &amp; APIs</span>
            <span className="ci-card-value">{metrics.materialsCount}</span>
            <span className="ci-card-subtext">
              {metrics.materialsInStock} in stock &middot; {metrics.materialsOutOfStock} out
            </span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            ₹
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Inventory Value</span>
            <span className="ci-card-value" style={{ color: '#7c3aed', fontSize: 18 }}>
              ₹{metrics.totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <span className="ci-card-subtext">Combined stock valuation</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
            ⚠️
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Stock Reorder Alerts</span>
            <span className="ci-card-value" style={{ color: '#ca8a04' }}>
              {metrics.totalLowStock}
            </span>
            <span className="ci-card-subtext">At or below reorder level</span>
          </div>
        </div>

        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fff1f2', color: '#e11d48' }}>
            🛡️
          </div>
          <div className="ci-card-info">
            <span className="ci-card-label">Lots Pending QC</span>
            <span className="ci-card-value" style={{ color: '#e11d48' }}>
              {metrics.pendingQcLots}
            </span>
            <span className="ci-card-subtext">
              {metrics.expiringLots30Days > 0 ? `${metrics.expiringLots30Days} expiring soon` : 'Quality quarantine'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Deep-Dive Dashboard Panels Grid */}
      <div className="ci-dash-grid">
        {/* Panel A: Stock Health & Distribution */}
        <div className="ci-dash-card">
          <div className="ci-dash-card-header">
            <div>
              <h3>Stock Health &amp; Availability</h3>
              <p>Breakdown across Products and Raw Materials</p>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>
              {metrics.productsInStock + metrics.materialsInStock} Healthy Items
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Products Stock Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>Finished Products Availability</span>
                <span style={{ color: '#64748b' }}>
                  {metrics.productsCount === 0 ? 'No products registered' : `${metrics.productsInStock} of ${metrics.productsCount} In Stock`}
                </span>
              </div>
              <div className="ci-progress-bar-bg">
                {metrics.productsCount > 0 ? (
                  <>
                    <div
                      className="ci-progress-segment"
                      style={{
                        width: `${(metrics.productsInStock / metrics.productsCount) * 100}%`,
                        background: '#16a34a',
                      }}
                      title={`In Stock: ${metrics.productsInStock}`}
                    />
                    <div
                      className="ci-progress-segment"
                      style={{
                        width: `${(metrics.productsLowStock / metrics.productsCount) * 100}%`,
                        background: '#eab308',
                      }}
                      title={`Low Stock: ${metrics.productsLowStock}`}
                    />
                    <div
                      className="ci-progress-segment"
                      style={{
                        width: `${(metrics.productsOutOfStock / metrics.productsCount) * 100}%`,
                        background: '#dc2626',
                      }}
                      title={`Out of Stock: ${metrics.productsOutOfStock}`}
                    />
                  </>
                ) : (
                  <div style={{ width: '100%', background: '#e2e8f0' }} />
                )}
              </div>
            </div>

            {/* Raw Materials Stock Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>Raw Materials Availability</span>
                <span style={{ color: '#64748b' }}>
                  {metrics.materialsCount === 0 ? 'No materials registered' : `${metrics.materialsInStock} of ${metrics.materialsCount} In Stock`}
                </span>
              </div>
              <div className="ci-progress-bar-bg">
                {metrics.materialsCount > 0 ? (
                  <>
                    <div
                      className="ci-progress-segment"
                      style={{
                        width: `${(metrics.materialsInStock / metrics.materialsCount) * 100}%`,
                        background: '#16a34a',
                      }}
                      title={`In Stock: ${metrics.materialsInStock}`}
                    />
                    <div
                      className="ci-progress-segment"
                      style={{
                        width: `${(metrics.materialsLowStock / metrics.materialsCount) * 100}%`,
                        background: '#eab308',
                      }}
                      title={`Low Stock: ${metrics.materialsLowStock}`}
                    />
                    <div
                      className="ci-progress-segment"
                      style={{
                        width: `${(metrics.materialsOutOfStock / metrics.materialsCount) * 100}%`,
                        background: '#dc2626',
                      }}
                      title={`Out of Stock: ${metrics.materialsOutOfStock}`}
                    />
                  </>
                ) : (
                  <div style={{ width: '100%', background: '#e2e8f0' }} />
                )}
              </div>
            </div>

            {/* Health Legend */}
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b', marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#16a34a' }} />
                In Stock ({metrics.productsInStock + metrics.materialsInStock})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#eab308' }} />
                Low Stock ({metrics.totalLowStock})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#dc2626' }} />
                Out of Stock ({metrics.totalOutOfStock})
              </span>
            </div>
          </div>
        </div>

        {/* Panel B: Inventory Valuation Split */}
        <div className="ci-dash-card">
          <div className="ci-dash-card-header">
            <div>
              <h3>Valuation Breakdown</h3>
              <p>Capital deployed in warehouse storage</p>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#7c3aed' }}>
              ₹{metrics.totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="ci-stat-row">
              <span style={{ color: '#64748b' }}>Finished Products Valuation</span>
              <strong style={{ color: '#0f172a' }}>
                ₹{metrics.productsValuation.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </strong>
            </div>

            <div className="ci-stat-row">
              <span style={{ color: '#64748b' }}>Raw Materials Valuation</span>
              <strong style={{ color: '#0f172a' }}>
                ₹{metrics.materialsValuation.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </strong>
            </div>

            <div className="ci-stat-row">
              <span style={{ color: '#64748b' }}>Total Registered SKUs</span>
              <strong style={{ color: '#0f172a' }}>
                {metrics.productsCount + metrics.materialsCount} items
              </strong>
            </div>

            <div className="ci-stat-row">
              <span style={{ color: '#64748b' }}>Lots Pending Quality Approval</span>
              <span style={{ fontWeight: 600, color: metrics.pendingQcLots > 0 ? '#e11d48' : '#16a34a' }}>
                {metrics.pendingQcLots} lots
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Action Cards & Reorder Alerts */}
      <div className="ci-dash-grid">
        {/* Panel C: Critical Reorder Attention */}
        <div className="ci-dash-card">
          <div className="ci-dash-card-header">
            <div>
              <h3>Inventory Alerts &amp; Reorders</h3>
              <p>Items requiring purchase or production attention</p>
            </div>
            <Link to="/inventory/orders" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              View Orders →
            </Link>
          </div>

          {criticalItems.length === 0 ? (
            <div style={{ padding: '24px 10px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              ✓ All inventory items are adequately stocked above their reorder thresholds.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {criticalItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: item.level === 'danger' ? '#fef2f2' : '#fefce8',
                    border: `1px solid ${item.level === 'danger' ? '#fecaca' : '#fef08a'}`,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong>{item.code}</strong> &middot; {item.name}
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {item.type} &middot; Stock: <strong>{item.stock}</strong> (Reorder: {item.reorder})
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: item.level === 'danger' ? '#dc2626' : '#ca8a04',
                      color: '#ffffff',
                    }}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel D: Fast Navigation Hub */}
        <div className="ci-dash-card">
          <div className="ci-dash-card-header">
            <div>
              <h3>Common Inventory Modules</h3>
              <p>Direct shortcuts to active inventory workflows</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link to="/inventory/products" className="ci-quick-link">
              <div>
                <div>📦 Products</div>
                <span style={{ fontSize: 11, color: '#64748b' }}>Formulations &amp; Packs</span>
              </div>
              <span>→</span>
            </Link>

            <Link to="/inventory/materials" className="ci-quick-link">
              <div>
                <div>🧪 Raw Materials</div>
                <span style={{ fontSize: 11, color: '#64748b' }}>APIs &amp; Excipients</span>
              </div>
              <span>→</span>
            </Link>

            <Link to="/inventory/orders" className="ci-quick-link">
              <div>
                <div>📋 Orders</div>
                <span style={{ fontSize: 11, color: '#64748b' }}>Allocation &amp; Stock</span>
              </div>
              <span>→</span>
            </Link>

            <Link to="/inventory/stock" className="ci-quick-link">
              <div>
                <div>🏢 Stock &amp; Lots</div>
                <span style={{ fontSize: 11, color: '#64748b' }}>Receipts &amp; Batches</span>
              </div>
              <span>→</span>
            </Link>

            <Link to="/inventory/issue-return" className="ci-quick-link">
              <div>
                <div>🔄 Issue / Return</div>
                <span style={{ fontSize: 11, color: '#64748b' }}>Production Floor Transfers</span>
              </div>
              <span>→</span>
            </Link>

            <Link to="/inventory/ledger" className="ci-quick-link">
              <div>
                <div>📑 Stock Ledger</div>
                <span style={{ fontSize: 11, color: '#64748b' }}>Dual Inward / Outward Register</span>
              </div>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}