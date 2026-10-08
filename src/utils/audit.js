import { getActor } from './actor'
import { storage } from './storage'
import {
  getActiveCompanyId,
  WORKSPACES,
  getSelectedWorkspace,
} from './workspace'


const AUDIT_STORAGE_KEY =
  'cmhp_audit_log_v1'

const MAX_AUDIT_ROWS = 500


const COMPANY_NAMES = {
  1: 'CMHP',
  2: 'Tej Biocare',
}


const ACTION_LABELS = {

  addUser:
    'Added user',

  editUserAccess:
    'Updated user',

  deleteUser:
    'Deleted user',

  setUserStatus:
    'Changed user status',


  addDepartment:
    'Added department',

  editDepartment:
    'Updated department',

  deleteDepartment:
    'Deleted department',


  addProduct:
    'Added product',

  editProduct:
    'Updated product',

  deleteProduct:
    'Deleted product',


  addCustomer:
    'Added customer',

  editCustomer:
    'Updated customer',

  deleteCustomer:
    'Deleted customer',


  addOrder:
    'Created order',

  editOrder:
    'Updated order',

  deleteOrder:
    'Deleted order',


  addInvoice:
    'Created invoice',

  editInvoice:
    'Updated invoice',

  deleteInvoice:
    'Deleted invoice',

  setInvoiceStatus:
    'Changed invoice status',


  addPurchaseOrder:
    'Created purchase order',

  editPurchaseOrder:
    'Updated purchase order',

  deletePurchaseOrder:
    'Deleted purchase order',

  approvePurchaseOrder:
    'Approved purchase order',

  cancelPurchaseOrder:
    'Cancelled purchase order',


  addGoodsReceipt:
    'Added goods receipt',

  editGoodsReceipt:
    'Updated goods receipt',

  deleteGoodsReceipt:
    'Deleted goods receipt',


  addDispatch:
    'Created dispatch',

  editDispatch:
    'Updated dispatch',

  deleteDispatch:
    'Deleted dispatch',

  setDispatchStatus:
    'Changed dispatch status',


  addRecall:
    'Created recall',

  logRecallReturn:
    'Logged recall return',

  closeRecall:
    'Closed recall',

  deleteRecall:
    'Deleted recall',


  addDesignation:
    'Added designation',

  editDesignation:
    'Updated designation',

  deleteDesignation:
    'Deleted designation',

  setDesignationStatus:
    'Changed designation status',


  addShift:
    'Added shift',

  editShift:
    'Updated shift',

  deleteShift:
    'Deleted shift',

  setShiftStatus:
    'Changed shift status',


  addHoliday:
    'Added holiday',

  editHoliday:
    'Updated holiday',

  deleteHoliday:
    'Deleted holiday',


  addLeaveType:
    'Added leave type',

  editLeaveType:
    'Updated leave type',

  deleteLeaveType:
    'Deleted leave type',

  setLeaveTypeStatus:
    'Changed leave type status',


  checkIn:
    'Checked in',

  checkOut:
    'Checked out',

  markAttendance:
    'Marked attendance',

  editAttendance:
    'Updated attendance',

  deleteAttendance:
    'Deleted attendance',


  applyLeave:
    'Applied for leave',

  decideLeave:
    'Decided leave request',

  cancelLeave:
    'Cancelled leave request',

  deleteLeaveRequest:
    'Deleted leave request',


  addSalaryStructure:
    'Added salary structure',

  editSalaryStructure:
    'Updated salary structure',

  deleteSalaryStructure:
    'Deleted salary structure',


  receiveStock:
    'Received stock',

  issueStock:
    'Issued stock',

  returnStock:
    'Returned stock',

  adjustStock:
    'Adjusted stock',

  setLotQcStatus:
    'Changed lot QC status',


  addItem:
    'Added material',

  editItem:
    'Updated material',

  deleteItem:
    'Deleted material',

  setItemStatus:
    'Changed material status',


  addLocation:
    'Added location',

  editLocation:
    'Updated location',

  deleteLocation:
    'Deleted location',

  setLocationStatus:
    'Changed location status',


  payrollPayment:
    'Marked salary as paid',
}


