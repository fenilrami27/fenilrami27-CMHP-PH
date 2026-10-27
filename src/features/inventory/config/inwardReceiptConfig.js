/**
 * RAW MATERIAL INWARD RECEIPT CONFIGURATION
 * 
 * Central configuration object for receipt header profile and supplier blank defaults.
 * Update these fields when official company registration, GSTIN, PAN, address,
 * or contact numbers are ready.
 */

export const INWARD_RECEIPT_CONFIG = {
  // Company Profile displayed at the top of the Receipt Header
  company: {
    name: 'Common Inventory',
    legal_name: '',
    address: '',
    gstin: '',
    pan: '',
    state: '',
    phone: '',
    email: '',
  },

  // Supplier / Vendor details (leave optional tax/contact fields empty for now)
  supplier: {
    gstin: '',
    address: '',
    contact: '',
  },
}
