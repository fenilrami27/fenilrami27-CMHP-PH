import { storage } from './storage'
import {
  getActiveCompanyId,
  getUserCompanyIds,
  WORKSPACES,
  getCurrentWorkspace,
  isManagementRole,
} from './workspace'

export function getCurrentUser() {
  return storage.getUser()
}

export function isSuperAdmin(user = getCurrentUser()) {
  return Boolean(
    user?.is_superuser ||
    user?.profile?.role === 'SUPER_ADMIN'
  )
}

export function isManagerOrAdmin(user = getCurrentUser()) {
  return isManagementRole(user)
}

/*
 * Returns the company ID of the current business workspace.
 * When in ALL_COMPANIES group view, this returns null so callers can check for consolidated view.
 */
export function getScopedCompanyId(user = getCurrentUser()) {
  return getActiveCompanyId(user)
}

export function getScopedCompanyIds(user = getCurrentUser()) {
  const current = getCurrentWorkspace(user)
  if (current === WORKSPACES.ALL_COMPANIES) {
    return getUserCompanyIds(user)
  }
  const companyId = getScopedCompanyId(user)
  return companyId ? [Number(companyId)] : []
}

export function isCommonInventoryContext(user = getCurrentUser()) {
  return getCurrentWorkspace(user) === WORKSPACES.COMMON
}

export function isAllCompaniesContext(user = getCurrentUser()) {
  return getCurrentWorkspace(user) === WORKSPACES.ALL_COMPANIES
}

export function isCompanyScopedContext(user = getCurrentUser()) {
  const current = getCurrentWorkspace(user)
  return (
    current === WORKSPACES.COMPANY_A ||
    current === WORKSPACES.COMPANY_B ||
    current === WORKSPACES.ALL_COMPANIES
  )
}

export function companyMatches(record, companyId) {
  if (!companyId) {
    return false
  }
  return Number(record?.company) === Number(companyId)
}

/*
 * Filter company-specific records.
 * Supports single company workspaces as well as All Companies group view.
 */
export function scopeCompanyRows(rows, user = getCurrentUser()) {
  const list = Array.isArray(rows) ? rows : []
  const current = getCurrentWorkspace(user)

  if (current === WORKSPACES.ALL_COMPANIES) {
    const accessible = getUserCompanyIds(user)
    return list.filter((row) => {
      if (!row?.company) return true
      return accessible.includes(Number(row.company))
    })
  }

  const companyId = getScopedCompanyId(user)
  if (!companyId) {
    return []
  }

  return list.filter((row) => companyMatches(row, companyId))
}

/*
 * Enforce company ID into newly created records.
 * If in ALL_COMPANIES mode, fallback to payload company or primary company.
 */
export function enforceCompanyPayload(payload = {}, user = getCurrentUser()) {
  const current = getCurrentWorkspace(user)
  let companyId = getScopedCompanyId(user)

  if (!companyId && current === WORKSPACES.ALL_COMPANIES) {
    companyId = payload.company || user?.profile?.primary_company || 1
  }

  if (!companyId) {
    throw new Error('Select a company workspace before creating company-specific data.')
  }

  return {
    ...payload,
    company: Number(companyId),
  }
}

export function assertCompanyRecord(id, collection, user = getCurrentUser()) {
  const current = getCurrentWorkspace(user)
  const list = Array.isArray(collection) ? collection : []

  if (current === WORKSPACES.ALL_COMPANIES) {
    const accessible = getUserCompanyIds(user)
    const record = list.find((row) => Number(row?.id) === Number(id))
    if (!record || (record.company && !accessible.includes(Number(record.company)))) {
      throw new Error('This record does not belong to any assigned company.')
    }
    return record
  }

  const companyId = getScopedCompanyId(user)
  if (!companyId) {
    throw new Error('No company workspace is active.')
  }

  const record = list.find((row) => Number(row?.id) === Number(id))
  if (!record || !companyMatches(record, companyId)) {
    throw new Error('This record does not belong to the active company.')
  }

  return record
}

export function getLockedCompanyIds(user = getCurrentUser()) {
  if (isManagementRole(user)) {
    return getUserCompanyIds(user)
  }

  const primary = Number(user?.profile?.primary_company)
  if (Number.isFinite(primary) && primary > 0) {
    return [primary]
  }

  const assigned = getUserCompanyIds(user)
  return assigned.length ? [assigned[0]] : []
}