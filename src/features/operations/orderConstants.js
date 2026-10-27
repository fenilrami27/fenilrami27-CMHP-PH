/**
 * ============================================================
 * ORDERS MODULE - CENTRAL CONSTANTS & DROPDOWN OPTIONS
 * ============================================================
 * 
 * Edit this single file to modify dropdown choices across the Orders module:
 * - Product Types & Sub-types (Section A: Order Details)
 * - Printing Statuses (Section B: Batch & Printing Details)
 * - Requisition Statuses & Packing Types (Section C: Packing & Requisition Details)
 */

import { DOSAGE_FORMS } from '../../constants/dosageForms'

// Section A: Product Types (Liquid, Tablet, Capsule, Syrup, Drops, Oil, Kits, Pills)
export const ORDER_PRODUCT_TYPES = DOSAGE_FORMS

// Section A: Solid Sub-types (Tablet, Capsule)
export const ORDER_PRODUCT_SUBTYPES = [
  'Tablet',
  'Capsule',
]

// Section B: Printing Status (e.g. Pending, In Progress, Done)
export const ORDER_PRINTING_STATUSES = [
  'Pending',
  'In Progress',
  'Done',
]

// Section C: Packing Types (e.g. Blister, Strip, Bottle, Vial, Pouch, Box, Jar, Carton)
export const ORDER_PACKING_TYPES = [
  'Blister',
  'Strip',
  'Bottle',
  'Vial',
  'Pouch',
  'Box',
  'Jar',
  'Carton',
]

// Section C: Requisition Status (e.g. Pending, Requested, Received)
export const ORDER_REQUISITION_STATUSES = [
  'Pending',
  'Requested',
  'Received',
]

// Company Master with default codes
export const ORDER_COMPANIES = [
  { id: 1, name: 'CMHP Pharma', code: 'CMHP' },
  { id: 2, name: 'Tej Biocare', code: 'TEJ' },
]

/**
 * Section Status Calculation Helpers
 * A section becomes "Completed" when all its required fields are filled.
 */

export function getSectionAStatus(order) {
  if (!order) return 'Pending'
  const pType = order.product_type || order.type || order.dosage_form || order.dosageForm || ''
  const isSolid = String(pType).toLowerCase() === 'solid'
  const hasSubtype = isSolid ? Boolean(order.product_subtype || order.subtype) : true
  const hasPlannedDate = Boolean(order.planned_mfg_date)
  const hasOrderDate = Boolean(order.date_of_order || order.order_date)

  // Planned Mfg Date cannot be earlier than Date of Order
  let dateValid = true
  if (hasPlannedDate && hasOrderDate) {
    dateValid = order.planned_mfg_date >= (order.date_of_order || order.order_date)
  }

  const isComplete = Boolean(
    (order.product_name || order.product) &&
    pType &&
    hasSubtype &&
    order.company &&
    (order.company_code || order.companyCode) &&
    hasOrderDate &&
    hasPlannedDate &&
    dateValid &&
    (order.product_code || order.productCode)
  )

  return isComplete ? 'Completed' : 'Pending'
}

export function getSectionBStatus(order) {
  if (!order) return 'Pending'
  const mrp = Number(order.mrp_for_printing ?? order.mrp)
  const isComplete = Boolean(
    order.batch_no &&
    order.packing_size &&
    order.batch_size &&
    !isNaN(mrp) &&
    mrp > 0 &&
    order.printing_status
  )

  return isComplete ? 'Completed' : 'Pending'
}

export function getSectionCStatus(order) {
  if (!order) return 'Pending'
  const isComplete = Boolean(
    order.packing_type &&
    order.label &&
    order.box &&
    order.insert &&
    order.requisition_status
  )

  return isComplete ? 'Completed' : 'Pending'
}
