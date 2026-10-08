import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'

import { hrService } from './hrService'
import { allowedCompanyIds, canManageAttendance } from './permissions'
import { logAudit } from '../../utils/audit'
import { formatDateTimeIN } from '../../utils/formatters'

import '../companies/Companies.css'
import './Hrms.css'


const STATUS_OPTIONS = [
  ['PRESENT', 'Present'],
  ['ABSENT', 'Absent'],
  ['HALF_DAY', 'Half Day'],
  ['LATE', 'Late'],
  ['EARLY_EXIT', 'Early Exit'],
  ['LEAVE', 'On Leave'],
  ['HOLIDAY', 'Holiday'],
  ['WEEKLY_OFF', 'Weekly Off'],
  ['WFH', 'Work From Home'],
]

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS)

const REGULARIZATION_STORAGE_KEY = 'cmhp_attendance_regularizations_v2'
const PAYROLL_RUNS_STORAGE_KEY = 'cmhp_payroll_runs_v2'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function timeOf(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7)
}

export default function Attendance() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManageTeam = canManageAttendance(user)

  // Sub-tabs: 'roster' (Daily Roster & Self Punch), 'calendar' (Monthly Calendar & Summary), 'regularization' (Requests)
  const [activeTab, setActiveTab] = useState('roster')

  const [myToday, setMyToday] = useState(null)
  const [myHistory, setMyHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [myError, setMyError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [date, setDate] = useState(todayStr())
  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState('')

  // Holidays & Leave Requests in scope
  const [holidays, setHolidays] = useState([])
  const [leaves, setLeaves] = useState([])
  const [shifts, setShifts] = useState([])

  // Bulk Marking Modal
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('PRESENT')
  const [bulkCompany, setBulkCompany] = useState('ALL')
  const [bulkOverwrite, setBulkOverwrite] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)

  // Monthly Calendar Tab State
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr())
  const [selectedEmpId, setSelectedEmpId] = useState(String(user?.id || ''))
  const [monthAttendanceRecords, setMonthAttendanceRecords] = useState([])

  // Regularization Tab State
  const [regularizations, setRegularizations] = useState(() => {
    try {
      const raw = localStorage.getItem(REGULARIZATION_STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [regModalOpen, setRegModalOpen] = useState(false)
  const [regForm, setRegForm] = useState({
    date: todayStr(),
    check_in: '09:00',
    check_out: '18:00',
    reason: '',
  })

  // Check if month is locked by processed payroll
  const isMonthLocked = useMemo(() => {
    const monthPrefix = (activeTab === 'calendar' ? selectedMonth : date).slice(0, 7)
    try {
      const raw = localStorage.getItem(PAYROLL_RUNS_STORAGE_KEY)
      if (!raw) return false
      const runs = JSON.parse(raw)
      return runs.some(
        (r) => r.month === monthPrefix && (r.status === 'PROCESSED' || r.status === 'APPROVED' || r.status === 'PAID')
      )
    } catch {
      return false
    }
  }, [date, selectedMonth, activeTab])


  const loadMine = async () => {
    setMyError('')
    try {
      const [todayResponse, historyResponse] = await Promise.all([
        hrService.getMyTodayAttendance(user.id),
        hrService.getMyAttendanceHistory(user.id, 14),
      ])
      setMyToday(todayResponse.data)
      setMyHistory(historyResponse.data || [])
    } catch (err) {
      setMyError(getErrorMessage(err))
    }
  }


  const loadRoster = async (forDate) => {
    if (!canManageTeam) return
    setRosterLoading(true)
    setRosterError('')
    try {
      const [rosterRes, holidaysRes, leavesRes, shiftsRes] = await Promise.all([
        hrService.getAttendanceForDate(forDate, scopedCompanies),
        hrService.getHolidays(scopedCompanies),
        hrService.getLeaveRequests(scopedCompanies, 'APPROVED'),
        hrService.getShifts(scopedCompanies),
      ])

      setRoster(rosterRes.data || [])
      setHolidays(holidaysRes.data || [])
      setLeaves(leavesRes.data || [])
      setShifts(shiftsRes.data || [])
    } catch (err) {
      setRosterError(getErrorMessage(err))
    } finally {
      setRosterLoading(false)
    }
  }


  useEffect(() => {
    loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadRoster(date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, canManageTeam])

  useEffect(() => {
    if (activeTab === 'calendar') {
      const [year, month] = selectedMonth.split('-').map(Number)
      const startDate = `${selectedMonth}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`

      hrService.getAttendanceRange(startDate, endDate)
        .then((res) => setMonthAttendanceRecords(res.data || []))
        .catch(() => setMonthAttendanceRecords([]))
    }
  }, [activeTab, selectedMonth])


  // Check In with Shift Grace Time Auto-calculation
  const doCheckIn = async () => {
    if (isMonthLocked) {
      setMyError('Cannot punch attendance: This month is locked by finalized payroll.')
      return
    }

    setBusy(true)
    setMyError('')

    try {
      const userShift = shifts.find((s) => Number(s.id) === Number(user?.profile?.shift || user?.shift))

      await hrService.doCheckIn({
        user: user.id,
        company: user.profile?.primary_company,
        shift: userShift?.id || null,
      })

      logAudit({
        module: 'HRMS',
        entity_type: 'Attendance',
        entity_id: `${user.username} (${todayStr()})`,
        action: 'CHECK_IN',
        description: `Punch In recorded at ${new Date().toLocaleTimeString()} by ${user.username}`,
        user,
      })

      setSuccessMsg('Check-in recorded successfully.')
      await loadMine()
      if (canManageTeam) await loadRoster(date)
    } catch (err) {
      setMyError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }


  // Check Out with Working Hours & Half-Day / Overtime Calculation
  const doCheckOut = async () => {
    if (isMonthLocked) {
      setMyError('Cannot punch attendance: This month is locked by finalized payroll.')
      return
    }

    setBusy(true)
    setMyError('')

    try {
      await hrService.doCheckOut({ user: user.id })

      logAudit({
        module: 'HRMS',
        entity_type: 'Attendance',
        entity_id: `${user.username} (${todayStr()})`,
        action: 'CHECK_OUT',
        description: `Punch Out recorded at ${new Date().toLocaleTimeString()} by ${user.username}`,
        user,
      })

      setSuccessMsg('Check-out recorded successfully.')
      await loadMine()
      if (canManageTeam) await loadRoster(date)
    } catch (err) {
      setMyError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }


  // Manual Status Change on Roster Row
  const markRosterStatus = async (employeeId, status) => {
    if (isMonthLocked) {
      setRosterError('Attendance records for this month are locked by payroll.')
      return
    }

    setRosterError('')
    try {
      await hrService.markAttendance({
        user: employeeId,
        company: user.profile?.primary_company,
        date,
        status,
      })

      logAudit({
        module: 'HRMS',
        entity_type: 'Attendance',
        entity_id: `Emp #${employeeId} (${date})`,
        action: 'UPDATE',
        description: `Marked attendance as ${status} on ${date}`,
        user,
      })

      await loadRoster(date)
    } catch (err) {
      setRosterError(getErrorMessage(err))
    }
  }


  // Bulk Marking across Roster
  const handleBulkMark = async () => {
    if (isMonthLocked) {
      setRosterError('Cannot bulk mark: Selected month is locked by payroll.')
      setBulkModalOpen(false)
      return
    }

    setBulkSaving(true)
    setRosterError('')

    try {
      let targets = roster
      if (bulkCompany !== 'ALL') {
        targets = targets.filter(
          (r) => Number(r.employee.primary_company) === Number(bulkCompany)
        )
      }

      if (!bulkOverwrite) {
        targets = targets.filter((r) => !r.attendance || r.attendance.status === 'NOT_MARKED')
      }

      for (const row of targets) {
        await hrService.markAttendance({
          user: row.employee.id,
          company: row.employee.primary_company,
          date,
          status: bulkStatus,
        })
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'Attendance',
        entity_id: `Bulk (${date})`,
        action: 'BULK_MARK',
        description: `Bulk marked ${targets.length} employees as ${bulkStatus} for ${date}`,
        user,
      })

      setSuccessMsg(`Bulk marked ${targets.length} employee(s) as ${bulkStatus}.`)
      setBulkModalOpen(false)
      await loadRoster(date)
    } catch (err) {
      setRosterError(getErrorMessage(err))
    } finally {
      setBulkSaving(false)
    }
  }


  // Regularization submission
  const submitRegularization = (e) => {
    e.preventDefault()
    if (!regForm.reason.trim()) {
      setMyError('Please provide a reason for the regularization request.')
      return
    }

    const newReq = {
      id: `REG-${Date.now()}`,
      user_id: user.id,
      user_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
      employee_code: user.profile?.employee_id || `EMP-${user.id}`,
      date: regForm.date,
      check_in: regForm.check_in,
      check_out: regForm.check_out,
      reason: regForm.reason.trim(),
      status: 'PENDING',
      created_at: new Date().toISOString(),
    }

    const nextList = [newReq, ...regularizations]
    setRegularizations(nextList)
    localStorage.setItem(REGULARIZATION_STORAGE_KEY, JSON.stringify(nextList))

    logAudit({
      module: 'HRMS',
      entity_type: 'AttendanceRegularization',
      entity_id: newReq.id,
      action: 'APPLY',
      description: `Submitted attendance regularization for ${newReq.date}`,
      user,
    })

    setRegModalOpen(false)
    setRegForm({ date: todayStr(), check_in: '09:00', check_out: '18:00', reason: '' })
    setSuccessMsg('Regularization request submitted for manager approval.')
  }

  // Regularization approval/rejection
  const decideRegularization = async (regId, decision) => {
    if (isMonthLocked) {
      setRosterError('Cannot modify: Month is locked by payroll.')
      return
    }

    const req = regularizations.find((r) => r.id === regId)
    if (!req) return

    const nextList = regularizations.map((r) =>
      r.id === regId
        ? {
            ...r,
            status: decision,
            decided_at: new Date().toISOString(),
            decided_by: user.username,
          }
        : r
    )
    setRegularizations(nextList)
    localStorage.setItem(REGULARIZATION_STORAGE_KEY, JSON.stringify(nextList))

    if (decision === 'APPROVED') {
      // Update the actual attendance record
      await hrService.markAttendance({
        user: req.user_id,
        company: user.profile?.primary_company,
        date: req.date,
        status: 'PRESENT',
      })
    }

    logAudit({
      module: 'HRMS',
      entity_type: 'AttendanceRegularization',
      entity_id: regId,
      action: decision,
      description: `${decision} regularization request for ${req.user_name} on ${req.date}`,
      user,
    })

    setSuccessMsg(`Regularization request ${decision.toLowerCase()}.`)
    if (canManageTeam) await loadRoster(date)
  }


  // Helper: auto-detect if date is holiday or leave
  const getContextualDayBadge = (emp, targetDate) => {
    // Check holiday
    const hol = holidays.find(
      (h) => h.date === targetDate && (!h.company || Number(h.company) === Number(emp.primary_company))
    )
    if (hol) {
      return { status: 'HOLIDAY', label: `Holiday (${hol.name})`, tone: '#fef3c7', text: '#b45309' }
    }

    // Check approved leave
    const leave = leaves.find(
      (l) =>
        Number(l.user) === Number(emp.id) &&
        targetDate >= l.from_date &&
        targetDate <= l.to_date
    )
    if (leave) {
      return { status: 'LEAVE', label: `On Leave (${leave.leave_type_name || 'Approved'})`, tone: '#e0e7ff', text: '#4338ca' }
    }

    return null
  }


  // Monthly Calendar Calculations
  const calendarDays = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${selectedMonth}-${String(d).padStart(2, '0')}`
      days.push(dayStr)
    }
    return days
  }, [selectedMonth])

  const employeeMonthSummary = useMemo(() => {
    const empRecords = monthAttendanceRecords.filter(
      (r) => Number(r.user) === Number(selectedEmpId)
    )

    let present = 0
    let late = 0
    let halfDay = 0
    let absent = 0
    let leave = 0
    let holiday = 0
    let totalHours = 0

    empRecords.forEach((r) => {
      if (r.status === 'PRESENT') present++
      else if (r.status === 'LATE') late++
      else if (r.status === 'HALF_DAY') halfDay++
      else if (r.status === 'ABSENT') absent++
      else if (r.status === 'LEAVE') leave++
      else if (r.status === 'HOLIDAY') holiday++
      totalHours += Number(r.working_hours) || 0
    })

    return {
      totalMarked: empRecords.length,
      present,
      late,
      halfDay,
      absent,
      leave,
      holiday,
      totalHours: totalHours.toFixed(1),
    }
  }, [monthAttendanceRecords, selectedEmpId])


  const canCheckIn = !myToday || !myToday.check_in
  const canCheckOut = myToday && myToday.check_in && !myToday.check_out


  return (
    <div className="hr-page">
      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Attendance</h1>
          <p>
            Real-time punch in/out, grace time &amp; shift auto-calculation, daily roster,
            bulk marking, attendance regularization, and monthly summary with payroll lock protection.
          </p>
        </div>
      </div>

      {myError && <Alert type="error">{myError}</Alert>}
      {successMsg && (
        <Alert type="success" message={successMsg} onDismiss={() => setSuccessMsg('')} />
      )}

      {isMonthLocked && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            padding: '12px 16px',
            borderRadius: 8,
            color: '#92400e',
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>🔒 Payroll Locked:</span>
          <span>Attendance records for this month are locked because payroll has been processed/approved. Edits are disabled.</span>
        </div>
      )}

      {/* TOP LEVEL NAVIGATION TABS */}
      <div className="hr-tabs" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={activeTab === 'roster' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('roster')}
        >
          Daily Roster &amp; Punch
        </button>
        <button
          type="button"
          className={activeTab === 'calendar' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('calendar')}
        >
          Monthly Calendar &amp; Summary
        </button>
        <button
          type="button"
          className={activeTab === 'regularization' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('regularization')}
        >
          Regularization Requests ({regularizations.filter((r) => r.status === 'PENDING').length})
        </button>
      </div>

      {/* TAB 1: DAILY ROSTER & SELF CHECK-IN */}
      {activeTab === 'roster' && (
        <>
          <div className="hr-checkin-card">
            <div className="hr-checkin-status">
              <strong>
                {myToday
                  ? `Today's Status: ${STATUS_LABEL[myToday.status] || myToday.status}`
                  : 'You have not checked in today'}
              </strong>

              <span>{todayStr()}</span>

              <div className="hr-checkin-times">
                <div>
                  <span>Check-in</span>
                  <strong>{timeOf(myToday?.check_in)}</strong>
                </div>
                <div>
                  <span>Check-out</span>
                  <strong>{timeOf(myToday?.check_out)}</strong>
                </div>
                {myToday?.working_hours != null && (
                  <div>
                    <span>Working hours</span>
                    <strong>{myToday.working_hours} hrs</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="hr-checkin-actions">
              <Button
                onClick={doCheckIn}
                disabled={!canCheckIn || busy || isMonthLocked}
                loading={busy && canCheckIn}
                loadingText="Checking in..."
              >
                Punch In
              </Button>

              <Button
                variant="secondary"
                onClick={doCheckOut}
                disabled={!canCheckOut || busy || isMonthLocked}
                loading={busy && canCheckOut}
                loadingText="Checking out..."
              >
                Punch Out
              </Button>
            </div>
          </div>

          {canManageTeam && (
            <section className="company-panel" style={{ marginTop: 20 }}>
              <div className="company-toolbar">
                <div>
                  <h2>Team Daily Roster</h2>
                  <p>Attendance records and live status for selected date</p>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    className="company-search"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />

                  <Button
                    variant="secondary"
                    onClick={() => setBulkModalOpen(true)}
                    disabled={isMonthLocked}
                  >
                    Bulk Mark
                  </Button>
                </div>
              </div>

              {rosterError && <Alert type="error">{rosterError}</Alert>}

              <div className="company-table-wrap">
                <table className="company-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Shift</th>
                      <th>Company</th>
                      <th>Status</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Mark As</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rosterLoading && (
                      <tr>
                        <td colSpan="7" className="company-empty">
                          Loading roster for {date}...
                        </td>
                      </tr>
                    )}

                    {!rosterLoading &&
                      roster.map(({ employee, attendance }) => {
                        const contextBadge = getContextualDayBadge(employee, date)

                        return (
                          <tr key={employee.id}>
                            <td>
                              <strong>{employee.display_name}</strong>
                              <span className="company-address">
                                {employee.employee_id || employee.username}
                              </span>
                            </td>

                            <td>{employee.shift?.name || 'Standard'}</td>

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
                              {contextBadge ? (
                                <span
                                  style={{
                                    background: contextBadge.tone,
                                    color: contextBadge.text,
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  {contextBadge.label}
                                </span>
                              ) : (
                                <span
                                  className={`attendance-status attendance-${
                                    attendance?.status || 'NOT_MARKED'
                                  }`}
                                >
                                  {attendance
                                    ? STATUS_LABEL[attendance.status] || attendance.status
                                    : 'Not marked'}
                                </span>
                              )}
                            </td>

                            <td>{timeOf(attendance?.check_in)}</td>
                            <td>{timeOf(attendance?.check_out)}</td>

                            <td>
                              <select
                                className="hr-mark-select"
                                value={attendance?.status || ''}
                                disabled={isMonthLocked}
                                onChange={(event) => {
                                  if (event.target.value) {
                                    markRosterStatus(employee.id, event.target.value)
                                  }
                                }}
                              >
                                <option value="">Set status...</option>
                                {STATUS_OPTIONS.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}

                    {!rosterLoading && roster.length === 0 && (
                      <tr>
                        <td colSpan="7" className="company-empty">
                          No employees in scope for this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* TAB 2: MONTHLY CALENDAR & EMPLOYEE SUMMARY */}
      {activeTab === 'calendar' && (
        <section className="company-panel">
          <div className="company-toolbar">
            <div>
              <h2>Monthly Calendar &amp; Statistics</h2>
              <p>Per-employee monthly attendance calendar and breakdown</p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="month"
                className="company-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />

              <select
                className="company-select"
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
              >
                {roster.map(({ employee }) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.display_name} ({employee.employee_id || employee.username})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* MONTHLY SUMMARY METRIC CARDS */}
          <div className="hr-kpis" style={{ marginTop: 14 }}>
            <div className="hr-kpi-card">
              <span className="hr-kpi-label">Present Days</span>
              <strong className="hr-kpi-value" style={{ color: '#16a34a' }}>
                {employeeMonthSummary.present}
              </strong>
            </div>

            <div className="hr-kpi-card">
              <span className="hr-kpi-label">Late Marks</span>
              <strong className="hr-kpi-value" style={{ color: '#d97706' }}>
                {employeeMonthSummary.late}
              </strong>
            </div>

            <div className="hr-kpi-card">
              <span className="hr-kpi-label">Half Days</span>
              <strong className="hr-kpi-value" style={{ color: '#ca8a04' }}>
                {employeeMonthSummary.halfDay}
              </strong>
            </div>

            <div className="hr-kpi-card">
              <span className="hr-kpi-label">Absent / LOP</span>
              <strong className="hr-kpi-value" style={{ color: '#dc2626' }}>
                {employeeMonthSummary.absent}
              </strong>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 14, color: '#173b59', marginBottom: 12 }}>
              Calendar Grid: {selectedMonth}
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 8,
              }}
            >
              {calendarDays.map((dayStr) => {
                const dayNum = parseInt(dayStr.slice(8), 10)
                const rec = monthAttendanceRecords.find(
                  (r) => Number(r.user) === Number(selectedEmpId) && r.date === dayStr
                )

                const isWeekend = new Date(dayStr).getDay() === 0

                return (
                  <div
                    key={dayStr}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: 10,
                      background: rec?.status ? '#f8fafc' : isWeekend ? '#f1f5f9' : '#ffffff',
                      minHeight: 65,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                        Day {dayNum}
                      </span>
                      {isWeekend && <span style={{ fontSize: 10, color: '#94a3b8' }}>Sun</span>}
                    </div>

                    <div style={{ marginTop: 6 }}>
                      {rec ? (
                        <span
                          className={`attendance-status attendance-${rec.status}`}
                          style={{ fontSize: 10, padding: '2px 6px' }}
                        >
                          {STATUS_LABEL[rec.status] || rec.status}
                        </span>
                      ) : isWeekend ? (
                        <span style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
                          Weekly Off
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: REGULARIZATION REQUESTS */}
      {activeTab === 'regularization' && (
        <section className="company-panel">
          <div className="company-toolbar">
            <div>
              <h2>Attendance Regularization</h2>
              <p>Submit and process requests for missed punches or duty on tour</p>
            </div>

            <Button onClick={() => setRegModalOpen(true)}>
              + Request Regularization
            </Button>
          </div>

          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Requested Timing</th>
                  <th>Reason</th>
                  <th>Status</th>
                  {canManageTeam && <th>Decision</th>}
                </tr>
              </thead>

              <tbody>
                {regularizations.length === 0 ? (
                  <tr>
                    <td colSpan={canManageTeam ? 7 : 6} className="company-empty">
                      No attendance regularization requests found.
                    </td>
                  </tr>
                ) : (
                  regularizations.map((req) => (
                    <tr key={req.id}>
                      <td><span className="company-code">{req.id}</span></td>
                      <td>
                        <strong>{req.user_name}</strong>
                        <div style={{ fontSize: 11, color: '#6d859a' }}>{req.employee_code}</div>
                      </td>
                      <td><strong>{req.date}</strong></td>
                      <td>{req.check_in} &ndash; {req.check_out}</td>
                      <td>{req.reason}</td>
                      <td>
                        <span
                          className={`company-status ${
                            req.status === 'APPROVED'
                              ? 'active'
                              : req.status === 'REJECTED'
                              ? 'inactive'
                              : ''
                          }`}
                          style={{
                            background: req.status === 'PENDING' ? '#fef3c7' : undefined,
                            color: req.status === 'PENDING' ? '#b45309' : undefined,
                          }}
                        >
                          {req.status}
                        </span>
                      </td>

                      {canManageTeam && (
                        <td className="company-actions">
                          {req.status === 'PENDING' ? (
                            <>
                              <button
                                type="button"
                                className="company-link"
                                onClick={() => decideRegularization(req.id, 'APPROVED')}
                                disabled={isMonthLocked}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="company-link danger"
                                onClick={() => decideRegularization(req.id, 'REJECTED')}
                                disabled={isMonthLocked}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              Processed by {req.decided_by || 'Admin'}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* BULK MARK MODAL */}
      {bulkModalOpen && (
        <Modal
          title={`Bulk Mark Attendance for ${date}`}
          onClose={() => setBulkModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulkModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={bulkSaving} onClick={handleBulkMark}>
                Apply to Roster
              </Button>
            </>
          }
        >
          <div className="company-form-grid">
            <div className="field">
              <label className="field-label">Status to Mark</label>
              <select
                className="field-input"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label">Company Filter</label>
              <select
                className="field-input"
                value={bulkCompany}
                onChange={(e) => setBulkCompany(e.target.value)}
              >
                <option value="ALL">All Companies</option>
                {scopedCompanies.map((cId) => (
                  <option key={cId} value={cId}>
                    Company #{cId}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <input
                type="checkbox"
                id="bulkOverwrite"
                checked={bulkOverwrite}
                onChange={(e) => setBulkOverwrite(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="bulkOverwrite" style={{ fontSize: 13, color: '#173b59', cursor: 'pointer', fontWeight: 600 }}>
                Overwrite already marked employees (default only marks un-marked)
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* REGULARIZATION REQUEST MODAL */}
      {regModalOpen && (
        <Modal
          title="Submit Attendance Regularization Request"
          onClose={() => setRegModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRegModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitRegularization}>
                Submit Request
              </Button>
            </>
          }
        >
          <form onSubmit={submitRegularization}>
            <div className="company-form-grid">
              <div className="field">
                <label className="field-label">Date</label>
                <input
                  type="date"
                  className="field-input"
                  value={regForm.date}
                  onChange={(e) => setRegForm({ ...regForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Check-in Time</label>
                <input
                  type="time"
                  className="field-input"
                  value={regForm.check_in}
                  onChange={(e) => setRegForm({ ...regForm, check_in: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Check-out Time</label>
                <input
                  type="time"
                  className="field-input"
                  value={regForm.check_out}
                  onChange={(e) => setRegForm({ ...regForm, check_out: e.target.value })}
                  required
                />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label className="field-label">Reason for Missing Punch</label>
                <textarea
                  className="field-input"
                  rows={3}
                  placeholder="Explain why biometric/app punch was missed (e.g. client visit, power issue)..."
                  value={regForm.reason}
                  onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })}
                  required
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}