import {
  createNotification,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from './erpSlice'

export {
  createNotification,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
}

export const selectNotifications = (state) =>
  state.erp?.notifications || state.notifications || []
