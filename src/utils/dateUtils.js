/**
 * Enterprise Date Utilities for Pharmaceutical ERP
 * Supports Indian date formats (DD/MM/YYYY, DD.MM.YYYY), ISO strings (YYYY-MM-DD),
 * and standard JS Date timestamps.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

/**
 * Parses date inputs of various formats into numeric year, month (1-12), and day (1-31).
 * Returns null if invalid or missing.
 */
export function parseDateParts(dateInput) {
  if (!dateInput) return null
  const str = String(dateInput).trim()
  if (!str || str === '—' || str === '-') return null

  // 1. Format: DD.MM.YYYY or DD.MM.YY
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/)
  if (dotMatch) {
    let year = parseInt(dotMatch[3], 10)
    if (year < 100) year += 2000
    const month = parseInt(dotMatch[2], 10)
    const day = parseInt(dotMatch[1], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day }
    }
  }

  // 2. Format: DD/MM/YYYY or DD/MM/YY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (slashMatch) {
    let year = parseInt(slashMatch[3], 10)
    if (year < 100) year += 2000
    const month = parseInt(slashMatch[2], 10)
    const day = parseInt(slashMatch[1], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day }
    }
  }

  // 3. Format: YYYY-MM-DD or ISO timestamp
  const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (dashMatch) {
    const year = parseInt(dashMatch[1], 10)
    const month = parseInt(dashMatch[2], 10)
    const day = parseInt(dashMatch[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day }
    }
  }

  // 4. Standard Date fallback
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    }
  }

  return null
}

/**
 * Returns formatted ISO date YYYY-MM-DD from any supported input.
 */
export function toISODateString(dateInput) {
  const parts = parseDateParts(dateInput)
  if (!parts) return ''
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${parts.year}-${m}-${d}`
}

/**
 * Formats date as DD/MM/YYYY (Indian standard).
 */
export function formatDisplayDate(dateInput) {
  const parts = parseDateParts(dateInput)
  if (!parts) return '—'
  const d = String(parts.day).padStart(2, '0')
  const m = String(parts.month).padStart(2, '0')
  return `${d}/${m}/${parts.year}`
}

/**
 * Gets 'YYYY-MM' key from date input.
 */
export function getMonthYearKey(dateInput) {
  const parts = parseDateParts(dateInput)
  if (!parts) return ''
  const m = String(parts.month).padStart(2, '0')
  return `${parts.year}-${m}`
}

/**
 * Gets current month key, e.g. '2026-10'.
 */
export function getCurrentMonthKey(refDate = new Date()) {
  const y = refDate.getFullYear()
  const m = String(refDate.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Formats 'YYYY-MM' as 'October 2026'.
 */
export function formatMonthYearLabel(monthYearKey) {
  if (!monthYearKey || monthYearKey === 'ALL') return 'All Time'
  const [yStr, mStr] = String(monthYearKey).split('-')
  const monthIdx = parseInt(mStr, 10) - 1
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${MONTH_NAMES[monthIdx]} ${yStr}`
  }
  return monthYearKey
}

/**
 * Checks if a date matches a selected month/year ('ALL' or 'YYYY-MM').
 */
export function matchesMonthYear(dateInput, selectedMonthYear) {
  if (!selectedMonthYear || selectedMonthYear === 'ALL') return true
  const key = getMonthYearKey(dateInput)
  return key === selectedMonthYear
}

/**
 * Checks if a date falls between fromDate (YYYY-MM-DD) and toDate (YYYY-MM-DD).
 */
export function matchesDateRange(dateInput, fromDate, toDate) {
  if (!fromDate && !toDate) return true
  const iso = toISODateString(dateInput)
  if (!iso) return false
  if (fromDate && iso < fromDate) return false
  if (toDate && iso > toDate) return false
  return true
}

/**
 * Generates an array of available month options for dropdown selectors.
 * If given an array of existing data items and date field extractor,
 * it guarantees all months present in the data are included,
 * plus current month and surrounding months.
 */
export function buildMonthOptions(dates = [], currentKey = getCurrentMonthKey()) {
  const keysSet = new Set()
  if (currentKey) keysSet.add(currentKey)

  dates.forEach((d) => {
    const k = getMonthYearKey(d)
    if (k) keysSet.add(k)
  })

  // Also include 3 months back and 2 months ahead of current
  const [currY, currM] = currentKey.split('-').map(Number)
  for (let offset = -5; offset <= 2; offset++) {
    const target = new Date(currY, currM - 1 + offset, 1)
    const k = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
    keysSet.add(k)
  }

  const sortedKeys = Array.from(keysSet).sort().reverse()

  return sortedKeys.map((key) => ({
    value: key,
    label: formatMonthYearLabel(key) + (key === currentKey ? ' (Current)' : ''),
    isCurrent: key === currentKey,
  }))
}
