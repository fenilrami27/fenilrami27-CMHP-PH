import { useState, useEffect, useRef } from 'react'

import {
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom'

import useAuth from '../hooks/useAuth'
import useWorkspace from '../hooks/useWorkspace'

import {
  DashboardIcon,
  InventoryIcon,
  FlaskIcon,
  TruckIcon,
  ShieldCheckIcon,
  UsersIcon,
  UserIcon,
  MenuIcon,
  CloseIcon,
  LogoutIcon,
  ReceiptIcon,
  ClockIcon,
  CalendarIcon,
  WalletIcon,
  ClipboardIcon,
  BuildingIcon,
  FactoryIcon,
} from '../components/icons'

import {
  SidebarScene,
} from '../components/PharmaArt'

import WorkspaceSwitcher
  from '../components/WorkspaceSwitcher'
import NotificationBell
  from '../components/NotificationBell'

import {
  WORKSPACES,
  getCurrentWorkspace,
  getSelectedWorkspace,
  requiresWorkspaceSelection,
} from '../utils/workspace'

import './MainLayout.css'


/* =========================================================
   NAVIGATION
   ========================================================= */

const NAV_SECTIONS = [

  {
    title: 'Main menu',

    items: [

      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: DashboardIcon,
        accent: '#4f8cff',
        companyOnly: true,
      },

      {
        label: 'Products',
        path: '/products',
        icon: FlaskIcon,
        accent: '#22b8a6',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DEPARTMENT_MANAGER', 'STORES_MANAGER'],
      },

      {
        label: 'Orders',
        path: '/orders',
        icon: ClipboardIcon,
        accent: '#f2b84b',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DEPARTMENT_MANAGER', 'STORES_MANAGER', 'HR_MANAGER'],
      },

      {
        label: 'Quality Control',
        path: '/quality',
        icon: ShieldCheckIcon,
        accent: '#34d399',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DEPARTMENT_MANAGER'],
      },

      {
        label: 'Production',
        path: '/production',
        icon: FactoryIcon,
        accent: '#f97316',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DEPARTMENT_MANAGER', 'STORES_MANAGER', 'HR_MANAGER', 'EMPLOYEE'],
      },

      {
        label: 'Invoicing',
        path: '/invoices',
        icon: ReceiptIcon,
        accent: '#0b73df',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT'],
      },

      {
        label: 'Supply Chain',
        path: '/supply-chain',
        icon: TruckIcon,
        accent: '#f5a623',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Dispatch',
        path: '/dispatch',
        icon: TruckIcon,
        accent: '#10b981',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DEPARTMENT_MANAGER', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Customer Management',
        path: '/customer-management',
        icon: UsersIcon,
        accent: '#34d399',
        companyOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DEPARTMENT_MANAGER'],
      },

      {
        label: 'User Management',
        path: '/companies',
        icon: UsersIcon,
        accent: '#34d399',
        companyOnly: true,
        requiresCompanyAccess: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'HR_ADMINISTRATOR', 'HR_MANAGER'],
      },

    ],
  },


  {
    title: 'Inventory',

    items: [

      {
        label: 'Dashboard',
        path: '/inventory',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Products',
        path: '/inventory/products',
        icon: FlaskIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Raw Materials',
        path: '/inventory/materials',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Orders',
        path: '/inventory/orders',
        icon: ClipboardIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Stock & Lots',
        path: '/inventory/stock',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Issue / Return',
        path: '/inventory/issue-return',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Stock Ledger',
        path: '/inventory/ledger',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Samples',
        path: '/inventory/samples',
        icon: FlaskIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

      {
        label: 'Stock Requests',
        path: '/inventory/requests',
        icon: ClipboardIcon,
        accent: '#f59e0b',
        commonInventoryOnly: true,
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'STORES_MANAGER', 'STORES_USER'],
      },

    ],
  },


  {
    title: 'HRMS',

    items: [

      {
        label: 'HR Dashboard',
        path: '/hrms',
        icon: BuildingIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Employees',
        path: '/hrms/employees',
        icon: UsersIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsManage: true,
      },

      {
        label: 'Attendance',
        path: '/hrms/attendance',
        icon: ClockIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Leave',
        path: '/hrms/leave',
        icon: CalendarIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Holidays',
        path: '/hrms/holidays',
        icon: CalendarIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Shifts',
        path: '/hrms/shifts',
        icon: ClockIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Designations',
        path: '/hrms/designations',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsMasters: true,
      },


      /* =====================================================
         PAYROLL

         Admin / Super Admin only
         ===================================================== */

      {
        label: 'Payroll',
        path: '/hrms/payroll',
        icon: WalletIcon,
        accent: '#f472b6',
        companyOnly: true,
        adminOnly: true,
      },


      /* =====================================================
         AUDIT LOGS

         Management / HR Admin / HR Manager / Super Admin
         ===================================================== */

      {
        label: 'Audit Logs',
        path: '/hrms/audit-log',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsManage: true,
      },


      /* =====================================================
         MY SALARY

         Normal employees / users
         ===================================================== */

      {
        label: 'My Salary',
        path: '/hrms/my-salary',
        icon: WalletIcon,
        accent: '#f472b6',
        companyOnly: true,
        nonAdminOnly: true,
      },


      {
        label: 'HR Reports',
        path: '/hrms/reports',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsManage: true,
      },

    ],
  },

]


