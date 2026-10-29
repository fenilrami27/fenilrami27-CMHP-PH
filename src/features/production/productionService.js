import { store } from '../../store/store'
import { delay } from '../../store/mockApi'
import {
  saveBmrRecord,
  updateOrderProductionStatus,
  addInvoice,
} from '../../store/erpSlice'
import { operationsService } from '../operations/operationsService'
import { getScopedCompanyId, isSuperAdmin, getLockedCompanyIds } from '../../utils/companyScope'
import { storage } from '../../utils/storage'

function getActiveCompany() {
  const user = storage.getUser()
  if (isSuperAdmin(user)) {
    return getScopedCompanyId(user)
  }
  const locked = getLockedCompanyIds(user)
  const primaryCompany = Number(locked?.[0])
  if (Number.isFinite(primaryCompany) && primaryCompany > 0) {
    return primaryCompany
  }
  return getScopedCompanyId(user)
}

export function resolveOrderDosageForm(order) {
  if (!order) return ''
  if (order.dosage_form) return order.dosage_form
  if (order.dosageForm) return order.dosageForm
  if (order.product_type) return order.product_type
  if (order.type) return order.type
  const state = store.getState().erp
  const allProducts = [
    ...(state.products || []),
    ...(state.commonProducts || []),
    ...(state.byCompany?.cmhp?.products || []),
    ...(state.byCompany?.tej?.products || []),
  ]
  const prod = allProducts.find(
    (p) =>
      (order.product_id && (String(p.id) === String(order.product_id) || p.code === order.product_code)) ||
      (order.product_code && p.code === order.product_code) ||
      (order.product_name && (p.name === order.product_name || p.product_name === order.product_name)) ||
      (order.product && (p.name === order.product || p.product_name === order.product))
  )
  if (prod?.dosage_form) return prod.dosage_form
  if (prod?.category) return prod.category
  return ''
}

export const productionService = {
  getOrders: async () => {
    // operationsService already filters and hydrates company orders
    const res = await operationsService.getOrders()
    const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
    
    // Ensure all production fields are initialized with defaults
    return list.map((order) => {
      const dosage_form = resolveOrderDosageForm(order)
      return {
        ...order,
        dosage_form,
        dosageForm: dosage_form,
        bmr_status: order.bmr_status || 'NO',
        production_status: order.production_status || 'In Planning',
        production_remark: order.production_remark || '',
        packaging_status: order.packaging_status || 'Pending',
        dispatch_status: order.dispatch_status || 'NO',
        supply_by_date: order.supply_by_date || order.planned_mfg_date || order.delivery_deadline || '—',
      }
    })
  },

  getOrderById: async (orderId) => {
    if (!orderId) return null
    const targetStr = String(orderId).trim()
    const cleanTarget = targetStr.replace(/^#/, '')

    const matchesOrder = (o) => {
      if (!o) return false
      return (
        String(o.id) === cleanTarget ||
        String(o.number) === cleanTarget ||
        String(o.number) === targetStr ||
        String(o.id) === targetStr
      )
    }

    // First try the scoped orders
    const orders = await productionService.getOrders()
    const found = orders.find(matchesOrder)
    if (found) return found

    // If not found in current scoped company, search across all companies in Redux store
    const state = store.getState().erp
    const allCompanyOrders = [
      ...(state.byCompany?.cmhp?.orders || []),
      ...(state.byCompany?.tej?.orders || []),
      ...(state.orders || []),
    ]
    const fallback = allCompanyOrders.find(matchesOrder)
    if (fallback) {
      const dosage_form = resolveOrderDosageForm(fallback)
      return {
        ...fallback,
        dosage_form,
        dosageForm: dosage_form,
        bmr_status: fallback.bmr_status || 'NO',
        production_status: fallback.production_status || 'In Planning',
        production_remark: fallback.production_remark || '',
        packaging_status: fallback.packaging_status || 'Pending',
        dispatch_status: fallback.dispatch_status || 'NO',
        supply_by_date: fallback.supply_by_date || fallback.planned_mfg_date || fallback.delivery_deadline || '—',
      }
    }
    return null
  },

  updateProduction: (payload) => {
    store.dispatch(updateOrderProductionStatus(payload))
    const state = store.getState().erp
    const targetStr = String(payload.id)
    const allOrders = [
      ...(state.byCompany?.cmhp?.orders || []),
      ...(state.byCompany?.tej?.orders || []),
      ...(state.orders || []),
    ]
    const order = allOrders.find((o) => String(o.id) === targetStr)
    return delay(order || null)
  },

  getBmr: (orderId, batchNo, bmrType) => {
    const state = store.getState().erp
    const bmrs = state.bmrs || {}
    const orderKey = orderId ? String(orderId) : null
    const batchKey = batchNo ? String(batchNo) : null
    const type = (bmrType || '').toLowerCase()

    let record = null
    if (type === 'syrup' || type === 'tablet') {
      if (orderKey && bmrs[type + '_' + orderKey]) {
        record = bmrs[type + '_' + orderKey]
      } else if (batchKey && bmrs[type + '_' + batchKey]) {
        record = bmrs[type + '_' + batchKey]
      }
      return delay(record || null)
    }

    if (orderKey && bmrs['drops_' + orderKey]) {
      record = bmrs['drops_' + orderKey]
    } else if (batchKey && bmrs['drops_' + batchKey]) {
      record = bmrs['drops_' + batchKey]
    } else if (orderKey && bmrs[orderKey] && bmrs[orderKey].bmrType !== 'syrup') {
      record = bmrs[orderKey]
    } else if (batchKey && bmrs[batchKey] && bmrs[batchKey].bmrType !== 'syrup') {
      record = bmrs[batchKey]
    }
    return delay(record || null)
  },

  saveBmr: (payload) => {
    store.dispatch(saveBmrRecord(payload))
    return delay({ success: true, savedAt: new Date().toISOString() })
  },

  getInvoices: () => {
    const state = store.getState().erp
    const currentCompany = getActiveCompany()
    const invoices = (state.invoices || []).filter((inv) => {
      if (!currentCompany) return true
      return Number(inv.company) === Number(currentCompany)
    })
    return delay(invoices)
  },

  createInvoiceFromOrder: (order) => {
    const invoiceNumber = `INV-${order.number || order.id}-${Date.now().toString().slice(-4)}`
    const quantity = Number(String(order.batch_size || '100').replace(/[^0-9.]/g, '')) || 100
    const rate = Number(String(order.mrp_for_printing || '150').replace(/[^0-9.]/g, '')) || 150
    const lineTotal = quantity * rate
    const taxPercent = 18
    const taxAmount = (lineTotal * taxPercent) / 100
    const total = lineTotal + taxAmount

    const newInvoice = {
      company: order.company,
      company_name: order.company_name,
      customer: order.customer,
      customer_name: order.customer_name,
      order: order.id,
      order_number: order.number || `ORD-${order.id}`,
      batch: order.batch_no,
      number: invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      subtotal: lineTotal,
      total: total,
      total_amount: total,
      status: 'ISSUED',
      notes: `Invoice generated from Production order #${order.number || order.id}`,
      lines: [
        {
          id: `line-${Date.now()}`,
          product: order.product || 1,
          product_name: order.product_name || order.product_code || 'Product',
          description: `${order.product_name} - Batch ${order.batch_no || 'N/A'}`,
          quantity: String(quantity),
          rate: String(rate),
        },
      ],
    }

    store.dispatch(addInvoice(newInvoice))
    return delay(newInvoice)
  },
}
