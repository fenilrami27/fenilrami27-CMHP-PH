const WORKSPACE_KEY = 'cmhp_selected_workspace'

export const WORKSPACES = {
  COMPANY_A: 'company_a',
  COMPANY_B: 'company_b',
  COMMON: 'common_inventory',
}

export const WORKSPACE_OPTIONS = {
  COMPANY_A: {
    id: WORKSPACES.COMPANY_A,
    name: 'CMHP Pharma',
    shortName: 'CMHP',
    label: 'CMHP',
    description: 'CMHP Pharmaceuticals Private Limited operations and records',
    icon: 'building',
    companyId: 1,
  },
  COMPANY_B: {
    id: WORKSPACES.COMPANY_B,
    name: 'Tej Biocare',
    shortName: 'Tej Biocare',
    label: 'Tej Biocare',
    description: 'Tej Biocare Formulations Private Limited operations and records',
    icon: 'building',
    companyId: 2,
  },
  COMMON: {
    id: WORKSPACES.COMMON,
    name: 'Common Inventory',
    shortName: 'Common Inventory',
    label: 'Common Inventory',
    description: 'Shared physical raw materials, packaging, lots and warehouse locations',
    icon: 'inventory',
    companyId: null,
  },
}

/* =========================================================
   ROLE HELPERS
   ========================================================= */

export function isSuperAdmin(user) {
  const role = user?.profile?.role || user?.role
  return Boolean(
    user?.is_superuser ||
    role === 'SUPER_ADMIN'
  )
}

export function isManagementRole(user) {
  const role = user?.profile?.role || user?.role
  return Boolean(
    isSuperAdmin(user) ||
    role === 'MANAGEMENT'
  )
}

export function isHrRole(user) {
  const role = user?.profile?.role || user?.role
  return [
    'HR_ADMINISTRATOR',
    'HR_MANAGER',
  ].includes(role)
}

/* =========================================================
   COMPANY ACCESS
   ========================================================= */

export function getUserCompanyIds(user) {
  if (!user) return []

  // Super Admin and Management always have full access to both companies
  if (isSuperAdmin(user) || isManagementRole(user)) {
    return [1, 2]
  }

  const rawCompanies = user?.profile?.companies || user?.companies
  const companies = Array.isArray(rawCompanies) ? rawCompanies : []

  const assigned = companies
    .map(Number)
    .filter(Number.isFinite)

  /* Users with multiple companies assigned explicitly */
  if (assigned.length > 1) {
    return [...new Set(assigned)]
  }

  /* Normal users are locked to their primary company */
  const primary = Number(user?.profile?.primary_company || user?.primary_company)
  if (Number.isFinite(primary) && primary > 0) {
    return [primary]
  }

  return assigned.length ? [assigned[0]] : [1]
}

export function hasCompanyAAccess(user) {
  return getUserCompanyIds(user).includes(1)
}

export function hasCompanyBAccess(user) {
  return getUserCompanyIds(user).includes(2)
}

export function hasCommonInventoryAccess(user) {
  const role = user?.profile?.role || user?.role
  return Boolean(
    isSuperAdmin(user) ||
    role === 'SUPER_ADMIN' ||
    user?.profile?.can_access_common_inventory ||
    user?.can_access_common_inventory
  )
}

/* =========================================================
   AVAILABLE WORKSPACES
   ========================================================= */

export function getAvailableWorkspaces(user) {
  const options = []

  if (hasCompanyAAccess(user)) {
    options.push(WORKSPACE_OPTIONS.COMPANY_A)
  }

  if (hasCompanyBAccess(user)) {
    options.push(WORKSPACE_OPTIONS.COMPANY_B)
  }

  if (hasCommonInventoryAccess(user)) {
    options.push(WORKSPACE_OPTIONS.COMMON)
  }

  return options
}

/* =========================================================
   STORAGE
   ========================================================= */

export function getSelectedWorkspace() {
  try {
    return localStorage.getItem(WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function setSelectedWorkspace(workspace) {
  try {
    if (!workspace) {
      localStorage.removeItem(WORKSPACE_KEY)
      return
    }
    localStorage.setItem(WORKSPACE_KEY, workspace)
  } catch {
    // Ignore localStorage errors
  }
}

export function clearSelectedWorkspace() {
  try {
    localStorage.removeItem(WORKSPACE_KEY)
  } catch {
    // Ignore localStorage errors
  }
}

/* =========================================================
   CURRENT WORKSPACE
   ========================================================= */

export function hasValidSelectedWorkspace(user) {
  const selected = getSelectedWorkspace()
  const available = getAvailableWorkspaces(user)

  if (!selected) {
    return false
  }

  return available.some((workspace) => workspace.id === selected) || Object.values(WORKSPACES).includes(selected)
}

export function getCurrentWorkspace(user) {
  const selected = getSelectedWorkspace()
  const available = getAvailableWorkspaces(user)

  if (selected) {
    if (available.some((workspace) => workspace.id === selected)) {
      return selected
    }
    if (Object.values(WORKSPACES).includes(selected)) {
      return selected
    }
  }

  /* Automatically select when there is only one workspace */
  if (available.length === 1) {
    const workspace = available[0].id
    setSelectedWorkspace(workspace)
    return workspace
  }

  if (available.length > 0) {
    return available[0].id
  }

  return null
}

export function getCurrentWorkspaceObject(user) {
  const current = getCurrentWorkspace(user)
  const available = getAvailableWorkspaces(user)

  return available.find((workspace) => workspace.id === current) || Object.values(WORKSPACE_OPTIONS).find((w) => w.id === current) || null
}

/* =========================================================
   ACTIVE COMPANY
   ========================================================= */

export function getActiveCompanyId(user) {
  const current = getCurrentWorkspace(user) || getSelectedWorkspace()

  if (current === WORKSPACES.COMPANY_A) {
    return 1
  }

  if (current === WORKSPACES.COMPANY_B) {
    return 2
  }

  return null
}

export function getActiveCompanyIds(user) {
  const companyId = getActiveCompanyId(user)
  return companyId ? [companyId] : []
}

/* =========================================================
   ROUTE RULES
   ========================================================= */

export function requiresWorkspaceSelection(user) {
  return getAvailableWorkspaces(user).length > 1
}

export function isCommonInventoryWorkspace(user) {
  return getCurrentWorkspace(user) === WORKSPACES.COMMON
}

export function isAllCompaniesWorkspace() {
  return false
}

export function isCompanyWorkspace(user) {
  const current = getCurrentWorkspace(user)
  return (
    current === WORKSPACES.COMPANY_A ||
    current === WORKSPACES.COMPANY_B
  )
}

/* =========================================================
   BACKWARD COMPATIBILITY
   ========================================================= */

export function getActiveWorkspaceForUser(user) {
  return getCurrentWorkspace(user)
}

export function setStoredWorkspace(workspace) {
  setSelectedWorkspace(workspace)
}

export function clearStoredWorkspace() {
  clearSelectedWorkspace()
}