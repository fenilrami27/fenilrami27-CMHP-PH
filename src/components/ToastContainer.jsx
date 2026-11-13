import {
  useEffect,
  useState,
  useRef,
} from 'react'
import { useSelector } from 'react-redux'
import useAuth from '../hooks/useAuth'
import {
  subscribeNotifications,
  isNotificationForUser,
} from '../utils/notifications'
import { selectActiveCompanyId } from '../utils/companySelectors'

import './ToastContainer.css'

export default function ToastContainer() {
  const { user } = useAuth()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const userRef = useRef(user)
  const activeCompanyIdRef = useRef(activeCompanyId)

  const [
    notifications,
    setNotifications,
  ] = useState([])

  useEffect(() => {
    userRef.current = user
    activeCompanyIdRef.current = activeCompanyId
  }, [user, activeCompanyId])

  // Clear toasts when active company changes
  useEffect(() => {
    setNotifications((current) =>
      current.filter((item) =>
        isNotificationForUser(item, user, activeCompanyId)
      )
    )
  }, [activeCompanyId, user])

  useEffect(() => {
    return subscribeNotifications(
      (notification) => {
        // Enforce strict company isolation & role-wise check for toast alerts
        if (
          !isNotificationForUser(
            notification,
            userRef.current,
            activeCompanyIdRef.current
          )
        ) {
          return
        }

        const id =
          `${Date.now()}-${Math.random()}`

        setNotifications(
          (current) => [
            ...current,
            {
              id,
              ...notification,
            },
          ]
        )

        window.setTimeout(
          () => {
            setNotifications(
              (current) =>
                current.filter(
                  (item) =>
                    item.id !== id
                )
            )
          },
          3500
        )
      }
    )
  }, [])

  return (
    <div className="cmhp-toast-container">
      {notifications.map(
        (notification) => (
          <div
            key={notification.id}
            className={`cmhp-toast cmhp-toast-${notification.type}`}
          >
            {notification.message}
          </div>
        )
      )}
    </div>
  )
}
