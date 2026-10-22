import { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import useAuth from '../../hooks/useAuth'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { getErrorMessage } from '../../utils/errors'
import { hrService } from './hrService'
import { logAudit } from '../../utils/audit'
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

export default function CheckInOutSection({ onAttendanceChange, className = '' }) {
  const { user } = useAuth()
  const erpAttendance = useSelector((state) => state.erp?.attendance || [])
  const erpShifts = useSelector((state) => state.erp?.shifts || [])

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const role = String(user?.profile?.role || user?.role || '').toUpperCase()
  const isAdmin = Boolean(user?.is_superuser) || role === 'SUPER_ADMIN' || role === 'ADMIN'

  const today = todayStr()

  // Single source of truth from Redux (Hooks called unconditionally at top level)
  const myToday = useMemo(() => {
    if (!user || isAdmin) return null
    return (
      erpAttendance.find(
        (a) => Number(a.user) === Number(user.id) && a.date === today
      ) || null
    )
  }, [erpAttendance, user, isAdmin, today])

  const isMonthLocked = useMemo(() => {
    const monthPrefix = today.slice(0, 7)
    try {
      const raw = localStorage.getItem(PAYROLL_RUNS_STORAGE_KEY)
      if (!raw) return false
      const runs = JSON.parse(raw)
      return runs.some(
        (r) =>
          r.month === monthPrefix &&
          (r.status === 'PROCESSED' || r.status === 'APPROVED' || r.status === 'PAID')
      )
    } catch {
      return false
    }
  }, [today])

  // Return null for Admin or unauthenticated user
  if (isAdmin || !user) {
    return null
  }

  const canCheckIn = !myToday || !myToday.check_in
  const canCheckOut = myToday && myToday.check_in && !myToday.check_out

  const doCheckIn = async () => {
    if (isAdmin) return
    if (isMonthLocked) {
      setErrorMsg('Cannot check in: This month is locked by finalized payroll.')
      return
    }

    setBusy(true)
    setErrorMsg('')

    try {
      const userShift = erpShifts.find(
        (s) => Number(s.id) === Number(user?.profile?.shift || user?.shift)
      )

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
        description: `Check In recorded at ${new Date().toLocaleTimeString()} by ${user.username}`,
        user,
      })

      setSuccessMsg('Check-in recorded successfully.')
      if (onAttendanceChange) onAttendanceChange()
    } catch (err) {
      setErrorMsg(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const doCheckOut = async () => {
    if (isAdmin) return
    if (isMonthLocked) {
      setErrorMsg('Cannot check out: This month is locked by finalized payroll.')
      return
    }

    setBusy(true)
    setErrorMsg('')

    try {
      await hrService.doCheckOut({ user: user.id })

      logAudit({
        module: 'HRMS',
        entity_type: 'Attendance',
        entity_id: `${user.username} (${todayStr()})`,
        action: 'CHECK_OUT',
        description: `Check Out recorded at ${new Date().toLocaleTimeString()} by ${user.username}`,
        user,
      })

      setSuccessMsg('Check-out recorded successfully.')
      if (onAttendanceChange) onAttendanceChange()
    } catch (err) {
      setErrorMsg(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className} style={{ marginBottom: 18 }}>
      {errorMsg && (
        <Alert type="error" onDismiss={() => setErrorMsg('')} style={{ marginBottom: 12 }}>
          {errorMsg}
        </Alert>
      )}
      {successMsg && (
        <Alert
          type="success"
          message={successMsg}
          onDismiss={() => setSuccessMsg('')}
          style={{ marginBottom: 12 }}
        />
      )}

      <div className="hr-checkin-card" style={{ marginBottom: 0 }}>
        <div className="hr-checkin-status">
          <strong>
            {myToday
              ? `Today's Status: ${STATUS_LABEL[myToday.status] || myToday.status}`
              : 'You have not checked in today'}
          </strong>

          <span>{today}</span>

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
            Check In
          </Button>

          <Button
            variant="secondary"
            onClick={doCheckOut}
            disabled={!canCheckOut || busy || isMonthLocked}
            loading={busy && canCheckOut}
            loadingText="Checking out..."
          >
            Check Out
          </Button>
        </div>
      </div>
    </div>
  )
}
