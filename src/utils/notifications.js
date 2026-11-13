import { store } from '../store/store'
import {
  createNotification as createNotificationAction,
  markNotificationRead as markNotificationReadAction,
  markAllNotificationsRead as markAllNotificationsReadAction,
  deleteNotification as deleteNotificationAction,
  clearAllNotifications as clearAllNotificationsAction,
} from '../store/erpSlice'
import { normalizeRole, isSuperAdmin } from './roles'
import {
  toCompanyId,
  selectActiveCompanyId,
} from './companySelectors'
import { getUserCompanyIds } from './workspace'
import { storage } from './storage'

const TOAST_EVENT_NAME = 'cmhp:notification'

function getCurrentUser() {
  return storage.getUser()
}

/* =========================================================
   REDUX ACTION CREATOR & DISPATCHER
   ========================================================= */

export function createNotification(payload = {}) {
  const compId = toCompanyId(
    payload.companyId ??
    payload.company ??
    store.getState()?.erp?.activeCompanyId ??
    1
  )

  const notification = {
    id:
      payload.id ||
      `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    companyId: compId,
    company: compId,
    type: payload.type || payload.category || 'general',
    category: payload.category || payload.type || 'general',
    title: payload.title || 'Notification',
    message: payload.message || '',
    createdAt: payload.createdAt || new Date().toISOString(),
    severity: payload.severity || 'info', // 'info' | 'success' | 'warning' | 'danger'
    link: payload.link || null,
    referenceId: payload.referenceId || null,
    targetRoles: Array.isArray(payload.targetRoles) && payload.targetRoles.length > 0
      ? payload.targetRoles
      : (payload.targetRoles
          ? [payload.targetRoles]
          : (payload.targetUserIds && payload.targetUserIds.length > 0 ? [] : ['ALL'])),
    targetUserIds: Array.isArray(payload.targetUserIds)
      ? payload.targetUserIds
      : payload.targetUserIds
        ? [payload.targetUserIds]
        : [],
    readBy: Array.isArray(payload.readBy) ? payload.readBy : [],
  }

  return createNotificationAction(notification)
}

export function dispatchNotification(payload = {}) {
  const action = createNotification(payload)
  store.dispatch(action)
  return action.payload
}

export function markNotificationRead(id, userId) {
  return store.dispatch(
    markNotificationReadAction({
      id,
      userId,
    })
  )
}

export function markAllNotificationsRead(userId, companyId) {
  const compId = companyId !== undefined && companyId !== null
    ? toCompanyId(companyId)
    : selectActiveCompanyId(store.getState())

  return store.dispatch(
    markAllNotificationsReadAction({
      userId,
      companyId: compId,
    })
  )
}

export function deleteNotification(id) {
  return store.dispatch(
    deleteNotificationAction({
      id,
    })
  )
}

export function clearAllNotifications() {
  return store.dispatch(clearAllNotificationsAction())
}

/* =========================================================
   ROLE & USER FILTERING WITH STRICT COMPANY ISOLATION
   ========================================================= */

/**
 * Filter matching rules:
 * 1. Strict Company Isolation: Notification companyId MUST match active company.
 * 2. Employee company membership: Employee must have access to active company.
 * 3. Super admin: sees all roles for the active company.
 * 4. Target User IDs: targeted directly to user ID.
 * 5. Target Roles: role-wise matching (QC, QA, Invoicing, Dispatch, Stores, HR, etc.).
 */
export function isNotificationForUser(notification, user, activeCompanyId) {
  if (!notification || !user) return false

  // 1. Strict Company Isolation (Hard Rule)
  // One company must NEVER see another company's notifications.
  const targetCompId = toCompanyId(
    activeCompanyId ?? store.getState()?.erp?.activeCompanyId ?? 1
  )
  const notifCompId = toCompanyId(notification.companyId ?? notification.company)

  if (notifCompId !== targetCompId) {
    return false
  }

  // 2. User Company Scope Check
  // Normal employees are restricted to their company
  const isSuper = isSuperAdmin(user)
  if (!isSuper) {
    const userCompanyIds = getUserCompanyIds(user)
    if (
      Array.isArray(userCompanyIds) &&
      userCompanyIds.length > 0 &&
      !userCompanyIds.includes(targetCompId)
    ) {
      return false
    }
  }

  // 3. Super admin sees all roles for the active company
  if (isSuper) {
    return true
  }

  // 4. Target user IDs check (private / directed notifications)
  const userId = Number(user.id)
  if (
    Array.isArray(notification.targetUserIds) &&
    notification.targetUserIds.length > 0
  ) {
    const isTargetedUser = notification.targetUserIds.some(
      (id) => Number(id) === userId
    )
    if (isTargetedUser) return true

    // If targeted to specific users without targetRoles, it is private
    if (
      !notification.targetRoles ||
      notification.targetRoles.length === 0
    ) {
      return false
    }
  }

  // 5. Target roles check
  const userRole = normalizeRole(user)
  const userDesignation = String(
    user?.designation || user?.profile?.designation || ''
  ).toUpperCase()
  const userDepartment = String(
    user?.department || user?.profile?.department || ''
  ).toUpperCase()

  const roles = Array.isArray(notification.targetRoles)
    ? notification.targetRoles.map((r) => String(r).trim().toUpperCase())
    : []

  if (roles.length === 0 || roles.includes('ALL')) {
    return true
  }

  // Direct role string match
  if (roles.includes(userRole)) {
    return true
  }

  // Management / Executive match
  if (
    (userRole === 'MANAGEMENT' || userRole === 'DEPARTMENT_MANAGER') &&
    (roles.includes('MANAGEMENT') ||
      roles.includes('MANAGER') ||
      roles.includes('DEPARTMENT_MANAGER'))
  ) {
    return true
  }

  // Quality Control (QC)
  const isQcUser =
    userRole === 'QC' ||
    userDesignation.includes('QC') ||
    userDesignation.includes('QUALITY CONTROL') ||
    userDepartment.includes('QC') ||
    userDepartment.includes('QUALITY CONTROL')
  if (isQcUser && roles.includes('QC')) {
    return true
  }

  // Quality Assurance (QA)
  const isQaUser =
    userRole === 'QA' ||
    userDesignation.includes('QA') ||
    userDesignation.includes('QUALITY ASSURANCE') ||
    userDepartment.includes('QA') ||
    userDepartment.includes('QUALITY ASSURANCE')
  if (isQaUser && roles.includes('QA')) {
    return true
  }

  // Billing / Invoicing
  const isInvoicingUser =
    userRole === 'INVOICING' ||
    userRole === 'BILLING' ||
    userRole === 'ACCOUNTS' ||
    userDesignation.includes('INVOIC') ||
    userDesignation.includes('BILL') ||
    userDesignation.includes('ACCOUNT') ||
    userDepartment.includes('ACCOUNT') ||
    userDepartment.includes('BILL')
  if (
    isInvoicingUser &&
    (roles.includes('INVOICING') ||
      roles.includes('BILLING') ||
      roles.includes('ACCOUNTS'))
  ) {
    return true
  }

  // Production / BMR
  const isProdUser =
    userRole === 'PRODUCTION' ||
    userDesignation.includes('PRODUCTION') ||
    userDesignation.includes('CHEMIST') ||
    userDepartment.includes('PRODUCTION')
  if (
    isProdUser &&
    (roles.includes('PRODUCTION') || roles.includes('BMR'))
  ) {
    return true
  }

  // Dispatch
  const isDispatchUser =
    userRole === 'DISPATCH' ||
    userDesignation.includes('DISPATCH') ||
    userDepartment.includes('DISPATCH')
  if (isDispatchUser && roles.includes('DISPATCH')) {
    return true
  }

  // Stores / Inventory
  const isStoresUser =
    userRole === 'STORES_MANAGER' ||
    userRole === 'STORES_USER' ||
    userDesignation.includes('STORE') ||
    userDesignation.includes('WAREHOUSE') ||
    userDepartment.includes('STORE') ||
    userDepartment.includes('WAREHOUSE')
  if (
    isStoresUser &&
    (roles.includes('STORES_MANAGER') ||
      roles.includes('STORES_USER') ||
      roles.includes('STORE_MANAGER') ||
      roles.includes('INVENTORY'))
  ) {
    return true
  }

  // HR
  const isHrUser =
    userRole === 'HR_ADMINISTRATOR' ||
    userRole === 'HR_MANAGER' ||
    userRole === 'HR' ||
    userDesignation.includes('HR') ||
    userDepartment.includes('HR')
  if (
    isHrUser &&
    (roles.includes('HR') ||
      roles.includes('HR_ADMINISTRATOR') ||
      roles.includes('HR_MANAGER'))
  ) {
    return true
  }

  return false
}

export function isNotificationRead(notification, user) {
  if (!notification || !user) return false
  const userId = Number(user.id)
  if (Array.isArray(notification.readBy)) {
    return notification.readBy.some((id) => Number(id) === userId)
  }
  return Boolean(notification.is_read)
}

/* =========================================================
   CENTRAL REDUX SELECTORS
   ========================================================= */

/**
 * Filter in ONE central place: a Redux selector that takes the active companyId,
 * the current user's role and the user id.
 */
export function selectFilteredNotifications(state, user, activeCompanyIdOverride) {
  const erp = state?.erp || state || {}
  const allNotifications = Array.isArray(erp.notifications) ? erp.notifications : []
  const activeCompanyId =
    activeCompanyIdOverride !== undefined && activeCompanyIdOverride !== null
      ? toCompanyId(activeCompanyIdOverride)
      : selectActiveCompanyId(state)

  const currentUser = user || getCurrentUser()
  if (!currentUser) return []

  return allNotifications.filter((n) =>
    isNotificationForUser(n, currentUser, activeCompanyId)
  )
}

export function selectUnreadNotificationsCount(state, user, activeCompanyIdOverride) {
  const filtered = selectFilteredNotifications(state, user, activeCompanyIdOverride)
  const currentUser = user || getCurrentUser()
  return filtered.filter((n) => !isNotificationRead(n, currentUser)).length
}

/* =========================================================
   MIGRATION & CLEANUP HELPER
   ========================================================= */

export function migrateNotifications(notifications = [], state = {}) {
  if (!Array.isArray(notifications)) return []

  return notifications
    .filter((n) => n && typeof n === 'object')
    .map((n) => {
      let compId = n.companyId ?? n.company
      if (!compId) {
        const text = `${n.title || ''} ${n.message || ''}`.toLowerCase()
        if (text.includes('tej') || text.includes('biocare')) {
          compId = 2
        } else if (text.includes('cmhp')) {
          compId = 1
        } else if (n.referenceId && state) {
          const ord = (state.orders || []).find(
            (o) => String(o.number || o.id) === String(n.referenceId)
          )
          if (ord) {
            compId = Number(ord.company) === 2 || ord.companyId === 'tej' ? 2 : 1
          } else {
            const inv = (state.invoices || []).find(
              (i) => String(i.number || i.id) === String(n.referenceId)
            )
            if (inv) {
              compId = Number(inv.company) === 2 || inv.companyId === 'tej' ? 2 : 1
            }
          }
        }
      }

      const normalizedCompId = toCompanyId(compId)

      return {
        ...n,
        companyId: normalizedCompId,
        company: normalizedCompId,
        targetRoles:
          Array.isArray(n.targetRoles) && n.targetRoles.length > 0
            ? n.targetRoles
            : n.targetUserIds && n.targetUserIds.length > 0
              ? []
              : ['ALL'],
        targetUserIds: Array.isArray(n.targetUserIds) ? n.targetUserIds : [],
        readBy: Array.isArray(n.readBy)
          ? n.readBy
          : n.is_read
            ? [1]
            : [],
      }
    })
}

/* =========================================================
   DATE & TIME HELPERS
   ========================================================= */

export function isToday(isoString) {
  if (!isoString) return false
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return false

  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

export function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 30) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

/* =========================================================
   CATEGORY PRESENTATION METADATA
   ========================================================= */

export function getCategoryMeta(category, severity = 'info') {
  const cat = String(category || '').toLowerCase()
  switch (cat) {
    case 'order':
    case 'orders':
      return {
        label: 'Orders',
        iconName: 'order',
        bg: 'rgba(20, 120, 201, 0.12)',
        color: '#1478c9',
      }
    case 'inventory':
    case 'stock':
      return {
        label: 'Inventory',
        iconName: 'inventory',
        bg:
          severity === 'danger'
            ? 'rgba(239, 68, 68, 0.12)'
            : 'rgba(245, 158, 11, 0.12)',
        color: severity === 'danger' ? '#ef4444' : '#f59e0b',
      }
    case 'leave':
      return {
        label: 'Leave',
        iconName: 'leave',
        bg:
          severity === 'success'
            ? 'rgba(16, 185, 129, 0.12)'
            : severity === 'danger'
              ? 'rgba(239, 68, 68, 0.12)'
              : 'rgba(139, 92, 246, 0.12)',
        color:
          severity === 'success'
            ? '#10b981'
            : severity === 'danger'
              ? '#ef4444'
              : '#8b5cf6',
      }
    case 'quality':
    case 'qc':
    case 'qa':
      return {
        label: 'Quality',
        iconName: 'quality',
        bg: 'rgba(16, 185, 129, 0.12)',
        color: '#10b981',
      }
    case 'hr':
    case 'hrms':
      return {
        label: 'HRMS',
        iconName: 'hr',
        bg: 'rgba(236, 72, 153, 0.12)',
        color: '#ec4899',
      }
    case 'dispatch':
      return {
        label: 'Dispatch',
        iconName: 'dispatch',
        bg: 'rgba(59, 130, 246, 0.12)',
        color: '#3b82f6',
      }
    default:
      return {
        label: 'System',
        iconName: 'system',
        bg: 'rgba(100, 116, 139, 0.12)',
        color: '#64748b',
      }
  }
}

/* =========================================================
   TOAST HELPERS (Company-Gated)
   ========================================================= */

export function notify(message, type = 'success', meta = {}) {
  if (typeof window !== 'undefined') {
    const activeCompanyId = toCompanyId(
      meta.companyId ?? selectActiveCompanyId(store.getState())
    )

    window.dispatchEvent(
      new CustomEvent(TOAST_EVENT_NAME, {
        detail: {
          message,
          type,
          title:
            type === 'error'
              ? 'Alert'
              : type === 'warning'
                ? 'Warning'
                : 'Update',
          companyId: activeCompanyId,
          ...meta,
        },
      })
    )
  }
}

export function notifySuccess(message, meta = {}) {
  notify(message, 'success', meta)
}

export function notifyError(message, meta = {}) {
  notify(message, 'error', meta)
}

export function notifyWarning(message, meta = {}) {
  notify(message, 'warning', meta)
}

export function subscribeNotifications(callback) {
  if (typeof window === 'undefined') return () => {}

  const handler = (event) => {
    callback(event.detail)
  }

  window.addEventListener(TOAST_EVENT_NAME, handler)

  return () => {
    window.removeEventListener(TOAST_EVENT_NAME, handler)
  }
}
