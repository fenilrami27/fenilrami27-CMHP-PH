import { store } from '../store/store'
import {
  createNotification as createNotificationAction,
  markNotificationRead as markNotificationReadAction,
  markAllNotificationsRead as markAllNotificationsReadAction,
  deleteNotification as deleteNotificationAction,
  clearAllNotifications as clearAllNotificationsAction,
} from '../store/erpSlice'
import { normalizeRole, isSuperAdmin } from './roles'

const TOAST_EVENT_NAME = 'cmhp:notification'

/* =========================================================
   REDUX ACTION CREATOR & DISPATCHER
   ========================================================= */

export function createNotification(payload = {}) {
  const notification = {
    id:
      payload.id ||
      `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: payload.type || payload.category || 'general',
    category: payload.category || payload.type || 'general',
    title: payload.title || 'Notification',
    message: payload.message || '',
    createdAt: payload.createdAt || new Date().toISOString(),
    severity: payload.severity || 'info', // 'info' | 'success' | 'warning' | 'danger'
    link: payload.link || null,
    referenceId: payload.referenceId || null,
    targetRoles: Array.isArray(payload.targetRoles)
      ? payload.targetRoles
      : payload.targetRoles
        ? [payload.targetRoles]
        : [],
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

export function markAllNotificationsRead(userId) {
  return store.dispatch(
    markAllNotificationsReadAction({
      userId,
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
   ROLE & USER FILTERING
   ========================================================= */

export function isNotificationForUser(notification, user) {
  if (!notification || !user) return false

  const userId = Number(user.id)
  const userRole = normalizeRole(user)
  const isSuper = isSuperAdmin(user)

  // Explicit target user IDs check
  if (
    Array.isArray(notification.targetUserIds) &&
    notification.targetUserIds.length > 0
  ) {
    const isTargetedUser = notification.targetUserIds.some(
      (id) => Number(id) === userId
    )
    if (isTargetedUser) return true

    // If targetUserIds is specified without targetRoles, it is private to those users
    if (
      !notification.targetRoles ||
      notification.targetRoles.length === 0
    ) {
      return false
    }
  }

  // Target roles check
  if (
    Array.isArray(notification.targetRoles) &&
    notification.targetRoles.length > 0
  ) {
    const roles = notification.targetRoles.map((r) =>
      String(r).trim().toUpperCase()
    )

    // Admin matches any admin role
    if (
      isSuper &&
      (roles.includes('SUPER_ADMIN') ||
        roles.includes('ADMIN') ||
        roles.includes('ALL'))
    ) {
      return true
    }

    // Direct role match
    if (roles.includes(userRole)) {
      return true
    }

    // Role aliases & groupings
    if (
      (roles.includes('STORE_MANAGER') ||
        roles.includes('STORES_MANAGER')) &&
      userRole === 'STORES_MANAGER'
    ) {
      return true
    }

    if (
      (roles.includes('MANAGER') ||
        roles.includes('MANAGEMENT') ||
        roles.includes('DEPARTMENT_MANAGER')) &&
      (userRole === 'MANAGEMENT' ||
        userRole === 'DEPARTMENT_MANAGER')
    ) {
      return true
    }

    if (
      (roles.includes('HR') ||
        roles.includes('HR_ADMINISTRATOR') ||
        roles.includes('HR_MANAGER')) &&
      (userRole === 'HR_ADMINISTRATOR' ||
        userRole === 'HR_MANAGER')
    ) {
      return true
    }

    if (
      roles.includes('QC') &&
      (userRole === 'STORES_MANAGER' ||
        userRole === 'MANAGEMENT' ||
        isSuper)
    ) {
      return true
    }

    if (
      roles.includes('QA') &&
      (userRole === 'STORES_MANAGER' ||
        userRole === 'MANAGEMENT' ||
        isSuper)
    ) {
      return true
    }

    if (roles.includes('ALL')) {
      return true
    }

    return false
  }

  // Fallback: If no target specified, visible to super admins
  return isSuper
}

export function isNotificationRead(notification, user) {
  if (!notification || !user) return false
  const userId = Number(user.id)
  return Boolean(
    Array.isArray(notification.readBy) &&
      notification.readBy.some((id) => Number(id) === userId)
  )
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
   TOAST HELPERS (Preserved for ToastContainer)
   ========================================================= */

export function notify(message, type = 'success') {
  if (typeof window !== 'undefined') {
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
        },
      })
    )
  }
}

export function notifySuccess(message) {
  notify(message, 'success')
}

export function notifyError(message) {
  notify(message, 'error')
}

export function notifyWarning(message) {
  notify(message, 'warning')
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