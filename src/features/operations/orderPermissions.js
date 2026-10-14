import { storage } from '../../utils/storage'
import { isSuperAdmin as checkSuperAdmin } from '../../utils/companyScope'

/**
 * ============================================================
 * ORDERS MODULE - CENTRAL ROLE-BASED ACCESS CONTROL (RBAC)
 * ============================================================
 * 
 * Central permissions configuration with field-level map:
 * - Admin: Full access. Create orders, edit all three sections, delete, approve, change status, print/export, view audit logs.
 * - Manager: Sees whole order (Sections A & C read-only), edits ONLY Section B. Cannot create or delete.
 * - Store Manager: Sees whole order (Sections A & B read-only), edits ONLY Section C. Cannot create or delete.
 * - Other roles (QC, QA, Accounts, Dispatch, Employee): View-only for relevant stage, single stage action. Never edit A, B, or C.
 * - Only Admin can use "Add Order".
 */

export const ORDER_ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  STORE_MANAGER: 'STORE_MANAGER',
  QC: 'QC',
  QA: 'QA',
  ACCOUNTS: 'ACCOUNTS',
  DISPATCH: 'DISPATCH',
  EMPLOYEE: 'EMPLOYEE',
}

/**
 * Normalizes any system role string into one of the canonical Order Roles.
 */
export function getOrderRole(user = storage.getUser()) {
  if (checkSuperAdmin(user)) {
    return ORDER_ROLES.ADMIN
  }

  const rawRole = String(
    user?.profile?.role ||
    user?.role ||
    ''
  ).trim().toUpperCase()

  if (['SUPER_ADMIN', 'ADMIN', 'SYSTEM_ADMIN'].includes(rawRole)) {
    return ORDER_ROLES.ADMIN
  }

  if (['MANAGEMENT', 'DEPARTMENT_MANAGER', 'MANAGER', 'HR_MANAGER', 'HR_ADMINISTRATOR', 'PLANT_HEAD'].includes(rawRole)) {
    return ORDER_ROLES.MANAGER
  }

  if (['STORES_MANAGER', 'STORE_MANAGER', 'STORES_USER', 'INVENTORY_MANAGER', 'WAREHOUSE_MANAGER'].includes(rawRole)) {
    return ORDER_ROLES.STORE_MANAGER
  }

  if (['QC', 'QUALITY_CONTROL', 'QC_OFFICER', 'QC_ANALYST', 'QC_MANAGER'].includes(rawRole)) {
    return ORDER_ROLES.QC
  }

  if (['QA', 'QUALITY_ASSURANCE', 'QA_OFFICER', 'QA_MANAGER', 'QA_HEAD'].includes(rawRole)) {
    return ORDER_ROLES.QA
  }

  if (['ACCOUNTS', 'ACCOUNTANT', 'FINANCE', 'BILLING'].includes(rawRole)) {
    return ORDER_ROLES.ACCOUNTS
  }

  if (['DISPATCH', 'LOGISTICS', 'DISPATCH_OFFICER'].includes(rawRole)) {
    return ORDER_ROLES.DISPATCH
  }

  return ORDER_ROLES.EMPLOYEE
}

export function getCurrentUserRole(user = storage.getUser()) {
  return getOrderRole(user)
}

/**
 * FIELD-LEVEL OWNERSHIP MAP
 */

// Section A: Order Details (owned by Admin)
export const SECTION_A_FIELDS = [
  'product_name',
  'product_type',
  'type',
  'product_subtype',
  'subtype',
  'company',
  'company_code',
  'companyCode',
  'date_of_order',
  'order_date',
  'planned_mfg_date',
  'product_code',
  'productCode',
  // Associated order references
  'customer',
  'customer_name',
  'customer_code',
  'order_number',
  'number',
  'delivery_date',
  'delivery_deadline',
  'currency',
  'customer_order_reference',
  'notes',
  'lines',
]

// Section B: Batch & Printing Details (owned by Manager)
export const SECTION_B_FIELDS = [
  'batch_no',
  'packing_size',
  'batch_size',
  'mrp_for_printing',
  'mrp',
  'printing_status',
  // Batch meta
  'packing_unit',
  'output_unit',
  'planned_pack_quantity',
  'approved_formula_revision',
  'batch_notes',
]