const COLLECTION_BY_ACTION = {

  addUser:
    'users',

  editUserAccess:
    'users',

  deleteUser:
    'users',

  setUserStatus:
    'users',


  addDepartment:
    'departments',

  editDepartment:
    'departments',

  deleteDepartment:
    'departments',


  addProduct:
    'products',

  editProduct:
    'products',

  deleteProduct:
    'products',


  addCustomer:
    'customers',

  editCustomer:
    'customers',

  deleteCustomer:
    'customers',


  addOrder:
    'orders',

  editOrder:
    'orders',

  deleteOrder:
    'orders',


  addInvoice:
    'invoices',

  editInvoice:
    'invoices',

  deleteInvoice:
    'invoices',

  setInvoiceStatus:
    'invoices',


  addPurchaseOrder:
    'purchaseOrders',

  editPurchaseOrder:
    'purchaseOrders',

  deletePurchaseOrder:
    'purchaseOrders',

  approvePurchaseOrder:
    'purchaseOrders',

  cancelPurchaseOrder:
    'purchaseOrders',


  addDispatch:
    'dispatches',

  editDispatch:
    'dispatches',

  deleteDispatch:
    'dispatches',

  setDispatchStatus:
    'dispatches',


  addRecall:
    'recalls',

  logRecallReturn:
    'recalls',

  closeRecall:
    'recalls',

  deleteRecall:
    'recalls',


  addDesignation:
    'designations',

  editDesignation:
    'designations',

  deleteDesignation:
    'designations',

  setDesignationStatus:
    'designations',


  addShift:
    'shifts',

  editShift:
    'shifts',

  deleteShift:
    'shifts',

  setShiftStatus:
    'shifts',


  addHoliday:
    'holidays',

  editHoliday:
    'holidays',

  deleteHoliday:
    'holidays',


  addLeaveType:
    'leaveTypes',

  editLeaveType:
    'leaveTypes',

  deleteLeaveType:
    'leaveTypes',

  setLeaveTypeStatus:
    'leaveTypes',


  markAttendance:
    'attendance',

  editAttendance:
    'attendance',

  deleteAttendance:
    'attendance',


  applyLeave:
    'leaveRequests',

  decideLeave:
    'leaveRequests',

  cancelLeave:
    'leaveRequests',

  deleteLeaveRequest:
    'leaveRequests',


  addSalaryStructure:
    'salaryStructures',

  editSalaryStructure:
    'salaryStructures',

  deleteSalaryStructure:
    'salaryStructures',


  addItem:
    'items',

  editItem:
    'items',

  deleteItem:
    'items',

  setItemStatus:
    'items',


  addLocation:
    'locations',

  editLocation:
    'locations',

  deleteLocation:
    'locations',

  setLocationStatus:
    'locations',


  receiveStock:
    'transactions',

  issueStock:
    'transactions',

  returnStock:
    'transactions',

  adjustStock:
    'transactions',


  setLotQcStatus:
    'lots',


  payrollPayment:
    'salaryPayments',
}


function readRows() {

  try {

    const raw =
      localStorage.getItem(
        AUDIT_STORAGE_KEY
      )

    const parsed =
      raw
        ? JSON.parse(raw)
        : []


    return Array.isArray(parsed)
      ? parsed
      : []

  } catch {

    return []

  }

}


function writeRows(
  rows
) {

  try {

    localStorage.setItem(

      AUDIT_STORAGE_KEY,

      JSON.stringify(

        rows.slice(
          0,
          MAX_AUDIT_ROWS
        )

      )

    )

  } catch {

    /*
     * Audit logging should never
     * break normal ERP operations.
     */

  }

}


