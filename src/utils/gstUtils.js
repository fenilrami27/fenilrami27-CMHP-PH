// Format quantity (integers without decimal, decimals with up to 2 decimal places)
export function formatQty(num) {
  if (num === null || num === undefined || num === '') return ''
  const n = Number(num)
  if (isNaN(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return String(Math.round((n + Number.EPSILON) * 100) / 100)
}

// Filter numeric input while typing
export function filterNumericInput(val, allowNegative = false) {
  if (val === '') return ''
  if (allowNegative && val === '-') return '-'
  const regex = allowNegative ? /^-?\d*\.?\d{0,4}$/ : /^\d*\.?\d{0,4}$/
  return regex.test(val) ? val : null
}

// Official GST state mapping: Telangana is 36, Gujarat is 24, Maharashtra is 27, etc.
export const GST_STATE_MAP = {
  'JAMMU AND KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '25',
  'DADRA AND NAGAR HAVELI': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '37',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'LADAKH': '38',
}

export function deriveStateCode(gstin, state) {
  if (gstin && typeof gstin === 'string') {
    const cleaned = gstin.trim()
    const prefix = cleaned.substring(0, 2)
    if (/^\d{2}$/.test(prefix)) {
      return prefix
    }
  }
  if (state && typeof state === 'string') {
    const cleaned = state.trim().toUpperCase()
    if (GST_STATE_MAP[cleaned]) {
      return GST_STATE_MAP[cleaned]
    }
    for (const [name, code] of Object.entries(GST_STATE_MAP)) {
      if (name.includes(cleaned) || cleaned.includes(name)) {
        return code
      }
    }
  }
  return ''
}