// Section C: Packing & Requisition Details (owned by Store Manager)
export const SECTION_C_FIELDS = [
  'packing_type',
  'label',
  'box',
  'insert',
  'requisition_status',
  'materials_allocated',
  'allocation_date',
  'allocated_by',
  'status',
  // Store meta
  'store',
  'store_name',
]

// Backward-compatible field exports
export const ADMIN_ORDER_FIELDS = SECTION_A_FIELDS
export const MANAGER_ORDER_FIELDS = SECTION_B_FIELDS
export const STORE_MANAGER_ORDER_FIELDS = SECTION_C_FIELDS
export const HR_MANAGER_ORDER_FIELDS = MANAGER_ORDER_FIELDS

export const ORDER_FIELDS = {
  product_name: 'Product Name',
  product_type: 'Type',
  product_subtype: 'Sub-type',
  company: 'Company',
  company_code: 'Company Code',
  date_of_order: 'Date of Order',
  planned_mfg_date: 'Planned Mfg Date',
  product_code: 'Product Code',
  batch_no: 'Batch No.',
  packing_size: 'Packing Size',
  batch_size: 'Batch Size',
  mrp_for_printing: 'MRP for Printing',
  printing_status: 'Printing Status',
  packing_type: 'Packing Type',
  label: 'Label',
  box: 'Box',
  insert: 'Insert',
  requisition_status: 'Requisition Status',
}

export const ORDER_FIELD_LABELS = ORDER_FIELDS

/**
 * ============================================================
 * PERMISSION MATRIX CONFIGURATION
 * ============================================================
 */
export const ORDER_PERMISSIONS = {
  [ORDER_ROLES.ADMIN]: {
    canView: true,
    canCreate: true, // Only Admin can use "Add Order"
    canEdit: true,
    canDelete: true, // Only Admin can delete
    canApprove: true,
    canChangeStatus: true,
    canExport: true,
    canViewAudit: true,
    sections: ['A', 'B', 'C', 'admin', 'batch', 'store'],
  },
  [ORDER_ROLES.MANAGER]: {
    canView: true,
    canCreate: false, // Cannot create orders
    canEdit: true, // Can edit Section B only
    canDelete: false, // Cannot delete orders
    canApprove: true,
    canChangeStatus: true,
    canExport: true,
    canViewAudit: true,
    sections: ['B', 'batch'],
  },
  [ORDER_ROLES.STORE_MANAGER]: {
    canView: true,
    canCreate: true, // Store Manager can create / requisition orders
    canEdit: true, // Can edit Section C only
    canDelete: false, // Cannot delete orders
    canApprove: false,
    canChangeStatus: false,
    canExport: true,
    canViewAudit: false,
    sections: ['C', 'store'],
  },
  [ORDER_ROLES.QC]: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canChangeStatus: (targetStatus, currentStatus) => {
      return currentStatus === 'QC_PENDING' && ['QC_APPROVED', 'QA_PENDING', 'QC_REJECTED'].includes(targetStatus)
    },
    canExport: true,
    canViewAudit: false,
    sections: [],
  },
  [ORDER_ROLES.QA]: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canChangeStatus: (targetStatus, currentStatus) => {
      return currentStatus === 'QA_PENDING' && ['QA_APPROVED', 'IN_PRODUCTION', 'READY_FOR_PRODUCTION'].includes(targetStatus)
    },
    canExport: true,
    canViewAudit: false,
    sections: [],
  },
  [ORDER_ROLES.ACCOUNTS]: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canChangeStatus: false,
    canExport: true,
    canViewAudit: false,
    sections: [],
  },
  [ORDER_ROLES.DISPATCH]: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canChangeStatus: (targetStatus) => ['DISPATCHED', 'DELIVERED'].includes(targetStatus),
    canExport: true,
    canViewAudit: false,
    sections: [],
  },
  [ORDER_ROLES.EMPLOYEE]: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canChangeStatus: false,
    canExport: false,
    canViewAudit: false,
    sections: [],
  },
}

/**
 * Access Check Functions
 */

export function canViewOrders(user = storage.getUser()) {
  const role = getOrderRole(user)
  return Boolean(ORDER_PERMISSIONS[role]?.canView)
}

export function canCreateOrders(user = storage.getUser()) {
  const role = getOrderRole(user)
  return Boolean(ORDER_PERMISSIONS[role]?.canCreate)
}