/* =========================================================
   SIDEBAR PERMISSIONS
   ========================================================= */

function visibleSections(
  user,
  activeWorkspace
) {
  const role =
    user?.profile?.role ||
    user?.role ||
    ''

  const isCommonInventory =
    activeWorkspace === WORKSPACES.COMMON

  /*
   * ADMIN CHECK
   */
  const isAdmin =
    Boolean(user?.is_superuser) ||
    role === 'SUPER_ADMIN'

  /*
   * COMPANY ACCESS
   */
  const companyAccess =
    isAdmin ||
    role === 'MANAGEMENT' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER'

  /*
   * HR MANAGEMENT ACCESS
   */
  const hrmsManageAccess =
    isAdmin ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER' ||
    role === 'MANAGEMENT'

  /*
   * HR MASTER ACCESS
   */
  const hrmsMastersAccess =
    isAdmin ||
    role === 'HR_ADMINISTRATOR'

  // Requirement 1:
  // When Common Inventory is selected, show ONLY the Inventory section.
  // When a Company workspace is selected, show ONLY company sections (Main menu and HRMS).
  const targetSections = isCommonInventory
    ? NAV_SECTIONS.filter((section) => section.title === 'Inventory')
    : NAV_SECTIONS.filter((section) => section.title !== 'Inventory')

  return targetSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        // In Common Inventory, hide companyOnly items
        if (isCommonInventory && item.companyOnly) {
          return false
        }

        // In Company workspace, hide Common Inventory only items
        if (!isCommonInventory && item.commonInventoryOnly) {
          return false
        }

        // Admin sees all permitted items within the current workspace (except nonAdminOnly)
        if (isAdmin) {
          if (item.nonAdminOnly) return false
          return true
        }

        // Company and HR role checks for non-admin
        if (item.requiresCompanyAccess && !companyAccess) {
          return false
        }

        if (item.requiresHrmsManage && !hrmsManageAccess) {
          return false
        }

        if (item.requiresHrmsMasters && !hrmsMastersAccess) {
          return false
        }

        if (item.adminOnly) {
          return false
        }

        if (item.nonAdminOnly && isAdmin) {
          return false
        }

        if (
          Array.isArray(item.roles) &&
          item.roles.length > 0 &&
          !item.roles.includes(role)
        ) {
          return false
        }

        return true
      }),
    }))
    .filter((section) => section.items.length > 0)
}


/* =========================================================
   NAV ITEM
   ========================================================= */

function NavItem({
  item,
  onNavigate,
  collapsed,
}) {

  const Icon =
    item.icon


  const iconStyle = {
    '--nav-accent':
      item.accent,
  }


  return (

    <NavLink
      to={item.path}
      end
      onClick={onNavigate}
      data-label={item.label}
      title={
        collapsed
          ? item.label
          : undefined
      }
      className={({ isActive }) =>
        isActive
          ? 'nav-link active'
          : 'nav-link'
      }
    >

      <span
        className="nav-icon"
        style={iconStyle}
      >

        <Icon size={18} />

      </span>


      <span className="nav-label">

        {item.label}

      </span>

    </NavLink>

  )

}


