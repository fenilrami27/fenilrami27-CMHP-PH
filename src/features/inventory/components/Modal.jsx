import './Modal.css'

export default function Modal({ title, onClose, children, footer }) {
  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={(event) => event.stopPropagation()}>
        <div className="inv-modal-header">
          <h3>{title}</h3>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="inv-modal-body">{children}</div>
        {footer && <div className="inv-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}