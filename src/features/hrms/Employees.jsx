import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManageEmployees } from './permissions'
import { previewDocumentNumber, commitDocumentNumber } from '../../utils/documentNumbers'
import { formatDateTimeIN, maskAadhaar, maskBankAcc, maskPAN } from '../../utils/formatters'
import { logAudit, getEntityAuditLogs } from '../../utils/audit'

import '../companies/Companies.css'
import './Hrms.css'


const ROLES = [
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
  ['PROBATION', 'Probation'],
  ['NOTICE_PERIOD', 'Notice Period'],
  ['INACTIVE', 'Inactive'],
  ['RESIGNED', 'Resigned'],
  ['TERMINATED', 'Terminated'],
]

const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full Time'],
  ['PROBATION', 'Probation'],
  ['CONTRACT', 'Contract'],
  ['PART_TIME', 'Part Time'],
  ['INTERN', 'Intern'],
]

const GENDER_OPTIONS = [
  ['MALE', 'Male'],
  ['FEMALE', 'Female'],
  ['OTHER', 'Other'],
]

const EMPTY_FORM = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  gender: 'MALE',
  dob: '',
  role: 'EMPLOYEE',
  primary_company: '',
  department: '',
  designation: '',
  employee_id: '',
  joining_date: '',
  employment_type: 'FULL_TIME',
  employment_status: 'ACTIVE',
  reporting_manager: '',
  shift: '',
  // Emergency Contact
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  // Bank Details
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  monthly_salary: '',
  // Statutory KYC
  pan: '',
  uan: '',
  aadhaar: '',
  photo_url: '',
  documents: [],
}