/* =========================================================
   COMPANY LOGO
   ========================================================= */

function getCompanyLogo(
  workspaceId
) {

  if (
    workspaceId ===
    WORKSPACES.COMPANY_A
  ) {

    return '/logo.jpg'

  }


  if (
    workspaceId ===
    WORKSPACES.COMPANY_B
  ) {

    return '/logo2.jpeg'

  }


  return null

}


/* =========================================================
   MAIN LAYOUT
   ========================================================= */

export default function MainLayout() {

  const {
    user,
    logout,
  } = useAuth()


  const {
    activeWorkspace,
    activeOption,
    setActiveWorkspace,
  } = useWorkspace()


  const navigate =
    useNavigate()
  const location =
    useLocation()

  const [expandedSections, setExpandedSections] = useState({
    'Main menu': true,
    'Inventory': true,
    'HRMS': true,
  })

  const toggleSection = (title) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: prev[title] === undefined ? false : !prev[title],
    }))
  }

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false)

  const menuButtonRef = useRef(null)
  const drawerRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    if (menuOpen) {
      window.addEventListener('keydown', handleKeyDown)
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      drawerRef.current?.focus()

      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        document.body.style.overflow = prevOverflow
      }
    }
  }, [menuOpen])

  const [
    collapsed,
  ] = useState(false)

  const [
    profileOpen,
    setProfileOpen,
  ] = useState(false)

  const profileRef = useRef(null)

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false)
      }
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setProfileOpen(false)
      }
    }
    if (profileOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [profileOpen])


  const effectiveWorkspace =
    activeWorkspace ||
    getCurrentWorkspace(user) ||
    getSelectedWorkspace() ||
    WORKSPACES.COMPANY_A


  useEffect(() => {
    if (user && effectiveWorkspace && effectiveWorkspace !== activeWorkspace && setActiveWorkspace) {
      setActiveWorkspace(effectiveWorkspace)
    }
  }, [user, effectiveWorkspace, activeWorkspace, setActiveWorkspace])


  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    if (!effectiveWorkspace && requiresWorkspaceSelection(user)) {
      navigate('/workspace-select', { replace: true })
    }
  }, [user, effectiveWorkspace, navigate])


  const displayName =
    user?.first_name ||
    user?.username ||
    'Admin'


  const initial =
    displayName
      .charAt(0)
      .toUpperCase()


  const sections =
    visibleSections(
      user,
      effectiveWorkspace
    )


  const companyLogo =
    getCompanyLogo(
      effectiveWorkspace
    )


  const currentCompanyName =
    activeOption?.name ||
    (effectiveWorkspace === WORKSPACES.COMPANY_B
      ? 'Tej Biocare'
      : effectiveWorkspace === WORKSPACES.COMMON
      ? 'Common Inventory'
      : 'CMHP Pharma')


  const sidebarClass = [

    'layout-sidebar',

    menuOpen
      ? 'open'
      : '',

    collapsed
      ? 'collapsed'
      : '',

  ]
    .filter(Boolean)
    .join(' ')


  return (

    <div className="layout">

      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside
        id="app-sidebar"
        ref={drawerRef}
        tabIndex={-1}
        className={sidebarClass}
        aria-label="Navigation drawer"
      >

        <div className="sidebar-brand">

          <span
            className="sidebar-mark"
            aria-hidden="true"
          >

            {companyLogo ? (

              <img
                src={companyLogo}
                alt={
                  currentCompanyName
                }
                loading="eager"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  display: 'block',
                  padding: '3px',
                  boxSizing: 'border-box',
                }}
              />

            ) : (

              <BuildingIcon
                size={20}
              />

            )}

          </span>


          <div className="sidebar-brand-text">

            <div className="sidebar-name-row">

              <span className="sidebar-name">
                {currentCompanyName}
              </span>

            </div>


            <span className="sidebar-tag">
              Pharmaceutical ERP
            </span>

          </div>

          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => {
              setMenuOpen(false)
              menuButtonRef.current?.focus()
            }}
            aria-label="Close navigation menu"
          >
            <CloseIcon size={18} />
          </button>

        </div>


        <nav
          className="sidebar-nav"
          aria-label="Main navigation"
        >
          {sections.map((section) => {
            const isSectionActive = section.items.some(
              (item) =>
                location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path))
            )
            const isExpanded =
              expandedSections[section.title] !== undefined
                ? expandedSections[section.title]
                : true

            return (
              <div key={section.title} className="nav-section-group">
                <button
                  type="button"
                  className={`nav-section-header ${isSectionActive ? 'is-active-section' : ''}`}
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={isExpanded}
                  title={`Toggle ${section.title}`}
                >
                  <span className="nav-section-text">
                    {section.title}
                  </span>
                  <svg
                    className={`nav-section-chevron ${isExpanded ? 'is-expanded' : ''}`}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="nav-list">
                    {section.items.map((item) => (
                      <NavItem
                        key={item.label}
                        item={item}
                        collapsed={collapsed}
                        onNavigate={() => {
                          setMenuOpen(false)
                          menuButtonRef.current?.focus()
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>


        <div
          className="sidebar-art"
          aria-hidden="true"
        >

          <div className="sidebar-art-text">

            <span className="sidebar-art-logo">

              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >

                <path d="M12 21v-8" />

                <path
                  d="M12 13c-4 0-6-2.5-6-6 4 0 6 2.5 6 6Z"
                />

                <path
                  d="M12 15c0-3.5 2-6 6-6 0 3.5-2 6-6 6Z"
                />

              </svg>

            </span>


            <p>

              <strong>
                Better Health
              </strong>

              <span>
                Brighter Tomorrow
              </span>

            </p>

          </div>


          <SidebarScene />

        </div>

      </aside>


      {menuOpen && (

        <div
          className="layout-overlay"
          onClick={() => {
            setMenuOpen(false)
            menuButtonRef.current?.focus()
          }}
          aria-label="Close navigation overlay"
        />

      )}


      {/* =====================================================
          MAIN
          ===================================================== */}

      <div className="layout-main">

        <header className="layout-header">

          <button
            type="button"
            className="menu-toggle"
            ref={menuButtonRef}
            onClick={() =>
              setMenuOpen((prev) => !prev)
            }
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
          >

            <MenuIcon size={18} />

          </button>

          <div className="mobile-header-brand" aria-label={currentCompanyName}>
            <span className="mobile-header-logo" aria-hidden="true">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt=""
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <BuildingIcon size={18} />
              )}
            </span>
            <div className="mobile-header-info">
              <span className="mobile-header-name">{currentCompanyName}</span>
              <span className="mobile-header-sub">ERP</span>
            </div>
          </div>


          <div className="header-search">

            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >

              <circle
                cx="11"
                cy="11"
                r="7"
              />

              <path d="m20 20-4-4" />

            </svg>


            <input
              type="search"
              placeholder="Search companies, products, batches..."
              aria-label="Search"
            />

          </div>


          <div className="header-right">

            <WorkspaceSwitcher />


            <NotificationBell />


            {/* PROFILE MENU */}
            <div className="user-profile-menu" ref={profileRef}>
              <button
                type="button"
                className={`user-chip user-chip-button ${profileOpen ? 'is-open' : ''}`}
                onClick={() => setProfileOpen((prev) => !prev)}
                title="Account menu"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="user-avatar">
                  {initial}
                </span>

                <span className="user-meta">
                  <span className="user-name">
                    {displayName}
                  </span>
                  <span className="user-role-label">
                    {user?.profile?.role_display || user?.profile?.role || user?.role || 'Employee'}
                  </span>
                </span>
              </button>

              {profileOpen && (
                <div className="user-profile-popover" role="menu">
                  <div className="user-popover-header">
                    <div className="user-popover-name">
                      {displayName}
                    </div>
                    {user?.email && (
                      <div className="user-popover-email">
                        {user.email}
                      </div>
                    )}
                  </div>

                  <div className="user-popover-divider" />

                  <button
                    type="button"
                    className="user-popover-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false)
                      navigate('/profile')
                    }}
                  >
                    <UserIcon size={16} />
                    <span>My Profile</span>
                  </button>

                  <button
                    type="button"
                    className="user-popover-item is-signout"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false)
                      logout()
                    }}
                  >
                    <LogoutIcon size={16} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>

          </div>

        </header>


        <main className="layout-content">

          <Outlet />

        </main>

      </div>

    </div>

  )

}