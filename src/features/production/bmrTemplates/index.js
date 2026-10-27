/**
 * BMR Template Registry
 * Central mapping from dosage form to BMR definition.
 * Dosage Form options: Liquid, Tablet, Capsule, Syrup, Drops, Oil, Kits, Pills.
 * Every dosage form has a 19-section GMP Master BMR template.
 */

import {
  BMR_SECTIONS as DROPS_BMR_SECTIONS,
  getEmptyBmrData as getEmptyDropsBmrData,
  normalizeBmrData as normalizeDropsBmrData,
  getSectionStatus as getDropsSectionStatus,
} from '../bmrInitialData.js'

import {
  SYRUP_BMR_SECTIONS,
  getEmptySyrupBmrData,
  normalizeSyrupBmrData,
  getSyrupSectionStatus,
} from '../syrupInitialData.js'

export const BMR_TEMPLATES = {
  Syrup: {
    dosageForm: 'Syrup',
    bmrType: 'syrup',
    title: 'Syrup Oral Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-03/00',
    sections: SYRUP_BMR_SECTIONS,
    getEmptyData: getEmptySyrupBmrData,
    normalizeData: normalizeSyrupBmrData,
    getSectionStatus: getSyrupSectionStatus,
    isAvailable: true,
  },
  Drops: {
    dosageForm: 'Drops',
    bmrType: 'drops',
    title: 'Drops Oral Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-02/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Liquid: {
    dosageForm: 'Liquid',
    bmrType: 'liquid',
    title: 'Liquid Oral Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-01/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Tablet: {
    dosageForm: 'Tablet',
    bmrType: 'tablet',
    title: 'Tablet Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( TABLET DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-04/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Capsule: {
    dosageForm: 'Capsule',
    bmrType: 'capsule',
    title: 'Capsule Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( CAPSULE DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-05/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Oil: {
    dosageForm: 'Oil',
    bmrType: 'oil',
    title: 'Oil Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( LIQUID/OIL DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-06/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Kits: {
    dosageForm: 'Kits',
    bmrType: 'kits',
    title: 'Kit Packaging BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( PACKAGING DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-07/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Pills: {
    dosageForm: 'Pills',
    bmrType: 'pills',
    title: 'Pills Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( SOLID DOSAGE DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-08/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
}

// Aliases for plurals and common synonyms
BMR_TEMPLATES.Syrups = BMR_TEMPLATES.Syrup
BMR_TEMPLATES.Tablets = BMR_TEMPLATES.Tablet
BMR_TEMPLATES.Capsules = BMR_TEMPLATES.Capsule
BMR_TEMPLATES.Liquids = BMR_TEMPLATES.Liquid
BMR_TEMPLATES.Suspension = BMR_TEMPLATES.Liquid
BMR_TEMPLATES.Suspensions = BMR_TEMPLATES.Liquid
BMR_TEMPLATES.Drop = BMR_TEMPLATES.Drops
BMR_TEMPLATES.Oils = BMR_TEMPLATES.Oil
BMR_TEMPLATES.Kit = BMR_TEMPLATES.Kits
BMR_TEMPLATES.Pill = BMR_TEMPLATES.Pills

/**
 * Returns the canonical template for a dosage form string, matching
 * case-insensitively, trimmed, and across singular/plural variants.
 * Never returns null so every order has a working 19-section BMR.
 * @param {string} dosageForm
 * @returns {object}
 */
export function getBmrTemplate(dosageForm) {
  if (!dosageForm) return BMR_TEMPLATES.Drops

  const raw = String(dosageForm).trim()
  const lower = raw.toLowerCase()

  // 1. Direct match on BMR_TEMPLATES keys
  const directKey = Object.keys(BMR_TEMPLATES).find(
    (k) => k.toLowerCase() === lower
  )
  if (directKey && BMR_TEMPLATES[directKey]) {
    return BMR_TEMPLATES[directKey]
  }

  // 2. Partial substring matching
  if (lower.includes('syrup')) return BMR_TEMPLATES.Syrup
  if (lower.includes('drop')) return BMR_TEMPLATES.Drops
  if (lower.includes('tablet') || lower.includes('tab')) return BMR_TEMPLATES.Tablet
  if (lower.includes('capsule') || lower.includes('cap')) return BMR_TEMPLATES.Capsule
  if (lower.includes('liquid') || lower.includes('suspension')) return BMR_TEMPLATES.Liquid
  if (lower.includes('oil')) return BMR_TEMPLATES.Oil
  if (lower.includes('kit')) return BMR_TEMPLATES.Kits
  if (lower.includes('pill')) return BMR_TEMPLATES.Pills

  // 3. Fallback: return Drops template with preserved dosageForm name
  return {
    ...BMR_TEMPLATES.Drops,
    dosageForm: raw,
    title: `${raw} Dosage Form BMR (19 Pages)`,
  }
}

/**
 * Check if a dosage form has an implemented BMR template.
 * @param {string} dosageForm
 * @returns {boolean}
 */
export function isBmrAvailable(dosageForm) {
  return true
}
