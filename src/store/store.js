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
    'lots', 'commonProducts', 'commonRawMaterials', 'orders',
    'customers', 'suppliers', 'issueHistory', 'stockReturns',
    'qcRecords', 'qaRecords', 'purchaseOrders', 'dispatches', 'dosageForms', 'invoices'
  ]
  seedIfEmptyKeys.forEach((key) => {
    if (!Array.isArray(result[key]) || result[key].length === 0) {
      if (Array.isArray(initialState[key]) && initialState[key].length > 0) {
        result[key] = JSON.parse(JSON.stringify(initialState[key]))
      }
    }
  })

  // Ensure notifications and stockRequests array exists
  if (!Array.isArray(result.notifications)) {
    result.notifications = []
  }
  if (!Array.isArray(result.stockRequests)) {
    result.stockRequests = []
  }
  if (!Array.isArray(result.stockLedgerEntries)) {
    result.stockLedgerEntries = []
  }
  if (!result.orderInvoices || typeof result.orderInvoices !== 'object') {
    result.orderInvoices = {}
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

  migrateDocumentNumbers(
    result
  )

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