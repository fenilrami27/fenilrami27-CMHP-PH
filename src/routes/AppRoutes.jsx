import {
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import ProtectedRoute, {
  RoleRoute,
} from './ProtectedRoute'

import PublicRoute
  from './PublicRoute'

import MainLayout
  from '../Layouts/MainLayout'

import Login
  from '../features/auth/Login'

import Dashboard
  from '../features/dashboard/Dashboard'

import Inventory
  from '../features/inventory/Inventory'

import Companies
  from '../features/companies/Companies'

import Products
  from '../features/products/Products'

import Operations
  from '../features/operations/Operations'

import Orders
  from '../features/operations/Orders'

import Quality
  from '../features/quality/Quality'

import Production
  from '../features/production/Production'

import BmrForm
  from '../features/production/BmrForm'

import ProductionInvoice
  from '../features/production/ProductionInvoice'

import InvoiceViewPage
  from '../features/invoice/InvoiceViewPage'

import Invoice
  from '../features/invoice/Invoice'

import SupplyChain
  from '../features/supplyChain/SupplyChain'

import WorkspaceSelection
  from '../features/workspace/WorkspaceSelection'

import HrDashboard
  from '../features/hrms/HrDashboard'

import Employees
  from '../features/hrms/Employees'

import Attendance
  from '../features/hrms/Attendance'

import Leave
  from '../features/hrms/Leave'

import Holidays
  from '../features/hrms/Holidays'

import Shifts
  from '../features/hrms/Shifts'

import Designations
  from '../features/hrms/Designations'

import Payroll
  from '../features/hrms/Payroll'

import HrReports
  from '../features/hrms/HrReports'

import MySalary
  from '../features/hrms/MySalary'

import AuditLog
  from '../features/hrms/AuditLog'

import Profile
  from '../features/profile/Profile'

import NotificationsPage
  from '../features/notifications/NotificationsPage'

import NotFound
  from '../components/NotFound'


export default function AppRoutes() {

  return (

    <Routes>

      {/* =====================================================
          ROOT
          ===================================================== */}

      <Route
        path="/"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />


      {/* =====================================================
          PUBLIC
          ===================================================== */}

      <Route
        element={
          <PublicRoute />
        }
      >

        <Route
          path="/login"
          element={
            <Login />
          }
        />

      </Route>


      {/* =====================================================
          PROTECTED
          ===================================================== */}

      <Route
        element={
          <ProtectedRoute />
        }
      >

        {/* WORKSPACE SELECTION */}

        <Route
          path="/workspace-select"
          element={
            <WorkspaceSelection />
          }
        />


        {/* ===================================================
            MAIN APPLICATION LAYOUT
            =================================================== */}

        <Route
          element={
            <MainLayout />
          }
        >

          {/* =================================================
              PROFILE
              ================================================= */}

          <Route
            path="/profile"
            element={
              <Profile />
            }
          />

          {/* =================================================
              NOTIFICATIONS
              ================================================= */}

          <Route
            path="/notifications"
            element={
              <NotificationsPage />
            }
          />


          {/* =================================================
              DASHBOARD
              ================================================= */}

          <Route
            path="/dashboard"
            element={
              <Dashboard />
            }
          />


          {/* =================================================
              USER MANAGEMENT
              ================================================= */}

          <Route
            path="/companies"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'HR_ADMINISTRATOR',
                  'HR_MANAGER',
                ]}
              >
                <Companies />
              </RoleRoute>
            }
          />


          {/* =================================================
              INVENTORY
              ================================================= */}

          <Route
            path="/inventory/*"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'STORES_MANAGER',
                  'STORES_USER',
                ]}
              >
                <Inventory />
              </RoleRoute>
            }
          />


          {/* =================================================
              PRODUCTS
              ================================================= */}

          <Route
            path="/products"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                ]}
              >
                <Products />
              </RoleRoute>
            }
          />

          <Route
            path="/operations"
            element={
              <Navigate to="/products" replace />
            }
          />


          {/* =================================================
              ORDERS
              ================================================= */}

          <Route
            path="/orders"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                ]}
              >
                <Orders />
              </RoleRoute>
            }
          />
          <Route
            path="/orders/new"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                ]}
              >
                <Orders defaultMode="create" />
              </RoleRoute>
            }
          />
          <Route
            path="/orders/edit/:id"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                ]}
              >
                <Orders defaultMode="edit" />
              </RoleRoute>
            }
          />


          {/* =================================================
              QUALITY CONTROL & QA RELEASE
              ================================================= */}

          <Route
            path="/quality"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                ]}
              >
                <Quality />
              </RoleRoute>
            }
          />


          {/* =================================================
              PRODUCTION & BMR
              ================================================= */}

          <Route
            path="/production"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                  'EMPLOYEE',
                ]}
              >
                <Production />
              </RoleRoute>
            }
          />

          <Route
            path="/production/bmr"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                  'EMPLOYEE',
                ]}
              >
                <BmrForm />
              </RoleRoute>
            }
          />

          <Route
            path="/production/bmr/:orderId"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                  'EMPLOYEE',
                ]}
              >
                <BmrForm />
              </RoleRoute>
            }
          />

          <Route
            path="/production/invoice/:orderId"
            element={<Navigate to="/invoices" replace />}
          />

          <Route
            path="/invoices/new"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                  'EMPLOYEE',
                ]}
              >
                <InvoiceViewPage isNew />
              </RoleRoute>
            }
          />

          <Route
            path="/invoices/view/:id"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                  'EMPLOYEE',
                ]}
              >
                <InvoiceViewPage />
              </RoleRoute>
            }
          />

          <Route
            path="/invoices/:id"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                  'STORES_MANAGER',
                  'HR_MANAGER',
                  'EMPLOYEE',
                ]}
              >
                <InvoiceViewPage />
              </RoleRoute>
            }
          />


          {/* =================================================
              INVOICING
              ================================================= */}

          <Route
            path="/invoices"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                ]}
              >
                <Invoice />
              </RoleRoute>
            }
          />


          {/* =================================================
              SUPPLY CHAIN
              ================================================= */}

          <Route
            path="/supply-chain"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'STORES_MANAGER',
                  'STORES_USER',
                ]}
              >
                <SupplyChain />
              </RoleRoute>
            }
          />


          {/* =================================================
              CUSTOMER MANAGEMENT
              ================================================= */}

          <Route
            path="/customer-management"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'DEPARTMENT_MANAGER',
                ]}
              >
                <Operations
                  standaloneCustomers
                />
              </RoleRoute>
            }
          />


          {/* =================================================
              HRMS
              ================================================= */}

          <Route
            path="/hrms"
            element={
              <HrDashboard />
            }
          />


          <Route
            path="/hrms/employees"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'HR_ADMINISTRATOR',
                  'HR_MANAGER',
                ]}
              >
                <Employees />
              </RoleRoute>
            }
          />


          <Route
            path="/hrms/attendance"
            element={
              <Attendance />
            }
          />


          <Route
            path="/hrms/leave"
            element={
              <Leave />
            }
          />


          <Route
            path="/hrms/holidays"
            element={
              <Holidays />
            }
          />


          <Route
            path="/hrms/shifts"
            element={
              <Shifts />
            }
          />


          <Route
            path="/hrms/designations"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'HR_ADMINISTRATOR',
                  'HR_MANAGER',
                ]}
              >
                <Designations />
              </RoleRoute>
            }
          />

          <Route
            path="/hrms/designation"
            element={
              <Navigate to="/hrms/designations" replace />
            }
          />


          {/* =================================================
              PAYROLL (Admin management or Employee own salary)
              ================================================= */}

          <Route
            path="/hrms/payroll"
            element={
              <RoleRoute adminOnly>
                <Payroll
                  initialTab="structures"
                />
              </RoleRoute>
            }
          />


          {/* =================================================
              EMPLOYEE MY SALARY
              ================================================= */}

          <Route
            path="/hrms/my-salary"
            element={
              <RoleRoute
                nonAdminOnly
              >
                <MySalary />
              </RoleRoute>
            }
          />


          {/* =================================================
              SALARY HISTORY
              ================================================= */}

          <Route
            path="/hrms/salary-history"
            element={
              <RoleRoute
                adminOnly
              >
                <Payroll
                  initialTab="history"
                />
              </RoleRoute>
            }
          />


          {/* =================================================
              AUDIT LOGS

              IMPORTANT:
              This must use AuditLog.jsx.

              Do NOT use:
              <Payroll initialTab="audit" />
              ================================================= */}

          <Route
            path="/hrms/audit-log"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'HR_ADMINISTRATOR',
                  'HR_MANAGER',
                ]}
              >
                <AuditLog />
              </RoleRoute>
            }
          />


          {/* =================================================
              HR REPORTS
              ================================================= */}

          <Route
            path="/hrms/reports"
            element={
              <RoleRoute
                roles={[
                  'SUPER_ADMIN',
                  'MANAGEMENT',
                  'HR_ADMINISTRATOR',
                  'HR_MANAGER',
                ]}
              >
                <HrReports />
              </RoleRoute>
            }
          />

        </Route>

      </Route>


      {/* =====================================================
          FALLBACK
          ===================================================== */}

      <Route
        path="*"
        element={
          <NotFound />
        }
      />

    </Routes>

  )

}