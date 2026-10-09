import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import Modal from '../inventory/components/Modal'
import { recordAudit } from '../../utils/audit'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManageMasters } from './permissions'

import '../companies/Companies.css'
import './Hrms.css'


const EMPTY_FORM = {
  name: '',
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  grace_minutes: 10,
  half_day_hours: 4.5,
  is_overnight: false,
  weekly_off: 'Sunday',
  company: '',
}


export default function Shifts() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  const [shifts, setShifts] = useState([])
  const [companies, setCompanies] = useState([])
  const [employees, setEmployees] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)


  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [shiftsResponse, companiesResponse, employeesResponse] = await Promise.all([
        hrService.getShifts(scopedCompanies),
        companyService.getCompanies(),
        hrService.getEmployees(scopedCompanies),
      ])

      setShifts(shiftsResponse.data || [])
      setCompanies((companiesResponse.data || []).filter((c) => c.is_active))
      setEmployees(employeesResponse.data || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, companyFilter, statusFilter])


  const companyName = (id) => {
    if (!id) {
      return 'Both companies'
    }

    return companies.find((c) => Number(c.id) === Number(id))?.name || '\u2014'
  }

  const assignedCount = (shiftId) => {
    return employees.filter(
      (emp) => Number(emp.shift?.id ?? emp.shift) === Number(shiftId)
    ).length
  }


  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }


  const openEdit = (shift) => {
    setEditing(shift)

    setForm({
      name: shift.name || '',
      start_time: shift.start_time || '09:00',
      end_time: shift.end_time || '18:00',
      break_minutes: shift.break_minutes ?? 60,
      grace_minutes: shift.grace_minutes ?? 10,
      half_day_hours: shift.half_day_hours ?? 4.5,
      is_overnight: Boolean(shift.is_overnight),
      weekly_off: shift.weekly_off || 'Sunday',
      company: shift.company ? String(shift.company) : '',
    })

    setError('')
    setModalOpen(true)
  }


  const save = async (event) => {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Shift name is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: Number(form.break_minutes) || 0,
        grace_minutes: Number(form.grace_minutes) || 0,
        half_day_hours: Number(form.half_day_hours) || 4.5,
        is_overnight: Boolean(form.is_overnight),
        weekly_off: form.weekly_off.trim() || 'Sunday',
        company: form.company ? Number(form.company) : null,
      }

      if (editing) {
        await hrService.updateShift(editing.id, payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Shift',
          entityId: String(editing.id),
          referenceNumber: payload.name,
          action: 'UPDATE',
          before: {
            name: editing.name,
            start_time: editing.start_time,
            end_time: editing.end_time,
            break_minutes: editing.break_minutes,
            grace_minutes: editing.grace_minutes,
            half_day_hours: editing.half_day_hours,
            is_overnight: editing.is_overnight,
            weekly_off: editing.weekly_off,
          },
          after: payload,
        })
      } else {
        await hrService.createShift(payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Shift',
          entityId: payload.name,
          referenceNumber: payload.name,
          action: 'CREATE',
          after: payload,
        })
      }

      setModalOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const changeStatus = async (shift) => {
    const action = shift.is_active ? 'deactivate' : 'reactivate'

    if (!window.confirm(`Are you sure you want to ${action} "${shift.name}"?`)) {
      return
    }

    setError('')

    try {
      if (shift.is_active) {
        await hrService.deactivateShift(shift.id)
      } else {
        await hrService.reactivateShift(shift.id)
      }

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Shift',
        entityId: String(shift.id),
        referenceNumber: shift.name,
        action: shift.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        before: { is_active: shift.is_active },
        after: { is_active: !shift.is_active },
      })

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const remove = async (shift) => {
    const inUse = assignedCount(shift.id)

    if (inUse > 0) {
      setError(
        `"${shift.name}" is assigned to ${inUse} employee${inUse === 1 ? '' : 's'}. Deactivate it instead of deleting.`
      )
      return
    }

    if (!window.confirm(`Delete "${shift.name}"? This cannot be undone.`)) {
      return
    }

    setError('')

    try {
      await hrService.deleteShift(shift.id)

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Shift',
        entityId: String(shift.id),
        referenceNumber: shift.name,
        action: 'DELETE',
        before: shift,
      })

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const filteredShifts = shifts
    .filter((shift) => {
      if (companyFilter !== 'ALL') {
        return !shift.company || Number(shift.company) === Number(companyFilter)
      }
      return true
    })
    .filter((shift) => {
      if (statusFilter === 'ACTIVE') return shift.is_active
      if (statusFilter === 'INACTIVE') return !shift.is_active
      return true
    })
    .filter((shift) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return [shift.name, shift.weekly_off, companyName(shift.company)]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q))
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize))
  const paginatedShifts = filteredShifts.slice((page - 1) * pageSize, page * pageSize)

  if (!canManage) {
    const myEmployee =
      employees.find(
        (emp) =>
          Number(emp.id) === Number(user?.id) ||
          emp.username === user?.username
      ) || user

    const fullName =
      myEmployee?.display_name ||
      `${myEmployee?.first_name || ''} ${myEmployee?.last_name || ''}`.trim() ||
      myEmployee?.full_name ||
      myEmployee?.username ||
      'Employee'

    const designation =
      myEmployee?.designation_name ||
      myEmployee?.designation?.title ||
      myEmployee?.designation ||
      myEmployee?.profile?.designation ||
      'Staff Member'

    const myShiftId =
      myEmployee?.shift?.id ??
      myEmployee?.shift ??
      myEmployee?.profile?.shift

    const myShift =
      shifts.find((s) => Number(s.id) === Number(myShiftId)) ||
      (typeof myEmployee?.shift === 'object' ? myEmployee?.shift : null)

    const shiftName = myShift?.name || 'General Shift'
    const shiftTimings =
      myShift?.start_time && myShift?.end_time
        ? `${myShift.start_time} - ${myShift.end_time}`
        : '09:00 AM - 05:00 PM'

    return (
      <div className="hr-page">
        <div className="hr-header">
          <div>
            <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
              HRMS
            </span>
            <h1>My Assigned Shift</h1>
            <p>Your work shift schedule, timings, and designation details.</p>
          </div>
        </div>

        <section className="company-panel" style={{ maxWidth: 640 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              padding: '24px 28px',
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                {fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>{fullName}</h2>
                <div style={{ fontSize: 14, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
                  Designation: <strong style={{ color: '#0284c7' }}>{designation}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                padding: '16px 20px',
                background: '#f8fafc',
                borderRadius: 10,
                border: '1px solid #f1f5f9',
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Shift Name
                </span>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                  {shiftName}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Shift Timings
                </span>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                  🕒 {shiftTimings}
                </div>
              </div>

              {myShift?.weekly_off && (
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Weekly Off
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginTop: 4 }}>
                    {myShift.weekly_off}
                  </div>
                </div>
              )}
            </div>
          </div>
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
          <h1>Shifts</h1>
          <p>
            Configure standard, overnight, and custom shifts with grace times, break duration,
            half-day thresholds, and weekly offs (US-HR-8).
          </p>
        </div>
      </div>

      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Shift masters</h2>
            <p>
              {shifts.length} shift{shifts.length === 1 ? '' : 's'} configured &middot;{' '}
              {shifts.filter((s) => s.is_active).length} active
            </p>
          </div>

          <Button onClick={openCreate}>+ Add shift</Button>
        </div>

        <div className="hr-filters">
          <input
            className="company-search"
            placeholder="Search by shift name, weekly off, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Timing</th>
                <th>Break / Grace</th>
                <th>Half-Day Threshold</th>
                <th>Weekly Off</th>
                <th>Company</th>
                <th>Employees</th>
                <th>Status</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" className="company-empty">Loading shifts...</td>
                </tr>
              )}

              {!loading &&
                paginatedShifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>
                      <strong>{shift.name}</strong>
                      {shift.is_overnight && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: '2px 6px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                        >
                          Overnight
                        </span>
                      )}
                    </td>
                    <td>{shift.start_time} &ndash; {shift.end_time}</td>
                    <td>{shift.break_minutes}m break / {shift.grace_minutes}m grace</td>
                    <td>{shift.half_day_hours ?? 4.5} hrs</td>
                    <td>{shift.weekly_off || 'Sunday'}</td>
                    <td>{companyName(shift.company)}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{assignedCount(shift.id)}</span>
                    </td>
                    <td>
                      <span className={shift.is_active ? 'company-status active' : 'company-status inactive'}>
                        {shift.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="company-actions">
                      <button type="button" className="company-link" onClick={() => openEdit(shift)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={shift.is_active ? 'company-link danger' : 'company-link'}
                        onClick={() => changeStatus(shift)}
                      >
                        {shift.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        className="company-link danger"
                        onClick={() => remove(shift)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && filteredShifts.length === 0 && (
                <tr>
                  <td colSpan="9" className="company-empty">
                    {shifts.length === 0
                      ? 'No shifts configured yet.'
                      : 'No shifts match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '0 4px', fontSize: 13, color: '#6d859a' }}>
          <div>
            Showing {filteredShifts.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredShifts.length)} of {filteredShifts.length} shift{filteredShifts.length === 1 ? '' : 's'}
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

      {modalOpen && (
        <Modal
          title={editing ? 'Edit shift' : 'Add shift'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add shift'}
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={save}>
            <div className="company-form-grid">
              <Input
                label="Shift name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Start time</label>
                <input
                  className="field-input"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">End time</label>
                <input
                  className="field-input"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  required
                />
              </div>

              <Input
                label="Break (minutes)"
                type="number"
                min="0"
                value={form.break_minutes}
                onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
              />

              <Input
                label="Grace period (minutes)"
                type="number"
                min="0"
                value={form.grace_minutes}
                onChange={(e) => setForm({ ...form, grace_minutes: e.target.value })}
              />

              <Input
                label="Half-day minimum hours"
                type="number"
                step="0.5"
                min="1"
                max="12"
                value={form.half_day_hours}
                onChange={(e) => setForm({ ...form, half_day_hours: e.target.value })}
              />

              <Input
                label="Weekly off (e.g. Sunday or Saturday, Sunday)"
                placeholder="e.g. Sunday"
                value={form.weekly_off}
                onChange={(e) => setForm({ ...form, weekly_off: e.target.value })}
              />

              <div className="field">
                <label className="field-label">Company</label>
                <select
                  className="field-input"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                >
                  <option value="">Both companies</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <input
                  type="checkbox"
                  id="is_overnight"
                  checked={form.is_overnight}
                  onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="is_overnight" style={{ fontSize: 13, color: '#173b59', cursor: 'pointer', fontWeight: 600 }}>
                  Overnight Shift (shift crosses midnight to next day)
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}