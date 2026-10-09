import { useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'

import OverviewTab from './tabs/OverviewTab'
import CommonProductsTab from './tabs/CommonProductsTab'
import CommonMaterialsTab from './tabs/CommonMaterialsTab'
import CommonOrdersTab from './tabs/CommonOrdersTab'
import StockTab from './tabs/StockTab'
import IssueReturnTab from './tabs/IssueReturnTab'
import StockLedgerTab from './tabs/StockLedgerTab'

import './Inventory.css'


/* =========================================================
   INVENTORY COMPONENT
   ========================================================= */

export default function Inventory() {

    const { user } = useAuth()
    const location = useLocation()

    const role = user?.profile?.role


    /* =====================================================
       CURRENT INVENTORY SECTION
       ===================================================== */

    const activePath =
        location.pathname.replace(/\/+$/, '') ||
        '/inventory'


    const activeSection =
        activePath === '/inventory'
            ? 'overview'
            : activePath === '/inventory/products'
                ? 'products'
                : activePath === '/inventory/materials'
                    ? 'materials'
                    : activePath === '/inventory/orders'
                        ? 'orders'
                        : activePath === '/inventory/stock'
                            ? 'stock'
                            : activePath === '/inventory/issue-return'
                                ? 'issue-return'
                                : (activePath === '/inventory/ledger' || activePath === '/inventory/stock-ledger')
                                    ? 'ledger'
                                    : 'overview'


    /* =====================================================
       COMMON INVENTORY ACCESS
       ===================================================== */

    const canAccess =
        user?.is_superuser === true ||
        role === 'SUPER_ADMIN' ||
        user?.profile?.can_access_common_inventory === true


    /* =====================================================
       ACCESS DENIED
       ===================================================== */

    if (!canAccess) {

        return (
            <div className="inv">

                <div className="inv-panel inv-empty">

                    You don't currently have access to the
                    Common Store &amp; Inventory module.
                    Ask an admin to enable it for your
                    account.

                </div>

            </div>
        )

    }


    /* =====================================================
       MAIN INVENTORY UI
       ===================================================== */

    return (

        <div className="inv">


            {/* =================================================
                HEADER
                ================================================= */}

            <div className="inv-header top-banner">

                <div>

                    <span className="page-hero-pill">
                        {activeSection === 'ledger'
                            ? 'PHARMACEUTICAL INVENTORY REGISTER'
                            : 'COMMON STORE & WAREHOUSE'}
                    </span>

                    <h1>
                        {activeSection === 'ledger'
                            ? 'Chemical & Stock Ledger'
                            : 'Common Inventory'}
                    </h1>

                    <p>
                        {activeSection === 'ledger'
                            ? 'Standard dual-register stock ledger: side-by-side Inward & Outward tracking, container math (kg to bags), opening stock carry-forward, and running physical balance.'
                            : 'Common Store & Inventory — shared across CMHP Pharma and Tej Biocare.'}
                    </p>

                </div>

            </div>


            {/* =================================================
                ACTIVE SECTION CONTENT
                ================================================= */}

            {activeSection === 'overview' && (
                <OverviewTab />
            )}

            {activeSection === 'products' && (
                <CommonProductsTab
                    role={role}
                />
            )}

            {activeSection === 'materials' && (
                <CommonMaterialsTab
                    role={role}
                />
            )}

            {activeSection === 'orders' && (
                <CommonOrdersTab
                    role={role}
                />
            )}

            {activeSection === 'stock' && (
                <StockTab
                    role={role}
                />
            )}


            {activeSection === 'issue-return' && (

                <IssueReturnTab />

            )}


            {activeSection === 'ledger' && (

                <StockLedgerTab />

            )}

        </div>

    )

}