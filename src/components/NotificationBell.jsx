import { useState, useEffect, useRef, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import {
  isNotificationForUser,
  isNotificationRead,
  isToday,
  formatRelativeTime,
  getCategoryMeta,
  markNotificationRead,
  markAllNotificationsRead,
} from '../utils/notifications'
import './NotificationBell.css'

/* =========================================================
   CATEGORY ICONS
   ========================================================= */

function CategoryIcon({ iconName, size = 16 }) {
  switch (iconName) {
    case 'order':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      )
    case 'inventory':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      )
    case 'leave':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </svg>
      )
    case 'quality':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'hr':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'dispatch':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M15 18H9" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
        </svg>
      )
    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      )
  }
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useAuth()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const containerRef = useRef(null)

  const allNotifications = useSelector(
    (state) => state.erp?.notifications || []
  )

  // Filter notifications visible to this user
  const userNotifications = useMemo(() => {
    return allNotifications.filter((n) => isNotificationForUser(n, user))
  }, [allNotifications, user])

  // Calculate unread count for current user
  const unreadCount = useMemo(() => {
    return userNotifications.filter((n) => !isNotificationRead(n, user)).length
  }, [userNotifications, user])

  // Group newest first into "Today" and "Earlier"
  const { todayList, earlierList } = useMemo(() => {
    const today = []
    const earlier = []

    // Sort newest first
    const sorted = [...userNotifications].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    )

    sorted.forEach((item) => {
      if (isToday(item.createdAt)) {
        today.push(item)
      } else {
        earlier.push(item)
      }
    })

    return { todayList: today, earlierList: earlier }
  }, [userNotifications])

  // Close panel on outside click and Escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    function handleClickOutside(e) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToggle = () => {
    setIsOpen((prev) => !prev)
  }

  const handleMarkAllRead = (e) => {
    e.stopPropagation()
    if (!user?.id) return
    markAllNotificationsRead(user.id)
  }

  const handleItemClick = (item) => {
    if (!isNotificationRead(item, user)) {
      markNotificationRead(item.id, user?.id)
    }
    setIsOpen(false)
    if (item.link) {
      navigate(item.link)
    }
  }

  const handleItemMarkRead = (e, item) => {
    e.stopPropagation()
    markNotificationRead(item.id, user?.id)
  }

  const handleViewAll = () => {
    setIsOpen(false)
    navigate('/notifications')
  }

  return (
    <div className="notification-bell-container" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        className={`notification-bell-btn ${isOpen ? 'is-active' : ''}`}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={handleToggle}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="notification-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop overlay for mobile dismiss */}
      {isOpen && (
        <div
          className="notification-backdrop-overlay"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="notification-dropdown-panel"
          role="dialog"
          aria-label="Notification Center"
        >
          {/* Header */}
          <div className="notification-panel-header">
            <div className="notification-panel-title-wrap">
              <h3 className="notification-panel-title">Notifications</h3>
              {unreadCount > 0 && (
                <span className="notification-count-pill">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              type="button"
              className="notification-mark-all-btn"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
            >
              Mark all as read
            </button>
          </div>

          {/* List or Empty State */}
          <div className="notification-panel-body">
            {userNotifications.length === 0 ? (
              <div className="notification-empty-state">
                <div className="notification-empty-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <path d="m9 11 2 2 4-4" />
                  </svg>
                </div>
                <p className="notification-empty-title">You're all caught up</p>
                <p className="notification-empty-desc">
                  No new notifications right now.
                </p>
              </div>
            ) : (
              <>
                {/* TODAY GROUP */}
                {todayList.length > 0 && (
                  <div className="notification-group">
                    <p className="notification-group-title">Today</p>
                    {todayList.map((item) => {
                      const meta = getCategoryMeta(item.category, item.severity)
                      const isUnread = !isNotificationRead(item, user)

                      return (
                        <div
                          key={item.id}
                          className={`notification-item-card ${
                            isUnread ? 'is-unread' : ''
                          }`}
                          onClick={() => handleItemClick(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleItemClick(item)
                          }}
                        >
                          <div
                            className="notification-icon-wrap"
                            style={{
                              backgroundColor: meta.bg,
                              color: meta.color,
                            }}
                          >
                            <CategoryIcon iconName={meta.iconName} size={16} />
                          </div>

                          <div className="notification-content-wrap">
                            <div className="notification-item-header">
                              <span className="notification-item-title">
                                {item.title}
                              </span>
                              <span className="notification-item-time">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                            </div>
                            <p className="notification-item-message">
                              {item.message}
                            </p>
                          </div>

                          <div className="notification-item-actions">
                            {isUnread && (
                              <>
                                <span className="notification-unread-dot" title="Unread" />
                                <button
                                  type="button"
                                  className="notification-item-check-btn"
                                  title="Mark as read"
                                  aria-label="Mark as read"
                                  onClick={(e) => handleItemMarkRead(e, item)}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* EARLIER GROUP */}
                {earlierList.length > 0 && (
                  <div className="notification-group">
                    <p className="notification-group-title">Earlier</p>
                    {earlierList.map((item) => {
                      const meta = getCategoryMeta(item.category, item.severity)
                      const isUnread = !isNotificationRead(item, user)

                      return (
                        <div
                          key={item.id}
                          className={`notification-item-card ${
                            isUnread ? 'is-unread' : ''
                          }`}
                          onClick={() => handleItemClick(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleItemClick(item)
                          }}
                        >
                          <div
                            className="notification-icon-wrap"
                            style={{
                              backgroundColor: meta.bg,
                              color: meta.color,
                            }}
                          >
                            <CategoryIcon iconName={meta.iconName} size={16} />
                          </div>

                          <div className="notification-content-wrap">
                            <div className="notification-item-header">
                              <span className="notification-item-title">
                                {item.title}
                              </span>
                              <span className="notification-item-time">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                            </div>
                            <p className="notification-item-message">
                              {item.message}
                            </p>
                          </div>

                          <div className="notification-item-actions">
                            {isUnread && (
                              <>
                                <span className="notification-unread-dot" title="Unread" />
                                <button
                                  type="button"
                                  className="notification-item-check-btn"
                                  title="Mark as read"
                                  aria-label="Mark as read"
                                  onClick={(e) => handleItemMarkRead(e, item)}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer View All link */}
          <div className="notification-panel-footer">
            <button
              type="button"
              className="notification-view-all-link"
              onClick={handleViewAll}
            >
              View all notifications &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
