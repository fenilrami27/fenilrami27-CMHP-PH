/**
 * QC Template Registry
 * Central mapping from dosage form to Certificate of Analysis (CoA) template.
 * For Oil orders: available 2-page Finished Product - Oil format (SOP/QC/11/F-05/00).
 * Other dosage forms will display: "QC format for this dosage form is not available yet".
 */

export const QC_TEMPLATES = {
  Oil: {
    dosageForm: 'Oil',
    qcType: 'oil',
    title: 'CERTIFICATE OF ANALYSIS (FINISHED PRODUCT – OIL)',
    formNo: 'SOP/QC/11/F-05/00',
    pagesCount: 2,
    isAvailable: true,
  },
  Liquid: {
    dosageForm: 'Liquid',
    isAvailable: false,
  },
  Tablet: {
    dosageForm: 'Tablet',
    qcType: 'tablet',
    title: 'CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)',
    formNo: 'SOP/QC/11/F-05/00',
    pagesCount: 2,
    isAvailable: true,
  },
  Capsule: {
    dosageForm: 'Capsule',
    isAvailable: false,
  },
  Syrup: {
    dosageForm: 'Syrup',
    qcType: 'syrup',
    title: 'CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)',
    formNo: 'SOP/QC/11/F-05/00',
    pagesCount: 1,
    isAvailable: true,
  },
  Drops: {
    dosageForm: 'Drops',
    qcType: 'drops',
    title: 'CERTIFICATE OF ANALYSIS (FINISHED PRODUCT)',
    formNo: 'SOP/QC/11/F-05/00',
    pagesCount: 1,
    isAvailable: true,
  },
  Kits: {
    dosageForm: 'Kits',
    isAvailable: false,
  },
  Pills: {
    dosageForm: 'Pills',
    isAvailable: false,
  },
  'Mother Tincture': {
    dosageForm: 'Mother Tincture',
    qcType: 'mother-tincture',
    title: 'CERTIFICATE OF ANALYSIS (MOTHER TINCTURE)',
    formNo: 'SOP/QC/11/F-04/00',
    pagesCount: 1,
    isAvailable: true,
  },
}

export function getQcTemplate(dosageForm) {
  if (!dosageForm) return null
  const normalized = String(dosageForm).trim().toLowerCase()
  const matchKey = Object.keys(QC_TEMPLATES).find(
    (key) => key.toLowerCase() === normalized
  )
  return matchKey ? QC_TEMPLATES[matchKey] : null
}