export function canEditOrders(user = storage.getUser(), order = null) {
  const role = getOrderRole(user)
  const perm = ORDER_PERMISSIONS[role]?.canEdit
  if (typeof perm === 'function') {
    return perm(order)
  }
  return Boolean(perm)
}

export function canDeleteOrders(user = storage.getUser()) {
  const role = getOrderRole(user)
  return Boolean(ORDER_PERMISSIONS[role]?.canDelete)
}

export function canApproveOrders(user = storage.getUser()) {
  const role = getOrderRole(user)
  return Boolean(ORDER_PERMISSIONS[role]?.canApprove)
}

export function canMoveOrderStage(user = storage.getUser(), targetStatus, currentStatus = 'DRAFT') {
  const role = getOrderRole(user)
  const perm = ORDER_PERMISSIONS[role]?.canChangeStatus
  if (typeof perm === 'function') {
    return perm(targetStatus, currentStatus)
  }
  return Boolean(perm)
}

/**
 * Section edit check:
 * - Section A / 'admin': Admin only
 * - Section B / 'batch': Manager & Admin only
 * - Section C / 'store': Store Manager & Admin only
 */
export function canViewOrderSection(section, user = storage.getUser()) {
  const role = getOrderRole(user)
  if (role === ORDER_ROLES.ADMIN) return true

  const normalized = String(section || '').toUpperCase()
  // Section C belongs ONLY to Store Manager and Admin. Manager role must NOT see it.
  if (normalized === 'C' || section === 'store') {
    return role === ORDER_ROLES.STORE_MANAGER
  }

  // Section B belongs to Manager and Admin
  if (normalized === 'B' || section === 'batch') {
    return role === ORDER_ROLES.MANAGER
  }

  // Section A is visible to all permitted roles
  return true
}

export function canEditOrderSection(section, user = storage.getUser(), order = null) {
  const role = getOrderRole(user)

  if (role === ORDER_ROLES.ADMIN) return true

  const normalized = String(section || '').toUpperCase()
  if (normalized === 'A' || section === 'admin') {
    return false // Only Admin can edit Section A
  }

  if (normalized === 'B' || section === 'batch') {
    return role === ORDER_ROLES.MANAGER
  }

  if (normalized === 'C' || section === 'store') {
    return role === ORDER_ROLES.STORE_MANAGER
  }

  return false
}

/**
 * Field-level edit check
 */
export function canEditOrderField(fieldOrUser, userOrField = storage.getUser(), order = null) {
  let field = fieldOrUser
  let user = userOrField

  if (fieldOrUser && typeof fieldOrUser === 'object' && typeof userOrField === 'string') {
    user = fieldOrUser
    field = userOrField
  }

  if (!field) return false

  const role = getOrderRole(user)
  if (role === ORDER_ROLES.ADMIN) return true

  if (role === ORDER_ROLES.MANAGER) {
    return SECTION_B_FIELDS.includes(field)
  }

  if (role === ORDER_ROLES.STORE_MANAGER) {
    return SECTION_C_FIELDS.includes(field)
  }

  return false
}

/**
 * Returns array of field names that the user's role is allowed to edit.
 */
export function getOrderEditFields(user = storage.getUser()) {
  const role = getOrderRole(user)
  if (role === ORDER_ROLES.ADMIN) {
    return [...SECTION_A_FIELDS, ...SECTION_B_FIELDS, ...SECTION_C_FIELDS]
  }
  if (role === ORDER_ROLES.MANAGER) {
    return [...SECTION_B_FIELDS]
  }
  if (role === ORDER_ROLES.STORE_MANAGER) {
    return [...SECTION_C_FIELDS]
  }
  return []
}

export const getEditableOrderFields = getOrderEditFields

/**
 * Filters an edit payload to strip out any fields the role is not allowed to modify.
 */
export function filterOrderEditPayload(payload = {}, user = storage.getUser(), order = null) {
  if (!payload || typeof payload !== 'object') return {}

  const role = getOrderRole(user)
  if (role === ORDER_ROLES.ADMIN) return payload

  const allowed = getOrderEditFields(user)
  const filtered = {}

  Object.keys(payload).forEach((k) => {
    if (allowed.includes(k) || ['id', 'company'].includes(k)) {
      filtered[k] = payload[k]
    }
  })

  return filtered
}