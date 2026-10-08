import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'

import { hrService } from './hrService'
import {
  allowedCompanyIds,
  canApproveLeave,
  canManageMasters,
} from './permissions'
import { logAudit } from '../../utils/audit'

import '../companies/Companies.css'
import './Hrms.css'

const EMPTY_APPLY_FORM = {
  leave_type: '',
  from_date: '',
  to_date: '',
  is_half_day: false,
  reason: '',
}

const EMPTY_TYPE_FORM = {
  name: '',
  code: '',
  paid: true,
  max_days_per_year: 12,
  carry_forward: true,
  company: '',
}


function calculateWorkingLeaveDays(from, to, isHalfDay, holidays = []) {
  if (!from || !to) return 0
  if (isHalfDay) return 0.5

  const start = new Date(from)
  const end = new Date(to)
  if (end < start) return 0

  let workingDays = 0
  const curr = new Date(start)

  const holidayDateSet = new Set(holidays.map((h) => h.date))

  while (curr <= end) {
    const dayOfWeek = curr.getDay() // 0 = Sunday
    const dateStr = curr.toISOString().slice(0, 10)

    // Exclude Sundays and official holidays
    if (dayOfWeek !== 0 && !holidayDateSet.has(dateStr)) {
      workingDays++
    }
    curr.setDate(curr.getDate() + 1)
  }

  return workingDays
}


