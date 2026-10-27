import { useState, useMemo, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useLocation } from 'react-router-dom'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import {
  issueStock,
  returnStock,
  updateStockReturnStatus,
} from '../../../store/erpSlice'
import './IssueReturn.css'
import './CommonInventory.css'

const DEPARTMENTS = [
  'Production Line 1 (Solid Dosage)',
  'Granulation & Mixing Department',
  'Tableting & Compression Section',
  'Liquid & Syrup Formulation Section',
  'Packaging & Blistering Unit',
  'Quality Control Testing Lab',
  'R&D Formulation Laboratory',
  'Warehouse Staging & Outbound',
]

const RETURN_REASONS = [
  'Failed Quality Inspection / Assay Deviation',
  'Packaging Defect / Broken Seal / Damaged Pack',
  'Contamination / Foreign Particulate Matter',
  'Labeling Discrepancy / Missing Batch Print',
  'Physical Instability / Discoloration / Sediments',
  'Customer Rejection / Delivery Refusal',
  'Expired / Near-Expiry Material',
  'Other Quality Deviation / Vendor Recall',
]

export default function IssueReturnTab() {
  const dispatch = useDispatch()
  const location = useLocation()

  // Redux state
  const lots = useSelector((state) => state.erp?.lots || [])
  const orders = useSelector((state) => state.erp?.orders || [])
  const issueHistory = useSelector((state) => state.erp?.issueHistory || [])
  const stockReturns = useSelector((state) => state.erp?.stockReturns || [])
  const rawMaterials = useSelector((state) => state.erp?.commonRawMaterials || [])
  const products = useSelector((state) => state.erp?.commonProducts || [])

  // Navigation tab: 'issue' | 'return'
  const [activeTab, setActiveTab] = useState(
    location.state?.preselectTab === 'return' ? 'return' : 'issue'
  )

  // Messages
  const [issueError, setIssueError] = useState('')
  const [issueSuccess, setIssueSuccess] = useState('')
  const [returnError, setReturnError] = useState('')
  const [returnSuccess, setReturnSuccess] = useState('')

  // Detail Modal for a Return record
  const [selectedReturn, setSelectedReturn] = useState(null)

  /* =========================================================
     1. ISSUE FORM STATE
     ========================================================= */
  const [issueForm, setIssueForm] = useState({
    item_id: '',
    lot_id: '',
    quantity: '',
    issued_to_type: 'DEPARTMENT', // 'DEPARTMENT' | 'ORDER'
    department: DEPARTMENTS[0],
    order_id: '',
    date: new Date().toISOString().slice(0, 10),
    remarks: '',
  })

  // Prefill if passed via route state
  useEffect(() => {
    if (location.state?.preselectLot) {
      const pLot = location.state.preselectLot
      if (location.state.preselectTab === 'return') {
        setActiveTab('return')
        setReturnForm((prev) => ({
          ...prev,
          category: pLot.category || 'ALL',
          item_id: String(pLot.item_id || pLot.item || ''),
          lot_id: String(pLot.id),
        }))
      } else {
        setActiveTab('issue')
        setIssueForm((prev) => ({
          ...prev,
          item_id: String(pLot.item_id || pLot.item || ''),
          lot_id: String(pLot.id),
        }))
      }
    }
  }, [location.state])

  // Distinct items that currently have lots
  const availableItemsForIssue = useMemo(() => {
    const map = new Map()
    lots.forEach((l) => {
      const key = String(l.item_id || l.item)
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          code: l.item_code,
          name: l.item_name,
          category: l.category,
          item_type: l.item_type,
          uom: l.uom || l.uom_code,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [lots])

  // Lots available for the selected issue item
  const lotsForSelectedIssueItem = useMemo(() => {
    if (!issueForm.item_id) return []
    return lots.filter((l) => String(l.item_id || l.item) === String(issueForm.item_id))
  }, [lots, issueForm.item_id])

  // Selected lot object for Issue
  const currentIssueLot = useMemo(() => {
    if (!issueForm.lot_id) return null
    return lots.find((l) => String(l.id) === String(issueForm.lot_id)) || null
  }, [lots, issueForm.lot_id])

  // Open orders available for Issue
  const openOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      const st = String(o.status || '').toUpperCase()
      return !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(st)
    })
  }, [orders])

  // Handle Issue Form Submit
  const handleIssueSubmit = (e) => {
    e.preventDefault()
    setIssueError('')
    setIssueSuccess('')

    if (!issueForm.item_id || !issueForm.lot_id) {
      setIssueError('Please select an item and a lot.')
      return
    }

    const qty = Number(issueForm.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setIssueError('Quantity must be greater than zero.')
      return
    }

    if (!currentIssueLot) {
      setIssueError('Selected lot was not found.')
      return
    }

    const available = Number(currentIssueLot.available_quantity) || 0
    if (qty > available) {
      setIssueError(`Quantity exceeds available lot quantity (${available} ${currentIssueLot.uom || currentIssueLot.uom_code} available).`)
      return
    }

    let issuedToName = issueForm.department
    let orderId = null

    if (issueForm.issued_to_type === 'ORDER') {
      const matchedOrder = openOrders.find((o) => String(o.id) === String(issueForm.order_id))
      if (!matchedOrder) {
        setIssueError('Please select a valid open customer order.')
        return
      }
      issuedToName = `Order #${matchedOrder.number} (${matchedOrder.customer_name})`
      orderId = matchedOrder.id
    }

    dispatch(
      issueStock({
        lot_id: currentIssueLot.id,
        quantity: qty,
        issued_to_type: issueForm.issued_to_type,
        issued_to_name: issuedToName,
        order_id: orderId,
        date: issueForm.date,
        remarks: issueForm.remarks.trim(),
        issued_by: 'Demo User',
      })
    )

    setIssueSuccess(`Successfully issued ${qty} ${currentIssueLot.uom || currentIssueLot.uom_code} of ${currentIssueLot.item_name} (Lot #${currentIssueLot.lot_number}) to ${issuedToName}. Stock updated live.`)
    setIssueForm({
      item_id: '',
      lot_id: '',
      quantity: '',
      issued_to_type: 'DEPARTMENT',
      department: DEPARTMENTS[0],
      order_id: '',
      date: new Date().toISOString().slice(0, 10),
      remarks: '',
    })
  }

  /* =========================================================
     2. RETURN FORM STATE (With Enforced Return-To Rule)
     ========================================================= */
  const [returnForm, setReturnForm] = useState({
    category: 'ALL',
    item_id: '',
    lot_id: '',
    quantity: '',
    reason: RETURN_REASONS[0],
    reason_notes: '',
    date: new Date().toISOString().slice(0, 10),
  })

  // Dynamic categories for return dropdown
  const returnCategoryOptions = useMemo(() => {
    const set = new Set()
    lots.forEach((l) => {
      if (l.category && String(l.category).trim()) set.add(String(l.category).trim())
    })
    return Array.from(set).sort()
  }, [lots])

  // Items filtered by return category
  const availableItemsForReturn = useMemo(() => {
    const map = new Map()
    lots.forEach((l) => {
      if (returnForm.category !== 'ALL' && l.category !== returnForm.category) return
      const key = String(l.item_id || l.item)
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          code: l.item_code,
          name: l.item_name,
          category: l.category,
          item_type: l.item_type,
          uom: l.uom || l.uom_code,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [lots, returnForm.category])

  // Lots available for selected return item
  const lotsForSelectedReturnItem = useMemo(() => {
    if (!returnForm.item_id) return []
    return lots.filter((l) => String(l.item_id || l.item) === String(returnForm.item_id))
  }, [lots, returnForm.item_id])

  // Selected lot object for Return
  const currentReturnLot = useMemo(() => {
    if (!returnForm.lot_id) return null
    return lots.find((l) => String(l.id) === String(returnForm.lot_id)) || null
  }, [lots, returnForm.lot_id])

  /* =========================================================
     CORE BUSINESS RULE COMPUTATION
     - Medicines / finished goods: CAN ONLY be returned to the
       company that manufactured and supplied that lot (Tej Biocare or CMHP).
     - Raw materials: CAN ONLY be returned to the supplier.
     ========================================================= */
  const returnToPartyInfo = useMemo(() => {
    if (!currentReturnLot) {
      return {
        partyName: 'Select an item & lot first',
        label: 'Auto-determined upon lot selection',
        type: 'NONE',
        ruleNotice: 'The Return-To destination is locked and automatically enforced based on the lot\'s origin.',
        isLocked: true,
      }
    }

    const isMedicine = currentReturnLot.item_type === 'MEDICINE'

    if (isMedicine) {
      // Must return to manufacturing company (Tej Biocare / CMHP)
      const mfgName = currentReturnLot.source_company || 'Tej Biocare'
      return {
        partyName: mfgName,
        label: `${mfgName} (Manufacturer)`,
        type: 'MANUFACTURER',
        ruleNotice: `Finished Goods Policy: This lot was formulated & manufactured by ${mfgName}. Defective units can strictly only be returned to ${mfgName}.`,
        isLocked: true,
      }
    } else {
      // Must return to raw material supplier
      // Look up supplier from raw material record or lot
      const mat = rawMaterials.find((m) => String(m.id) === String(currentReturnLot.item_id || currentReturnLot.item) || m.code === currentReturnLot.item_code)
      const supplierName = currentReturnLot.supplier_name || currentReturnLot.source_company || mat?.supplier || 'Solchem Industries'
      return {
        partyName: supplierName,
        label: `${supplierName} (Supplier)`,
        type: 'SUPPLIER',
        ruleNotice: `Raw Material Policy: This raw material was procured from supplier ${supplierName}. Defective material can strictly only be returned to ${supplierName}.`,
        isLocked: true,
      }
    }
  }, [currentReturnLot, rawMaterials])

  // Handle Return Form Submit
  const handleReturnSubmit = (e) => {
    e.preventDefault()
    setReturnError('')
    setReturnSuccess('')

    if (!returnForm.item_id || !returnForm.lot_id) {
      setReturnError('Please select an item and a lot.')
      return
    }

    const qty = Number(returnForm.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setReturnError('Quantity must be greater than zero.')
      return
    }

    if (!currentReturnLot) {
      setReturnError('Selected lot was not found.')
      return
    }

    const available = Number(currentReturnLot.available_quantity) || 0
    if (qty > available) {
      setReturnError(`Quantity exceeds available lot quantity (${available} ${currentReturnLot.uom || currentReturnLot.uom_code} available).`)
      return
    }

    if (!returnForm.reason_notes.trim()) {
      setReturnError('Please provide detailed notes describing the defect or issue.')
      return
    }

    // Submit Return action
    dispatch(
      returnStock({
        lot_id: currentReturnLot.id,
        quantity: qty,
        return_to: returnToPartyInfo.partyName,
        return_to_label: returnToPartyInfo.label,
        return_to_type: returnToPartyInfo.type,
        reason: returnForm.reason,
        reason_notes: returnForm.reason_notes.trim(),
        date: returnForm.date,
        status: 'Raised',
        created_by: 'Demo User',
      })
    )

    setReturnSuccess(`Return record created for ${qty} ${currentReturnLot.uom || currentReturnLot.uom_code} of ${currentReturnLot.item_name} (Lot #${currentReturnLot.lot_number}). Return To locked as "${returnToPartyInfo.label}". Stock deducted live in Redux.`)
    setReturnForm({
      category: 'ALL',
      item_id: '',
      lot_id: '',
      quantity: '',
      reason: RETURN_REASONS[0],
      reason_notes: '',
      date: new Date().toISOString().slice(0, 10),
    })
  }

  /* =========================================================
     3. HISTORY TABLES FILTER & PAGINATION
     ========================================================= */
  // Issue History Filters
  const [issueSearch, setIssueSearch] = useState('')
  const [issuePage, setIssuePage] = useState(1)
  const [issuePageSize, setIssuePageSize] = useState(10)

  const filteredIssueHistory = useMemo(() => {
    return (issueHistory || []).filter((iss) => {
      if (!issueSearch.trim()) return true
      const q = issueSearch.toLowerCase().trim()
      const matchNum = String(iss.issue_number || '').toLowerCase().includes(q)
      const matchItem = String(iss.item_name || '').toLowerCase().includes(q)
      const matchLot = String(iss.lot_number || '').toLowerCase().includes(q)
      const matchTo = String(iss.issued_to_name || '').toLowerCase().includes(q)
      return matchNum || matchItem || matchLot || matchTo
    })
  }, [issueHistory, issueSearch])

  const paginatedIssueHistory = filteredIssueHistory.slice(
    (issuePage - 1) * issuePageSize,
    issuePage * issuePageSize
  )

  // Returns History Filters
  const [returnSearch, setReturnSearch] = useState('')
  const [returnCategoryFilter, setReturnCategoryFilter] = useState('ALL')
  const [returnStatusFilter, setReturnStatusFilter] = useState('ALL')
  const [returnPartyFilter, setReturnPartyFilter] = useState('ALL')
  const [returnPage, setReturnPage] = useState(1)
  const [returnPageSize, setReturnPageSize] = useState(10)

  const returnPartyOptions = useMemo(() => {
    const set = new Set()
    stockReturns.forEach((r) => {
      if (r.return_to && String(r.return_to).trim()) set.add(String(r.return_to).trim())
    })
    return Array.from(set).sort()
  }, [stockReturns])

  const filteredStockReturns = useMemo(() => {
    return (stockReturns || []).filter((ret) => {
      if (returnStatusFilter !== 'ALL' && ret.status !== returnStatusFilter) return false
      if (returnCategoryFilter !== 'ALL' && ret.category !== returnCategoryFilter) return false
      if (returnPartyFilter !== 'ALL' && ret.return_to !== returnPartyFilter) return false

      if (returnSearch.trim()) {
        const q = returnSearch.toLowerCase().trim()
        const matchNum = String(ret.return_number || '').toLowerCase().includes(q)
        const matchItem = String(ret.item_name || '').toLowerCase().includes(q)
        const matchLot = String(ret.lot_number || '').toLowerCase().includes(q)
        const matchParty = String(ret.return_to || '').toLowerCase().includes(q)
        const matchReason = String(ret.reason || '').toLowerCase().includes(q)
        if (!matchNum && !matchItem && !matchLot && !matchParty && !matchReason) return false
      }

      return true
    })
  }, [stockReturns, returnStatusFilter, returnCategoryFilter, returnPartyFilter, returnSearch])

  const paginatedStockReturns = filteredStockReturns.slice(
    (returnPage - 1) * returnPageSize,
    returnPage * returnPageSize
  )

  // Handle Return Status Progression: Raised -> Approved -> Dispatched -> Closed
  const advanceReturnStatus = (returnRecord, nextStatus) => {
    dispatch(
      updateStockReturnStatus({
        id: returnRecord.id,
        status: nextStatus,
        notes: `Advanced to ${nextStatus} by Demo User on ${new Date().toISOString().slice(0, 10)}`,
      })
    )
    if (selectedReturn && selectedReturn.id === returnRecord.id) {
      setSelectedReturn({ ...selectedReturn, status: nextStatus })
    }
  }

  return (
    <div className="ir-container">
      {/* 1. Header Toolbar */}
      <div className="ir-header">
        <div className="ir-header-titles">
          <h2>Inventory — Stock Issue &amp; Return</h2>
          <p>
            Controlled stock issuance against production departments and customer orders, and vendor-routed returns for defect management.
          </p>
        </div>
      </div>

      {/* 2. Top Mode Switcher Tabs */}
      <div className="ir-tabs-bar">
        <button
          type="button"
          className={`ir-tab-btn ${activeTab === 'issue' ? 'active' : ''}`}
          onClick={() => { setActiveTab('issue'); setIssueError(''); setIssueSuccess(''); }}
        >
          📤 Issue Stock <span className="ir-tab-count">{issueHistory.length}</span>
        </button>
        <button
          type="button"
          className={`ir-tab-btn ${activeTab === 'return' ? 'active' : ''}`}
          onClick={() => { setActiveTab('return'); setReturnError(''); setReturnSuccess(''); }}
        >
          ↩ Return Defective Goods <span className="ir-tab-count">{stockReturns.length}</span>
        </button>
      </div>

      {/* =========================================================
          TAB 1: ISSUE STOCK
          ========================================================= */}
      {activeTab === 'issue' && (
        <>
          {issueError && <Alert type="error" message={issueError} />}
          {issueSuccess && <Alert type="success" message={issueSuccess} />}

          {/* Issue Form Card */}
          <div className="ir-form-card">
            <div className="ir-form-header">
              <div>
                <h3>Issue Material or Finished Goods</h3>
                <p>Deduct stock from an approved lot against an internal department or confirmed customer order.</p>
              </div>
            </div>

            <form onSubmit={handleIssueSubmit}>
              <div className="ir-form-grid">
                {/* 1. Select Item */}
                <div className="ir-field-group">
                  <label className="ir-field-label">
                    Item / Material *
                  </label>
                  <select
                    className="company-input"
                    value={issueForm.item_id}
                    onChange={(e) => {
                      setIssueForm({ ...issueForm, item_id: e.target.value, lot_id: '' })
                    }}
                    required
                  >
                    <option value="">Select item…</option>
                    {availableItemsForIssue.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.code} — {it.name} ({it.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Select Lot */}
                <div className="ir-field-group">
                  <label className="ir-field-label">
                    Lot / Batch *
                    {currentIssueLot && (
                      <span className="ir-field-hint">
                        Avail: {Number(currentIssueLot.available_quantity).toLocaleString('en-IN')} {currentIssueLot.uom || currentIssueLot.uom_code}
                      </span>
                    )}
                  </label>
                  <select
                    className="company-input"
                    value={issueForm.lot_id}
                    onChange={(e) => setIssueForm({ ...issueForm, lot_id: e.target.value })}
                    disabled={!issueForm.item_id}
                    required
                  >
                    <option value="">Select lot / batch…</option>
                    {lotsForSelectedIssueItem.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lot_number} ({l.available_quantity} {l.uom || l.uom_code} avail — {l.source_company || l.supplier_name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Quantity to Issue */}
                <div className="ir-field-group">
                  <label className="ir-field-label">
                    Quantity to Issue *
                    {currentIssueLot && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Unit: {currentIssueLot.uom || currentIssueLot.uom_code}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max={currentIssueLot ? currentIssueLot.available_quantity : undefined}
                    placeholder="e.g. 100"
                    value={issueForm.quantity}
                    onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })}
                    className="company-input"
                    required
                  />
                </div>

                {/* 4. Issued-To Type (Toggle: Department vs Order) */}
                <div className="ir-field-group">
                  <label className="ir-field-label">Issued To Destination *</label>
                  <div className="ir-toggle-group">
                    <button
                      type="button"
                      className={`ir-toggle-btn ${issueForm.issued_to_type === 'DEPARTMENT' ? 'active' : ''}`}
                      onClick={() => setIssueForm({ ...issueForm, issued_to_type: 'DEPARTMENT' })}
                    >
                      🏢 Department
                    </button>
                    <button
                      type="button"
                      className={`ir-toggle-btn ${issueForm.issued_to_type === 'ORDER' ? 'active' : ''}`}
                      onClick={() => setIssueForm({ ...issueForm, issued_to_type: 'ORDER' })}
                    >
                      📋 Customer Order
                    </button>
                  </div>
                </div>

                {/* 5. Destination Selector */}
                {issueForm.issued_to_type === 'DEPARTMENT' ? (
                  <div className="ir-field-group">
                    <label className="ir-field-label">Department / Unit *</label>
                    <select
                      className="company-input"
                      value={issueForm.department}
                      onChange={(e) => setIssueForm({ ...issueForm, department: e.target.value })}
                      required
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="ir-field-group">
                    <label className="ir-field-label">Open Customer Order *</label>
                    <select
                      className="company-input"
                      value={issueForm.order_id}
                      onChange={(e) => setIssueForm({ ...issueForm, order_id: e.target.value })}
                      required
                    >
                      <option value="">Select order…</option>
                      {openOrders.map((ord) => (
                        <option key={ord.id} value={ord.id}>
                          #{ord.number} — {ord.customer_name} ({ord.quantity} {ord.uom || 'units'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 6. Issue Date */}
                <div className="ir-field-group">
                  <label className="ir-field-label">Issue Date *</label>
                  <input
                    type="date"
                    value={issueForm.date}
                    onChange={(e) => setIssueForm({ ...issueForm, date: e.target.value })}
                    className="company-input"
                    required
                  />
                </div>

                {/* 7. Remarks */}
                <div className="ir-field-group ir-field-full">
                  <label className="ir-field-label">Remarks / Purpose / Work Order Note</label>
                  <input
                    type="text"
                    placeholder="e.g. Dispatched for Batch PARA-502 wet granulation run"
                    value={issueForm.remarks}
                    onChange={(e) => setIssueForm({ ...issueForm, remarks: e.target.value })}
                    className="company-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!issueForm.item_id || !issueForm.lot_id || !issueForm.quantity}
                >
                  Confirm &amp; Issue Stock
                </Button>
              </div>
            </form>
          </div>

          {/* Issue History Table */}
          <div className="ir-history-card">
            <div className="ir-history-header">
              <div>
                <h3>Stock Issue History</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Audited register of material and finished goods issues deducted from warehouse lots.
                </p>
              </div>
              <input
                type="search"
                placeholder="Search issues by item, lot, recipient…"
                value={issueSearch}
                onChange={(e) => { setIssueSearch(e.target.value); setIssuePage(1); }}
                className="company-input"
                style={{ width: 280 }}
              />
            </div>

            <div className="ci-table-wrapper" style={{ maxHeight: 420 }}>
              <table className="ci-table">
                <thead>
                  <tr>
                    <th>Issue Ref #</th>
                    <th>Date</th>
                    <th>Item &amp; Category</th>
                    <th>Lot / Batch #</th>
                    <th>Quantity Issued</th>
                    <th>Issued To</th>
                    <th>Issued By</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedIssueHistory.map((iss) => (
                    <tr key={iss.id}>
                      <td style={{ fontWeight: 800, fontFamily: 'monospace', color: '#2563eb' }}>
                        {iss.issue_number}
                      </td>
                      <td>{iss.date}</td>
                      <td>
                        <strong>{iss.item_name}</strong>
                        <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                          {iss.category}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{iss.lot_number}</td>
                      <td style={{ fontWeight: 800 }}>
                        {iss.quantity} {iss.uom}
                      </td>
                      <td>
                        <span className="ci-badge ci-badge-neutral" style={{ fontSize: 11 }}>
                          {iss.issued_to_name}
                        </span>
                      </td>
                      <td>{iss.issued_by || 'Demo User'}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {iss.remarks || '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredIssueHistory.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                        No stock issues recorded matching this search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b', paddingTop: 8 }}>
              <span>Showing {paginatedIssueHistory.length} of {filteredIssueHistory.length} issues</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={issuePage <= 1}
                  onClick={() => setIssuePage((p) => p - 1)}
                  style={{ minHeight: 32, padding: '4px 12px' }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={issuePage >= Math.ceil(filteredIssueHistory.length / issuePageSize)}
                  onClick={() => setIssuePage((p) => p + 1)}
                  style={{ minHeight: 32, padding: '4px 12px' }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
          TAB 2: RETURN DEFECTIVE GOODS (Enforced Return-To Routing)
          ========================================================= */}
      {activeTab === 'return' && (
        <>
          {returnError && <Alert type="error" message={returnError} />}
          {returnSuccess && <Alert type="success" message={returnSuccess} />}

          {/* Return Form Card */}
          <div className="ir-form-card">
            <div className="ir-form-header">
              <div>
                <h3>Record Return of Defective Goods</h3>
                <p>Register returned goods due to quality deviations, physical defects, or supplier rejections.</p>
              </div>
            </div>

            {/* CORE BUSINESS RULE BANNER */}
            <div className="ir-rule-banner">
              <span className="ir-rule-icon">🔒</span>
              <div className="ir-rule-content">
                <span className="ir-rule-title">
                  Enforced Routing Rule: {returnToPartyInfo.label}
                </span>
                <span className="ir-rule-sub">
                  {returnToPartyInfo.ruleNotice}
                </span>
              </div>
            </div>

            <form onSubmit={handleReturnSubmit}>
              <div className="ir-form-grid">
                {/* 1. Category Filter */}
                <div className="ir-field-group">
                  <label className="ir-field-label">Category</label>
                  <select
                    className="company-input"
                    value={returnForm.category}
                    onChange={(e) => {
                      setReturnForm({ ...returnForm, category: e.target.value, item_id: '', lot_id: '' })
                    }}
                  >
                    <option value="ALL">All Categories</option>
                    {returnCategoryOptions.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Item Selector */}
                <div className="ir-field-group">
                  <label className="ir-field-label">Item / Material *</label>
                  <select
                    className="company-input"
                    value={returnForm.item_id}
                    onChange={(e) => {
                      setReturnForm({ ...returnForm, item_id: e.target.value, lot_id: '' })
                    }}
                    required
                  >
                    <option value="">Select item…</option>
                    {availableItemsForReturn.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.code} — {it.name} ({it.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Lot Selector */}
                <div className="ir-field-group">
                  <label className="ir-field-label">
                    Lot / Batch *
                    {currentReturnLot && (
                      <span className="ir-field-hint">
                        Avail: {Number(currentReturnLot.available_quantity).toLocaleString('en-IN')} {currentReturnLot.uom || currentReturnLot.uom_code}
                      </span>
                    )}
                  </label>
                  <select
                    className="company-input"
                    value={returnForm.lot_id}
                    onChange={(e) => setReturnForm({ ...returnForm, lot_id: e.target.value })}
                    disabled={!returnForm.item_id}
                    required
                  >
                    <option value="">Select lot / batch…</option>
                    {lotsForSelectedReturnItem.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lot_number} ({l.available_quantity} {l.uom || l.uom_code} avail — {l.source_company || l.supplier_name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Return Quantity */}
                <div className="ir-field-group">
                  <label className="ir-field-label">
                    Return Quantity *
                    {currentReturnLot && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Unit: {currentReturnLot.uom || currentReturnLot.uom_code}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max={currentReturnLot ? currentReturnLot.available_quantity : undefined}
                    placeholder="e.g. 50"
                    value={returnForm.quantity}
                    onChange={(e) => setReturnForm({ ...returnForm, quantity: e.target.value })}
                    className="company-input"
                    required
                  />
                </div>

                {/* 5. RETURN TO PARTY (LOCKED & AUTO-FILLED) */}
                <div className="ir-field-group">
                  <label className="ir-field-label">
                    Return To Party (Enforced &amp; Locked) 🔒
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={returnToPartyInfo.label}
                    className="company-input ir-locked-input"
                    title="This field is decided automatically based on the lot's manufacturer or supplier and cannot be changed by the user."
                  />
                </div>

                {/* 6. Return Date */}
                <div className="ir-field-group">
                  <label className="ir-field-label">Return Date *</label>
                  <input
                    type="date"
                    value={returnForm.date}
                    onChange={(e) => setReturnForm({ ...returnForm, date: e.target.value })}
                    className="company-input"
                    required
                  />
                </div>

                {/* 7. Return Reason */}
                <div className="ir-field-group ir-field-full">
                  <label className="ir-field-label">Defect / Return Reason *</label>
                  <select
                    className="company-input"
                    value={returnForm.reason}
                    onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                    required
                  >
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* 8. Detailed Notes */}
                <div className="ir-field-group ir-field-full">
                  <label className="ir-field-label">Detailed Notes &amp; Issue Description *</label>
                  <textarea
                    rows={3}
                    placeholder="Provide technical observations (e.g. Packaging seal breached, dark particulate contamination observed under 10x visual inspection, assay below USP specs)..."
                    value={returnForm.reason_notes}
                    onChange={(e) => setReturnForm({ ...returnForm, reason_notes: e.target.value })}
                    className="company-input"
                    style={{ height: 'auto', padding: '10px 12px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!returnForm.item_id || !returnForm.lot_id || !returnForm.quantity}
                >
                  Create Return Record
                </Button>
              </div>
            </form>
          </div>

          {/* Returns History Table */}
          <div className="ir-history-card">
            <div className="ir-history-header">
              <div>
                <h3>Returns History &amp; Workflow Tracking</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Lifecycle status: Raised → Approved → Dispatched → Closed.
                </p>
              </div>

              {/* Filters Bar */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="search"
                  placeholder="Search returns…"
                  value={returnSearch}
                  onChange={(e) => { setReturnSearch(e.target.value); setReturnPage(1); }}
                  className="company-input"
                  style={{ width: 180 }}
                />

                <select
                  value={returnStatusFilter}
                  onChange={(e) => { setReturnStatusFilter(e.target.value); setReturnPage(1); }}
                  className="company-input"
                  style={{ width: 140 }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Raised">Raised</option>
                  <option value="Approved">Approved</option>
                  <option value="Dispatched">Dispatched</option>
                  <option value="Closed">Closed</option>
                </select>

                <select
                  value={returnPartyFilter}
                  onChange={(e) => { setReturnPartyFilter(e.target.value); setReturnPage(1); }}
                  className="company-input"
                  style={{ width: 170 }}
                >
                  <option value="ALL">All Return Parties</option>
                  {returnPartyOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ci-table-wrapper" style={{ maxHeight: 420 }}>
              <table className="ci-table">
                <thead>
                  <tr>
                    <th>Return Ref #</th>
                    <th>Date</th>
                    <th>Item &amp; Category</th>
                    <th>Lot / Batch #</th>
                    <th>Returned Qty</th>
                    <th>Return To (Auto-Set)</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStockReturns.map((ret) => {
                    const statusClass =
                      ret.status === 'Raised'
                        ? 'ir-status-raised'
                        : ret.status === 'Approved'
                          ? 'ir-status-approved'
                          : ret.status === 'Dispatched'
                            ? 'ir-status-dispatched'
                            : 'ir-status-closed'

                    return (
                      <tr key={ret.id}>
                        <td style={{ fontWeight: 800, fontFamily: 'monospace', color: '#2563eb' }}>
                          {ret.return_number}
                        </td>
                        <td>{ret.date}</td>
                        <td>
                          <strong>{ret.item_name}</strong>
                          <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                            {ret.category}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>{ret.lot_number}</td>
                        <td style={{ fontWeight: 800 }}>
                          {ret.quantity} {ret.uom}
                        </td>
                        <td>
                          <span className="stocks-company-tag">
                            {ret.return_to_label || ret.return_to}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ret.reason}>
                          {ret.reason}
                        </td>
                        <td>
                          <span className={`ci-badge ${statusClass}`}>
                            {ret.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedReturn(ret)}
                              style={{ minHeight: 28, padding: '3px 9px', fontSize: 11 }}
                            >
                              Details
                            </Button>

                            {/* Status workflow triggers */}
                            {ret.status === 'Raised' && (
                              <Button
                                variant="primary"
                                onClick={() => advanceReturnStatus(ret, 'Approved')}
                                style={{ minHeight: 28, padding: '3px 9px', fontSize: 11 }}
                              >
                                Approve
                              </Button>
                            )}
                            {ret.status === 'Approved' && (
                              <Button
                                variant="primary"
                                onClick={() => advanceReturnStatus(ret, 'Dispatched')}
                                style={{ minHeight: 28, padding: '3px 9px', fontSize: 11 }}
                              >
                                Dispatch
                              </Button>
                            )}
                            {ret.status === 'Dispatched' && (
                              <Button
                                variant="primary"
                                onClick={() => advanceReturnStatus(ret, 'Closed')}
                                style={{ minHeight: 28, padding: '3px 9px', fontSize: 11 }}
                              >
                                Close
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredStockReturns.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                        No return records match your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b', paddingTop: 8 }}>
              <span>Showing {paginatedStockReturns.length} of {filteredStockReturns.length} returns</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={returnPage <= 1}
                  onClick={() => setReturnPage((p) => p - 1)}
                  style={{ minHeight: 32, padding: '4px 12px' }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={returnPage >= Math.ceil(filteredStockReturns.length / returnPageSize)}
                  onClick={() => setReturnPage((p) => p + 1)}
                  style={{ minHeight: 32, padding: '4px 12px' }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
          RETURN DETAIL MODAL
          ========================================================= */}
      {selectedReturn && (
        <Modal
          title={`Return Inspection Record — ${selectedReturn.return_number}`}
          onClose={() => setSelectedReturn(null)}
          maxWidth={640}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedReturn.status === 'Raised' && (
                  <Button
                    variant="primary"
                    onClick={() => advanceReturnStatus(selectedReturn, 'Approved')}
                  >
                    ✓ Approve Return
                  </Button>
                )}
                {selectedReturn.status === 'Approved' && (
                  <Button
                    variant="primary"
                    onClick={() => advanceReturnStatus(selectedReturn, 'Dispatched')}
                  >
                    🚚 Mark Dispatched to Vendor
                  </Button>
                )}
                {selectedReturn.status === 'Dispatched' && (
                  <Button
                    variant="primary"
                    onClick={() => advanceReturnStatus(selectedReturn, 'Closed')}
                  >
                    ✓ Complete &amp; Close Return
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={() => setSelectedReturn(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Rule Verification Callout */}
            <div className="ir-rule-banner" style={{ marginTop: 0 }}>
              <span className="ir-rule-icon">🔒</span>
              <div className="ir-rule-content">
                <span className="ir-rule-title">
                  Destination: {selectedReturn.return_to_label || selectedReturn.return_to}
                </span>
                <span className="ir-rule-sub">
                  {selectedReturn.item_type === 'MEDICINE'
                    ? 'Finished Goods Rule: Returned to manufacturing plant.'
                    : 'Raw Materials Rule: Returned to material supplier.'}
                </span>
              </div>
            </div>

            <div className="ir-detail-grid">
              <div className="ir-detail-block">
                <label>Item Name &amp; Code</label>
                <span>{selectedReturn.item_name} ({selectedReturn.item_code})</span>
              </div>

              <div className="ir-detail-block">
                <label>Lot / Batch Number</label>
                <span style={{ fontFamily: 'monospace' }}>{selectedReturn.lot_number}</span>
              </div>

              <div className="ir-detail-block">
                <label>Quantity Returned</label>
                <span style={{ color: '#dc2626' }}>{selectedReturn.quantity} {selectedReturn.uom}</span>
              </div>

              <div className="ir-detail-block">
                <label>Return Date</label>
                <span>{selectedReturn.date}</span>
              </div>

              <div className="ir-detail-block">
                <label>Workflow Status</label>
                <span>
                  <span className={`ci-badge ${
                    selectedReturn.status === 'Raised' ? 'ir-status-raised' :
                    selectedReturn.status === 'Approved' ? 'ir-status-approved' :
                    selectedReturn.status === 'Dispatched' ? 'ir-status-dispatched' : 'ir-status-closed'
                  }`}>
                    {selectedReturn.status}
                  </span>
                </span>
              </div>

              <div className="ir-detail-block">
                <label>Recorded By</label>
                <span>{selectedReturn.created_by || 'Demo User'}</span>
              </div>
            </div>

            <div className="ir-detail-block" style={{ gridColumn: '1 / -1' }}>
              <label>Reason Category</label>
              <span>{selectedReturn.reason}</span>
            </div>

            <div className="ir-detail-block" style={{ gridColumn: '1 / -1' }}>
              <label>Technical Defect Description &amp; Notes</label>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                {selectedReturn.reason_notes || 'No additional notes recorded.'}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}