import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import {
  isNotificationForUser,
  isNotificationRead,
  formatRelativeTime,
  getCategoryMeta,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../utils/notifications'
import './NotificationsPage.css'

const ITEMS_PER_PAGE = 10

const CATEGORIES = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'order', label: 'Orders' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'leave', label: 'Leave' },
  { value: 'quality', label: 'Quality' },
  { value: 'hr', label: 'HRMS' },
  { value: 'dispatch', label: 'Dispatch' },
]

export default function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'UNREAD'
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const allNotifications = useSelector(
    (state) => state.erp?.notifications || []
  )

  // Filter notifications visible to this user
  const userNotifications = useMemo(() => {
    return allNotifications.filter((n) => isNotificationForUser(n, user))
  }, [allNotifications, user])

  // Filter by status, category, and search query
  const filteredNotifications = useMemo(() => {
    return userNotifications
      .filter((n) => {
        // Status filter
        if (statusFilter === 'UNREAD') {
          if (isNotificationRead(n, user)) return false
        }

        // Category filter
        if (categoryFilter !== 'ALL') {
          if (
            String(n.category || n.type).toLowerCase() !==
            categoryFilter.toLowerCase()
          ) {
            return false
          }
        }

        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const matchesTitle = String(n.title || '').toLowerCase().includes(q)
          const matchesMessage = String(n.message || '').toLowerCase().includes(q)
          if (!matchesTitle && !matchesMessage) return false
        }

        return true
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [userNotifications, user, statusFilter, categoryFilter, searchQuery])

  // Unread count
  const unreadCount = useMemo(() => {
    return userNotifications.filter((n) => !isNotificationRead(n, user)).length
  }, [userNotifications, user])

  // Pagination
  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE) || 1
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredNotifications.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredNotifications, currentPage])

  const handleMarkAllRead = () => {
    if (!user?.id) return
    markAllNotificationsRead(user.id)
  }

  const handleItemClick = (item) => {
    if (!isNotificationRead(item, user)) {
      markNotificationRead(item.id, user?.id)
    }
    if (item.link) {
      navigate(item.link)
    }
  }

  const handleItemMarkRead = (e, item) => {
    e.stopPropagation()
    markNotificationRead(item.id, user?.id)
  }

  return (
    <div className="notif-page">
      {/* Header */}
      <div className="notif-header">
        <div className="notif-title-group">
          <h1>Notification Center</h1>
          <p>Review system alerts, order updates, stock thresholds, and HR activity.</p>
        </div>

        <div className="notif-header-actions">
          <button
            type="button"
            className="notif-btn-secondary"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            Mark all as read ({unreadCount})
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="notif-toolbar">
        {/* Status Tabs */}
        <div className="notif-filter-tabs">
          <button
            type="button"
            className={`notif-tab-btn ${statusFilter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => {
              setStatusFilter('ALL')
              setCurrentPage(1)
            }}
          >
            All ({userNotifications.length})
          </button>
          <button
            type="button"
            className={`notif-tab-btn ${statusFilter === 'UNREAD' ? 'is-active' : ''}`}
            onClick={() => {
              setStatusFilter('UNREAD')
              setCurrentPage(1)
            }}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Category & Search */}
        <div className="notif-filter-controls">
          <select
            className="notif-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setCurrentPage(1)
            }}
            aria-label="Filter by category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <input
            type="search"
            className="notif-search-input"
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            aria-label="Search notifications"
          />
        </div>
      </div>

      {/* List Panel */}
      <div className="notif-list-panel">
        {paginatedItems.length === 0 ? (
          <div className="notif-empty-state">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ref-blue, #1478c9)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              <path d="m9 11 2 2 4-4" />
            </svg>
            <h3>You're all caught up</h3>
            <p>
              {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                ? 'No notifications match your current filter settings.'
                : 'There are no active notifications for your profile.'}
            </p>
            {(searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="notif-btn-secondary"
                onClick={() => {
                  setStatusFilter('ALL')
                  setCategoryFilter('ALL')
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          paginatedItems.map((item) => {
            const meta = getCategoryMeta(item.category, item.severity)
            const isUnread = !isNotificationRead(item, user)

            return (
              <div
                key={item.id}
                className={`notif-row ${isUnread ? 'is-unread' : ''}`}
              >
                <div
                  className="notif-row-main"
                  onClick={() => handleItemClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleItemClick(item)
                  }}
                >
                  <div
                    className="notif-row-icon"
                    style={{
                      backgroundColor: meta.bg,
                      color: meta.color,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>

                  <div className="notif-row-content">
                    <div className="notif-row-top">
                      <span className="notif-row-title">{item.title}</span>
                      <span
                        className="notif-badge-pill"
                        style={{
                          backgroundColor: meta.bg,
                          color: meta.color,
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <p className="notif-row-message">{item.message}</p>

                    <div className="notif-row-meta">
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      <span>&bull;</span>
                      <span>
                        {new Date(item.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="notif-row-actions">
                  {isUnread && (
                    <button
                      type="button"
                      className="notif-btn-secondary"
                      onClick={(e) => handleItemMarkRead(e, item)}
                    >
                      Mark read
                    </button>
                  )}
                  {item.link && (
                    <button
                      type="button"
                      className="notif-btn-primary"
                      onClick={() => handleItemClick(item)}
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* Pagination */}
        {filteredNotifications.length > ITEMS_PER_PAGE && (
          <div className="notif-pagination">
            <span className="notif-page-info">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)}{' '}
              of {filteredNotifications.length} notifications
            </span>

            <div className="notif-page-controls">
              <button
                type="button"
                className="notif-page-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="notif-page-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
