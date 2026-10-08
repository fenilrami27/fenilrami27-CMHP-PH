import { store } from '../../store/store'

const ROLE_LABELS = {

  SUPER_ADMIN:
    'Super Admin',

  MANAGEMENT:
    'Management',

  HR_ADMINISTRATOR:
    'HR Administrator',

  HR_MANAGER:
    'HR Manager',

  DEPARTMENT_MANAGER:
    'Department Manager',

  STORES_MANAGER:
    'Stores Manager',

  STORES_USER:
    'Stores User',

  EMPLOYEE:
    'Employee',

  VIEWER:
    'Viewer',

}


function delay(
  value,
  ms = 250
) {

  return new Promise(
    (resolve) =>
      setTimeout(
        () => resolve(value),
        ms
      )
  )

}


export async function loginRequest(
  username,
  password
) {

  const {
    users,
  } =
    store.getState().erp


  const match =
    users.find(
      (u) =>
        u.username
          .toLowerCase() ===
        username
          .trim()
          .toLowerCase() &&
        u.password === password
    )


  if (!match) {

    throw new Error(
      'Invalid username or password.'
    )

  }


  if (!match.is_active) {

    throw new Error(
      'This account has been deactivated. Contact your admin.'
    )

  }


  const sessionUser =
    createSessionUser(
      match
    )


  return delay({

    token:
      `mock-token-${match.id}-${Date.now()}`,

    user:
      sessionUser,

  })

}


/* =========================================================
   SESSION USER
   ========================================================= */

export function createSessionUser(
  match
) {

  return {

    id:
      match.id,

    username:
      match.username,

    first_name:
      match.first_name,

    last_name:
      match.last_name,

    email:
      match.email,

    is_superuser:
      match.role ===
      'SUPER_ADMIN',

    profile: {

      role:
        match.role,

      role_label:
        ROLE_LABELS[
          match.role
        ] ||
        match.role,

      can_access_common_inventory:
        Boolean(
          match.can_access_common_inventory
        ),

      full_name:
        `${match.first_name || ''} ${match.last_name || ''}`
          .trim() ||
        match.username,

      companies:
        Array.isArray(
          match.companies
        )
          ? match.companies.map(Number)
          : [],

      primary_company:
        match.primary_company
          ? Number(
              match.primary_company
            )
          : null,

      employee_id:
        match.employee_id ||
        '',

      department:
        match.department
          ? Number(
              match.department
            )
          : null,

      designation:
        match.designation ||
        '',

      phone:
        match.phone ||
        '',

      joining_date:
        match.joining_date ||
        '',

      employment_status:
        match.employment_status ||
        'ACTIVE',

    },

  }

}


export async function logoutRequest() {
  return delay(
    true,
    100
  )
}