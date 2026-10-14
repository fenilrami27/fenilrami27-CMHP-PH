import { useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import CommonOrdersTab from '../inventory/tabs/CommonOrdersTab'
import { selectActiveCompanyId } from '../../utils/companySelectors'
import HeroBanner from '../../components/HeroBanner'
import { storage } from '../../utils/storage'
import { canCreateOrders, canEditOrders, getOrderRole } from './orderPermissions'
import AccessDenied from '../../components/AccessDenied'
import '../inventory/Inventory.css'
import './Orders.css'

export default function Orders({ role, defaultMode = null }) {
  const { id } = useParams()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const isTej = Number(activeCompanyId) === 2
  const companyName = isTej ? 'Tej Biocare' : 'CMHP Pharma'
  const currentUser = storage.getUser()

  // Route guard: direct access to /orders/new
  if (defaultMode === 'create' && !canCreateOrders(currentUser)) {
    return (
      <div className="orders-page inv" style={{ padding: '24px 16px' }}>
        <AccessDenied
          title="Access Denied"
          message={`Your role (${getOrderRole(currentUser)}) does not have permission to create orders.`}
          returnPath="/orders"
          returnLabel="Return to Orders"
        />
      </div>
    )
  }

  // Route guard: direct access to /orders/edit/:id
  if (defaultMode === 'edit' && !canEditOrders(currentUser)) {
    return (
      <div className="orders-page inv" style={{ padding: '24px 16px' }}>
        <AccessDenied
          title="Access Denied"
          message={`Your role (${getOrderRole(currentUser)}) does not have permission to edit orders.`}
          returnPath="/orders"
          returnLabel="Return to Orders"
        />
      </div>
    )
  }

  return (
    <div className="orders-page inv">
      <HeroBanner
        eyebrow={`${companyName} Workspace`}
        title={`${companyName} Sales Orders`}
        subtitle="Manage sales orders, check raw material availability, auto-calculate formula requirements and schedule production batches."
      />

      <CommonOrdersTab
        role={role}
        isCompanyScoped={true}
        initialMode={defaultMode}
        initialOrderId={id}
      />
    </div>
  )
}