export default function Employees() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageEmployees(user)

  const [employees, setEmployees] = useState([])
  const [companies, setCompanies] = useState([])
  const [departments, setDepartments] = useState([])
  const [shifts, setShifts] = useState([])
  const [designations, setDesignations] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Search & Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals & Drawers
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState('personal') // 'personal', 'employment', 'bank_kyc', 'docs'
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // View Details Drawer
  const [viewingEmployee, setViewingEmployee] = useState(null)
  const [viewTab, setViewTab] = useState('overview') // 'overview', 'bank_kyc', 'history'
  const [viewHistory, setViewHistory] = useState([])


  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [
        employeesResponse,
        companiesResponse,
        departmentsResponse,
        shiftsResponse,
        designationsResponse,
      ] = await Promise.all([
        hrService.getEmployees(scopedCompanies),
        companyService.getCompanies(),
        companyService.getDepartments(),
        hrService.getShifts(scopedCompanies),
        hrService.getDesignations(scopedCompanies),
      ])

      setEmployees(employeesResponse.data || [])
      setCompanies((companiesResponse.data || []).filter((c) => c.is_active))
      setDepartments((departmentsResponse.data || []).filter((d) => d.is_active))
      setShifts((shiftsResponse.data || []).filter((s) => s.is_active))
      setDesignations((designationsResponse.data || []).filter((d) => d.is_active))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, companyFilter, deptFilter, statusFilter, typeFilter])


  const companyOptions = scopedCompanies.length
    ? companies.filter((c) => scopedCompanies.includes(Number(c.id)))
    : companies

  const designationOptions = designations.filter(
    (d) => !d.company || Number(d.company) === Number(form.primary_company)
  )

  const managerOptions = employees.filter(
    (employee) => !selectedEmployee || employee.id !== selectedEmployee.id
  )


  const openCreate = () => {
    setSelectedEmployee(null)
    const generatedEmpId = previewDocumentNumber('EMPLOYEE')

    setForm({
      ...EMPTY_FORM,
      primary_company: companyOptions[0] ? String(companyOptions[0].id) : '',
      employee_id: generatedEmpId,
      joining_date: new Date().toISOString().slice(0, 10),
    })

    setModalTab('personal')
    setError('')
    setSuccessMessage('')
    setModalOpen(true)
  }


  const openEdit = (employee) => {
    setSelectedEmployee(employee)

    setForm({
      username: employee.username || '',
      password: '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      gender: employee.gender || 'MALE',
      dob: employee.dob || '',
      role: employee.role || 'EMPLOYEE',
      primary_company: employee.primary_company ? String(employee.primary_company) : '',
      department: employee.department ? String(employee.department.id || employee.department) : '',
      designation: employee.designation || '',
      employee_id: employee.employee_id || '',
      joining_date: employee.joining_date || '',
      employment_type: employee.employment_type || 'FULL_TIME',
      employment_status: employee.employment_status || 'ACTIVE',
      reporting_manager: employee.reporting_manager ? String(employee.reporting_manager) : '',
      shift: employee.shift ? String(employee.shift.id || employee.shift) : '',
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_relation: employee.emergency_contact_relation || '',
      emergency_contact_phone: employee.emergency_contact_phone || '',
      bank_name: employee.bank_name || '',
      bank_account_number: employee.bank_account_number || '',
      bank_ifsc: employee.bank_ifsc || '',
      monthly_salary: employee.monthly_salary ?? '',
      pan: employee.pan || '',
      uan: employee.uan || '',
      aadhaar: employee.aadhaar || '',
      photo_url: employee.photo_url || '',
      documents: Array.isArray(employee.documents) ? employee.documents : [],
    })

    setModalTab('personal')
    setError('')
    setSuccessMessage('')
    setModalOpen(true)
  }


  const openView = (employee) => {
    setViewingEmployee(employee)
    setViewTab('overview')
    const history = getEntityAuditLogs('Employee', employee.employee_id || employee.id)
    setViewHistory(history)
  }


  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setSelectedEmployee(null)
    setError('')
  }


  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  // Handle document attachment
  const handleAddDocument = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const newDoc = {
        id: `doc-${Date.now()}`,
        name: file.name,
        size: `${Math.round(file.size / 1024)} KB`,
        type: file.type || 'Document',
        uploaded_at: new Date().toISOString(),
        file_url: e.target.result,
      }
      setForm((curr) => ({
        ...curr,
        documents: [...(curr.documents || []), newDoc],
      }))
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveDocument = (docId) => {
    setForm((curr) => ({
      ...curr,
      documents: (curr.documents || []).filter((d) => d.id !== docId),
    }))
  }


  const save = async (event) => {
    event.preventDefault()

    if (!form.primary_company) {
      setError('Please select the employee’s company.')
      return
    }

    if (!form.first_name.trim()) {
      setError('First name is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      let finalEmpId = form.employee_id.trim()
      if (!selectedEmployee) {
        finalEmpId = commitDocumentNumber('EMPLOYEE')
      }

      const statusHistoryEntry = {
        status: form.employment_status,
        changed_at: new Date().toISOString(),
        changed_by: user?.username || 'Admin',
        reason: selectedEmployee ? 'Profile updated' : 'Initial employment setup',
      }

      const existingHistory = Array.isArray(selectedEmployee?.status_history)
        ? selectedEmployee.status_history
        : []

      const nextStatusHistory = selectedEmployee?.employment_status !== form.employment_status
        ? [...existingHistory, statusHistoryEntry]
        : existingHistory.length === 0
        ? [statusHistoryEntry]
        : existingHistory

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        dob: form.dob || null,
        role: form.role,
        primary_company: Number(form.primary_company),
        department: form.department ? Number(form.department) : null,
        designation: form.designation.trim(),
        employee_id: finalEmpId,
        joining_date: form.joining_date || null,
        employment_type: form.employment_type,
        employment_status: form.employment_status,
        status_history: nextStatusHistory,
        reporting_manager: form.reporting_manager ? Number(form.reporting_manager) : null,
        shift: form.shift ? Number(form.shift) : null,
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_relation: form.emergency_contact_relation.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        bank_name: form.bank_name.trim(),
        bank_account_number: form.bank_account_number.trim(),
        bank_ifsc: form.bank_ifsc.trim(),
        monthly_salary: form.monthly_salary === '' ? null : Number(form.monthly_salary),
        pan: form.pan.trim().toUpperCase(),
        uan: form.uan.trim(),
        aadhaar: form.aadhaar.trim(),
        photo_url: form.photo_url,
        documents: form.documents || [],
      }

      if (!selectedEmployee) {
        await hrService.createEmployee({
          ...payload,
          username: form.username.trim() || `emp_${finalEmpId.toLowerCase()}`,
          password: form.password || 'Temporary@1234',
          can_access_common_inventory: false,
        })

        logAudit({
          module: 'HRMS',
          entity_type: 'Employee',
          entity_id: finalEmpId,
          action: 'CREATE',
          description: `Created new employee ${payload.first_name} ${payload.last_name} (${finalEmpId})`,
          user,
          company: payload.primary_company,
        })

        setSuccessMessage('Employee added successfully.')
      } else {
        await hrService.updateEmployee(selectedEmployee.id, payload)

        logAudit({
          module: 'HRMS',
          entity_type: 'Employee',
          entity_id: finalEmpId,
          action: 'UPDATE',
          description: `Updated employee profile for ${payload.first_name} ${payload.last_name} (${finalEmpId})`,
          user,
          company: payload.primary_company,
        })

        setSuccessMessage('Employee updated successfully.')
      }

      closeModal()
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const changeStatus = async (employee) => {
    const action = employee.is_active ? 'deactivate' : 'reactivate'

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${employee.display_name}?`
    )

    if (!confirmed) return

    setError('')

    try {
      if (employee.is_active) {
        await hrService.deactivateEmployee(employee.id)
      } else {
        await hrService.reactivateEmployee(employee.id)
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'Employee',
        entity_id: employee.employee_id || String(employee.id),
        action: employee.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        description: `${employee.is_active ? 'Deactivated' : 'Reactivated'} employee ${employee.display_name}`,
        user,
        company: employee.primary_company,
      })

      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const removeEmployee = async (employee) => {
    // Check if other employees report to this employee
    const subordinates = employees.filter((e) => Number(e.reporting_manager) === Number(employee.id))
    if (subordinates.length > 0) {
      setError(
        `Cannot delete ${employee.display_name}: ${subordinates.length} employee(s) report to them. Reassign reporting manager or deactivate instead.`
      )
      return
    }

    const confirmed = window.confirm(
      `Archive and remove employee "${employee.display_name}" (${employee.employee_id})? This will archive their ERP record.`
    )

    if (!confirmed) return

    setError('')

    try {
      await hrService.deleteEmployee(employee.id)

      logAudit({
        module: 'HRMS',
        entity_type: 'Employee',
        entity_id: employee.employee_id || String(employee.id),
        action: 'DELETE',
        description: `Archived/Deleted employee ${employee.display_name} (${employee.employee_id})`,
        user,
        company: employee.primary_company,
      })

      setSuccessMessage(`Employee ${employee.display_name} archived.`)
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  // Filter & Search
  const filtered = useMemo(() => {
    return employees
      .filter((emp) => {
        if (companyFilter !== 'ALL') {
          return Number(emp.primary_company) === Number(companyFilter)
        }
        return true
      })
      .filter((emp) => {
        if (deptFilter !== 'ALL') {
          return Number(emp.department?.id || emp.department) === Number(deptFilter)
        }
        return true
      })
      .filter((emp) => {
        if (statusFilter === 'ACTIVE') return emp.is_active
        if (statusFilter === 'INACTIVE') return !emp.is_active
        if (statusFilter !== 'ALL') return emp.employment_status === statusFilter
        return true
      })
      .filter((emp) => {
        if (typeFilter !== 'ALL') {
          return (emp.employment_type || 'FULL_TIME') === typeFilter
        }
        return true
      })
      .filter((emp) => {
        const query = search.trim().toLowerCase()
        if (!query) return true

        const text = [
          emp.display_name,
          emp.employee_id,
          emp.designation,
          emp.email,
          emp.phone,
          emp.role_label,
          emp.department?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(query)
      })
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
  }, [employees, companyFilter, deptFilter, statusFilter, typeFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedEmployees = filtered.slice((page - 1) * pageSize, page * pageSize)


  if (!canManage) {
    return (
      <div className="hr-page">
        <section className="company-panel company-no-access">
          <h1>Employees</h1>
          <p>
            Your current role does not have access to the employee master.
            Ask an HR Administrator to review your permissions.
          </p>
        </section>
      </div>
    )
  }


  return (
    <div className="hr-page">
      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Employees</h1>
          <p>
            Comprehensive employee directory. Manage personal profiles, KYC documents,
            shift rosters, emergency contacts, statutory accounts, and view complete audit history.
          </p>
        </div>
      </div>

      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Employee directory</h2>
            <p>
              {employees.length} employee{employees.length === 1 ? '' : 's'} registered &middot;{' '}
              {filtered.length} matching filter
            </p>
          </div>

          <Button onClick={openCreate}>+ Add employee</Button>
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}
        {successMessage && !modalOpen && (
          <Alert
            type="success"
            message={successMessage}
            onDismiss={() => setSuccessMessage('')}
          />
        )}

        <div className="hr-filters">
          <input
            className="company-search"
            placeholder="Search by name, employee ID, designation, email, phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className="company-select"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="ALL">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="company-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            className="company-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active only</option>
            <option value="INACTIVE">Inactive only</option>
            {EMPLOYMENT_STATUS.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="company-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All employment types</option>
            {EMPLOYMENT_TYPES.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="company-table-wrap">
          <table className="company-table company-user-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee ID</th>
                <th>Designation &amp; Dept</th>
                <th>Shift</th>
                <th>Company</th>
                <th>Status</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="company-empty">
                    Loading employees...
                  </td>
                </tr>
              )}

              {!loading &&
                paginatedEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {(employee.first_name?.[0] || employee.username?.[0] || 'E').toUpperCase()}
                        </div>
                        <div>
                          <strong>{employee.display_name}</strong>
                          <div className="company-address" style={{ fontSize: 11, color: '#6d859a' }}>
                            {employee.email || employee.username}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="company-code" style={{ fontWeight: 600 }}>
                        {employee.employee_id || '—'}
                      </span>
                    </td>

                    <td>
                      <div>{employee.designation || '—'}</div>
                      <div className="hr-subtext" style={{ fontSize: 11, color: '#6d859a' }}>
                        {employee.department?.name || 'General'}
                      </div>
                    </td>

                    <td>
                      {employee.shift?.name || (
                        <span style={{ color: '#94a3b8' }}>Unassigned</span>
                      )}
                    </td>

                    <td>
                      {employee.company ? (
                        <span className="company-code">
                          {employee.company.code}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td>
                      <span
                        className={
                          employee.is_active
                            ? 'company-status active'
                            : 'company-status inactive'
                        }
                      >
                        {employee.employment_status || (employee.is_active ? 'Active' : 'Inactive')}
                      </span>
                    </td>

                    <td className="company-actions">
                      <button
                        type="button"
                        className="company-link"
                        onClick={() => openView(employee)}
                      >
                        View
                      </button>

                      <button
                        type="button"
                        className="company-link"
                        onClick={() => openEdit(employee)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className={
                          employee.is_active
                            ? 'company-link danger'
                            : 'company-link'
                        }
                        onClick={() => changeStatus(employee)}
                      >
                        {employee.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>

                      <button
                        type="button"
                        className="company-link danger"
                        onClick={() => removeEmployee(employee)}
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="company-empty">
                    {employees.length === 0
                      ? 'No employees registered yet. Click "+ Add employee" to create the first record.'
                      : 'No employees match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '0 4px', fontSize: 13, color: '#6d859a' }}>
          <div>
            Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} employee{filtered.length === 1 ? '' : 's'}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="company-link"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ padding: '4px 8px', fontWeight: 600, color: '#173b59' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="company-link"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div
          className="company-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal()
            }
          }}
        >
          <div
            className="company-modal user-management-modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 840 }}
          >
            <div className="company-modal-header">
              <div>
                <div className="modal-context-label">HRMS MASTER</div>
                <h3>
                  {selectedEmployee
                    ? `Edit Profile: ${selectedEmployee.display_name}`
                    : 'Add New Employee'}
                </h3>
              </div>

              <button
                type="button"
                className="company-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR FOR FORM SECTIONS */}
            <div className="hr-tabs" style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className={modalTab === 'personal' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('personal')}
              >
                1. Personal Details
              </button>
              <button
                type="button"
                className={modalTab === 'employment' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('employment')}
              >
                2. Employment &amp; Schedule
              </button>
              <button
                type="button"
                className={modalTab === 'bank_kyc' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('bank_kyc')}
              >
                3. Bank &amp; Statutory KYC
              </button>
              <button
                type="button"
                className={modalTab === 'docs' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('docs')}
              >
                4. Documents ({form.documents?.length || 0})
              </button>
            </div>

            <form className="company-form user-management-form" onSubmit={save}>
              {error && (
                <div className="user-modal-alert">
                  <Alert type="error" message={error} />
                </div>
              )}

              {/* TAB 1: PERSONAL & EMERGENCY */}
              {modalTab === 'personal' && (
                <div className="company-form-section">
                  <div className="company-form-grid">
                    <Input
                      label="Employee ID (Auto-generated)"
                      name="employee_id"
                      value={form.employee_id}
                      disabled
                      readOnly
                    />

                    <Input
                      label="Username"
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      disabled={Boolean(selectedEmployee)}
                      required
                    />

                    {!selectedEmployee && (
                      <Input
                        label="Initial Password"
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={handleChange}
                        minLength="6"
                        required
                      />
                    )}

                    <Input
                      label="First Name"
                      name="first_name"
                      value={form.first_name}
                      onChange={handleChange}
                      required
                    />

                    <Input
                      label="Last Name"
                      name="last_name"
                      value={form.last_name}
                      onChange={handleChange}
                    />

                    <Input
                      label="Email"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                    />

                    <Input
                      label="Phone"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                    />

                    <div className="field">
                      <label className="field-label">Gender</label>
                      <select
                        className="field-input"
                        name="gender"
                        value={form.gender}
                        onChange={handleChange}
                      >
                        {GENDER_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Date of Birth</label>
                      <input
                        className="field-input"
                        type="date"
                        name="dob"
                        value={form.dob}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: 'span 2', marginTop: 10, paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: 13, color: '#173b59' }}>Emergency Contact Information</strong>
                    </div>

                    <Input
                      label="Emergency Contact Name"
                      name="emergency_contact_name"
                      value={form.emergency_contact_name}
                      onChange={handleChange}
                    />

                    <Input
                      label="Relationship"
                      name="emergency_contact_relation"
                      placeholder="e.g. Spouse, Father, Sibling"
                      value={form.emergency_contact_relation}
                      onChange={handleChange}
                    />

                    <Input
                      label="Emergency Phone"
                      name="emergency_contact_phone"
                      value={form.emergency_contact_phone}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: EMPLOYMENT & SCHEDULE */}
              {modalTab === 'employment' && (
                <div className="company-form-section">
                  <div className="company-form-grid">
                    <div className="field">
                      <label className="field-label">Company</label>
                      <select
                        className="field-input"
                        name="primary_company"
                        value={form.primary_company}
                        onChange={handleChange}
                        required
                      >
                        <option value="">Select company</option>
                        {companyOptions.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name} ({company.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">ERP Access Role</label>
                      <select
                        className="field-input"
                        name="role"
                        value={form.role}
                        onChange={handleChange}
                        required
                      >
                        {ROLES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Department</label>
                      <select
                        className="field-input"
                        name="department"
                        value={form.department}
                        onChange={handleChange}
                      >
                        <option value="">No Department</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Designation</label>
                      <select
                        className="field-input"
                        name="designation"
                        value={form.designation}
                        onChange={handleChange}
                      >
                        <option value="">No designation</option>
                        {designationOptions.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Assigned Shift</label>
                      <select
                        className="field-input"
                        name="shift"
                        value={form.shift}
                        onChange={handleChange}
                      >
                        <option value="">No shift assigned</option>
                        {shifts
                          .filter(
                            (s) => !s.company || String(s.company) === form.primary_company
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.start_time} - {s.end_time})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Reporting Manager</label>
                      <select
                        className="field-input"
                        name="reporting_manager"
                        value={form.reporting_manager}
                        onChange={handleChange}
                      >
                        <option value="">No Manager</option>
                        {managerOptions.map((mgr) => (
                          <option key={mgr.id} value={mgr.id}>
                            {mgr.display_name} ({mgr.employee_id || mgr.username})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Joining Date</label>
                      <input
                        className="field-input"
                        type="date"
                        name="joining_date"
                        value={form.joining_date}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="field">
                      <label className="field-label">Employment Type</label>
                      <select
                        className="field-input"
                        name="employment_type"
                        value={form.employment_type}
                        onChange={handleChange}
                      >
                        {EMPLOYMENT_TYPES.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Employment Status</label>
                      <select
                        className="field-input"
                        name="employment_status"
                        value={form.employment_status}
                        onChange={handleChange}
                      >
                        {EMPLOYMENT_STATUS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      label="Monthly Gross Salary (₹)"
                      name="monthly_salary"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 35000"
                      value={form.monthly_salary}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: BANK & STATUTORY KYC */}
              {modalTab === 'bank_kyc' && (
                <div className="company-form-section">
                  <div className="company-form-grid">
                    <Input
                      label="Bank Name"
                      name="bank_name"
                      placeholder="e.g. State Bank of India, HDFC"
                      value={form.bank_name}
                      onChange={handleChange}
                    />

                    <Input
                      label="Account Number"
                      name="bank_account_number"
                      placeholder="Full account number"
                      value={form.bank_account_number}
                      onChange={handleChange}
                    />

                    <Input
                      label="IFSC Code"
                      name="bank_ifsc"
                      placeholder="e.g. SBIN0001234"
                      value={form.bank_ifsc}
                      onChange={handleChange}
                    />

                    <div className="field" style={{ gridColumn: 'span 2', marginTop: 10, paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: 13, color: '#173b59' }}>Statutory KYC Identifiers</strong>
                    </div>

                    <Input
                      label="PAN Card Number"
                      name="pan"
                      placeholder="e.g. ABCDE1234F"
                      maxLength="10"
                      value={form.pan}
                      onChange={handleChange}
                    />

                    <Input
                      label="Aadhaar Number"
                      name="aadhaar"
                      placeholder="12-digit Aadhaar number"
                      maxLength="12"
                      value={form.aadhaar}
                      onChange={handleChange}
                    />

                    <Input
                      label="UAN Number (PF)"
                      name="uan"
                      placeholder="Universal Account Number"
                      maxLength="12"
                      value={form.uan}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: DOCUMENTS & ATTACHMENTS */}
              {modalTab === 'docs' && (
                <div className="company-form-section">
                  <div style={{ marginBottom: 14 }}>
                    <label className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                      Upload Identity / Resume / Contract Documents
                    </label>
                    <input
                      type="file"
                      onChange={handleAddDocument}
                      className="field-input"
                      style={{ padding: 6 }}
                    />
                  </div>

                  <div className="company-table-wrap">
                    <table className="company-table">
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Size</th>
                          <th>Uploaded At</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.documents || []).length === 0 ? (
                          <tr>
                            <td colSpan="4" className="company-empty">
                              No documents uploaded yet. Choose a file above.
                            </td>
                          </tr>
                        ) : (
                          form.documents.map((doc) => (
                            <tr key={doc.id}>
                              <td><strong>{doc.name}</strong></td>
                              <td>{doc.size}</td>
                              <td>{formatDateTimeIN(doc.uploaded_at)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="company-link danger"
                                  onClick={() => handleRemoveDocument(doc.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="company-modal-actions" style={{ marginTop: 20 }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </Button>

                <Button type="submit" loading={saving} loadingText="Saving...">
                  {selectedEmployee ? 'Save Changes' : 'Create Employee'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW EMPLOYEE DETAILS MODAL */}
      {viewingEmployee && (
        <div
          className="company-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingEmployee(null)
          }}
        >
          <div
            className="company-modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 840 }}
          >
            <div className="company-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  {(viewingEmployee.first_name?.[0] || viewingEmployee.username?.[0] || 'E').toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{viewingEmployee.display_name}</h3>
                  <div style={{ fontSize: 12, color: '#6d859a', marginTop: 3 }}>
                    {viewingEmployee.employee_id} &middot; {viewingEmployee.designation || 'Unassigned'} &middot; {viewingEmployee.company?.name}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="company-modal-close"
                onClick={() => setViewingEmployee(null)}
              >
                ✕
              </button>
            </div>

            <div className="hr-tabs" style={{ marginBottom: 18 }}>
              <button
                type="button"
                className={viewTab === 'overview' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('overview')}
              >
                Profile &amp; Employment
              </button>
              <button
                type="button"
                className={viewTab === 'bank_kyc' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('bank_kyc')}
              >
                Bank &amp; Statutory (Masked)
              </button>
              <button
                type="button"
                className={viewTab === 'history' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => {
                  setViewTab('history')
                  const history = getEntityAuditLogs('Employee', viewingEmployee.employee_id || viewingEmployee.id)
                  setViewHistory(history)
                }}
              >
                Activity / History ({viewHistory.length})
              </button>
            </div>

            {viewTab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px', fontSize: 13 }}>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Employee ID</span>
                  <strong>{viewingEmployee.employee_id || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Employment Status</span>
                  <span className={viewingEmployee.is_active ? 'company-status active' : 'company-status inactive'}>
                    {viewingEmployee.employment_status || (viewingEmployee.is_active ? 'Active' : 'Inactive')}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Email Address</span>
                  <span>{viewingEmployee.email || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Phone Number</span>
                  <span>{viewingEmployee.phone || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Department</span>
                  <span>{viewingEmployee.department?.name || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Designation</span>
                  <span>{viewingEmployee.designation || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Assigned Shift</span>
                  <span>{viewingEmployee.shift?.name || 'Unassigned'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Reporting Manager</span>
                  <span>{viewingEmployee.reporting_manager_name || 'None'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Joining Date</span>
                  <span>{viewingEmployee.joining_date || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Employment Type</span>
                  <span>{viewingEmployee.employment_type || 'Full Time'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Emergency Contact</span>
                  <span>
                    {viewingEmployee.emergency_contact_name
                      ? `${viewingEmployee.emergency_contact_name} (${viewingEmployee.emergency_contact_relation || 'Contact'} - ${viewingEmployee.emergency_contact_phone || ''})`
                      : 'None provided'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Monthly Salary</span>
                  <strong>
                    {viewingEmployee.monthly_salary != null
                      ? `₹${Number(viewingEmployee.monthly_salary).toLocaleString('en-IN')}`
                      : '—'}
                  </strong>
                </div>
              </div>
            )}

            {viewTab === 'bank_kyc' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px', fontSize: 13 }}>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Bank Name</span>
                  <strong>{viewingEmployee.bank_name || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Bank Account (Masked)</span>
                  <strong>{viewingEmployee.bank_account_number ? maskBankAcc(viewingEmployee.bank_account_number) : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Bank IFSC Code</span>
                  <span>{viewingEmployee.bank_ifsc || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>PAN Number (Masked)</span>
                  <strong>{viewingEmployee.pan ? maskPAN(viewingEmployee.pan) : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>Aadhaar Number (Masked)</span>
                  <strong>{viewingEmployee.aadhaar ? maskAadhaar(viewingEmployee.aadhaar) : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6d859a', display: 'block', fontSize: 11 }}>UAN Number</span>
                  <span>{viewingEmployee.uan || '—'}</span>
                </div>
              </div>
            )}

            {viewTab === 'history' && (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {viewHistory.length === 0 ? (
                  <div className="company-empty" style={{ textAlign: 'center', padding: 24 }}>
                    No audit log events recorded yet for this employee.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {viewHistory.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: '10px 14px',
                          background: '#f8fafc',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>
                            {item.action} &middot; {item.description}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {item.timestamp_ist || item.timestamp}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                          By: <strong>{item.user?.name || item.user?.username || 'System'}</strong> ({item.user?.role || 'User'})
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="company-modal-actions" style={{ marginTop: 24 }}>
              <Button onClick={() => setViewingEmployee(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}