export default function Leave() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canApprove = canApproveLeave(user)
  const canManage = canManageMasters(user)
  const myCompany = user?.profile?.primary_company

  const [leaveTypes, setLeaveTypes] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [teamRequests, setTeamRequests] = useState([])
  const [holidays, setHolidays] = useState([])

  const [applyForm, setApplyForm] = useState(EMPTY_APPLY_FORM)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [teamError, setTeamError] = useState('')

  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM)
  const [savingType, setSavingType] = useState(false)
  const [typeError, setTypeError] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')


  const loadAll = async () => {
    setLoading(true)
    setError('')

    try {
      const [typesResponse, mineResponse, holidaysResponse] = await Promise.all([
        hrService.getLeaveTypes(scopedCompanies),
        hrService.getMyLeaveRequests(user.id),
        hrService.getHolidays(scopedCompanies),
      ])

      setLeaveTypes(Array.isArray(typesResponse?.data) ? typesResponse.data : [])
      setMyRequests(Array.isArray(mineResponse?.data) ? mineResponse.data : [])
      setHolidays(Array.isArray(holidaysResponse?.data) ? holidaysResponse.data : [])

      if (canApprove) {
        const teamResponse = await hrService.getLeaveRequests(
          scopedCompanies,
          statusFilter || null
        )
        setTeamRequests(Array.isArray(teamResponse?.data) ? teamResponse.data : [])
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!canApprove) return
    setTeamError('')
    hrService
      .getLeaveRequests(scopedCompanies, statusFilter || null)
      .then((response) => {
        setTeamRequests(Array.isArray(response?.data) ? response.data : [])
      })
      .catch((err) => {
        setTeamError(getErrorMessage(err))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])


  const activeLeaveTypes = leaveTypes.filter(
    (type) =>
      type.is_active &&
      (!type.company || Number(type.company) === Number(myCompany))
  )

  // Compute Leave Balances for logged-in user for the current calendar year
  const currentYear = new Date().getFullYear().toString()

  const balances = useMemo(() => {
    const map = {}
    activeLeaveTypes.forEach((type) => {
      const quota = Number(type.max_days_per_year) || 0
      const approvedTaken = myRequests
        .filter(
          (req) =>
            Number(req.leave_type) === Number(type.id) &&
            req.status === 'APPROVED' &&
            req.from_date &&
            req.from_date.startsWith(currentYear)
        )
        .reduce((sum, req) => sum + (Number(req.days) || 0), 0)

      map[type.id] = {
        name: type.name,
        code: type.code,
        paid: type.paid,
        quota,
        taken: approvedTaken,
        balance: Math.max(0, quota - approvedTaken),
      }
    })
    return map
  }, [activeLeaveTypes, myRequests, currentYear])


  // Days count for active apply form
  const requestedDays = useMemo(() => {
    return calculateWorkingLeaveDays(
      applyForm.from_date,
      applyForm.to_date,
      applyForm.is_half_day,
      holidays
    )
  }, [applyForm.from_date, applyForm.to_date, applyForm.is_half_day, holidays])


  const submitApply = async (event) => {
    event.preventDefault()
    setApplying(true)
    setApplyError('')

    try {
      if (!applyForm.leave_type) {
        throw new Error('Please select a leave type.')
      }

      if (requestedDays <= 0) {
        throw new Error(
          'Please select a valid working date range (holidays and Sundays are excluded).'
        )
      }

      const selectedType = activeLeaveTypes.find(
        (t) => Number(t.id) === Number(applyForm.leave_type)
      )

      // Balance check for paid leaves
      if (selectedType && selectedType.paid) {
        const balObj = balances[selectedType.id]
        if (balObj && requestedDays > balObj.balance) {
          throw new Error(
            `Insufficient leave balance. You requested ${requestedDays} day(s), but only have ${balObj.balance} day(s) remaining for ${selectedType.name}.`
          )
        }
      }

      // Overlap check
      const overlap = myRequests.find((req) => {
        if (req.status === 'REJECTED' || req.status === 'CANCELLED') return false
        return (
          applyForm.from_date <= req.to_date &&
          applyForm.to_date >= req.from_date
        )
      })

      if (overlap) {
        throw new Error(
          `You already have a ${overlap.status.toLowerCase()} leave request covering this period (${overlap.from_date} to ${overlap.to_date}).`
        )
      }

      await hrService.submitLeaveRequest({
        user: user.id,
        company: myCompany,
        leave_type: Number(applyForm.leave_type),
        from_date: applyForm.from_date,
        to_date: applyForm.to_date,
        days: requestedDays,
        reason: applyForm.reason.trim(),
        is_half_day: applyForm.is_half_day,
      })

      logAudit({
        module: 'HRMS',
        entity_type: 'Leave',
        entity_id: `LV-${Date.now()}`,
        action: 'APPLY',
        description: `Applied for ${requestedDays} days ${selectedType?.name || 'Leave'} (${applyForm.from_date} to ${applyForm.to_date})`,
        user,
      })

      setApplyForm(EMPTY_APPLY_FORM)
      setSuccessMsg('Leave request submitted successfully.')
      await loadAll()
    } catch (err) {
      setApplyError(getErrorMessage(err) || err.message || 'Unable to submit leave request.')
    } finally {
      setApplying(false)
    }
  }


  const cancelMine = async (request) => {
    if (!window.confirm(`Cancel leave request for ${request.days} day(s)?`)) {
      return
    }

    setError('')
    try {
      await hrService.cancelLeaveRequest(request.id)

      logAudit({
        module: 'HRMS',
        entity_type: 'Leave',
        entity_id: String(request.id),
        action: 'CANCEL',
        description: `Cancelled leave request #${request.id} (${request.from_date} to ${request.to_date})`,
        user,
      })

      setSuccessMsg('Leave request cancelled.')
      await loadAll()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  // Approve / Reject with remarks and automatic sync to Attendance
  const decide = async (request, status) => {
    let note = ''
    if (status === 'REJECTED') {
      note = window.prompt('Reason/remarks for rejection:') || ''
      if (note === null) return // cancelled prompt
    } else {
      note = window.prompt('Approval remarks (optional):') || 'Approved by HR/Manager'
    }

    setTeamError('')
    try {
      await hrService.decideLeaveRequest(request.id, status, user.id, note)

      // When APPROVED: Sync leave days to Attendance
      if (status === 'APPROVED') {
        const start = new Date(request.from_date)
        const end = new Date(request.to_date)
        const curr = new Date(start)

        while (curr <= end) {
          if (curr.getDay() !== 0) { // exclude Sunday
            const dayStr = curr.toISOString().slice(0, 10)
            await hrService.markAttendance({
              user: request.user,
              company: request.company,
              date: dayStr,
              status: 'LEAVE',
            })
          }
          curr.setDate(curr.getDate() + 1)
        }
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'Leave',
        entity_id: String(request.id),
        action: status,
        description: `${status} leave request for ${request.employee_name} (${request.days} days, ${request.from_date} to ${request.to_date}). Remarks: ${note}`,
        user,
      })

      setSuccessMsg(`Leave request #${request.id} ${status.toLowerCase()}.`)
      await loadAll()
    } catch (err) {
      setTeamError(getErrorMessage(err))
    }
  }


  const openCreateType = () => {
    setTypeForm(EMPTY_TYPE_FORM)
    setTypeError('')
    setTypeModalOpen(true)
  }


  const saveType = async (event) => {
    event.preventDefault()
    setSavingType(true)
    setTypeError('')

    try {
      const name = typeForm.name.trim()
      const code = typeForm.code.trim().toUpperCase()

      if (!name) throw new Error('Leave type name is required.')
      if (!code) throw new Error('Leave type code is required.')

      await hrService.createLeaveType({
        name,
        code,
        paid: Boolean(typeForm.paid),
        max_days_per_year: Number(typeForm.max_days_per_year) || 0,
        carry_forward: Boolean(typeForm.carry_forward),
        company: typeForm.company ? Number(typeForm.company) : null,
      })

      logAudit({
        module: 'HRMS',
        entity_type: 'LeaveType',
        entity_id: code,
        action: 'CREATE',
        description: `Configured new leave type: ${name} (${code})`,
        user,
      })

      setTypeModalOpen(false)
      setSuccessMsg(`Leave type "${name}" created successfully.`)
      await loadAll()
    } catch (err) {
      setTypeError(getErrorMessage(err) || err.message || 'Unable to create leave type.')
    } finally {
      setSavingType(false)
    }
  }


  const toggleTypeStatus = async (type) => {
    try {
      if (type.is_default) {
        setError('Default leave types cannot be deactivated.')
        return
      }

      if (type.is_active) {
        await hrService.deactivateLeaveType(type.id)
      } else {
        await hrService.reactivateLeaveType(type.id)
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'LeaveType',
        entity_id: String(type.id),
        action: type.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        description: `${type.is_active ? 'Deactivated' : 'Reactivated'} leave type ${type.name}`,
        user,
      })

      await loadAll()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  return (
    <div className="hr-page">
      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Leave Management</h1>
          <p>
            Configurable leave policies, live balance tracking, half-day options,
            holidays/weekly-offs auto-exclusion, and attendance synchronization on approval.
          </p>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {successMsg && (
        <Alert type="success" message={successMsg} onDismiss={() => setSuccessMsg('')} />
      )}

      {/* LEAVE BALANCE SUMMARY CARDS */}
      <section className="company-panel" style={{ marginBottom: 20 }}>
        <div className="company-toolbar">
          <div>
            <h2>My Leave Balances ({currentYear})</h2>
            <p>Annual quotas and remaining balances</p>
          </div>
        </div>

        <div className="hr-kpis" style={{ marginTop: 12 }}>
          {Object.keys(balances).length === 0 ? (
            <div className="company-empty" style={{ gridColumn: 'span 4', padding: 20 }}>
              No leave policies configured yet. HR administrators can configure leave types below.
            </div>
          ) : (
            Object.values(balances).map((bal) => (
              <div key={bal.code} className="hr-kpi-card">
                <span className="hr-kpi-label">
                  {bal.name} {bal.paid ? '(Paid)' : '(Unpaid)'}
                </span>
                <strong className="hr-kpi-value" style={{ color: '#0284c7' }}>
                  {bal.balance} <span style={{ fontSize: 13, color: '#64748b' }}>/ {bal.quota} days</span>
                </strong>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Taken: {bal.taken} days
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* APPLY FOR LEAVE */}
      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Apply for leave</h2>
            <p>Submit a new leave request</p>
          </div>
        </div>

        {applyError && <Alert type="error">{applyError}</Alert>}

        <form onSubmit={submitApply}>
          <div className="company-form-grid">
            <div className="field">
              <label className="field-label">Leave type</label>
              <select
                className="field-input"
                value={applyForm.leave_type}
                onChange={(e) => setApplyForm({ ...applyForm, leave_type: e.target.value })}
                required
              >
                <option value="">Select leave type</option>
                {activeLeaveTypes.map((type) => {
                  const bal = balances[type.id]?.balance ?? type.max_days_per_year
                  return (
                    <option key={type.id} value={type.id}>
                      {type.name} &mdash; {type.paid ? `Paid (${bal} days left)` : 'Unpaid'}
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="field">
              <label className="field-label">From date</label>
              <input
                className="field-input"
                type="date"
                value={applyForm.from_date}
                onChange={(e) => setApplyForm({ ...applyForm, from_date: e.target.value })}
                required
              />
            </div>

            <div className="field">
              <label className="field-label">To date</label>
              <input
                className="field-input"
                type="date"
                value={applyForm.to_date}
                onChange={(e) => setApplyForm({ ...applyForm, to_date: e.target.value })}
                required
              />
            </div>

            <div className="field">
              <Input
                label="Reason for leave"
                placeholder="Reason or medical note..."
                value={applyForm.reason}
                onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
              />
            </div>

            <div className="field" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <input
                type="checkbox"
                id="is_half_day"
                checked={applyForm.is_half_day}
                onChange={(e) => setApplyForm({ ...applyForm, is_half_day: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="is_half_day" style={{ fontSize: 13, color: '#173b59', cursor: 'pointer', fontWeight: 600 }}>
                Half Day Leave (counts as 0.5 day)
              </label>
            </div>
          </div>

          {applyForm.from_date && applyForm.to_date && (
            <p className="user-admin-help" style={{ marginTop: 12, fontWeight: 600, color: '#0369a1' }}>
              ℹ️ Calculated Net Working Days: {requestedDays} day(s) requested (excluding Sundays &amp; official holidays).
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <Button type="submit" loading={applying} loadingText="Submitting...">
              Submit request
            </Button>
          </div>
        </form>
      </section>

      {/* MY REQUESTS */}
      <section className="company-panel" style={{ marginTop: 20 }}>
        <div className="company-toolbar">
          <div>
            <h2>My leave requests</h2>
            <p>{myRequests.length} request{myRequests.length === 1 ? '' : 's'} recorded</p>
          </div>
        </div>

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Leave type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Status</th>
                <th>Reason</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {myRequests.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.leave_type_name || request.leave_type || '—'}</strong></td>
                  <td>{request.from_date}</td>
                  <td>{request.to_date}</td>
                  <td><strong>{request.days}</strong></td>
                  <td>
                    <span className={`leave-status leave-${String(request.status || '').toLowerCase()}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>{request.reason || '—'}</td>
                  <td className="company-actions">
                    {request.status === 'PENDING' && (
                      <button
                        type="button"
                        className="company-link danger"
                        onClick={() => cancelMine(request)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {myRequests.length === 0 && (
                <tr>
                  <td colSpan="7" className="company-empty">
                    You have not applied for any leave yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* TEAM APPROVALS */}
      {canApprove && (
        <section className="company-panel" style={{ marginTop: 20 }}>
          <div className="company-toolbar">
            <div>
              <h2>Team Approvals</h2>
              <p>Review and decide pending leave requests for your team</p>
            </div>

            <select
              className="field-input"
              style={{ maxWidth: 180 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="PENDING">Pending only</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="">All statuses</option>
            </select>
          </div>

          {teamError && <Alert type="error">{teamError}</Alert>}

          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th className="company-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                {teamRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.employee_name}</strong>
                      <span className="company-address">{request.employee_code}</span>
                    </td>
                    <td>{request.leave_type_name || '—'}</td>
                    <td>{request.from_date}</td>
                    <td>{request.to_date}</td>
                    <td><strong>{request.days}</strong></td>
                    <td>
                      <span className={`leave-status leave-${String(request.status || '').toLowerCase()}`}>
                        {request.status}
                      </span>
                    </td>
                    <td>{request.reason || '—'}</td>
                    <td className="company-actions">
                      {request.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            className="company-link"
                            onClick={() => decide(request, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="company-link danger"
                            onClick={() => decide(request, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}

                {teamRequests.length === 0 && (
                  <tr>
                    <td colSpan="8" className="company-empty">
                      No leave requests found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* LEAVE TYPES MASTER */}
      {canManage && (
        <section className="company-panel" style={{ marginTop: 20 }}>
          <div className="company-toolbar">
            <div>
              <h2>Leave Types Master</h2>
              <p>Organization leave quota and policy configurations</p>
            </div>

            <Button onClick={openCreateType}>+ Add leave type</Button>
          </div>

          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Quota (Days/Year)</th>
                  <th>Carry Forward</th>
                  <th>Status</th>
                  <th className="company-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                {leaveTypes.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="company-empty" style={{ textAlign: 'center', padding: '36px' }}>
                      No leave types configured. Click "+ Add leave type" to set up your organization's policies.
                    </td>
                  </tr>
                ) : (
                  leaveTypes.map((type) => (
                    <tr key={`${type.code}-${type.id}`}>
                      <td><strong>{type.name}</strong></td>
                      <td><span className="company-code">{type.code}</span></td>
                      <td>{type.paid ? 'Paid' : 'Unpaid'}</td>
                      <td><strong>{type.max_days_per_year}</strong></td>
                      <td>{type.carry_forward ? 'Yes' : 'No'}</td>
                      <td>
                        <span className={type.is_active ? 'company-status active' : 'company-status inactive'}>
                          {type.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="company-actions">
                        <button
                          type="button"
                          className={type.is_active ? 'company-link danger' : 'company-link'}
                          onClick={() => toggleTypeStatus(type)}
                        >
                          {type.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ADD LEAVE TYPE MODAL */}
      {typeModalOpen && (
        <Modal
          title="Add Leave Type Master"
          onClose={() => setTypeModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTypeModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={savingType} onClick={saveType}>
                Add Leave Type
              </Button>
            </>
          }
        >
          {typeError && <Alert type="error">{typeError}</Alert>}

          <form onSubmit={saveType}>
            <div className="company-form-grid">
              <Input
                label="Leave Name"
                placeholder="e.g. Casual Leave, Maternity Leave"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                required
              />

              <Input
                label="Code"
                placeholder="e.g. CL, SL, EL"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                required
              />

              <Input
                label="Max Days / Year Quota"
                type="number"
                min="0"
                value={typeForm.max_days_per_year}
                onChange={(e) => setTypeForm({ ...typeForm, max_days_per_year: e.target.value })}
              />

              <div className="field">
                <label className="field-label">Company Policy</label>
                <select
                  className="field-input"
                  value={typeForm.company}
                  onChange={(e) => setTypeForm({ ...typeForm, company: e.target.value })}
                >
                  <option value="">Both Companies (Group)</option>
                  {scopedCompanies.map((cId) => (
                    <option key={cId} value={cId}>Company #{cId}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ gridColumn: 'span 2', display: 'flex', gap: 24, marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#173b59' }}>
                  <input
                    type="checkbox"
                    checked={typeForm.paid}
                    onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span>Paid Leave</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#173b59' }}>
                  <input
                    type="checkbox"
                    checked={typeForm.carry_forward}
                    onChange={(e) => setTypeForm({ ...typeForm, carry_forward: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span>Carry Forward Allowed</span>
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}