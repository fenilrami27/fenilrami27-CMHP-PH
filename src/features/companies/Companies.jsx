import { useState } from 'react'
import useAuth from '../../hooks/useAuth'

import {
  canManageAccess,
  canManageDepartments,
  canViewCompanies,
} from './permissions'

import CompaniesTab from './tabs/CompaniesTab'
import DepartmentsTab from './tabs/DepartmentsTab'
import UserAccessTab from './tabs/UserAccessTab'

import './Companies.css'

export default function Companies() {
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState('companies')

  const canAccess = canViewCompanies(user)
  const canAccessUsers = canManageAccess(user)
  const canAccessDepartments = canManageDepartments(user)
  const canAccessCompanies = canViewCompanies(user)

  /*
   * If the user does not have access to
   * Company / User Management, show the
   * access-denied state.
   */
  if (!canAccess) {
    return (
      <div className="companies">
        <section className="company-panel company-no-access">
          <h1>Administration</h1>
          <p className="company-text">
            Your current role does not have access to company, department, or user administration.
            Contact your Super Administrator to review permissions.
          </p>
        </section>
      </div>
    )
  }

  /*
   * Resolve default tab if selected tab is not permitted
   */
  const resolvedTab =
    activeTab === 'companies' && !canAccessCompanies
      ? canAccessUsers
        ? 'users'
        : 'departments'
      : activeTab === 'users' && !canAccessUsers
        ? canAccessCompanies
          ? 'companies'
          : 'departments'
        : activeTab === 'departments' && !canAccessDepartments
          ? canAccessCompanies
            ? 'companies'
            : 'users'
          : activeTab

  return (
    <div className="companies">
      {/* =====================================================
          HEADER
          ===================================================== */}
      <header className="company-header">
        <div className="company-header-content">
          <span className="company-eyebrow">Enterprise Administration</span>
          <h1>Multi-Company &amp; Access Control</h1>
          <p>
            Manage pharmaceutical legal entities, corporate departments, and granular 5-level user permissions from one centralized administration console.
          </p>
        </div>

        <div className="company-header-mark" aria-hidden="true">
          <span>+</span>
        </div>
      </header>

      {/* =====================================================
          TABS
          ===================================================== */}
      <div className="company-tabs">
        {canAccessCompanies && (
          <button
            type="button"
            className={
              resolvedTab === 'companies'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() => setActiveTab('companies')}
          >
            Company Master
          </button>
        )}

        {canAccessDepartments && (
          <button
            type="button"
            className={
              resolvedTab === 'departments'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() => setActiveTab('departments')}
          >
            Departments
          </button>
        )}

        {canAccessUsers && (
          <button
            type="button"
            className={
              resolvedTab === 'users'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() => setActiveTab('users')}
          >
            User Accounts &amp; Access
          </button>
        )}
      </div>

      {/* =====================================================
          TAB CONTENT
          ===================================================== */}
      {resolvedTab === 'companies' && <CompaniesTab />}
      {resolvedTab === 'departments' && <DepartmentsTab />}
      {resolvedTab === 'users' && <UserAccessTab />}
    </div>
  )
}