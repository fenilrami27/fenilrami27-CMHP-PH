const ERP_STORAGE_KEY =
  'cmhp_erp_state_v4'

const STORAGE_VERSION =
  4


function isBrowser() {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  )
}


function safeParse(
  value
) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}


export function loadPersistedERPState() {
  if (!isBrowser()) {
    return null
  }

  try {
    const raw =
      localStorage.getItem(
        ERP_STORAGE_KEY
      )

    if (!raw) {
      return null
    }

    const parsed =
      safeParse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object'
    ) {
      return null
    }

    /*
     * Support both:
     *
     * {
     *   version: 4,
     *   data: {...}
     * }
     *
     * and older plain ERP state.
     */

    if (
      parsed.version &&
      parsed.data
    ) {
      if (
        parsed.version >
        STORAGE_VERSION
      ) {
        console.warn(
          'CMHP ERP: Stored data is newer than this application.'
        )

        return null
      }

      return parsed.data
    }

    return parsed
  } catch (error) {
    console.error(
      'CMHP ERP: Failed to load saved data:',
      error
    )

    return null
  }
}


export function savePersistedERPState(
  state
) {
  if (!isBrowser()) {
    return
  }

  try {
    localStorage.setItem(
      ERP_STORAGE_KEY,
      JSON.stringify({
        version:
          STORAGE_VERSION,

        savedAt:
          new Date().toISOString(),

        data:
          state,
      })
    )
  } catch (error) {
    console.error(
      'CMHP ERP: Failed to save ERP data:',
      error
    )
  }
}


export function clearPersistedERPState() {
  if (!isBrowser()) {
    return
  }

  localStorage.removeItem(
    ERP_STORAGE_KEY
  )
}


export function exportERPState(
  state
) {
  return JSON.stringify(
    {
      application:
        'CMHP ERP',

      version:
        STORAGE_VERSION,

      exportedAt:
        new Date().toISOString(),

      data:
        state,
    },
    null,
    2
  )
}


export function importERPState(
  raw
) {
  const parsed =
    typeof raw === 'string'
      ? safeParse(raw)
      : raw

  if (
    !parsed ||
    typeof parsed !== 'object'
  ) {
    throw new Error(
      'Invalid ERP backup file.'
    )
  }

  if (
    parsed.data &&
    typeof parsed.data === 'object'
  ) {
    return parsed.data
  }

  return parsed
}


export {
  ERP_STORAGE_KEY,
  STORAGE_VERSION,
}