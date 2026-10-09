import { useEffect, useMemo, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import { getErrorMessage } from '../../../utils/errors'
import {
  validEmail,
  validPhone,
  validPassword,
  required,
} from '../../../utils/validation'
import { confirmAction } from '../../../utils/confirmAction'

import { companyService } from '../companyService'
import useAuth from '../../../hooks/useAuth'
import useWorkspace from '../../../hooks/useWorkspace'
import { previewDocumentNumber, commitDocumentNumber } from '../../../utils/documentNumbers'
import { logAudit } from '../../../utils/audit'
import { store } from '../../../store/store'
import {
  addSalaryStructure,
  editSalaryStructure,
  addShift,
  addDesignation,
} from '../../../store/erpSlice'


const ALL_ROLES = [
  ['SUPER_ADMIN', 'Super Admin'],
  ['MANAGEMENT', 'Management'],
  ['HR_ADMINISTRATOR', 'HR Administrator'],
  ['HR_MANAGER', 'HR Manager'],
  ['DEPARTMENT_MANAGER', 'Department Manager'],
  ['STORES_MANAGER', 'Stores Manager'],
  ['STORES_USER', 'Stores User'],
  ['EMPLOYEE', 'Employee'],
  ['VIEWER', 'Viewer'],
]


const EMPLOYMENT_STATUS = [
  ['ACTIVE', 'Active'],
  ['ON_LEAVE', 'On Leave'],
  ['NOTICE_PERIOD', 'Notice Period'],
  ['INACTIVE', 'Inactive'],
  ['RESIGNED', 'Resigned'],
  ['TERMINATED', 'Terminated'],
]


const EMPTY_FORM = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  role: 'EMPLOYEE',
  companies: [],
  department: '',
  employee_id: '',
  designation: '',
  phone: '',
  joining_date: '',
  employment_status: 'ACTIVE',
  can_access_common_inventory: false,
  basic_salary: '',
  allowances: '',
  deductions: '',
  shift: '',
  shift_name: '',
  shift_start_time: '09:00',
  shift_end_time: '18:00',
}


const normalizeId = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const numberValue = Number(value)

  return Number.isNaN(numberValue)
    ? value
    : numberValue
}


const getCompanyIds = (companies = []) => {
  if (!Array.isArray(companies)) {
    return []
  }

  return companies
    .map((company) => {
      if (
        company &&
        typeof company === 'object'
      ) {
        return normalizeId(company.id)
      }

      return normalizeId(company)
    })
    .filter(
      (id) =>
        id !== null &&
        id !== undefined
    )
}


