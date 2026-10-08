import {
  configureStore,
} from '@reduxjs/toolkit'

import erpReducer, {
  initialState,
} from './erpSlice'

import {
  loadPersistedERPState,
  savePersistedERPState,
} from './persistence'

import {
  recordAudit,
} from '../utils/audit'

import {
  migrateDocumentNumbers,
} from '../utils/documentNumbers'


function buildInitialERPState() {
  const savedState =
    loadPersistedERPState()

  if (
    !savedState ||
    typeof savedState !== 'object'
  ) {
    migrateDocumentNumbers(initialState)
    return {
      ...initialState,
    }
  }

  const result = {
    ...initialState,
  }

  Object.keys(
    initialState
  ).forEach(
    (key) => {
      if (
        Object.prototype.hasOwnProperty.call(
          savedState,
          key
        ) &&
        savedState[key] !== undefined &&
        savedState[key] !== null
      ) {
        result[key] =
          savedState[key]
      }
    }
  )



  migrateDocumentNumbers(
    result
  )

  return result
}


/*
 * AUDIT MIDDLEWARE
 *
 * Every ERP mutation such as:
 * add user
 * edit order
 * delete product
 * approve leave
 * mark attendance
 * update salary
 * inventory changes
 *
 * is automatically recorded.
 */

const auditMiddleware =
  (storeApi) =>
  (next) =>
  (action) => {
    const result =
      next(action)

    if (
      action?.type?.startsWith(
        'erp/'
      )
    ) {
      recordAudit({
        action:
          action.type,

        payload:
          action.payload,

        state:
          storeApi
            .getState()
            .erp,
      })
    }

    return result
  }


export const store =
  configureStore({
    reducer: {
      erp:
        erpReducer,
    },

    preloadedState: {
      erp:
        buildInitialERPState(),
    },

    middleware:
      (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck:
            true,
        }).concat(
          auditMiddleware
        ),
  })


let lastSavedState =
  null


store.subscribe(() => {
  const currentState =
    store
      .getState()
      .erp

  if (
    currentState ===
    lastSavedState
  ) {
    return
  }

  lastSavedState =
    currentState

  savePersistedERPState(
    currentState
  )
})


export default store