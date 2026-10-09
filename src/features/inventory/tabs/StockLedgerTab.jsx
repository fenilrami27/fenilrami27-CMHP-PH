import { useState, useMemo, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Modal from '../components/Modal'
import {
  addStockLedgerEntry,
  setOpeningStockRecord,
  reverseStockLedgerEntry,
  adjustStockLedgerPhysical,
  addCommonRawMaterial,
} from '../../../store/erpSlice'
import { logAudit } from '../../../utils/audit'
import './StockLedger.css'

const FINANCIAL_YEARS = ['2026-27', '2025-26', '2024-25', '2027-28']

export default function StockLedgerTab() {
  const dispatch = useDispatch()
  const erpState = useSelector((state) => state.erp || {})
  const currentUser = useSelector((state) => state.auth?.user || {})

  // All available raw materials, common products & items in the store
  const commonRawMaterials = useSelector((state) => state.erp?.commonRawMaterials || [])
  const commonProducts = useSelector((state) => state.erp?.commonProducts || [])
  const registeredItems = useSelector((state) => state.erp?.items || [])
  const stockLedgerEntries = useSelector((state) => state.erp?.stockLedgerEntries || [])

  // Auto-fetched catalog combining all raw materials, chemicals & products
  const allItemsCatalog = useMemo(() => {
    const list = []
    const seen = new Set()

    // 1. Raw Materials & Chemicals
    commonRawMaterials.forEach((m) => {
      const key = String(m.code || m.id).toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push({
          id: m.id,
          code: m.code || `RM-${m.id}`,
          name: m.name,
          category: m.category || 'Raw Material',
          base_unit: m.uom || 'KG',
          pack_size: Number(m.pack_size) || 25,
          display_unit: m.display_unit || 'BAG',
          current_stock: Number(m.current_stock) || 0,
          reorder_level: Number(m.reorder_level) || 0,
          type: 'RAW_MATERIAL',
        })
      }
    })

    // 2. Common Products
    commonProducts.forEach((p) => {
      const key = String(p.code || p.id).toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push({
          id: p.id,
          code: p.code || `PRD-${p.id}`,
          name: p.name,
          category: p.category || 'Finished Product',
          base_unit: p.uom || 'KG',
          pack_size: Number(p.pack_size) || 25,
          display_unit: p.display_unit || 'BAG',
          current_stock: Number(p.current_stock) || 0,
          reorder_level: Number(p.reorder_level) || 0,
          type: 'FINISHED_GOODS',
        })
      }
    })

    // 3. Generic items if any
    registeredItems.forEach((i) => {
      const key = String(i.code || i.id).toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push({
          id: i.id,
          code: i.code || `ITM-${i.id}`,
          name: i.name,
          category: 'Chemical',
          base_unit: 'KG',
          pack_size: 25,
          display_unit: 'BAG',
          current_stock: Number(i.available_quantity) || 0,
          reorder_level: 0,
          type: 'RAW_MATERIAL',
        })
      }
    })

    return list.sort((a, b) => (a.code || '').localeCompare(b.code || ''))
  }, [commonRawMaterials, commonProducts, registeredItems])

  // Searchable Item Dropdown State
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false)
  const [itemSearchQuery, setItemSearchQuery] = useState('')
  const dropdownRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setItemDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search-filtered catalog for the dropdown
  const searchableCatalog = useMemo(() => {
    if (!itemSearchQuery.trim()) return allItemsCatalog
    const q = itemSearchQuery.trim().toLowerCase()
    return allItemsCatalog.filter((item) => {
      const code = (item.code || '').toLowerCase()
      const name = (item.name || '').toLowerCase()
      const cat = (item.category || '').toLowerCase()
      return code.includes(q) || name.includes(q) || cat.includes(q)
    })
  }, [allItemsCatalog, itemSearchQuery])

  // Selected Item State
  const [selectedItemKey, setSelectedItemKey] = useState('')

  // Set initial selected item if not set or if current selection not in list
  useEffect(() => {
    if (allItemsCatalog.length > 0) {
      const exists = allItemsCatalog.some((i) => String(i.id) === String(selectedItemKey))
      if (!exists) {
        setSelectedItemKey(String(allItemsCatalog[0].id))
      }
    } else {
      setSelectedItemKey('')
    }
  }, [allItemsCatalog, selectedItemKey])

  const activeItem = useMemo(() => {
    return allItemsCatalog.find((i) => String(i.id) === String(selectedItemKey)) || null
  }, [allItemsCatalog, selectedItemKey])

  // Financial Year & Date Range Filters
  const [financialYear, setFinancialYear] = useState('2026-27')
  const [searchFilter, setSearchFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Notifications
  const [notification, setNotification] = useState({ type: '', message: '' })

  // =========================================================
  // AUTO-FETCH LEDGER ENTRIES FOR ACTIVE ITEM & FY
  // =========================================================

  const itemEntries = useMemo(() => {
    if (!activeItem) return []
    return stockLedgerEntries.filter((e) => {
      const matchesItem =
        String(e.item_id) === String(activeItem.id) ||
        (e.item_code && String(e.item_code).toUpperCase() === String(activeItem.code).toUpperCase())
      const matchesFY = !e.financial_year || e.financial_year === financialYear
      return matchesItem && matchesFY
    })
  }, [stockLedgerEntries, activeItem, financialYear])

  // Opening Stock Entry (Row 1)
  const openingStockEntry = useMemo(() => {
    return (
      itemEntries.find((e) => e.type === 'OPENING' && !e.reversed) || {
        date: '01-04-2026',
        invoice_no: 'OPENING',
        supplier: 'STOCK',
        received_quantity: 0,
        no_of_containers: '0*25KG',
        price: '—',
        isDefaultEmpty: true,
      }
    )
  }, [itemEntries])

  // Inward Entries (excluding Opening)
  const inwardEntries = useMemo(() => {
    return itemEntries.filter((e) => e.type === 'INWARD')
  }, [itemEntries])

  // Outward Entries
  const outwardEntries = useMemo(() => {
    return itemEntries.filter((e) => e.type === 'OUTWARD')
  }, [itemEntries])

  // Filtered Inwards for display
  const displayedInwards = useMemo(() => {
    return inwardEntries.filter((e) => {
      if (startDate && e.date < startDate) return false
      if (endDate && e.date > endDate) return false
      if (searchFilter) {
        const q = searchFilter.toLowerCase()
        const inv = String(e.invoice_no || '').toLowerCase()
        const sup = String(e.supplier || '').toLowerCase()
        if (!inv.includes(q) && !sup.includes(q)) return false
      }
      return true
    })
  }, [inwardEntries, startDate, endDate, searchFilter])

  // Filtered Outwards for display
  const displayedOutwards = useMemo(() => {
    return outwardEntries.filter((e) => {
      if (startDate && e.date < startDate) return false
      if (endDate && e.date > endDate) return false
      if (searchFilter) {
        const q = searchFilter.toLowerCase()
        const batch = String(e.batch_no || '').toLowerCase()
        const prod = String(e.product_name || '').toLowerCase()
        if (!batch.includes(q) && !prod.includes(q)) return false
      }
      return true
    })
  }, [outwardEntries, startDate, endDate, searchFilter])

  // Calculate Running Balance & Summary Metrics
  const summaryMetrics = useMemo(() => {
    const openingQty = Number(openingStockEntry.received_quantity) || 0

    const totalInwardQty =
      openingQty +
      inwardEntries
        .filter((e) => !e.reversed)
        .reduce((sum, e) => sum + (Number(e.received_quantity) || 0), 0)

    const totalOutwardQty = outwardEntries
      .filter((e) => !e.reversed)
      .reduce((sum, e) => sum + (Number(e.issued_quantity) || 0), 0)

    const physicalBalance = totalInwardQty - totalOutwardQty

    const packSize = activeItem?.pack_size || 25
    const totalInwardBags = Math.round((totalInwardQty / packSize) * 10) / 10
    const totalOutwardBags = Math.round((totalOutwardQty / packSize) * 10) / 10
    const balanceBags = Math.round((physicalBalance / packSize) * 10) / 10

    return {
      openingQty,
      totalInwardQty,
      totalInwardBags,
      totalOutwardQty,
      totalOutwardBags,
      physicalBalance,
      balanceBags,
    }
  }, [openingStockEntry, inwardEntries, outwardEntries, activeItem])

  // Auto-fetched Suppliers from Store
  const autoFetchedSuppliers = useMemo(() => {
    const list = []
    const seen = new Set()
    const rawSup = [
      ...(erpState.byCompany?.cmhp?.suppliers || []),
      ...(erpState.byCompany?.tej?.suppliers || []),
      ...(erpState.suppliers || []),
    ]
    rawSup.forEach((s) => {
      const name = s.name || s.supplier_name
      if (name && !seen.has(name.toUpperCase())) {
        seen.add(name.toUpperCase())
        list.push(name)
      }
    })
    return list
  }, [erpState])

  // Auto-fetched Products from Store
  const autoFetchedProducts = useMemo(() => {
    const list = []
    const seen = new Set()
    const allProds = [
      ...(erpState.byCompany?.cmhp?.products || []),
      ...(erpState.byCompany?.tej?.products || []),
      ...(erpState.products || []),
      ...(erpState.commonProducts || []),
    ]
    allProds.forEach((p) => {
      const name = p.name || p.product_name
      if (name && !seen.has(name.toUpperCase())) {
        seen.add(name.toUpperCase())
        list.push(name)
      }
    })
    return list
  }, [erpState])

  // =========================================================
  // MODAL STATES
  // =========================================================

  const [inwardModalOpen, setInwardModalOpen] = useState(false)
  const [inwardForm, setInwardForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    invoice_no: '',
    supplier: '',
    received_quantity: '',
    price: '',
  })

  const [outwardModalOpen, setOutwardModalOpen] = useState(false)
  const [outwardForm, setOutwardForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    batch_no: '',
    product_name: '',
    issued_quantity: '',
    customRemark: '',
  })

  const [openingModalOpen, setOpeningModalOpen] = useState(false)
  const [openingForm, setOpeningForm] = useState({
    date: '2026-04-01',
    quantity: '',
  })

  const [auditModalOpen, setAuditModalOpen] = useState(false)
  const [auditForm, setAuditForm] = useState({
    physical_stock: '',
    reason: '',
  })

  const [newItemModalOpen, setNewItemModalOpen] = useState(false)
  const [newItemForm, setNewItemForm] = useState({
    code: '',
    name: '',
    category: 'Chemical',
    pack_size: 25,
    uom: 'KG',
    reorder_level: 100,
  })

  // =========================================================
  // INWARD HANDLERS
  // =========================================================

  const handleOpenInwardModal = () => {
    if (!activeItem) {
      setNotification({ type: 'error', message: 'Please select an item first.' })
      return
    }
    setInwardForm({
      date: new Date().toISOString().slice(0, 10),
      invoice_no: '',
      supplier: autoFetchedSuppliers[0] || 'NENSHI HEALTHCARE',
      received_quantity: '',
      price: '',
    })
    setInwardModalOpen(true)
  }

  // Auto-compute containers based on quantity & pack size
  const computedInwardContainers = useMemo(() => {
    const qty = Number(inwardForm.received_quantity) || 0
    const packSize = activeItem?.pack_size || 25
    if (qty <= 0) return ''
    const containers = Math.floor(qty / packSize)
    const remainder = qty % packSize
    if (remainder > 0) {
      return `${containers}*${packSize}KG + ${remainder}KG`
    }
    return `${containers}*${packSize}KG`
  }, [inwardForm.received_quantity, activeItem])

  const handleSaveInward = (e) => {
    e.preventDefault()
    const qty = Number(inwardForm.received_quantity)
    if (!qty || qty <= 0) {
      setNotification({ type: 'error', message: 'Please enter a valid received quantity.' })
      return
    }

    dispatch(
      addStockLedgerEntry({
        item_id: activeItem.id,
        item_code: activeItem.code,
        item_name: activeItem.name,
        type: 'INWARD',
        financial_year: financialYear,
        date: inwardForm.date,
        invoice_no: inwardForm.invoice_no.trim() || 'RECEIPT',
        supplier: inwardForm.supplier.trim() || 'SUPPLIER',
        received_quantity: qty,
        no_of_containers: computedInwardContainers,
        price: inwardForm.price ? `${inwardForm.price}/-` : '—',
        created_by: currentUser.username || 'Admin',
      })
    )

    logAudit({
      module: 'STOCK_LEDGER',
      action: 'INWARD_RECEIPT',
      entity_id: activeItem.code,
      details: `Received ${qty} KG (${computedInwardContainers}) of ${activeItem.name} via Inv #${inwardForm.invoice_no}`,
    })

    setNotification({
      type: 'success',
      message: `Inward of ${qty} KG (${computedInwardContainers}) recorded successfully.`,
    })
    setInwardModalOpen(false)
  }

  // =========================================================
  // OUTWARD HANDLERS
  // =========================================================

  const handleOpenOutwardModal = () => {
    if (!activeItem) {
      setNotification({ type: 'error', message: 'Please select an item first.' })
      return
    }
    setOutwardForm({
      date: new Date().toISOString().slice(0, 10),
      batch_no: '',
      product_name: autoFetchedProducts[0] || '',
      issued_quantity: '',
      customRemark: '',
    })
    setOutwardModalOpen(true)
  }

  // Auto-compute bag remark based on issued quantity
  const computedOutwardRemark = useMemo(() => {
    const qty = Number(outwardForm.issued_quantity) || 0
    const packSize = activeItem?.pack_size || 25
    if (qty <= 0) return ''
    const bags = Math.round((qty / packSize) * 10) / 10
    return `${bags} Bag`
  }, [outwardForm.issued_quantity, activeItem])

  const isOutwardExceedsBalance = useMemo(() => {
    const qty = Number(outwardForm.issued_quantity) || 0
    return qty > summaryMetrics.physicalBalance
  }, [outwardForm.issued_quantity, summaryMetrics.physicalBalance])

  const handleSaveOutward = (e) => {
    e.preventDefault()
    const qty = Number(outwardForm.issued_quantity)
    if (!qty || qty <= 0) {
      setNotification({ type: 'error', message: 'Please enter a valid issued quantity.' })
      return
    }

    if (qty > summaryMetrics.physicalBalance) {
      setNotification({
        type: 'error',
        message: `Validation Error: Cannot issue ${qty} KG. Available stock is only ${summaryMetrics.physicalBalance} KG!`,
      })
      return
    }

    const remarkText = outwardForm.customRemark.trim() || computedOutwardRemark

    dispatch(
      addStockLedgerEntry({
        item_id: activeItem.id,
        item_code: activeItem.code,
        item_name: activeItem.name,
        type: 'OUTWARD',
        financial_year: financialYear,
        date: outwardForm.date,
        batch_no: outwardForm.batch_no.trim() || 'NA',
        product_name: outwardForm.product_name.trim() || 'PRODUCTION',
        issued_quantity: qty,
        remark: remarkText,
        created_by: currentUser.username || 'Admin',
      })
    )

    logAudit({
      module: 'STOCK_LEDGER',
      action: 'OUTWARD_ISSUE',
      entity_id: activeItem.code,
      details: `Issued ${qty} KG (${remarkText}) of ${activeItem.name} to batch ${outwardForm.batch_no} for ${outwardForm.product_name}`,
    })

    setNotification({
      type: 'success',
      message: `Outward issue of ${qty} KG (${remarkText}) recorded successfully.`,
    })
    setOutwardModalOpen(false)
  }

  // =========================================================
  // OPENING STOCK HANDLER
  // =========================================================

  const handleOpenOpeningModal = () => {
    if (!activeItem) return
    const currentOpening = openingStockEntry.isDefaultEmpty
      ? ''
      : openingStockEntry.received_quantity
    setOpeningForm({
      date: '2026-04-01',
      quantity: String(currentOpening || ''),
    })
    setOpeningModalOpen(true)
  }

  const handleSaveOpeningStock = (e) => {
    e.preventDefault()
    const qty = Number(openingForm.quantity) || 0
    const packSize = activeItem?.pack_size || 25
    const containers = `${Math.floor(qty / packSize)}*${packSize}KG`

    dispatch(
      setOpeningStockRecord({
        item_id: activeItem.id,
        item_code: activeItem.code,
        item_name: activeItem.name,
        financial_year: financialYear,
        date: openingForm.date,
        quantity: qty,
        no_of_containers: containers,
      })
    )

    logAudit({
      module: 'STOCK_LEDGER',
      action: 'SET_OPENING_STOCK',
      entity_id: activeItem.code,
      details: `Set Opening Stock for ${activeItem.name} (${financialYear}) to ${qty} KG (${containers})`,
    })

    setNotification({
      type: 'success',
      message: `Opening stock of ${qty} KG set for Financial Year ${financialYear}.`,
    })
    setOpeningModalOpen(false)
  }

  // =========================================================
  // PHYSICAL VERIFICATION AUDIT
  // =========================================================

  const handleSaveAudit = (e) => {
    e.preventDefault()
    const phys = Number(auditForm.physical_stock)
    if (isNaN(phys) || phys < 0) {
      setNotification({ type: 'error', message: 'Please enter a valid physical stock quantity.' })
      return
    }

    const variance = phys - summaryMetrics.physicalBalance

    dispatch(
      adjustStockLedgerPhysical({
        item_id: activeItem.id,
        item_code: activeItem.code,
        item_name: activeItem.name,
        financial_year: financialYear,
        date: new Date().toISOString().slice(0, 10),
        physical_stock: phys,
        system_stock: summaryMetrics.physicalBalance,
        variance,
        reason: auditForm.reason.trim() || 'Physical stock reconciliation audit',
      })
    )

    logAudit({
      module: 'STOCK_LEDGER',
      action: 'PHYSICAL_STOCK_ADJUSTMENT',
      entity_id: activeItem.code,
      details: `Reconciled physical stock of ${activeItem.name}: System ${summaryMetrics.physicalBalance} KG -> Counted ${phys} KG (Variance: ${variance} KG)`,
    })

    setNotification({
      type: 'success',
      message: `Physical audit recorded: Stock updated to ${phys} KG (Variance: ${variance} KG).`,
    })
    setAuditModalOpen(false)
  }

  // =========================================================
  // REVERSE ENTRY
  // =========================================================

  const handleReverseEntry = (entry) => {
    const reason = window.prompt(
      `Confirm reversal of ${entry.type} entry (${entry.received_quantity || entry.issued_quantity} KG)?\nEnter reason:`
    )
    if (!reason) return

    dispatch(
      reverseStockLedgerEntry({
        id: entry.id,
        reason,
      })
    )

    logAudit({
      module: 'STOCK_LEDGER',
      action: 'REVERSE_ENTRY',
      entity_id: activeItem.code,
      details: `Reversed ${entry.type} entry ID ${entry.id}: ${reason}`,
    })

    setNotification({
      type: 'success',
      message: `Entry reversed successfully. Stock balance adjusted.`,
    })
  }

  // =========================================================
  // QUICK ADD NEW MATERIAL / CHEMICAL
  // =========================================================

  const handleSaveNewItem = (e) => {
    e.preventDefault()
    if (!newItemForm.code.trim() || !newItemForm.name.trim()) {
      setNotification({ type: 'error', message: 'Item Code and Name are required.' })
      return
    }

    const newId = Date.now()
    dispatch(
      addCommonRawMaterial({
        id: newId,
        code: newItemForm.code.trim().toUpperCase(),
        name: newItemForm.name.trim(),
        category: newItemForm.category,
        pack_size: Number(newItemForm.pack_size) || 25,
        display_unit: 'BAG',
        uom: newItemForm.uom || 'KG',
        reorder_level: Number(newItemForm.reorder_level) || 0,
        current_stock: 0,
      })
    )

    setSelectedItemKey(String(newId))
    setNewItemModalOpen(false)
    setNotification({
      type: 'success',
      message: `Chemical/Material "${newItemForm.name}" registered successfully.`,
    })
  }

  // =========================================================
  // EXCEL EXPORT (EXACT SHEET FORMAT)
  // =========================================================

  const handleExportExcel = () => {
    if (!activeItem) return

    let csv = `J TO R CHEMICAL STOCK ${financialYear}\n`
    csv += `ITEM NO,${activeItem.code},ITEM NAME,${activeItem.name},UNIT,${activeItem.display_unit} (1 ${activeItem.display_unit} = ${activeItem.pack_size} ${activeItem.base_unit})\n\n`
    csv += `INWARD,,,,,,OUTWARD,,,,,PHYSICAL GM\n`
    csv += `DATE,INVOICE NO,SUPPLIER,RECEIVED QUANTITY,NO OF CONTAINERS,PRICE,DATE,BATCH NO,NAME OF PRODUCT,ISSUED QUANTITY,REMARK,TOTAL INWARD,TOTAL OUTWARD,BALANCE\n`

    // Opening row
    csv += `${openingStockEntry.date},${openingStockEntry.invoice_no},${openingStockEntry.supplier},${openingStockEntry.received_quantity},${openingStockEntry.no_of_containers},${openingStockEntry.price || '—'},,,,,,,,\n`

    // Max rows between inwards and outwards
    const maxRows = Math.max(displayedInwards.length, displayedOutwards.length)
    for (let i = 0; i < maxRows; i++) {
      const inRow = displayedInwards[i] || {}
      const outRow = displayedOutwards[i] || {}

      const inDate = inRow.date || ''
      const inInv = inRow.invoice_no || ''
      const inSup = inRow.supplier || ''
      const inQty = inRow.received_quantity || ''
      const inCont = inRow.no_of_containers || ''
      const inPrice = inRow.price || ''

      const outDate = outRow.date || ''
      const outBatch = outRow.batch_no || ''
      const outProd = outRow.product_name || ''
      const outQty = outRow.issued_quantity || ''
      const outRemark = outRow.remark || ''

      const totIn = i === 0 ? summaryMetrics.totalInwardQty : ''
      const totOut = i === 1 ? summaryMetrics.totalOutwardQty : ''
      const bal = i === 2 ? summaryMetrics.physicalBalance : ''

      csv += `"${inDate}","${inInv}","${inSup}","${inQty}","${inCont}","${inPrice}","${outDate}","${outBatch}","${outProd}","${outQty}","${outRemark}","${totIn}","${totOut}","${bal}"\n`
    }

    csv += `\nTOTAL INWARD,${summaryMetrics.totalInwardQty} KG (${summaryMetrics.totalInwardBags} Bags),TOTAL OUTWARD,${summaryMetrics.totalOutwardQty} KG (${summaryMetrics.totalOutwardBags} Bags),PHYSICAL BALANCE,${summaryMetrics.physicalBalance} KG (${summaryMetrics.balanceBags} Bags)\n`

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${activeItem.code}_Stock_Ledger_${financialYear}.csv`
    link.click()
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="stock-ledger-wrap">
      {/* 1. Notifications */}
      {notification.message && (
        <Alert type={notification.type}>{notification.message}</Alert>
      )}

      {/* 2. Filter & Action Toolbar */}
      <div className="stock-toolbar">
        <div className="stock-toolbar-left">
          {/* Searchable Chemical / Material Dropdown Combobox */}
          <div className="stock-searchable-select-wrap" ref={dropdownRef}>
            <button
              type="button"
              className={`stock-select-trigger ${itemDropdownOpen ? 'open' : ''}`}
              onClick={() => setItemDropdownOpen((prev) => !prev)}
            >
              <div className="stock-trigger-content">
                {activeItem ? (
                  <>
                    <span className="stock-trigger-code">{activeItem.code}</span>
                    <span className="stock-trigger-name">{activeItem.name}</span>
                    <span className="stock-trigger-sub">
                      (1 {activeItem.display_unit} = {activeItem.pack_size} {activeItem.base_unit})
                    </span>
                  </>
                ) : (
                  <span className="stock-trigger-placeholder">Select Chemical / Material...</span>
                )}
              </div>
              <span className="stock-trigger-arrow">{itemDropdownOpen ? '▴' : '▾'}</span>
            </button>

            {itemDropdownOpen && (
              <div className="stock-select-dropdown">
                <div className="stock-select-search-box">
                  <span className="stock-search-icon">🔍</span>
                  <input
                    type="text"
                    className="stock-select-search-input"
                    placeholder="Search chemical name, code (e.g. CL01, Lactose)..."
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  {itemSearchQuery && (
                    <button
                      type="button"
                      className="stock-search-clear-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setItemSearchQuery('')
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="stock-select-options-list">
                  {searchableCatalog.length === 0 ? (
                    <div className="stock-select-no-results">
                      <span>No matching items found for "{itemSearchQuery}"</span>
                      <button
                        type="button"
                        className="stock-select-create-btn"
                        onClick={() => {
                          setItemDropdownOpen(false)
                          setNewItemForm((prev) => ({ ...prev, name: itemSearchQuery }))
                          setNewItemModalOpen(true)
                        }}
                      >
                        + Register "{itemSearchQuery}"
                      </button>
                    </div>
                  ) : (
                    searchableCatalog.map((item) => (
                      <div
                        key={item.id}
                        className={`stock-select-option ${String(item.id) === String(selectedItemKey) ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedItemKey(String(item.id))
                          setItemDropdownOpen(false)
                          setItemSearchQuery('')
                        }}
                      >
                        <span className="stock-option-code">{item.code}</span>
                        <div className="stock-option-info">
                          <span className="stock-option-name">{item.name}</span>
                          <span className="stock-option-meta">
                            1 {item.display_unit} = {item.pack_size} {item.base_unit} &middot; {item.category}
                          </span>
                        </div>
                        {String(item.id) === String(selectedItemKey) && (
                          <span className="stock-option-check">✓</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

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
              onChange={(e) => setStartDate(e.target.value)}
              title="From Date"
            />
            <span style={{ color: '#94a3b8' }}>–</span>
            <input
              type="date"
              className="company-input"
              style={{ width: 130, height: 40 }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="To Date"
            />
          </div>

          {/* Search Input */}
          <input
            type="text"
            className="company-input"
            style={{ width: 170, height: 40 }}
            placeholder="Search invoice, batch, product..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>

        {/* Action Buttons */}
        <div className="stock-toolbar-right">
          <button
            type="button"
            className="stock-btn-action stock-btn-inward"
            onClick={handleOpenInwardModal}
            disabled={!activeItem}
          >
            + Inward Stock
          </button>

          <button
            type="button"
            className="stock-btn-action stock-btn-outward"
            onClick={handleOpenOutwardModal}
            disabled={!activeItem}
          >
            + Issue Outward
          </button>

          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={handleOpenOpeningModal}
            disabled={!activeItem}
          >
            Opening Stock
          </button>

          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={() => {
              if (!activeItem) return
              setAuditForm({ physical_stock: String(summaryMetrics.physicalBalance), reason: '' })
              setAuditModalOpen(true)
            }}
            disabled={!activeItem}
          >
            Physical Audit
          </button>

          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={handleExportExcel}
            disabled={!activeItem}
            title="Download CSV workbook matching client sheet"
          >
            📥 Export Excel
          </button>

          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={() => setNewItemModalOpen(true)}
          >
            + Register Chemical
          </button>
        </div>
      </div>

      {/* 5. Item Definition Header & Physical Stock Summary Dock */}
      {activeItem ? (
        <div className="stock-header-card">
          <div className="stock-item-info">
            <div className="stock-item-badge">{activeItem.code}</div>
            <div className="stock-item-details">
              <h2>{activeItem.name}</h2>
              <div className="stock-item-meta">
                <span className="stock-item-tag">📦 1 {activeItem.display_unit} = {activeItem.pack_size} {activeItem.base_unit}</span>
                <span className="stock-item-tag">🏷️ {activeItem.category}</span>
                <span className="stock-item-tag">📅 Active FY: {financialYear}</span>
                {summaryMetrics.physicalBalance <= activeItem.reorder_level && (
                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12 }}>
                    ⚠️ Below Reorder Level ({activeItem.reorder_level} {activeItem.base_unit})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Yellow Physical Stock Summary Dock (Replicating Excel Column M) */}
          <div className="stock-summary-dock">
            <div className="stock-summary-stat">
              <span className="lbl">Total Inward</span>
              <span className="val" style={{ color: '#047857' }}>
                {summaryMetrics.totalInwardQty.toLocaleString()} {activeItem.base_unit}
              </span>
              <span className="sub">{summaryMetrics.totalInwardBags} Bags</span>
            </div>

            <div className="stock-summary-divider" />

            <div className="stock-summary-stat">
              <span className="lbl">Total Outward</span>
              <span className="val" style={{ color: '#c2410c' }}>
                {summaryMetrics.totalOutwardQty.toLocaleString()} {activeItem.base_unit}
              </span>
              <span className="sub">{summaryMetrics.totalOutwardBags} Bags</span>
            </div>

            <div className="stock-summary-divider" />

            <div className="stock-summary-stat">
              <span className="lbl">Physical Stock</span>
              <span className="val" style={{ color: summaryMetrics.physicalBalance < 0 ? '#dc2626' : '#713f12' }}>
                {summaryMetrics.physicalBalance.toLocaleString()} {activeItem.base_unit}
              </span>
              <span className="sub">{summaryMetrics.balanceBags} Bags</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="stock-section-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 15, margin: '0 0 16px' }}>
            No chemical or raw material selected. Select an item or register a new one.
          </p>
          <Button variant="primary" onClick={() => setNewItemModalOpen(true)}>
            + Register Chemical / Material
          </Button>
        </div>
      )}

      {/* 6. Side-by-Side Dual Ledger (50% Inward | 50% Outward) */}
      {activeItem && (
        <div className="stock-dual-grid">
          {/* =========================================================
              LEFT HALF: INWARD REGISTER (GREEN THEME)
              ========================================================= */}
          <div className="stock-section-card stock-card-inward">
            <div className="stock-header-inward">
              <h3>
                <span>📥</span> INWARD (Receipts &amp; Opening)
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                {displayedInwards.length + 1} Entries
              </span>
            </div>

            <div className="stock-table-wrapper">
              <table className="stock-ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice No</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Received Qty ({activeItem.base_unit})</th>
                    <th>Containers</th>
                    <th style={{ textAlign: 'right' }}>Price ({activeItem.base_unit})</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1: OPENING STOCK AS ON 01-04 */}
                  <tr className="row-opening-stock">
                    <td>{openingStockEntry.date}</td>
                    <td>
                      <span className="stock-tag-opening">OPENING</span>
                    </td>
                    <td>{openingStockEntry.supplier}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                      {Number(openingStockEntry.received_quantity).toLocaleString()}{' '}
                      {activeItem.base_unit}
                    </td>
                    <td>{openingStockEntry.no_of_containers || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{openingStockEntry.price || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="stock-row-btn"
                        onClick={handleOpenOpeningModal}
                        title="Edit Opening Stock"
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>

                  {/* INWARD TRANSACTIONS */}
                  {displayedInwards.map((entry) => (
                    <tr key={entry.id} className={entry.reversed ? 'row-reversed' : ''}>
                      <td>{entry.date}</td>
                      <td style={{ fontWeight: 700 }}>{entry.invoice_no}</td>
                      <td>{entry.supplier}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                        {Number(entry.received_quantity).toLocaleString()} {activeItem.base_unit}
                      </td>
                      <td>{entry.no_of_containers}</td>
                      <td style={{ textAlign: 'right' }}>{entry.price || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {!entry.reversed && (
                          <button
                            type="button"
                            className="stock-row-btn"
                            onClick={() => handleReverseEntry(entry)}
                            title="Reverse Entry"
                          >
                            ✕
                          </button>
                        )}
                        {entry.reversed && (
                          <span style={{ fontSize: 10, color: '#dc2626' }}>Reversed</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {displayedInwards.length === 0 && (
                    <tr>
                      <td colSpan={7} className="stock-empty-pane">
                        No additional inward shipments recorded for FY {financialYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="stock-ledger-footer">
              <span>Total Inward (Inc. Opening):</span>
              <span>
                {summaryMetrics.totalInwardQty.toLocaleString()} {activeItem.base_unit} (
                {summaryMetrics.totalInwardBags} Bags)
              </span>
            </div>
          </div>

          {/* =========================================================
              RIGHT HALF: OUTWARD REGISTER (ORANGE THEME)
              ========================================================= */}
          <div className="stock-section-card stock-card-outward">
            <div className="stock-header-outward">
              <h3>
                <span>📤</span> OUTWARD (Issue to Production)
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9a3412' }}>
                {displayedOutwards.length} Entries
              </span>
            </div>

            <div className="stock-table-wrapper">
              <table className="stock-ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch No</th>
                    <th>Name of Product</th>
                    <th style={{ textAlign: 'right' }}>Issued Qty ({activeItem.base_unit})</th>
                    <th>Remark</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOutwards.map((entry) => (
                    <tr key={entry.id} className={entry.reversed ? 'row-reversed' : ''}>
                      <td>{entry.date}</td>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                        {entry.batch_no || 'NA'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{entry.product_name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>
                        {Number(entry.issued_quantity).toLocaleString()} {activeItem.base_unit}
                      </td>
                      <td>{entry.remark}</td>
                      <td style={{ textAlign: 'center' }}>
                        {!entry.reversed && (
                          <button
                            type="button"
                            className="stock-row-btn"
                            onClick={() => handleReverseEntry(entry)}
                            title="Reverse Entry"
                          >
                            ✕
                          </button>
                        )}
                        {entry.reversed && (
                          <span style={{ fontSize: 10, color: '#dc2626' }}>Reversed</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {displayedOutwards.length === 0 && (
                    <tr>
                      <td colSpan={6} className="stock-empty-pane">
                        No outward issues recorded for FY {financialYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="stock-ledger-footer">
              <span>Total Outward:</span>
              <span>
                {summaryMetrics.totalOutwardQty.toLocaleString()} {activeItem.base_unit} (
                {summaryMetrics.totalOutwardBags} Bags)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1: ADD INWARD STOCK
          ========================================================= */}
      {inwardModalOpen && activeItem && (
        <Modal
          title={`+ Add Inward Stock: ${activeItem.code} — ${activeItem.name}`}
          isOpen={inwardModalOpen}
          onClose={() => setInwardModalOpen(false)}
        >
          <form onSubmit={handleSaveInward}>
            <div className="stock-form-grid">
              <div className="field">
                <label className="field-label">Receipt Date *</label>
                <input
                  type="date"
                  className="field-input"
                  value={inwardForm.date}
                  onChange={(e) => setInwardForm({ ...inwardForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Invoice No *</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. T0826"
                  value={inwardForm.invoice_no}
                  onChange={(e) => setInwardForm({ ...inwardForm, invoice_no: e.target.value })}
                  required
                />
              </div>

              <div className="field stock-form-full">
                <label className="field-label">Supplier / Vendor *</label>
                <input
                  type="text"
                  list="supplier-options"
                  className="field-input"
                  placeholder="Select or enter supplier name..."
                  value={inwardForm.supplier}
                  onChange={(e) => setInwardForm({ ...inwardForm, supplier: e.target.value })}
                  required
                />
                <datalist id="supplier-options">
                  {autoFetchedSuppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label className="field-label">Received Quantity ({activeItem.base_unit}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="field-input"
                  placeholder="e.g. 225"
                  value={inwardForm.received_quantity}
                  onChange={(e) =>
                    setInwardForm({ ...inwardForm, received_quantity: e.target.value })
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Price per {activeItem.base_unit} (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="field-input"
                  placeholder="e.g. 270"
                  value={inwardForm.price}
                  onChange={(e) => setInwardForm({ ...inwardForm, price: e.target.value })}
                />
              </div>

              {/* Auto-Computed Containers Box */}
              <div className="stock-computed-box stock-form-full">
                <span>
                  Auto-Computed Containers (Pack Size: {activeItem.pack_size}{' '}
                  {activeItem.base_unit}):
                </span>
                <strong>{computedInwardContainers || 'Enter quantity above'}</strong>
              </div>

              {inwardForm.price && inwardForm.received_quantity && (
                <div className="stock-computed-box stock-form-full">
                  <span>Total Shipment Invoiced Value:</span>
                  <strong>
                    ₹
                    {(
                      Number(inwardForm.received_quantity) * Number(inwardForm.price)
                    ).toLocaleString('en-IN')}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setInwardModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Confirm Inward Receipt
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================
          MODAL 2: ADD OUTWARD ISSUE
          ========================================================= */}
      {outwardModalOpen && activeItem && (
        <Modal
          title={`+ Issue Material Outward: ${activeItem.code} — ${activeItem.name}`}
          isOpen={outwardModalOpen}
          onClose={() => setOutwardModalOpen(false)}
        >
          <form onSubmit={handleSaveOutward}>
            {/* Warning if exceeds stock */}
            {isOutwardExceedsBalance && (
              <div className="stock-alert-insufficient">
                <span>⚠️</span>
                <span>
                  Entered quantity exceeds available balance of {summaryMetrics.physicalBalance}{' '}
                  {activeItem.base_unit}! Cannot issue negative stock.
                </span>
              </div>
            )}

            <div className="stock-form-grid">
              <div className="field">
                <label className="field-label">Issue Date *</label>
                <input
                  type="date"
                  className="field-input"
                  value={outwardForm.date}
                  onChange={(e) => setOutwardForm({ ...outwardForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Production Batch No</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. GH2609 or NA"
                  value={outwardForm.batch_no}
                  onChange={(e) => setOutwardForm({ ...outwardForm, batch_no: e.target.value })}
                />
              </div>

              <div className="field stock-form-full">
                <label className="field-label">Name of Product / Formulation *</label>
                <input
                  type="text"
                  list="product-options"
                  className="field-input"
                  placeholder="Select product or type formulation name..."
                  value={outwardForm.product_name}
                  onChange={(e) => setOutwardForm({ ...outwardForm, product_name: e.target.value })}
                  required
                />
                <datalist id="product-options">
                  {autoFetchedProducts.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label className="field-label">Issued Quantity ({activeItem.base_unit}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={summaryMetrics.physicalBalance}
                  className="field-input"
                  placeholder="e.g. 75"
                  value={outwardForm.issued_quantity}
                  onChange={(e) =>
                    setOutwardForm({ ...outwardForm, issued_quantity: e.target.value })
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Available Physical Stock</label>
                <input
                  type="text"
                  className="field-input"
                  value={`${summaryMetrics.physicalBalance} ${activeItem.base_unit} (${summaryMetrics.balanceBags} Bags)`}
                  disabled
                  style={{ background: '#f8fafc', color: '#047857', fontWeight: 800 }}
                />
              </div>

              {/* Auto-Computed Bags Remark */}
              <div className="stock-computed-box stock-form-full">
                <span>Auto-Computed Bags Remark:</span>
                <strong>{computedOutwardRemark || 'Enter quantity above'}</strong>
              </div>

              <div className="field stock-form-full">
                <label className="field-label">Custom Remark Note (Optional override)</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder={computedOutwardRemark || 'e.g. 3 Bag'}
                  value={outwardForm.customRemark}
                  onChange={(e) =>
                    setOutwardForm({ ...outwardForm, customRemark: e.target.value })
                  }
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setOutwardModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isOutwardExceedsBalance}>
                Confirm Outward Issue
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================
          MODAL 3: OPENING STOCK
          ========================================================= */}
      {openingModalOpen && activeItem && (
        <Modal
          title={`Set Opening Stock (01-April) — FY ${financialYear}`}
          isOpen={openingModalOpen}
          onClose={() => setOpeningModalOpen(false)}
        >
          <form onSubmit={handleSaveOpeningStock}>
            <div className="stock-form-grid">
              <div className="field">
                <label className="field-label">Effective Date *</label>
                <input
                  type="date"
                  className="field-input"
                  value={openingForm.date}
                  onChange={(e) => setOpeningForm({ ...openingForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Opening Quantity ({activeItem.base_unit}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="field-input"
                  placeholder="e.g. 425"
                  value={openingForm.quantity}
                  onChange={(e) => setOpeningForm({ ...openingForm, quantity: e.target.value })}
                  required
                />
              </div>

              <div className="stock-computed-box stock-form-full">
                <span>Calculated Containers:</span>
                <strong>
                  {openingForm.quantity
                    ? `${Math.floor(Number(openingForm.quantity) / (activeItem.pack_size || 25))}*${activeItem.pack_size || 25}KG (${Math.round((Number(openingForm.quantity) / (activeItem.pack_size || 25)) * 10) / 10} Bags)`
                    : '—'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setOpeningModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Opening Stock
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================
          MODAL 4: PHYSICAL AUDIT & VERIFICATION
          ========================================================= */}
      {auditModalOpen && activeItem && (
        <Modal
          title={`Physical Stock Audit & Verification: ${activeItem.code}`}
          isOpen={auditModalOpen}
          onClose={() => setAuditModalOpen(false)}
        >
          <form onSubmit={handleSaveAudit}>
            <div className="stock-form-grid">
              <div className="field">
                <label className="field-label">System Book Stock</label>
                <input
                  type="text"
                  className="field-input"
                  value={`${summaryMetrics.physicalBalance} ${activeItem.base_unit}`}
                  disabled
                />
              </div>

              <div className="field">
                <label className="field-label">Physical Counted Stock ({activeItem.base_unit}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="field-input"
                  value={auditForm.physical_stock}
                  onChange={(e) =>
                    setAuditForm({ ...auditForm, physical_stock: e.target.value })
                  }
                  required
                />
              </div>

              <div className="stock-computed-box stock-form-full">
                <span>Calculated Stock Variance:</span>
                <strong
                  style={{
                    color:
                      Number(auditForm.physical_stock) - summaryMetrics.physicalBalance < 0
                        ? '#dc2626'
                        : '#047857',
                  }}
                >
                  {(
                    Number(auditForm.physical_stock || 0) - summaryMetrics.physicalBalance
                  ).toFixed(2)}{' '}
                  {activeItem.base_unit}
                </strong>
              </div>

              <div className="field stock-form-full">
                <label className="field-label">Audit / Reconciliation Note *</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. Annual stock audit reconciliation by QA"
                  value={auditForm.reason}
                  onChange={(e) => setAuditForm({ ...auditForm, reason: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setAuditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save &amp; Reconcile
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================
          MODAL 5: QUICK REGISTER CHEMICAL / MATERIAL
          ========================================================= */}
      {newItemModalOpen && (
        <Modal
          title="+ Register New Chemical / Raw Material"
          isOpen={newItemModalOpen}
          onClose={() => setNewItemModalOpen(false)}
        >
          <form onSubmit={handleSaveNewItem}>
            <div className="stock-form-grid">
              <div className="field">
                <label className="field-label">Item Code *</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. CL01"
                  value={newItemForm.code}
                  onChange={(e) => setNewItemForm({ ...newItemForm, code: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Category</label>
                <select
                  className="field-input"
                  value={newItemForm.category}
                  onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })}
                >
                  <option value="Chemical">Chemical</option>
                  <option value="Active API">Active API</option>
                  <option value="Excipient">Excipient</option>
                  <option value="Solvent">Solvent</option>
                  <option value="Packaging Material">Packaging Material</option>
                  <option value="Finished Product">Finished Product</option>
                </select>
              </div>

              <div className="field stock-form-full">
                <label className="field-label">Item Name (Full Chemical Description) *</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. LACTOSE 200 MESH IP"
                  value={newItemForm.name}
                  onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Pack Size (KG per Bag/Container) *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  className="field-input"
                  placeholder="e.g. 25"
                  value={newItemForm.pack_size}
                  onChange={(e) =>
                    setNewItemForm({ ...newItemForm, pack_size: e.target.value })
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Reorder Level (KG)</label>
                <input
                  type="number"
                  min="0"
                  className="field-input"
                  placeholder="e.g. 100"
                  value={newItemForm.reorder_level}
                  onChange={(e) =>
                    setNewItemForm({ ...newItemForm, reorder_level: e.target.value })
                  }
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setNewItemModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Register &amp; Open Ledger
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
