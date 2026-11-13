/**
 * Company Branding Helper
 *
 * Central authority for document branding across CMHP Pharma and Tej Biocare.
 * Rules:
 *  - CMHP IS UNTOUCHED: returns existing legacy assets and values exactly as today.
 *  - Tej Biocare returns /logo2.jpeg, TEJ BIOCARE uppercase header, and TEJ code.
 *  - Resolves company from record first, falling back to active workspace.
 */

import { getSelectedWorkspace, WORKSPACES } from './workspace.js'

export function isTejBiocare(target) {
  if (target === undefined || target === null || target === '') {
    const ws = getSelectedWorkspace()
    return ws === WORKSPACES.COMPANY_B || ws === 'company_b' || ws === '2' || ws === 2 || ws === 'tej'
  }

  // If a number was passed
  if (typeof target === 'number') {
    return target === 2
  }

  // If a string was passed
  if (typeof target === 'string') {
    const s = target.trim().toLowerCase()
    if (s === '2' || s === 'company_b' || s === 'tej' || s.includes('tej')) {
      return true
    }
    if (s === '1' || s === 'company_a' || s === 'cmhp' || s.includes('cmhp')) {
      return false
    }
    const ws = getSelectedWorkspace()
    return ws === WORKSPACES.COMPANY_B || ws === 'company_b' || ws === '2' || ws === 2 || ws === 'tej'
  }

  // If an object (order, invoice, batch, product, company, etc.) was passed
  if (typeof target === 'object') {
    // 1. Explicit company ID
    const compId = target.company ?? target.company_id ?? target.companyId ?? target.activeCompanyId ?? target.id
    if (compId !== undefined && compId !== null && compId !== '') {
      if (compId === 2 || compId === '2' || compId === 'company_b' || compId === 'tej' || compId === 'TEJ') {
        return true
      }
      if (compId === 1 || compId === '1' || compId === 'company_a' || compId === 'cmhp' || compId === 'CMHP') {
        return false
      }
    }

    // 2. Explicit company name
    const compName = target.company_name || target.companyName || target.name || ''
    if (typeof compName === 'string' && compName) {
      const lower = compName.toLowerCase()
      if (lower.includes('tej')) return true
      if (lower.includes('cmhp')) return false
    }

    // 3. Explicit company code
    const compCode = target.company_code || target.companyCode || target.code || ''
    if (typeof compCode === 'string' && compCode) {
      const upper = compCode.toUpperCase()
      if (upper === 'TEJ' || upper === 'TB') return true
      if (upper === 'CMHP') return false
    }

    // Fall back to active workspace
    const ws = getSelectedWorkspace()
    return ws === WORKSPACES.COMPANY_B || ws === 'company_b' || ws === '2' || ws === 2 || ws === 'tej'
  }

  return false
}

export function getCompanyBranding(target) {
  const isTej = isTejBiocare(target)

  if (isTej) {
    return {
      isTej: true,
      isCMHP: false,
      logoSrc: '/logo2.jpeg',
      invoiceLogoSrc: '/logo2.jpeg',
      headerName: 'TEJ BIOCARE',
      normalName: 'Tej Biocare',
      legalName: 'Tej Biocare',
      code: 'TEJ',
      forCompany: 'For Tej Biocare',
      mfgFor: 'TEJ',
      companyNameUpper: 'TEJ BIOCARE',
      bmrPrefix: 'BMR/TEJ',
      tagline: 'Healthcare & Formulations',
      logoFitClass: 'tej-logo-fit',
    }
  }

  return {
    isTej: false,
    isCMHP: true,
    logoSrc: '/logo.jpg',
    invoiceLogoSrc: '/cmhp_invoice_logo.png',
    headerName: 'CMHP PRIVATE LIMITED',
    normalName: 'CMHP Pharma',
    legalName: 'CMHP Pharmaceuticals Private Limited',
    code: 'CMHP',
    forCompany: 'For CMHP Private Limited',
    mfgFor: 'CMHP',
    companyNameUpper: 'CMHP PHARMACEUTICALS PVT. LTD.',
    bmrPrefix: 'BMR/CMHP',
    tagline: 'Better Health Brighter Tomorrow',
    logoFitClass: '',
  }
}
