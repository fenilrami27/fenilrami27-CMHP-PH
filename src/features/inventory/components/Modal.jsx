import { useEffect } from 'react'
import './Modal.css'

export default function Modal({
  isOpen = true,
  title,
  onClose,
  children,
  footer,
  maxWidth,
}) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  if (isOpen === false) {
    return null
  }

  return (
    <div className="inv-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="inv-modal"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inv-modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="inv-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="inv-modal-body">{children}</div>
        {footer && <div className="inv-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}