export default function UserAccessTab() {

  const {
    user: currentUser,
  } = useAuth()

  const {
    activeOption,
  } = useWorkspace()


  const currentRole =
    String(
      currentUser?.profile?.role ||
      currentUser?.role ||
      ''
    )
      .trim()
      .toUpperCase()


  const activeCompanyId =
    normalizeId(
      activeOption?.companyId
    )


  const activeCompanyName =
    activeOption?.name ||
    'Active Company'


  const isSuperAdmin =
    Boolean(
      currentUser?.is_superuser ||
      currentRole === 'SUPER_ADMIN'
    )


  const canEditDesignation =
    Boolean(
      currentUser?.is_superuser ||
      currentRole === 'SUPER_ADMIN' ||
      currentRole === 'HR_ADMINISTRATOR' ||
      currentRole === 'HR_MANAGER'
    )


  const canManageUserDeletion =
    Boolean(
      currentUser?.is_superuser ||
      currentRole === 'SUPER_ADMIN' ||
      currentRole === 'HR_ADMINISTRATOR' ||
      currentRole === 'HR_MANAGER'
    )


  const canManageCommonInventory =
    Boolean(
      currentUser?.is_superuser ||
      currentRole === 'SUPER_ADMIN'
    )


  const availableRoles =
    useMemo(() => {

      if (isSuperAdmin) {
        return ALL_ROLES
      }

      return ALL_ROLES.filter(
        ([value]) =>
          ![
            'SUPER_ADMIN',
            'MANAGEMENT',
            'HR_ADMINISTRATOR',
          ].includes(value)
      )

    }, [isSuperAdmin])


  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [departments, setDepartments] = useState([])
  const [shifts, setShifts] = useState([])
  const [salaryStructures, setSalaryStructures] = useState([])

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

  const [form, setForm] = useState(
    EMPTY_FORM
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [search, setSearch] = useState('')


  /*
   * =========================================================
   * LOAD DATA
   * =========================================================
   */

  const loadData = async () => {

    setLoading(true)
    setError('')

    try {

      const [
        usersResponse,
        companiesResponse,
        departmentsResponse,
      ] = await Promise.all([

        companyService.getUsers(),

        companyService.getCompanies(),

        companyService.getDepartments(),

      ])


      const userData =
        Array.isArray(
          usersResponse?.data
        )
          ? usersResponse.data
          : usersResponse?.data?.results || []


      const companyData =
        Array.isArray(
          companiesResponse?.data
        )
          ? companiesResponse.data
          : companiesResponse?.data?.results || []


      const departmentData =
        Array.isArray(
          departmentsResponse?.data
        )
          ? departmentsResponse.data
          : departmentsResponse?.data?.results || []


      setUsers(userData)


      setCompanies(
        companyData.filter(
          (company) =>
            company.is_active !== false
        )
      )


      setDepartments(
        departmentData.filter(
          (department) =>
            department.is_active !== false
        )
      )

      const erp = store.getState().erp
      setShifts((erp.shifts || []).filter((s) => s.is_active !== false))
      setSalaryStructures(erp.salaryStructures || [])

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setLoading(false)

    }

  }


  useEffect(() => {

    loadData()

  }, [])


  /*
   * =========================================================
   * MODAL KEYBOARD / BODY LOCK
   * =========================================================
   */

  useEffect(() => {

    if (!modalOpen) {
      return undefined
    }


    const handleKeyDown = (event) => {

      if (
        event.key === 'Escape' &&
        !saving
      ) {
        closeModal()
      }

    }


    document.addEventListener(
      'keydown',
      handleKeyDown
    )


    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow =
      'hidden'


    return () => {

      document.removeEventListener(
        'keydown',
        handleKeyDown
      )

      document.body.style.overflow =
        previousOverflow

    }

  }, [modalOpen, saving])


  /*
   * =========================================================
   * FORM HELPERS
   * =========================================================
   */

  const createEmptyForm = (
    companyId = activeCompanyId
  ) => {

    return {
      ...EMPTY_FORM,

      companies:
        companyId !== null
          ? [companyId]
          : [],

    }

  }


  const resetForm = () => {

    setForm(
      createEmptyForm()
    )

    setFormError('')

  }


  const closeModal = () => {

    if (saving) {
      return
    }

    setModalOpen(false)

    setSelectedUser(null)

    setFormError('')

    resetForm()

  }


  const openCreateUser = () => {

    setError('')
    setFormError('')
    setSuccessMessage('')

    setSelectedUser(null)

    const effectiveCompanyId =
      activeCompanyId !== null
        ? activeCompanyId
        : (companies[0]?.id ? Number(companies[0].id) : 1)

    const generatedEmpId = previewDocumentNumber('EMPLOYEE')

    setForm({
      ...createEmptyForm(effectiveCompanyId),
      employee_id: generatedEmpId,
      basic_salary: '',
      allowances: '',
      deductions: '',
      shift: '',
      shift_name: '',
      shift_start_time: '09:00',
      shift_end_time: '18:00',
    })

    setModalOpen(true)

  }


  const openEditUser = (
    user
  ) => {

    setError('')
    setFormError('')

    setSelectedUser(user)


    const existingCompanyIds =
      getCompanyIds(
        user.companies
      )


    const editableCompanies =
      isSuperAdmin
        ? existingCompanyIds
        : (
            activeCompanyId !== null
              ? [activeCompanyId]
              : existingCompanyIds
          )

    const erp = store.getState().erp
    const userStructure = (erp.salaryStructures || []).find(
      (s) => Number(s.user) === Number(user.id)
    )
    const userShift = (erp.shifts || []).find(
      (s) => Number(s.id) === Number(user.shift)
    )

    setForm({

      username:
        user.username || '',

      password:
        '',

      first_name:
        user.first_name || '',

      last_name:
        user.last_name || '',

      email:
        user.email || '',

      role:
        user.role || 'EMPLOYEE',

      companies:
        editableCompanies,

      department:
        user.department?.id ??
        user.department ??
        '',

      employee_id:
        user.employee_id || '',

      designation:
        user.designation || '',

      phone:
        user.phone || '',

      joining_date:
        user.joining_date || '',

      employment_status:
        user.employment_status ||
        'ACTIVE',

      can_access_common_inventory:
        Boolean(
          user.can_access_common_inventory
        ),

      basic_salary:
        userStructure?.basic ?? user.basic_salary ?? user.monthly_salary ?? '',

      allowances:
        userStructure?.allowances ?? user.allowances ?? '',

      deductions:
        userStructure?.deductions ?? user.deductions ?? '',

      shift:
        user.shift ?? userShift?.id ?? '',

      shift_name:
        userShift?.name ?? '',

      shift_start_time:
        userShift?.start_time ?? '09:00',

      shift_end_time:
        userShift?.end_time ?? '18:00',

    })


    setModalOpen(true)

  }


  const handleChange = (
    event
  ) => {

    const {
      name,
      value,
      type,
      checked,
    } = event.target


    setForm(
      (current) => ({

        ...current,

        [name]:
          type === 'checkbox'
            ? checked
            : value,

      })
    )

  }


  const handleCompanyToggle = (
    companyId
  ) => {

    if (!isSuperAdmin) {
      return
    }


    const normalizedCompanyId =
      normalizeId(companyId)


    setForm(
      (current) => {

        const exists =
          current.companies.some(
            (id) =>
              Number(id) ===
              Number(normalizedCompanyId)
          )


        return {

          ...current,

          companies:
            exists
              ? current.companies.filter(
                  (id) =>
                    Number(id) !==
                    Number(normalizedCompanyId)
                )
              : [
                  ...current.companies,
                  normalizedCompanyId,
                ],

        }

      }
    )

  }


  /*
   * =========================================================
   * SAVE USER
   * =========================================================
   */

  const handleSubmit = async (
    event
  ) => {

    event.preventDefault()

    setError('')
    setFormError('')

    setSaving(true)


    try {

      const usernameError =
        required(
          form.username,
          'Username'
        )

      if (usernameError) {
        throw new Error(usernameError)
      }

      const firstNameError =
        required(
          form.first_name,
          'First name'
        )

      if (firstNameError) {
        throw new Error(firstNameError)
      }

      const emailError =
        validEmail(form.email)

      if (emailError) {
        throw new Error(emailError)
      }

      const phoneError =
        validPhone(form.phone)

      if (phoneError) {
        throw new Error(phoneError)
      }

      const duplicateUsername = users.some(
        (u) =>
          u.username &&
          u.username.trim().toLowerCase() === form.username.trim().toLowerCase() &&
          (!selectedUser || Number(u.id) !== Number(selectedUser.id))
      )

      if (duplicateUsername) {
        throw new Error(
          `Username "${form.username.trim()}" already exists. Please choose a different username.`
        )
      }

      if (form.email && form.email.trim()) {
        const duplicateEmail = users.some(
          (u) =>
            u.email &&
            u.email.trim().toLowerCase() === form.email.trim().toLowerCase() &&
            (!selectedUser || Number(u.id) !== Number(selectedUser.id))
        )

        if (duplicateEmail) {
          throw new Error(
            `Email "${form.email.trim()}" is already registered to another user.`
          )
        }
      }

      const effectiveCompanyId =
        activeCompanyId !== null
          ? activeCompanyId
          : (companies[0]?.id ? Number(companies[0].id) : 1)

      if (
        !isSuperAdmin &&
        [
          'SUPER_ADMIN',
          'MANAGEMENT',
          'HR_ADMINISTRATOR',
        ].includes(form.role)
      ) {
        throw new Error(
          'You do not have permission to assign this role.'
        )
      }

      const trimmedPassword =
        form.password.trim()

      const companyAssignments =
        isSuperAdmin
          ? (getCompanyIds(form.companies).length ? getCompanyIds(form.companies) : [effectiveCompanyId])
          : [effectiveCompanyId]

      if (
        companyAssignments.length === 0
      ) {
        throw new Error(
          'At least one company must be assigned to the user.'
        )
      }

      const basicNum = Number(form.basic_salary) || 0
      const allowancesNum = Number(form.allowances) || 0
      const deductionsNum = Number(form.deductions) || 0
      const monthlyNum = Math.max(basicNum + allowancesNum - deductionsNum, 0)

      let effectiveShiftId = form.shift && form.shift !== 'CUSTOM' ? Number(form.shift) : null
      const erpState = store.getState().erp

      if (!effectiveShiftId && form.shift_name?.trim()) {
        const existingShift = (erpState.shifts || []).find(
          (s) =>
            s.name?.toLowerCase() === form.shift_name.trim().toLowerCase() &&
            Number(s.company) === Number(effectiveCompanyId)
        )
        if (existingShift) {
          effectiveShiftId = existingShift.id
        } else {
          store.dispatch(
            addShift({
              name: form.shift_name.trim(),
              start_time: form.shift_start_time || '09:00',
              end_time: form.shift_end_time || '18:00',
              company: Number(effectiveCompanyId),
              is_active: true,
            })
          )
          const freshShifts = store.getState().erp.shifts || []
          effectiveShiftId = freshShifts[freshShifts.length - 1]?.id || null
        }
      }

      if (form.designation?.trim()) {
        const desigTitle = form.designation.trim()
        const existingDesig = (erpState.designations || []).find(
          (d) =>
            d.title?.toLowerCase() === desigTitle.toLowerCase() &&
            Number(d.company) === Number(effectiveCompanyId)
        )
        if (!existingDesig) {
          store.dispatch(
            addDesignation({
              title: desigTitle,
              company: Number(effectiveCompanyId),
              is_active: true,
            })
          )
        }
      }

      const payload = {
        username:
          form.username.trim(),
        first_name:
          form.first_name.trim(),
        last_name:
          form.last_name.trim(),
        email:
          form.email.trim(),
        role:
          form.role,
        companies:
          companyAssignments,
        department:
          form.department
            ? Number(
                form.department
              )
            : null,
        employee_id:
          form.employee_id.trim(),
        designation:
          form.designation.trim(),
        phone:
          form.phone.trim(),
        joining_date:
          form.joining_date,
        employment_status:
          form.employment_status,
        can_access_common_inventory:
          canManageCommonInventory
            ? Boolean(
                form.can_access_common_inventory
              )
            : Boolean(
                selectedUser?.can_access_common_inventory
              ),
        basic_salary: basicNum,
        allowances: allowancesNum,
        deductions: deductionsNum,
        monthly_salary: monthlyNum,
        shift: effectiveShiftId,
      }

      if (
        selectedUser &&
        !canEditDesignation
      ) {
        payload.designation =
          selectedUser.designation ||
          ''
      }

      /*
       * =====================================================
       * CREATE USER
       * =====================================================
       */

      if (!selectedUser) {
        if (!trimmedPassword) {
          throw new Error(
            'Password is required when creating a user.'
          )
        }

        const passwordError =
          validPassword(
            trimmedPassword
          )

        if (passwordError) {
          throw new Error(passwordError)
        }

        payload.password =
          trimmedPassword

        const finalEmployeeId =
          commitDocumentNumber('EMPLOYEE')

        payload.employee_id =
          finalEmployeeId

        const activeFirstAssignments = [
          effectiveCompanyId,
          ...companyAssignments.filter(
            (id) =>
              Number(id) !==
              Number(effectiveCompanyId)
          ),
        ]

        await companyService.createUser({
          ...payload,
          companies:
            activeFirstAssignments,
          company:
            effectiveCompanyId,
        })

        const createdUser = (store.getState().erp.users || []).find(
          (u) => u.username === payload.username
        )

        if (createdUser) {
          store.dispatch(
            addSalaryStructure({
              user: Number(createdUser.id),
              company: Number(effectiveCompanyId),
              basic: basicNum,
              allowances: allowancesNum,
              deductions: deductionsNum,
              effective_from: form.joining_date || new Date().toISOString().slice(0, 10),
            })
          )
        }

        logAudit({
          module: 'HRMS',
          entity_type: 'User',
          entity_id: finalEmployeeId || form.username,
          action: 'USER_CREATED',
          description: `Created user ${form.username} (${finalEmployeeId})`,
          changes: [
            { field: 'username', new_value: form.username },
            { field: 'role', new_value: form.role },
            { field: 'basic_salary', new_value: basicNum },
            { field: 'shift', new_value: effectiveShiftId },
            { field: 'designation', new_value: form.designation },
          ],
          company: effectiveCompanyId,
        })
      }

      /*
       * =====================================================
       * EDIT USER
       * =====================================================
       */

      else {
        if (trimmedPassword) {
          const passwordError =
            validPassword(
              trimmedPassword
            )

          if (passwordError) {
            throw new Error(passwordError)
          }

          payload.password =
            trimmedPassword
        }

        await companyService.updateUserAccess(
          selectedUser.id,
          payload
        )

        const existingStructure = (store.getState().erp.salaryStructures || []).find(
          (s) => Number(s.user) === Number(selectedUser.id)
        )

        if (existingStructure) {
          store.dispatch(
            editSalaryStructure({
              id: existingStructure.id,
              payload: {
                basic: basicNum,
                allowances: allowancesNum,
                deductions: deductionsNum,
              },
            })
          )
        } else {
          store.dispatch(
            addSalaryStructure({
              user: Number(selectedUser.id),
              company: Number(effectiveCompanyId),
              basic: basicNum,
              allowances: allowancesNum,
              deductions: deductionsNum,
              effective_from: form.joining_date || new Date().toISOString().slice(0, 10),
            })
          )
        }

        const oldBasic = Number(selectedUser.basic_salary ?? existingStructure?.basic ?? selectedUser.monthly_salary ?? 0)
        const oldShift = selectedUser.shift
        const oldDesignation = selectedUser.designation || ''

        logAudit({
          module: 'HRMS',
          entity_type: 'User',
          entity_id: selectedUser.employee_id || selectedUser.id,
          action: 'USER_EDITED',
          description: `Updated user ${selectedUser.username}`,
          company: effectiveCompanyId,
        })

        if (oldBasic !== basicNum) {
          logAudit({
            module: 'HRMS',
            entity_type: 'Employee',
            entity_id: selectedUser.employee_id || selectedUser.id,
            action: 'SALARY_CHANGED',
            description: `Salary changed for ${selectedUser.username}`,
            changes: [{ field: 'basic_salary', old_value: oldBasic, new_value: basicNum }],
            company: effectiveCompanyId,
          })
        }

        if (Number(oldShift) !== Number(effectiveShiftId)) {
          logAudit({
            module: 'HRMS',
            entity_type: 'Employee',
            entity_id: selectedUser.employee_id || selectedUser.id,
            action: 'SHIFT_CHANGED',
            description: `Shift changed for ${selectedUser.username}`,
            changes: [{ field: 'shift', old_value: oldShift, new_value: effectiveShiftId }],
            company: effectiveCompanyId,
          })
        }

        if (oldDesignation !== form.designation.trim()) {
          logAudit({
            module: 'HRMS',
            entity_type: 'Employee',
            entity_id: selectedUser.employee_id || selectedUser.id,
            action: 'DESIGNATION_CHANGED',
            description: `Designation changed for ${selectedUser.username}`,
            changes: [{ field: 'designation', old_value: oldDesignation, new_value: form.designation.trim() }],
            company: effectiveCompanyId,
          })
        }
      }

      setModalOpen(false)
      setSelectedUser(null)
      setFormError('')
      resetForm()
      setSuccessMessage(
        selectedUser
          ? 'User updated successfully.'
          : 'User added successfully.'
      )

      await loadData()

    } catch (err) {

      setFormError(
        getErrorMessage(err)
      )

    } finally {

      setSaving(false)

    }

  }


  /*
   * =========================================================
   * DELETE USER
   * =========================================================
   */

  const deleteUser = async (
    user
  ) => {

    if (!user) {
      return
    }


    if (
      currentUser?.id != null &&
      Number(user.id) ===
        Number(currentUser.id)
    ) {

      setError(
        'You cannot delete your own user account.'
      )

      return

    }


    if (!canManageUserDeletion) {

      setError(
        'Only Admin or the related company HR can delete users.'
      )

      return

    }


    const confirmed =
      confirmAction(
        `Delete ${user.username}? This will permanently remove the user account and cannot be undone.`
      )


    if (!confirmed) {
      return
    }


    setError('')


    try {

      await companyService.deleteUser(
        user.id
      )


      await loadData()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    }

  }


  /*
   * =========================================================
   * ACTIVE COMPANY USER FILTER
   * =========================================================
   */

  const companyScopedUsers =
    useMemo(() => {

      if (
        activeCompanyId === null
      ) {
        return users
      }


      return users.filter(
        (user) => {

          const userCompanyIds =
            getCompanyIds(
              user.companies
            )


          return userCompanyIds.some(
            (companyId) =>
              Number(companyId) ===
              Number(activeCompanyId)
          )

        }
      )

    }, [
      users,
      activeCompanyId,
    ])


  /*
   * =========================================================
   * SEARCH
   * =========================================================
   */

  const filteredUsers =
    useMemo(() => {

      const query =
        search
          .trim()
          .toLowerCase()


      if (!query) {
        return companyScopedUsers
      }


      return companyScopedUsers.filter(
        (user) => {

          return [

            user.username,

            user.first_name,

            user.last_name,

            user.email,

            user.employee_id,

            user.designation,

            user.role_label,

            user.role,

            user.department?.name,

          ]
            .filter(Boolean)
            .some(
              (value) =>
                String(value)
                  .toLowerCase()
                  .includes(query)
            )

        }
      )

    }, [
      companyScopedUsers,
      search,
    ])


  /*
   * =========================================================
   * ACTIVE COMPANY DETAILS
   * =========================================================
   */

  const activeCompany =
    companies.find(
      (company) =>
        Number(company.id) ===
        Number(activeCompanyId)
    )


  /*
   * =========================================================
   * COMMON INVENTORY GUARD
   * =========================================================
   */

  if (
    activeCompanyId === null
  ) {

    return (

      <div className="user-management-page">

        <div className="user-management-empty-state">

          <div className="user-management-empty-icon">
            ◈
          </div>

          <h2>
            User Management
          </h2>

          <p>
            User Management is available only
            inside a company workspace.
          </p>

          <span>
            Current workspace:
            {' '}
            {activeOption?.name ||
              'Common Inventory'}
          </span>

        </div>

      </div>

    )

  }


  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (

    <div className="user-management-page">


      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="company-tab-header user-management-header">

        <div>

          <div className="user-management-eyebrow">
            {activeCompany?.name ||
              activeCompanyName}
          </div>

          <h2>
            User Management
          </h2>

          <p>
            Create, edit and manage users
            for the active company workspace.
          </p>

        </div>


        <Button
          type="button"
          onClick={
            openCreateUser
          }
        >
          + Add user
        </Button>

      </div>


      {/* =====================================================
          ERROR
          ===================================================== */}

      {error && (

        <div className="user-management-page-alert">

          <Alert
            type="error"
            message={error}
          />

        </div>

      )}

      {successMessage && (

        <div className="user-management-page-alert">

          <Alert
            type="success"
            message={successMessage}
            onDismiss={() => setSuccessMessage('')}
          />

        </div>

      )}


      {/* =====================================================
          SEARCH / SUMMARY
          ===================================================== */}

      <div className="company-toolbar user-management-toolbar">

        <div className="user-management-search">

          <Input
            label=""
            name="search"
            value={search}
            onChange={
              (event) =>
                setSearch(
                  event.target.value
                )
            }
            placeholder="Search users..."
          />

        </div>


        <div className="user-management-count">

          <strong>
            {filteredUsers.length}
          </strong>

          <span>
            {filteredUsers.length === 1
              ? 'user'
              : 'users'}
          </span>

        </div>

      </div>


      {/* =====================================================
          USERS TABLE
          ===================================================== */}

      <div className="company-table-wrap user-management-table-wrap">

        <table className="company-table user-management-table">

          <thead>

            <tr>

              <th>
                User
              </th>

              <th>
                Employee ID
              </th>

              <th>
                Role
              </th>

              <th>
                Department
              </th>

              <th>
                Companies
              </th>

              <th>
                Status
              </th>

              <th>
                Inventory
              </th>

              <th className="company-actions">
                Actions
              </th>

            </tr>

          </thead>


          <tbody>

            {loading && (

              <tr>

                <td
                  colSpan="8"
                  className="company-empty"
                >
                  <div className="user-table-loading">
                    Loading users...
                  </div>
                </td>

              </tr>

            )}


            {!loading &&
              filteredUsers.map(
                (user) => (

                  <tr
                    key={
                      user.id
                    }
                  >

                    {/* USER */}

                    <td>

                      <div className="company-user">

                        <strong>

                          {[
                            user.first_name,
                            user.last_name,
                          ]
                            .filter(Boolean)
                            .join(' ') ||
                            user.username}

                        </strong>

                        <span>

                          {user.email ||
                            user.username}

                        </span>

                      </div>

                    </td>


                    {/* EMPLOYEE ID */}

                    <td>

                      {user.employee_id ||
                        '—'}

                    </td>


                    {/* ROLE */}

                    <td>

                      <span className="user-role-text">

                        {user.role_label ||
                          user.role ||
                          '—'}

                      </span>

                    </td>


                    {/* DEPARTMENT */}

                    <td>

                      {user.department?.name ||
                        '—'}

                    </td>


                    {/* COMPANIES */}

                    <td>

                      <div className="company-badges">

                        {(
                          user.companies ||
                          []
                        ).map(
                          (company) => {

                            const key =
                              typeof company ===
                              'object'
                                ? company.id
                                : company


                            const label =
                              typeof company ===
                              'object'
                                ? company.name
                                : (
                                    Number(company) === 1
                                      ? 'CMHP Pharma'
                                      : Number(company) === 2
                                        ? 'Tej Biocare'
                                        : `Company ${company}`
                                  )


                            return (

                              <span
                                key={key}
                                className="company-badge"
                              >
                                {label}
                              </span>

                            )

                          }
                        )}

                      </div>

                    </td>


                    {/* STATUS */}

                    <td>

                      <span
                        className={
                          user.is_active
                            ? 'company-status active'
                            : 'company-status inactive'
                        }
                      >

                        {user.is_active
                          ? 'Active'
                          : 'Inactive'}

                      </span>

                    </td>


                    {/* INVENTORY */}

                    <td>

                      <span
                        className={
                          user.can_access_common_inventory
                            ? 'company-status active'
                            : 'company-status inactive'
                        }
                      >

                        {user.can_access_common_inventory
                          ? 'Enabled'
                          : 'Disabled'}

                      </span>

                    </td>


                    {/* ACTIONS */}

                    <td className="company-actions">

                      <div className="user-action-buttons">

                        <button
                          type="button"
                          className="company-link edit"
                          onClick={() =>
                            openEditUser(
                              user
                            )
                          }
                        >
                          Edit
                        </button>


                        {canManageUserDeletion && (

                          <button
                            type="button"
                            className="company-link danger"
                            onClick={() =>
                              deleteUser(
                                user
                              )
                            }
                            disabled={
                              Number(user.id) ===
                              Number(currentUser?.id)
                            }
                          >
                            Delete
                          </button>

                        )}

                      </div>

                    </td>

                  </tr>

                )
              )}


            {!loading &&
              filteredUsers.length ===
                0 && (

                <tr>

                  <td
                    colSpan="8"
                    className="company-empty"
                  >

                    <div className="user-empty-table-state">

                      <strong>
                        No users found
                      </strong>

                      <span>
                        {search
                          ? 'Try changing your search.'
                          : 'No users are assigned to this company.'}
                      </span>

                    </div>

                  </td>

                </tr>

              )}

          </tbody>

        </table>

      </div>


      {/* =====================================================
          USER MODAL
          ===================================================== */}

      {modalOpen && (

        <div
          className="company-modal-backdrop"
          onMouseDown={
            (event) => {

              if (
                event.target ===
                event.currentTarget
              ) {

                closeModal()

              }

            }
          }
        >

          <div
            className="company-modal user-management-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-management-modal-title"
          >


            {/* =================================================
                MODAL HEADER
                ================================================= */}

            <div className="company-modal-header">

              <div>

                <div className="modal-context-label">
                  {activeCompany?.name ||
                    activeCompanyName}
                </div>

                <h3 id="user-management-modal-title">

                  {selectedUser
                    ? 'Edit User'
                    : 'Add User'}

                </h3>

                <p>

                  {selectedUser
                    ? 'Update user details, access and security settings.'
                    : 'Create a new user for the active company.'}

                </p>

              </div>


              <button
                type="button"
                className="company-modal-close"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
                aria-label="Close"
              >
                ×
              </button>

            </div>


            {/* =================================================
                FORM
                ================================================= */}

            <form
              className="company-form user-management-form"
              onSubmit={
                handleSubmit
              }
            >


              {formError && (

                <div className="user-modal-alert">

                  <Alert
                    type="error"
                    message={formError}
                  />

                </div>

              )}


              {/* =================================================
                  ACCOUNT DETAILS
                  ================================================= */}

              <div className="company-form-section">

                <div className="user-section-heading">

                  <div>

                    <span className="user-section-number">
                      01
                    </span>

                    <div>

                      <h4>
                        Account details
                      </h4>

                      <p>
                        Basic login and employee information.
                      </p>

                    </div>

                  </div>

                </div>


                <div className="company-form-grid">

                  <Input
                    label="Username"
                    name="username"
                    value={
                      form.username
                    }
                    onChange={
                      handleChange
                    }
                    required
                  />


                  <Input
                    label={
                      selectedUser
                        ? 'New Password'
                        : 'Temporary Password'
                    }
                    name="password"
                    type="password"
                    value={
                      form.password
                    }
                    onChange={
                      handleChange
                    }
                    required={
                      !selectedUser
                    }
                    minLength="8"
                    placeholder={
                      selectedUser
                        ? 'Leave blank to keep current password'
                        : 'Minimum 8 characters'
                    }
                  />


                  <Input
                    label="First Name"
                    name="first_name"
                    value={
                      form.first_name
                    }
                    onChange={
                      handleChange
                    }
                    required
                  />


                  <Input
                    label="Last Name"
                    name="last_name"
                    value={
                      form.last_name
                    }
                    onChange={
                      handleChange
                    }
                  />


                  <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={
                      form.email
                    }
                    onChange={
                      handleChange
                    }
                  />


                  <Input
                    label="Phone"
                    name="phone"
                    value={
                      form.phone
                    }
                    onChange={
                      handleChange
                    }
                  />


                  <Input
                    label="Employee ID (Auto-generated)"
                    name="employee_id"
                    value={
                      form.employee_id
                    }
                    disabled
                    readOnly
                  />


                  <Input
                    label="Joining Date"
                    name="joining_date"
                    type="date"
                    value={
                      form.joining_date
                    }
                    onChange={
                      handleChange
                    }
                  />

                </div>

              </div>


              {/* =================================================
                  ACCESS
                  ================================================= */}

              <div className="company-form-section">

                <div className="user-section-heading">

                  <div>

                    <span className="user-section-number">
                      02
                    </span>

                    <div>

                      <h4>
                        Access & employment
                      </h4>

                      <p>
                        Define role, department and employment status.
                      </p>

                    </div>

                  </div>

                </div>


                <div className="company-form-grid">


                  <div className="company-field">

                    <label htmlFor="user-role">
                      Role
                    </label>

                    <select
                      id="user-role"
                      name="role"
                      value={
                        form.role
                      }
                      onChange={
                        handleChange
                      }
                      className="company-input"
                      required
                    >

                      {availableRoles.map(
                        ([
                          value,
                          label,
                        ]) => (

                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {label}
                          </option>

                        )
                      )}

                    </select>

                  </div>


                  <div className="company-field">

                    <label htmlFor="user-employment-status">
                      Employment Status
                    </label>

                    <select
                      id="user-employment-status"
                      name="employment_status"
                      value={
                        form.employment_status
                      }
                      onChange={
                        handleChange
                      }
                      className="company-input"
                    >

                      {EMPLOYMENT_STATUS.map(
                        ([
                          value,
                          label,
                        ]) => (

                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {label}
                          </option>

                        )
                      )}

                    </select>

                  </div>


                  <div className="company-field">

                    <label htmlFor="user-department">
                      Department
                    </label>

                    <select
                      id="user-department"
                      name="department"
                      value={
                        form.department
                      }
                      onChange={
                        handleChange
                      }
                      className="company-input"
                    >

                      <option value="">
                        Select department
                      </option>

                      {departments.map(
                        (department) => (

                          <option
                            key={
                              department.id
                            }
                            value={
                              department.id
                            }
                          >
                            {department.name}
                          </option>

                        )
                      )}

                    </select>

                  </div>


                  <Input
                    label="Designation"
                    name="designation"
                    value={
                      form.designation
                    }
                    onChange={
                      handleChange
                    }
                    disabled={
                      !canEditDesignation
                    }
                  />


                  {!canEditDesignation && (

                    <div className="company-field-help-full">

                      <span>
                        Designation can only be changed by Admin or the related company HR.
                      </span>

                    </div>

                  )}

                  <div className="company-field">
                    <label htmlFor="user-shift">
                      Assigned Shift
                    </label>
                    <select
                      id="user-shift"
                      name="shift"
                      value={form.shift}
                      onChange={handleChange}
                      className="company-input"
                    >
                      <option value="">Select shift</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.start_time} - {s.end_time})
                        </option>
                      ))}
                      <option value="CUSTOM">+ Custom Shift</option>
                    </select>
                  </div>

                  {(form.shift === 'CUSTOM' || (!form.shift && form.shift_name)) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10, gridColumn: 'span 2' }}>
                      <Input
                        label="Shift Name"
                        name="shift_name"
                        value={form.shift_name}
                        onChange={handleChange}
                        placeholder="e.g. General Shift"
                      />
                      <Input
                        label="Start Time"
                        type="time"
                        name="shift_start_time"
                        value={form.shift_start_time}
                        onChange={handleChange}
                      />
                      <Input
                        label="End Time"
                        type="time"
                        name="shift_end_time"
                        value={form.shift_end_time}
                        onChange={handleChange}
                      />
                    </div>
                  )}

                </div>

              </div>


              {/* =================================================
                  SALARY & PAYROLL (HRMS AUTO-SYNC)
                  ================================================= */}

              <div className="company-form-section">

                <div className="user-section-heading">

                  <div>

                    <span className="user-section-number">
                      03
                    </span>

                    <div>

                      <h4>
                        Salary &amp; Payroll Details
                      </h4>

                      <p>
                        Auto-syncs to HRMS Payroll salary structure for the active company.
                      </p>

                    </div>

                  </div>

                </div>

                <div className="company-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>

                  <Input
                    label="Basic Salary (₹)"
                    type="number"
                    min="0"
                    name="basic_salary"
                    value={form.basic_salary}
                    onChange={handleChange}
                    placeholder="e.g. 25000"
                  />

                  <Input
                    label="Allowances (₹)"
                    type="number"
                    min="0"
                    name="allowances"
                    value={form.allowances}
                    onChange={handleChange}
                    placeholder="e.g. 5000"
                  />

                  <Input
                    label="Deductions (₹)"
                    type="number"
                    min="0"
                    name="deductions"
                    value={form.deductions}
                    onChange={handleChange}
                    placeholder="e.g. 1800"
                  />

                </div>

                <div style={{ marginTop: 12, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#166534', fontWeight: 500 }}>
                    Monthly Net Salary:
                  </span>
                  <strong style={{ fontSize: 16, color: '#15803d' }}>
                    ₹{Math.max((Number(form.basic_salary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0), 0).toLocaleString('en-IN')}
                  </strong>
                </div>

              </div>


              {/* =================================================
                  COMPANY ASSIGNMENT
                  ================================================= */}

              <div className="company-form-section">

                <div className="user-section-heading">

                  <div>

                    <span className="user-section-number">
                      04
                    </span>

                    <div>

                      <h4>
                        Company assignment
                      </h4>

                      <p>
                        Control which company workspace this user can access.
                      </p>

                    </div>

                  </div>

                </div>


                {!isSuperAdmin && (

                  <div className="active-company-card">

                    <div className="active-company-card-icon">
                      ✓
                    </div>

                    <div>

                      <strong>
                        {activeCompany?.name ||
                          activeCompanyName}
                      </strong>

                      <span>
                        Automatically assigned to the active company.
                      </span>

                    </div>

                  </div>

                )}


                {isSuperAdmin && (

                  <>

                    <p className="company-form-help">

                      Super Admin can assign the user to one or both companies.

                    </p>


                    <div className="company-check-list">

                      {companies.map(
                        (company) => {

                          const checked =
                            form.companies.some(
                              (id) =>
                                Number(id) ===
                                Number(company.id)
                            )


                          return (

                            <label
                              key={
                                company.id
                              }
                              className={
                                checked
                                  ? 'company-check-item selected'
                                  : 'company-check-item'
                              }
                            >

                              <input
                                type="checkbox"
                                checked={
                                  checked
                                }
                                onChange={() =>
                                  handleCompanyToggle(
                                    company.id
                                  )
                                }
                              />

                              <span>

                                <strong>
                                  {company.name}
                                </strong>

                                <small>
                                  {Number(company.id) ===
                                  Number(activeCompanyId)
                                    ? 'Current workspace'
                                    : 'Additional company access'}
                                </small>

                              </span>

                            </label>

                          )

                        }
                      )}

                    </div>

                  </>

                )}

              </div>


              {/* =================================================
                  COMMON INVENTORY
                  ================================================= */}

              <div className="company-form-section">

                <div className="user-section-heading">

                  <div>

                    <span className="user-section-number">
                      05
                    </span>

                    <div>

                      <h4>
                        Common Inventory
                      </h4>

                      <p>
                        Allow access to the shared inventory workspace.
                      </p>

                    </div>

                  </div>

                </div>


                <label
                  className={
                    form.can_access_common_inventory
                      ? 'company-check-item inventory-access selected'
                      : 'company-check-item inventory-access'
                  }
                >

                  <input
                    type="checkbox"
                    name="can_access_common_inventory"
                    checked={
                      form.can_access_common_inventory
                    }
                    onChange={
                      handleChange
                    }
                    disabled={!canManageCommonInventory}
                  />

                  <span>

                    <strong>
                      Allow access to Common Inventory
                    </strong>

                    <small>
                      {canManageCommonInventory
                        ? 'Gives this user access to the shared inventory workspace.'
                        : 'Only Super Admin can change Common Inventory access.'}
                    </small>

                  </span>

                </label>

              </div>


              {/* =================================================
                  ACTIONS
                  ================================================= */}

              <div className="company-modal-actions">

                <Button
                  type="button"
                  variant="secondary"
                  onClick={
                    closeModal
                  }
                  disabled={
                    saving
                  }
                >
                  Cancel
                </Button>


                <Button
                  type="submit"
                  disabled={
                    saving
                  }
                >

                  {saving
                    ? 'Saving...'
                    : selectedUser
                      ? 'Save changes'
                      : 'Create user'}

                </Button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  )

}