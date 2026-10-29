import { DOSAGE_FORMS } from '../constants/dosageForms'
import {
  configureStore,
} from '@reduxjs/toolkit'

import erpReducer, {
  initialState,
} from './erpSlice'

import {
  loadPersistedERPState,
  savePersistedERPState,
} from './persistence'

import {
  recordAudit,
} from '../utils/audit'

import {
  migrateDocumentNumbers,
} from '../utils/documentNumbers'


function buildInitialERPState() {
  const savedState =
    loadPersistedERPState()

  if (
    !savedState ||
    typeof savedState !== 'object'
  ) {
    migrateDocumentNumbers(initialState)
    return {
      ...initialState,
    }
  }

  const result = {
    ...initialState,
  }

  Object.keys(
    initialState
  ).forEach(
    (key) => {
      if (
        Object.prototype.hasOwnProperty.call(
          savedState,
          key
        ) &&
        savedState[key] !== undefined &&
        savedState[key] !== null
      ) {
        result[key] =
          savedState[key]
      }
    }
  )

  // Hydrate empty arrays with seed data if saved state has no records for them
  const seedIfEmptyKeys = [
    'lots', 'commonProducts', 'commonRawMaterials', 'products', 'orders', 'batches',
    'customers', 'suppliers', 'issueHistory', 'stockReturns',
    'qcRecords', 'qaRecords', 'purchaseOrders', 'dispatches', 'dosageForms', 'invoices',
    'designations', 'salaryStructures', 'attendance', 'payments', 'formulas', 'formulaApprovals'
  ]
  seedIfEmptyKeys.forEach((key) => {
    if (!Array.isArray(result[key]) || result[key].length === 0) {
      if (Array.isArray(initialState[key]) && initialState[key].length > 0) {
        result[key] = JSON.parse(JSON.stringify(initialState[key]))
      }
    }
  })

  // Ensure all seed users exist
  if (!Array.isArray(result.users) || result.users.length < (initialState.users?.length || 0)) {
    result.users = [...(initialState.users || [])]
  }

  // Ensure BMRs and orderInvoices include all seed master copies
  if (!result.bmrs || typeof result.bmrs !== 'object' || Object.keys(result.bmrs).length === 0) {
    result.bmrs = { ...(initialState.bmrs || {}) }
  } else {
    result.bmrs = { ...(initialState.bmrs || {}), ...result.bmrs }
  }

  if (!result.orderInvoices || typeof result.orderInvoices !== 'object' || Object.keys(result.orderInvoices).length === 0) {
    result.orderInvoices = { ...(initialState.orderInvoices || {}) }
  } else {
    result.orderInvoices = { ...(initialState.orderInvoices || {}), ...result.orderInvoices }
  }

  if (!result.byCompany || !result.byCompany.cmhp || !result.byCompany.cmhp.orders || result.byCompany.cmhp.orders.length === 0) {
    result.byCompany = JSON.parse(JSON.stringify(initialState.byCompany || {}))
  }

  // Ensure dosageForms includes all current DOSAGE_FORMS and removes any 'Tablets'
  if (Array.isArray(result.dosageForms)) {
    result.dosageForms = result.dosageForms
      .map((df) => (String(df).trim().toLowerCase() === 'tablets' ? 'Tablet' : String(df).trim()))
      .filter((df) => df.toLowerCase() !== 'tablets')
    DOSAGE_FORMS.forEach((df) => {
      if (!result.dosageForms.some((x) => String(x).toLowerCase() === String(df).toLowerCase())) {
        result.dosageForms.push(df)
      }
    })
    const seenDf = new Set()
    result.dosageForms = result.dosageForms.filter((df) => {
      const lower = df.toLowerCase()
      if (seenDf.has(lower)) return false
      seenDf.add(lower)
      return true
    })
  } else {
    result.dosageForms = [...DOSAGE_FORMS]
  }

  // Ensure notifications, stockRequests, and ledger arrays exist
  if (!Array.isArray(result.notifications)) {
    result.notifications = []
  }
  if (!Array.isArray(result.stockRequests)) {
    result.stockRequests = [...(initialState.stockRequests || [])]
  }
  if (!Array.isArray(result.stockLedgerEntries)) {
    result.stockLedgerEntries = [...(initialState.stockLedgerEntries || [])]
  }

  // Ensure every invoice has a valid invoice number and linked order/customer data
  const sanitizeInvoices = (list) => {
    if (!Array.isArray(list)) return
    list.forEach((inv, idx) => {
      if (!inv.number && !inv.invoice_no) {
        inv.number = idx === 0 ? 'G/26-27/024' : 'G/26-27/025'
        inv.invoice_no = inv.number
      } else if (!inv.number && inv.invoice_no) {
        inv.number = inv.invoice_no
      }
      const orderId = inv.order || inv.order_id
      const allOrders = [
        ...(Array.isArray(result.orders) ? result.orders : []),
        ...(Array.isArray(result.byCompany?.cmhp?.orders) ? result.byCompany.cmhp.orders : []),
        ...(Array.isArray(result.byCompany?.tej?.orders) ? result.byCompany.tej.orders : []),
      ]
      const order = allOrders.find((o) =>
        (orderId && (String(o.id) === String(orderId) || String(o.number) === String(orderId))) ||
        (inv.order_number && (String(o.number) === String(inv.order_number) || String(o.id) === String(inv.order_number)))
      )
      if (order) {
        if (!inv.order_number || inv.order_number === '—') inv.order_number = order.number || (order.id ? 'ORD-' + order.id : '—')
        if (!inv.customer_name || inv.customer_name === '—') inv.customer_name = order.customer_name
      }
    })
  }
  if (Array.isArray(result.invoices)) sanitizeInvoices(result.invoices)
  if (result.byCompany?.cmhp?.invoices) sanitizeInvoices(result.byCompany.cmhp.invoices)
  if (result.byCompany?.tej?.invoices) sanitizeInvoices(result.byCompany.tej.invoices)

  // Ensure every raw material with current_stock > 0 has an opening stock ledger entry
  if (Array.isArray(result.commonRawMaterials)) {
    result.commonRawMaterials.forEach((mat) => {
      const stock = Number(mat.current_stock) || 0
      if (stock > 0) {
        const hasOpening = result.stockLedgerEntries.some(
          (e) =>
            (String(e.item_id) === String(mat.id) ||
              (e.item_code && String(e.item_code).trim().toLowerCase() === String(mat.code).trim().toLowerCase())) &&
            e.type === 'OPENING' &&
            !e.reversed
        )
        if (!hasOpening) {
          result.stockLedgerEntries.push({
            id: Date.now() + Math.floor(Math.random() * 10000),
            item_id: mat.id,
            item_code: mat.code,
            item_name: mat.name,
            type: 'OPENING',
            financial_year: '2026-27',
            date: mat.created_at ? mat.created_at.slice(0, 10) : '2026-04-01',
            invoice_no: `Opening stock ${mat.code}`,
            receipt_no: 'OPENING',
            reference: `Opening stock ${mat.code}`,
            supplier: 'Opening Stock',
            received_quantity: stock,
            issued_quantity: 0,
            running_balance: stock,
            no_of_containers: `${Math.floor(stock / (mat.pack_size || 25))}*${mat.pack_size || 25}${mat.uom || 'KG'}`,
            remark: `Opening stock for ${mat.name} (${mat.code})`,
            remarks: `Opening stock for ${mat.name} (${mat.code})`,
            created_at: mat.created_at || new Date().toISOString(),
            reversed: false,
          })
        }
      }
    })
  }

  // Ensure byCompany structure exists
  if (!result.byCompany) {
    result.byCompany = { cmhp: {}, tej: {} }
  }
  if (!result.byCompany.cmhp) result.byCompany.cmhp = {}
  if (!result.byCompany.tej) result.byCompany.tej = {}

  // List of company-specific slices that must be partitioned
  const companySlices = [
    'products', 'formulas', 'orders', 'batches', 'qcRecords', 'qaRecords',
    'invoices', 'payments', 'suppliers', 'purchaseOrders', 'goodsReceipts',
    'purchaseBills', 'internalAllocations', 'dispatches', 'salesReturns',
    'recalls', 'creditNotes', 'designations', 'shifts', 'holidays',
    'leaveTypes', 'attendance', 'leaveRequests', 'salaryStructures',
    'payrollRuns', 'payrollAdjustments', 'attendanceRegularizations', 'quotations',
    'stockRequests'
  ]

  companySlices.forEach((slice) => {
    const rootList = Array.isArray(result[slice]) ? result[slice] : []
    const cmhpExisting = Array.isArray(result.byCompany.cmhp[slice]) ? result.byCompany.cmhp[slice] : []
    const tejExisting = Array.isArray(result.byCompany.tej[slice]) ? result.byCompany.tej[slice] : []

    // If byCompany had no data for this slice but root array has data, partition it
    if (cmhpExisting.length === 0 && tejExisting.length === 0 && rootList.length > 0) {
      result.byCompany.cmhp[slice] = []
      result.byCompany.tej[slice] = []

      rootList.forEach((row) => {
        const isTej = Number(row?.company) === 2 || row?.companyId === 'tej'
        const compKey = isTej ? 'tej' : 'cmhp'
        const compId = isTej ? 2 : 1
        const stamped = {
          ...row,
          company: row?.company !== undefined ? Number(row.company) : compId,
          companyId: row?.companyId || compKey,
        }
        result.byCompany[compKey][slice].push(stamped)
      })
    } else {
      // Ensure records in byCompany have both company and companyId stamped
      result.byCompany.cmhp[slice] = (result.byCompany.cmhp[slice] || []).map((row) => ({
        ...row,
        company: 1,
        companyId: 'cmhp',
      }))
      result.byCompany.tej[slice] = (result.byCompany.tej[slice] || []).map((row) => ({
        ...row,
        company: 2,
        companyId: 'tej',
      }))
    }

    // Keep root array populated with all items, stamped with company & companyId
    result[slice] = [
      ...(result.byCompany.cmhp[slice] || []),
      ...(result.byCompany.tej[slice] || []),
    ]
  })

  // Ensure activeCompanyId & activeCompanyKey
  if (result.activeCompanyId === 2 || result.activeCompanyId === '2' || result.activeCompanyId === 'tej' || result.activeCompanyId === 'company_b') {
    result.activeCompanyId = 2
    result.activeCompanyKey = 'tej'
  } else {
    result.activeCompanyId = 1
    result.activeCompanyKey = 'cmhp'
  }

  if (Array.isArray(result.companies)) {
    result.companies = result.companies.map((c) => {
      if (c.id === 1 && (c.name === 'Company A' || c.code === 'COMP-A')) {
        return { ...c, name: 'CMHP Pharma', code: 'CMHP' }
      }
      if (c.id === 2 && (c.name === 'Company B' || c.code === 'COMP-B')) {
        return { ...c, name: 'Tej Biocare', code: 'TEJ' }
      }
      return c
    })
  }

  // Normalize 'Tablets' -> 'Tablet' across all persisted records
  const normalizeTablet = (val) => {
    if (typeof val === 'string' && val.trim().toLowerCase() === 'tablets') {
      return 'Tablet'
    }
    return val
  }

  const migrateProductRecord = (p) => {
    if (!p || typeof p !== 'object') return
    if (p.dosage_form) p.dosage_form = normalizeTablet(p.dosage_form)
    if (p.category) p.category = normalizeTablet(p.category)
    if (p.type) p.type = normalizeTablet(p.type)
  }
  if (Array.isArray(result.products)) result.products.forEach(migrateProductRecord)
  if (Array.isArray(result.commonProducts)) result.commonProducts.forEach(migrateProductRecord)
  if (Array.isArray(result.byCompany?.cmhp?.products)) result.byCompany.cmhp.products.forEach(migrateProductRecord)
  if (Array.isArray(result.byCompany?.tej?.products)) result.byCompany.tej.products.forEach(migrateProductRecord)

  const migrateOrderRecord = (o) => {
    if (!o || typeof o !== 'object') return
    if (o.dosage_form) o.dosage_form = normalizeTablet(o.dosage_form)
    if (o.dosageForm) o.dosageForm = normalizeTablet(o.dosageForm)
    if (o.product_type) o.product_type = normalizeTablet(o.product_type)
    if (o.type) o.type = normalizeTablet(o.type)
  }
  if (Array.isArray(result.orders)) result.orders.forEach(migrateOrderRecord)
  if (Array.isArray(result.byCompany?.cmhp?.orders)) result.byCompany.cmhp.orders.forEach(migrateOrderRecord)
  if (Array.isArray(result.byCompany?.tej?.orders)) result.byCompany.tej.orders.forEach(migrateOrderRecord)

  const migrateBatchRecord = (b) => {
    if (!b || typeof b !== 'object') return
    if (b.dosage_form) b.dosage_form = normalizeTablet(b.dosage_form)
    if (b.dosageForm) b.dosageForm = normalizeTablet(b.dosageForm)
    if (b.product_type) b.product_type = normalizeTablet(b.product_type)
    if (b.type) b.type = normalizeTablet(b.type)
  }
  if (Array.isArray(result.batches)) result.batches.forEach(migrateBatchRecord)
  if (Array.isArray(result.byCompany?.cmhp?.batches)) result.byCompany.cmhp.batches.forEach(migrateBatchRecord)
  if (Array.isArray(result.byCompany?.tej?.batches)) result.byCompany.tej.batches.forEach(migrateBatchRecord)

  const migrateFormulaRecord = (f) => {
    if (!f || typeof f !== 'object') return
    if (f.category) f.category = normalizeTablet(f.category)
    if (f.dosage_form) f.dosage_form = normalizeTablet(f.dosage_form)
    if (f.dosageForm) f.dosageForm = normalizeTablet(f.dosageForm)
    if (f.type) f.type = normalizeTablet(f.type)
  }
  if (Array.isArray(result.formulas)) result.formulas.forEach(migrateFormulaRecord)
  if (Array.isArray(result.byCompany?.cmhp?.formulas)) result.byCompany.cmhp.formulas.forEach(migrateFormulaRecord)
  if (Array.isArray(result.byCompany?.tej?.formulas)) result.byCompany.tej.formulas.forEach(migrateFormulaRecord)

  if (Array.isArray(result.lots)) {
    result.lots.forEach((l) => {
      if (l?.category) l.category = normalizeTablet(l.category)
    })
  }
  if (Array.isArray(result.stockLedgerEntries)) {
    result.stockLedgerEntries.forEach((e) => {
      if (e?.category) e.category = normalizeTablet(e.category)
    })
  }

  migrateDocumentNumbers(
    result
  )

  savePersistedERPState(result)

  return result
}


/*
 * AUDIT MIDDLEWARE
 *
 * Every ERP mutation such as:
 * add user
 * edit order
 * delete product
 * approve leave
 * mark attendance
 * update salary
 * inventory changes
 *
 * is automatically recorded.
 */

const auditMiddleware =
  (storeApi) =>
  (next) =>
  (action) => {
    const result =
      next(action)

    if (
      action?.type?.startsWith(
        'erp/'
      )
    ) {
      recordAudit({
        action:
          action.type,

        payload:
          action.payload,

        state:
          storeApi
            .getState()
            .erp,
      })
    }

    return result
  }


export const store =
  configureStore({
    reducer: {
      erp:
        erpReducer,
    },

    preloadedState: {
      erp:
        buildInitialERPState(),
    },

    middleware:
      (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck:
            true,
        }).concat(
          auditMiddleware
        ),
  })


let lastSavedState =
  null


store.subscribe(() => {
  const currentState =
    store
      .getState()
      .erp

  if (
    currentState ===
    lastSavedState
  ) {
    return
  }

  lastSavedState =
    currentState

  savePersistedERPState(
    currentState
  )
})


export default store