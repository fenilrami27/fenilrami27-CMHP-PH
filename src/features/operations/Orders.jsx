import { useSelector } from 'react-redux'
import CommonOrdersTab from '../inventory/tabs/CommonOrdersTab'
import { selectActiveCompanyId } from '../../utils/companySelectors'
import '../inventory/Inventory.css'
import './Orders.css'

export default function Orders({ role }) {
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const isTej = Number(activeCompanyId) === 2
  const companyName = isTej ? 'Tej Biocare' : 'CMHP Pharma'

  return (
    <div className="orders-page inv">
      <div className="inv-header">
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
            background: isTej ? '#e0e7ff' : '#fef3c7',
            color: isTej ? '#3730a3' : '#92400e',
          }}
        >
          {companyName} Workspace
        </span>
        <h1>{companyName} Sales Orders</h1>
        <p style={{ margin: '6px 0 0', color: '#5a738e', fontSize: 14 }}>
          Manage sales orders, check raw material availability, auto-calculate formula requirements and schedule production batches.
        </p>
      </div>

      <CommonOrdersTab role={role} isCompanyScoped={true} />
    </div>
  )
}