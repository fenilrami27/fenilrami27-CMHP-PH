import { useSelector } from 'react-redux'
import CommonOrdersTab from '../inventory/tabs/CommonOrdersTab'
import { selectActiveCompanyId } from '../../utils/companySelectors'
import HeroBanner from '../../components/HeroBanner'
import '../inventory/Inventory.css'
import './Orders.css'

export default function Orders({ role }) {
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const isTej = Number(activeCompanyId) === 2
  const companyName = isTej ? 'Tej Biocare' : 'CMHP Pharma'

  return (
    <div className="orders-page inv">
      <HeroBanner
        eyebrow={`${companyName} Workspace`}
        title={`${companyName} Sales Orders`}
        subtitle="Manage sales orders, check raw material availability, auto-calculate formula requirements and schedule production batches."
      />

      <CommonOrdersTab role={role} isCompanyScoped={true} />
    </div>
  )
}