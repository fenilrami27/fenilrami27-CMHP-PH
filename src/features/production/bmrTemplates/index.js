/**
 * BMR Template Registry
 * Central mapping from dosage form to BMR definition.
 * Dosage Form options: Liquid, Tablet, Capsule, Syrup, Drops, Oil, Kits, Pills.
 * - Drops -> Drops BMR (19 pages, form no. SOP/QA/04/F-02/00)
 * - Syrup -> Syrup BMR (19 pages, form no. SOP/QA/04/F-03/00)
 * - All other forms -> null (coming soon)
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
  Liquid: null, // TODO: Liquid BMR to be added later
  Tablet: null, // TODO: add BMR template
  Capsule: null, // TODO: add BMR template
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
  Oil: null, // TODO: add BMR template
  Kits: null, // TODO: add BMR template
  Pills: null, // TODO: add BMR template
}

/**
 * Returns the BMR template for a given dosage form, or null if not yet available.
 * Matches case-insensitively and trimmed against canonical dosage forms.
 * @param {string} dosageForm
 * @returns {object|null}
 */
export function getBmrTemplate(dosageForm) {
  if (!dosageForm) return null
  const normalized = String(dosageForm).trim().toLowerCase()
  const matchKey = Object.keys(BMR_TEMPLATES).find(
    (k) => k.toLowerCase() === normalized
  )
  return matchKey ? BMR_TEMPLATES[matchKey] : null
}

/**
 * Check if a dosage form has an implemented BMR template.
 * @param {string} dosageForm
 * @returns {boolean}
 */
export function isBmrAvailable(dosageForm) {
  return getBmrTemplate(dosageForm) !== null
}
