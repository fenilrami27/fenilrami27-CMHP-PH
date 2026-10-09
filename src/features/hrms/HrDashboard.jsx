import { useEffect, useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import useAuth from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errors'
import { selectActiveCompanyId } from '../../utils/companySelectors'

import { hrService } from './hrService'
import { allowedCompanyIds, canViewHrReports } from './permissions'

import '../dashboard/Dashboard.css'
import './Hrms.css'

export default function HrDashboard() {
  const { user } = useAuth()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const erpState = useSelector((state) => state.erp)

  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  const scopedCompanies = allowedCompanyIds(user)
  const canSeeApprovals = canViewHrReports(user)

  const role = String(user?.profile?.role || user?.role || '').toUpperCase()
  const isAdminOrHr =
    Boolean(user?.is_superuser) ||
    role === 'SUPER_ADMIN' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER' ||
    role === 'MANAGEMENT'

  useEffect(() => {
    if (isAdminOrHr) {
      hrService
        .getDashboardSummary(scopedCompanies)
        .then((response) => setSummary(response?.data || response))
        .catch((err) => setError(getErrorMessage(err)))
    }
  }, [activeCompanyId, isAdminOrHr])

  const name = user?.first_name || user?.username || 'there'
  const isCompanyB = Number(activeCompanyId) === 2

  // Employee-specific calculations
  const employeeData = useMemo(() => {
    if (isAdminOrHr) return null

    const userRecord =
      (erpState?.users || []).find(
        (u) => Number(u.id) === Number(user?.id) || u.username === user?.username
      ) || user

    const todayStr = new Date().toISOString().slice(0, 10)
    const todayAtt = (erpState?.attendance || []).find(
      (a) => Number(a.user) === Number(user?.id) && a.date === todayStr
    )

    let attStatus = 'Not Marked Today'
    let attColor = '#64748b'
    if (todayAtt?.check_in) {
      const checkInTime = new Date(todayAtt.check_in).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      attStatus = `Present (In: ${checkInTime})`
      attColor = '#15803d'
    } else if (todayAtt?.status === 'PRESENT') {
      attStatus = 'Present'
      attColor = '#15803d'
    } else if (todayAtt?.status === 'ON_LEAVE') {
      attStatus = 'On Leave'
      attColor = '#d97706'
    } else if (todayAtt?.status === 'HALF_DAY') {
      attStatus = 'Half Day'
      attColor = '#2563eb'
    }

    const myApprovedLeaves = (erpState?.leaveRequests || []).filter(
      (l) => Number(l.user) === Number(user?.id) && l.status === 'APPROVED'
    )
    const daysTaken = myApprovedLeaves.reduce(
      (sum, l) => sum + (Number(l.days) || 1),
      0
    )
    const leaveBalance = Math.max(24 - daysTaken, 0)

    const myShiftId = userRecord?.shift?.id ?? userRecord?.shift
    const myShift = (erpState?.shifts || []).find(
      (s) => Number(s.id) === Number(myShiftId)
    )
    const shiftName = myShift?.name || 'General Shift'
    const shiftTimings =
      myShift?.start_time && myShift?.end_time
        ? `${myShift.start_time} - ${myShift.end_time}`
        : '09:00 AM - 06:00 PM'

    const mySalaryStructure = (erpState?.salaryStructures || []).find(
      (s) => Number(s.user) === Number(user?.id)
    )
    const basic = Number(
      mySalaryStructure?.basic || userRecord?.basic_salary || userRecord?.monthly_salary || 0
    )
    const allowances = Number(
      mySalaryStructure?.allowances || userRecord?.allowances || 0
    )
    const deductions = Number(
      mySalaryStructure?.deductions || userRecord?.deductions || 0
    )
    const netPay = Math.max(basic + allowances - deductions, 0)

    const holidays = (erpState?.holidays || []).slice(0, 5)

    return {
      userRecord,
      attStatus,
      attColor,
      leaveBalance,
      shiftName,
      shiftTimings,
      basic,
      allowances,
      deductions,
      netPay,
      holidays,
    }
  }, [isAdminOrHr, user, erpState])

  // ==========================================
  // EMPLOYEE VIEW (NON-ADMIN)
  // ==========================================
  if (!isAdminOrHr && employeeData) {
    return (
      <div className="hr-page">
        <div className="hr-header">
          <div>
            <span className="dash-pill">HRMS</span>
            <h1>Welcome, {name}</h1>
            <p>Your personal attendance, leave balance, shift schedule, and payslip summary.</p>
          </div>
        </div>

        {/* 4 Clean Personal KPI Cards */}
        <section className="hr-kpis">
          <article className="hr-kpi-card">
            <div className="hr-kpi-value" style={{ color: employeeData.attColor, fontSize: 18 }}>
              {employeeData.attStatus}
            </div>
            <div className="hr-kpi-label">Today&rsquo;s Attendance</div>
          </article>

          <article className="hr-kpi-card">
            <div className="hr-kpi-value" style={{ color: '#0284c7' }}>
              {employeeData.leaveBalance} Days
            </div>
            <div className="hr-kpi-label">Annual Leave Balance</div>
          </article>

          <article className="hr-kpi-card">
            <div className="hr-kpi-value" style={{ fontSize: 18 }}>
              {employeeData.shiftName}
            </div>
            <div className="hr-kpi-label">Shift: {employeeData.shiftTimings}</div>
          </article>

          <article className="hr-kpi-card">
            <div className="hr-kpi-value" style={{ color: '#16a34a' }}>
              ₹{employeeData.netPay.toLocaleString('en-IN')}
            </div>
            <div className="hr-kpi-label">Monthly Net Pay</div>
          </article>
        </section>

        {/* Detailed Panels */}
        <section className="dash-grid">
          {/* Latest Payslip Summary */}
          <article className="dash-card">
            <div className="dash-card-header">
              <div>
                <h3 className="dash-card-title">Salary &amp; Payslip Summary</h3>
                <p className="dash-card-sub">Current monthly salary structure</p>
              </div>
              <Link to="/hrms/my-salary" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                View Full Slip →
              </Link>
            </div>

            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>Basic Salary</span>
                <span style={{ fontWeight: 600 }}>₹{employeeData.basic.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>Allowances</span>
                <span style={{ fontWeight: 600 }}>₹{employeeData.allowances.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>Deductions</span>
                <span style={{ fontWeight: 600, color: '#dc2626' }}>-₹{employeeData.deductions.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700, fontSize: 15 }}>
                <span>Net Pay</span>
                <span style={{ color: '#16a34a' }}>₹{employeeData.netPay.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </article>

          {/* Quick Actions & Holidays */}
          <article className="dash-card">
            <div className="dash-card-header">
              <div>
                <h3 className="dash-card-title">Employee Quick Actions</h3>
                <p className="dash-card-sub">Jump straight to your modules</p>
              </div>
            </div>

            <ul className="activity-list">
              <li>
                <span className="activity-dot activity-blue" />
                <div>
                  <Link to="/hrms/attendance" className="activity-title" style={{ textDecoration: 'none', color: '#1e293b' }}>
                    Mark Attendance
                  </Link>
                  <span className="activity-time">Check in or log daily work</span>
                </div>
              </li>
              <li>
                <span className="activity-dot activity-green" />
                <div>
                  <Link to="/hrms/leave" className="activity-title" style={{ textDecoration: 'none', color: '#1e293b' }}>
                    Apply for Leave
                  </Link>
                  <span className="activity-time">Submit leave request ({employeeData.leaveBalance} days left)</span>
                </div>
              </li>
              <li>
                <span className="activity-dot activity-purple" />
                <div>
                  <Link to="/hrms/shifts" className="activity-title" style={{ textDecoration: 'none', color: '#1e293b' }}>
                    View Shift &amp; Timings
                  </Link>
                  <span className="activity-time">{employeeData.shiftName} ({employeeData.shiftTimings})</span>
                </div>
              </li>
              <li>
                <span className="activity-dot activity-purple" />
                <div>
                  <Link to="/hrms/my-salary" className="activity-title" style={{ textDecoration: 'none', color: '#1e293b' }}>
                    Download Salary Slip
                  </Link>
                  <span className="activity-time">Generate PDF/Printable slip for current month</span>
                </div>
              </li>
            </ul>
          </article>
        </section>
      </div>
    )
  }

  // ==========================================
  // ADMIN / HR MANAGER VIEW
  // ==========================================
  const cards = summary
    ? [
        {
          label: 'Total employees',
          value: summary.total_employees,
        },
        {
          label: 'Present today',
          value: summary.present_today,
        },
        {
          label: 'Not marked yet',
          value: summary.not_marked_today,
        },
        {
          label: 'On leave today',
          value: summary.on_leave_today,
        },
        isCompanyB
          ? {
              label: 'Tej Biocare employees',
              value: summary.company_b_employees !== undefined ? summary.company_b_employees : summary.total_employees,
            }
          : {
              label: 'CMHP Pharma employees',
              value: summary.company_a_employees !== undefined ? summary.company_a_employees : summary.total_employees,
            },
      ]
    : []

  return (
    <div className="hr-page">
      <div className="hr-header">
        <div>
          <span className="dash-pill">HRMS</span>

          <h1>HR Dashboard, {name}</h1>

          <p>
            Company-wise employee, attendance and leave snapshot.
            {scopedCompanies.length > 0 && (
              ' You are viewing data for your assigned company only.'
            )}
          </p>
        </div>
      </div>

      {error && (
        <section className="dash-card">{error}</section>
      )}

      {!summary && !error && (
        <section className="dash-card">
          Loading HR summary…
        </section>
      )}

      {summary && (
        <>
          <section className="hr-kpis">
            {cards.map((card) => (
              <article className="hr-kpi-card" key={card.label}>
                <div className="hr-kpi-value">{card.value}</div>
                <div className="hr-kpi-label">{card.label}</div>
              </article>
            ))}

            {canSeeApprovals && (
              <article className="hr-kpi-card">
                <div className="hr-kpi-value">
                  {summary.pending_leave_approvals}
                </div>
                <div className="hr-kpi-label">
                  Pending leave approvals
                </div>
              </article>
            )}
          </section>

          <section className="dash-grid">
            <article className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h3 className="dash-card-title">
                    Upcoming holidays
                  </h3>
                  <p className="dash-card-sub">
                    Next 5 holidays on the company calendar
                  </p>
                </div>
              </div>

              {summary.upcoming_holidays?.length ? (
                <ul className="activity-list">
                  {summary.upcoming_holidays.map((holiday) => (
                    <li key={holiday.id}>
                      <span className="activity-dot activity-purple" />
                      <div>
                        <p className="activity-title">{holiday.name}</p>
                        <span className="activity-time">{holiday.date}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-empty">
                  No upcoming holidays configured yet.
                </p>
              )}
            </article>

            <article className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h3 className="dash-card-title">Quick links</h3>
                  <p className="dash-card-sub">
                    Jump straight to the HRMS module you need
                  </p>
                </div>
              </div>

              <ul className="activity-list">
                <li>
                  <span className="activity-dot activity-blue" />
                  <div>
                    <p className="activity-title">Mark today&rsquo;s attendance</p>
                    <span className="activity-time">HRMS → Attendance</span>
                  </div>
                </li>
                <li>
                  <span className="activity-dot activity-green" />
                  <div>
                    <p className="activity-title">Manage employee records</p>
                    <span className="activity-time">HRMS → Employees</span>
                  </div>
                </li>
              </ul>
            </article>
          </section>
        </>
      )}
    </div>
  )
}