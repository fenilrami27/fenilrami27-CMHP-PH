import { useNavigate } from 'react-router-dom'
import Button from './Button'

export default function AccessDenied({
  title = 'Access Restricted',
  message = 'You do not have permission to access this page or action.',
  returnPath = '/orders',
  returnLabel = 'Back to Orders',
}) {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        margin: '20px auto',
        maxWidth: 520,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          marginBottom: 16,
          color: '#ef4444',
        }}
      >
        🔒
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#0f172a', fontWeight: 700 }}>
        {title}
      </h3>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.5, maxWidth: 380 }}>
        {message}
      </p>
      <Button
        variant="primary"
        onClick={() => navigate(returnPath)}
      >
        {returnLabel}
      </Button>
    </div>
  )
}