function safeSummary(
  value,
  depth = 0
) {

  if (

    depth > 2 ||

    value === null ||

    value === undefined

  ) {

    return undefined

  }


  if (
    typeof value !==
    'object'
  ) {

    if (

      typeof value ===
        'string' &&

      value.length > 120

    ) {

      return (
        `${value.slice(
          0,
          117
        )}...`
      )

    }


    return value

  }


  if (
    Array.isArray(value)
  ) {

    return value
      .slice(0, 8)
      .map(
        (item) =>
          safeSummary(
            item,
            depth + 1
          )
      )

  }


  const result = {}


  Object.entries(value)
    .slice(0, 20)
    .forEach(
      ([key, item]) => {

        const lower =
          key.toLowerCase()


        if (

          lower.includes(
            'password'
          ) ||

          lower.includes(
            'token'
          ) ||

          lower.includes(
            'secret'
          ) ||

          lower.includes(
            'account_number'
          ) ||

          lower.includes(
            'ifsc'
          )

        ) {

          return

        }


        const safe =
          safeSummary(
            item,
            depth + 1
          )


        if (
          safe !== undefined
        ) {

          result[key] =
            safe

        }

      }
    )


  return result

}


function findCompanyId(
  actionName,
  payload,
  state
) {

  const direct =

    payload?.company ??

    payload?.primary_company ??

    payload?.company_id ??

    payload?.payload?.company ??

    payload?.payload
      ?.primary_company


  if (

    direct !== undefined &&

    direct !== null &&

    Number(direct) > 0

  ) {

    return Number(direct)

  }


  const collection =
    COLLECTION_BY_ACTION[
      actionName
    ]


  const id =
    payload?.id


  if (

    collection &&

    id &&

    Array.isArray(
      state?.[collection]
    )

  ) {

    const row =
      state[collection].find(
        (item) =>
          Number(item.id) ===
          Number(id)
      )


    if (
      row?.company
    ) {

      return Number(
        row.company
      )

    }


    if (
      row?.primary_company
    ) {

      return Number(
        row.primary_company
      )

    }

  }


  const active =
    getActiveCompanyId(
      storage.getUser()
    )


  return active
    ? Number(active)
    : null

}


export function companyLabel(
  companyId
) {

  if (
    Number(companyId) === 1
  ) {

    return COMPANY_NAMES[1]

  }


  if (
    Number(companyId) === 2
  ) {

    return COMPANY_NAMES[2]

  }


  if (
    getSelectedWorkspace() ===
    WORKSPACES.COMMON
  ) {

    return 'Common Inventory'

  }


  return 'System'

}


export function recordAudit({
  action,
  payload = {},
  state = {},
  companyId,
}) {

  if (

    !action ||

    !String(
      action
    ).startsWith(
      'erp/'
    )

  ) {

    return

  }


  const actionName =
    String(action).replace(
      /^erp\//,
      ''
    )


  const actor =
    getActor()


  const resolvedCompany =
    companyId ??

    findCompanyId(
      actionName,
      payload,
      state
    )


  const row = {

    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    created_at:
      new Date().toISOString(),

    action:
      actionName,

    label:
      ACTION_LABELS[actionName] ||

      actionName.replace(
        /([A-Z])/g,
        ' $1'
      ).trim(),

    actor_name:
      actor.actor_name,

    actor_role:
      actor.actor_role,

    company_id:
      resolvedCompany || null,

    company_name:
      companyLabel(
        resolvedCompany
      ),

    summary:
      safeSummary(
        payload
      ),

  }


  const rows =
    readRows()


  writeRows([
    row,
    ...rows,
  ])

}


export function getAuditRows({
  companyId = null,
  search = '',
  limit = MAX_AUDIT_ROWS,
} = {}) {

  const query =
    String(search)
      .trim()
      .toLowerCase()


  return readRows()

    .filter(
      (row) => {

        if (

          companyId &&

          Number(
            row.company_id
          ) !==
            Number(companyId)

        ) {

          return false

        }


        if (!query) {

          return true

        }


        return [

          row.label,

          row.action,

          row.actor_name,

          row.actor_role,

          row.company_name,

          JSON.stringify(
            row.summary || {}
          ),

        ]

          .join(' ')

          .toLowerCase()

          .includes(query)

      }
    )

    .slice(
      0,
      limit
    )

}


export function clearAuditRows() {

  try {

    localStorage.removeItem(
      AUDIT_STORAGE_KEY
    )

  } catch {

    /*
     * Ignore storage errors.
     */

  }

}


export {
  AUDIT_STORAGE_KEY,
}