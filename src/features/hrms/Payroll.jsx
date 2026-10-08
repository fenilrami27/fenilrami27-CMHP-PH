import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import useAuth
  from '../../hooks/useAuth'

import Alert
  from '../../components/Alert'

import Button
  from '../../components/Button'

import Input
  from '../../components/Input'

import {
  getErrorMessage,
} from '../../utils/errors'

import {
  recordAudit,
} from '../../utils/audit'

import Modal
  from '../inventory/components/Modal'

import {
  companyService,
} from '../companies/companyService'

import {
  hrService,
} from './hrService'

import {
  allowedCompanyIds,
  canManagePayroll,
} from './permissions'

import {
  currentMonth,
  downloadCsv,
  formatDate,
  formatMoney,
  monthDates,
  monthRange,
  round2,
  todayStr,
} from './hrUtils'

import '../companies/Companies.css'
import './Hrms.css'
import './Payroll.css'


const EMPTY_FORM = {
  user: '',
  effective_from: '',
  basic: '',
  allowances: '',
  incentives: '',
  bonus: '',
  other: '',
  deductions: '',
  note: '',
}


const ADJUSTMENTS_KEY =
  'cmhp_payroll_adjustments_v1'

const PAYMENTS_KEY =
  'cmhp_payroll_payments_v2'


const COMPANY_DISPLAY_NAMES = {
  1: 'CMHP',
  2: 'Tej Biocare',
}


const num = (
  value
) =>
  Number(value) || 0


const grossOf = (
  salary
) =>
  num(salary.basic) +
  num(salary.allowances) +
  num(salary.incentives) +
  num(salary.bonus) +
  num(salary.other)


const netOf = (
  salary
) =>
  Math.max(
    round2(
      grossOf(salary) -
        num(
          salary.deductions
        )
    ),
    0
  )


function responseData(
  response
) {

  return (
    response?.data ??
    response ??
    []
  )
}


function loadJson(
  key,
  fallback = {}
) {

  try {

    const raw =
      localStorage.getItem(
        key
      )

    return raw
      ? JSON.parse(raw)
      : fallback

  } catch {

    return fallback

  }
}


function saveJson(
  key,
  value
) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(value)
    )

  } catch {

    // Local persistence is non-blocking.

  }
}


function weeklyOffTokens(
  shift
) {

  return String(
    shift?.weekly_off ||
      'Sunday'
  )
    .toLowerCase()
    .split(
      /[,/&]|\band\b/
    )
    .map(
      (token) =>
        token
          .trim()
          .slice(0, 3)
    )
    .filter(Boolean)
}


const WEEKDAY_TOKENS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
]


function isWeeklyOff(
  dateStr,
  tokens
) {

  const day =
    new Date(
      `${dateStr}T00:00:00`
    ).getDay()

  return tokens.includes(
    WEEKDAY_TOKENS[day]
  )
}


function employeeMonthlySalary(
  employee
) {

  return num(
    employee?.monthly_salary ??
      employee?.salary ??
      employee?.monthlySalary ??
      employee?.salary_amount
  )
}


function companyDisplayName(
  companyId,
  companies = []
) {

  return (
    COMPANY_DISPLAY_NAMES[
      Number(companyId)
    ] ||
    companies.find(
      (company) =>
        Number(company.id) ===
        Number(companyId)
    )?.name ||
    `Company ${companyId || ''}`.trim()
  )
}


/*
 * Merge:
 *
 * 1. Real salary structures
 * 2. Employee monthly_salary
 *
 * This means:
 *
 * Add Employee
 *     ↓
 * monthly_salary
 *     ↓
 * Payroll automatically
 *
 */

function buildMergedStructures(
  structures,
  employees
) {

  const actualByUser =
    new Map(
      structures.map(
        (structure) => [
          Number(
            structure.user
          ),
          structure,
        ]
      )
    )

  return employees
    .filter(
      (employee) =>
        employee.is_active !== false
    )
    .map(
      (employee) => {

        const actual =
          actualByUser.get(
            Number(employee.id)
          )

        if (actual) {

          return {
            ...actual,
            virtual: false,
            employee_name:
              actual.employee_name ||
              employee.display_name ||
              employee.username,
          }

        }


        const salary =
          employeeMonthlySalary(
            employee
          )

        if (!(salary > 0)) {
          return null
        }


        return {

          id:
            `employee-salary-${employee.id}`,

          user:
            employee.id,

          company:
            employee.primary_company,

          effective_from:
            employee.joining_date ||
            '',

          basic:
            salary,

          allowances:
            0,

          incentives:
            0,

          bonus:
            0,

          other:
            0,

          deductions:
            0,

          note:
            'Imported from employee monthly salary',

          employee_name:
            employee.display_name ||
            employee.username,

          virtual:
            true,

        }

      }
    )
    .filter(Boolean)
}


/*
 * MONTHLY PAYROLL CALCULATION
 */

function buildPayrollRow({
  structure,
  employee,
  month,
  data,
  unmarkedPaid,
  adjustment,
}) {

  const {
    days,
  } =
    monthRange(
      month
    )

  const dates =
    monthDates(
      month
    )

  const today =
    todayStr()


  const records =
    new Map(
      data.attendance
        .filter(
          (record) =>
            Number(
              record.user
            ) ===
            Number(
              structure.user
            )
        )
        .map(
          (record) => [
            record.date,
            record,
          ]
        )
    )


  const holidayDates =
    new Set(
      data.holidays
        .filter(
          (holiday) =>
            !holiday.company ||
            Number(
              holiday.company
            ) ===
            Number(
              structure.company
            )
        )
        .map(
          (holiday) =>
            holiday.date
        )
    )


  const leaves =
    data.leaves.filter(
      (leave) =>
        Number(
          leave.user
        ) ===
          Number(
            structure.user
          ) &&
        leave.status ===
          'APPROVED'
    )


  const offTokens =
    weeklyOffTokens(
      employee?.shift
    )


  const leaveOn =
    (date) =>
      leaves.find(
        (leave) =>
          leave.from_date <=
            date &&
          leave.to_date >=
            date
      )


  const leavePaid =
    (request) => {

      if (!request) {
        return true
      }

      const type =
        data.leaveTypes.find(
          (leaveType) =>
            Number(
              leaveType.id
            ) ===
            Number(
              request.leave_type
            )
        )

      return type
        ? Boolean(
            type.paid
          )
        : true
    }


  const count = {

    worked: 0,

    halfDays: 0,

    paidLeave: 0,

    unpaidLeave: 0,

    offDays: 0,

    holidayDays: 0,

    absent: 0,

    unmarked: 0,

    upcoming: 0,

  }


  dates.forEach(
    (date) => {

      const record =
        records.get(
          date
        )


      if (record) {

        switch (
          record.status
        ) {

          case 'PRESENT':
          case 'LATE':
          case 'WFH':
          case 'EARLY_EXIT':

            count.worked += 1

            break


          case 'HALF_DAY':

            count.halfDays += 1

            break


          case 'LEAVE':

            if (
              leavePaid(
                leaveOn(
                  date
                )
              )
            ) {

              count.paidLeave += 1

            } else {

              count.unpaidLeave += 1

            }

            break


          case 'HOLIDAY':

            count.holidayDays += 1

            break


          case 'WEEKLY_OFF':

            count.offDays += 1

            break


          default:

            count.absent += 1

        }

        return

      }


      if (
        isWeeklyOff(
          date,
          offTokens
        )
      ) {

        count.offDays += 1

        return

      }


      if (
        holidayDates.has(
          date
        )
      ) {

        count.holidayDays += 1

        return

      }


      const leave =
        leaveOn(
          date
        )


      if (leave) {

        if (
          leavePaid(
            leave
          )
        ) {

          count.paidLeave += 1

        } else {

          count.unpaidLeave += 1

        }

        return

      }


      if (
        date > today
      ) {

        count.upcoming += 1

        return

      }


      count.unmarked += 1

    }
  )


  const payableDays =
    Math.min(
      days,
      count.worked +
        count.halfDays * 0.5 +
        count.paidLeave +
        count.offDays +
        count.holidayDays +
        count.upcoming +
        (
          unmarkedPaid
            ? count.unmarked
            : 0
        )
    )


  const fixedEarnings =
    num(
      structure.basic
    ) +
    num(
      structure.allowances
    ) +
    num(
      structure.other
    )


  const variableEarnings =
    num(
      structure.incentives
    ) +
    num(
      structure.bonus
    )


  const proratedFixed =
    round2(
      (
        fixedEarnings *
        payableDays
      ) / days
    )


  const earnings =
    round2(
      proratedFixed +
        variableEarnings
    )


  const deductions =
    num(
      structure.deductions
    )


  const net =
    Math.max(
      round2(
        earnings -
          deductions +
          adjustment
      ),
      0
    )


  return {

    user:
      structure.user,

    name:
      structure.employee_name,

    code:
      employee?.employee_id ||
      '',

    company:
      structure.company,

    days,

    ...count,

    payableDays,

    unpaidDays:
      round2(
        days -
          payableDays
      ),

    basic:
      num(
        structure.basic
      ),

    allowances:
      num(
        structure.allowances
      ),

    other:
      num(
        structure.other
      ),

    incentives:
      num(
        structure.incentives
      ),

    bonus:
      num(
        structure.bonus
      ),

    earnings,

    deductions,

    adjustment,

    net,

  }
}


/*
 * PAYMENT KEY
 */

function paymentKey(
  month,
  row
) {

  return (
    `${Number(
      row.company
    ) || 0}|${month}|${Number(
      row.user
    )}`
  )
}


/*
 * SALARY SLIP
 *
 * Company 1 -> CMHP
 * Company 2 -> Tej Biocare
 */

function downloadSalarySlip({
  row,
  month,
  companies,
  payment,
}) {

  const companyName =
    companyDisplayName(
      row.company,
      companies
    )


  const paidDate =
    payment?.paidAt
      ? new Date(
          payment.paidAt
        ).toLocaleDateString(
          'en-IN',
          {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }
        )
      : '—'


  const html =
`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Salary Slip - ${row.name} - ${month}</title>

<style>
body{
  font-family:Arial,sans-serif;
  background:#f4f8fc;
  margin:0;
  padding:32px;
  color:#173b5f;
}

.sheet{
  max-width:820px;
  margin:auto;
  background:#fff;
  border:1px solid #d8e5f0;
  border-radius:18px;
  padding:34px;
  box-shadow:0 12px 35px rgba(25,65,100,.08);
}

h1{
  margin:0 0 6px;
  font-size:28px;
}

.muted{
  color:#71869a;
}

.head{
  display:flex;
  justify-content:space-between;
  gap:20px;
  border-bottom:1px solid #e4edf4;
  padding-bottom:22px;
  margin-bottom:22px;
}

.badge{
  display:inline-block;
  padding:7px 12px;
  border-radius:20px;
  background:#eaf4ff;
  color:#1671c8;
  font-weight:700;
  font-size:12px;
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:18px;
}

td{
  padding:12px;
  border-bottom:1px solid #edf2f6;
}

td:last-child{
  text-align:right;
  font-weight:700;
}

.total td{
  font-size:18px;
  border-top:2px solid #173b5f;
}

.meta{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px 24px;
}

.footer{
  margin-top:28px;
  font-size:12px;
  color:#7890a4;
}
</style>

</head>

<body>

<div class="sheet">

<div class="head">

<div>

<span class="badge">
SALARY SLIP
</span>

<h1>
${companyName}
</h1>

<div class="muted">
Monthly salary statement • ${month}
</div>

</div>

<div style="text-align:right">

<strong>
${row.name}
</strong>

<div class="muted">
${row.code || 'Employee'}
</div>

</div>

</div>


<div class="meta">

<div>
<strong>Employee</strong><br>
${row.name}
</div>

<div>
<strong>Employee ID</strong><br>
${row.code || '—'}
</div>

<div>
<strong>Salary Month</strong><br>
${month}
</div>

<div>
<strong>Payment Status</strong><br>
PAID on ${paidDate}
</div>

</div>


<table>

<tr>
<td>Basic Salary</td>
<td>
₹${row.basic.toLocaleString(
  'en-IN',
  {
    minimumFractionDigits:2,
  }
)}
</td>
</tr>

<tr>
<td>Allowances</td>
<td>
₹${row.allowances.toLocaleString(
  'en-IN',
  {
    minimumFractionDigits:2,
  }
)}
</td>
</tr>

<tr>
<td>
Incentives + Bonus + Other
</td>

<td>
₹${(
  row.incentives +
  row.bonus +
  row.other
).toLocaleString(
  'en-IN',
  {
    minimumFractionDigits:2,
  }
)}
</td>

</tr>

<tr>

<td>
Deductions
</td>

<td>
- ₹${row.deductions.toLocaleString(
  'en-IN',
  {
    minimumFractionDigits:2,
  }
)}
</td>

</tr>

<tr>

<td>
Attendance / Payable Days
</td>

<td>
${row.payableDays} / ${row.days}
</td>

</tr>

<tr class="total">

<td>
NET PAYABLE
</td>

<td>
₹${row.net.toLocaleString(
  'en-IN',
  {
    minimumFractionDigits:2,
  }
)}
</td>

</tr>

</table>


<div class="footer">
This salary slip was generated by the CMHP Pharmaceutical ERP local payroll module.
</div>

</div>

</body>
</html>`


  const blob =
    new Blob(
      [html],
      {
        type:
          'text/html;charset=utf-8',
      }
    )


  const url =
    URL.createObjectURL(
      blob
    )


  const link =
    document.createElement(
      'a'
    )


  link.href =
    url

  link.download =
    `salary-slip-${row.code || row.user}-${month}.html`


  document.body.appendChild(
    link
  )

  link.click()

  document.body.removeChild(
    link
  )

  URL.revokeObjectURL(
    url
  )
}


export default function Payroll() {

  const {
    user,
  } = useAuth()


  const scopedCompanies =
    allowedCompanyIds(
      user
    )


  const canManage =
    canManagePayroll(
      user
    )


  const [
    tab,
    setTab,
  ] = useState(
    'structures'
  )


  const [
    structures,
    setStructures,
  ] = useState([])


  const [
    employees,
    setEmployees,
  ] = useState([])


  const [
    companies,
    setCompanies,
  ] = useState([])


  const [
    loading,
    setLoading,
  ] = useState(true)


  const [
    error,
    setError,
  ] = useState('')


  const [
    companyFilter,
    setCompanyFilter,
  ] = useState(
    'ALL'
  )


  const [
    modalOpen,
    setModalOpen,
  ] = useState(false)


  const [
    editing,
    setEditing,
  ] = useState(null)


  const [
    form,
    setForm,
  ] = useState(
    EMPTY_FORM
  )


  const [
    saving,
    setSaving,
  ] = useState(false)


  const [
    month,
    setMonth,
  ] = useState(
    currentMonth()
  )


  const [
    unmarkedPaid,
    setUnmarkedPaid,
  ] = useState(false)


  const [
    adjustments,
    setAdjustments,
  ] = useState(
    () =>
      loadJson(
        ADJUSTMENTS_KEY,
        {}
      )
  )


  const [
    payments,
    setPayments,
  ] = useState(
    () =>
      loadJson(
        PAYMENTS_KEY,
        {}
      )
  )


  const [
    payrollData,
    setPayrollData,
  ] = useState({

    attendance: [],

    holidays: [],

    leaves: [],

    leaveTypes: [],

  })


  const [
    payrollLoading,
    setPayrollLoading,
  ] = useState(false)


  const [
    payrollError,
    setPayrollError,
  ] = useState('')


  const load =
    async () => {

      setLoading(true)

      setError('')


      try {

        const [
          structuresResponse,
          employeesResponse,
          companiesResponse,
        ] =
          await Promise.all([

            hrService.getSalaryStructures(
              scopedCompanies
            ),

            hrService.getEmployees(
              scopedCompanies
            ),

            companyService.getCompanies(),

          ])


        setStructures(
          responseData(
            structuresResponse
          )
        )


        setEmployees(
          responseData(
            employeesResponse
          )
        )


        setCompanies(
          responseData(
            companiesResponse
          ).filter(
            (company) =>
              company.is_active
          )
        )

      } catch (err) {

        setError(
          getErrorMessage(
            err
          )
        )

      } finally {

        setLoading(false)

      }

    }


  useEffect(
    () => {

      load()

    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )


  useEffect(
    () => {

      saveJson(
        ADJUSTMENTS_KEY,
        adjustments
      )

    },
    [adjustments]
  )


  useEffect(
    () => {

      saveJson(
        PAYMENTS_KEY,
        payments
      )

    },
    [payments]
  )


  useEffect(
    () => {

      if (
        tab !== 'payroll' ||
        !month
      ) {
        return undefined
      }


      let cancelled =
        false


      const {
        from,
        to,
      } =
        monthRange(
          month
        )


      setPayrollLoading(
        true
      )


      setPayrollError(
        ''
      )


      Promise.all([

        hrService.getAttendanceRange(
          from,
          to,
          scopedCompanies
        ),

        hrService.getHolidays(
          scopedCompanies
        ),

        hrService.getLeaveRequests(
          scopedCompanies
        ),

        hrService.getLeaveTypes(
          scopedCompanies
        ),

      ])

        .then(
          ([
            attendance,
            holidays,
            leaves,
            leaveTypes,
          ]) => {

            if (
              cancelled
            ) {
              return
            }


            setPayrollData({

              attendance:
                responseData(
                  attendance
                ),

              holidays:
                responseData(
                  holidays
                ),

              leaves:
                responseData(
                  leaves
                ),

              leaveTypes:
                responseData(
                  leaveTypes
                ),

            })

          }
        )

        .catch(
          (err) => {

            if (
              !cancelled
            ) {

              setPayrollError(
                getErrorMessage(
                  err
                )
              )

            }

          }
        )

        .finally(
          () => {

            if (
              !cancelled
            ) {

              setPayrollLoading(
                false
              )

            }

          }
        )


      return () => {

        cancelled =
          true

      }

      // eslint-disable-next-line react-hooks/exhaustive-deps

    },
    [
      tab,
      month,
    ]
  )


  const mergedStructures =
    useMemo(
      () =>
        buildMergedStructures(
          structures,
          employees
        ),
      [
        structures,
        employees,
      ]
    )


  const employeeById =
    useMemo(
      () =>
        new Map(
          employees.map(
            (employee) => [
              Number(
                employee.id
              ),
              employee,
            ]
          )
        ),
      [employees]
    )


  const visibleStructures =
    useMemo(
      () => {

        if (
          companyFilter ===
          'ALL'
        ) {
          return mergedStructures
        }

        return mergedStructures.filter(
          (structure) =>
            Number(
              structure.company
            ) ===
            Number(
              companyFilter
            )
        )

      },
      [
        mergedStructures,
        companyFilter,
      ]
    )


  const availableEmployees =
    useMemo(
      () =>
        employees.filter(
          (employee) =>
            !structures.some(
              (structure) =>
                Number(
                  structure.user
                ) ===
                Number(
                  employee.id
                )
            )
        ),
      [
        employees,
        structures,
      ]
    )


  const payrollRows =
    useMemo(
      () =>
        visibleStructures
          .map(
            (structure) => {

              const employee =
                employeeById.get(
                  Number(
                    structure.user
                  )
                )


              const adjustment =
                num(
                  adjustments[
                    `${month}|${structure.user}`
                  ]
                )


              const row =
                buildPayrollRow({

                  structure,

                  employee,

                  month,

                  data:
                    payrollData,

                  unmarkedPaid,

                  adjustment,

                })


              const payment =
                payments[
                  paymentKey(
                    month,
                    row
                  )
                ]


              return {
                ...row,
                payment,
              }

            }
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          ),
      [
        visibleStructures,
        employeeById,
        month,
        payrollData,
        unmarkedPaid,
        adjustments,
        payments,
      ]
    )


  const totals =
    useMemo(
      () =>
        payrollRows.reduce(
          (
            sum,
            row
          ) => ({

            earnings:
              round2(
                sum.earnings +
                  row.earnings
              ),

            deductions:
              round2(
                sum.deductions +
                  row.deductions
              ),

            adjustment:
              round2(
                sum.adjustment +
                  row.adjustment
              ),

            net:
              round2(
                sum.net +
                  row.net
              ),

            paid:
              sum.paid +
              (
                row.payment?.status ===
                'PAID'
                  ? 1
                  : 0
              ),

          }),
          {
            earnings: 0,
            deductions: 0,
            adjustment: 0,
            net: 0,
            paid: 0,
          }
        ),
      [payrollRows]
    )


  const formGross =
    grossOf(
      form
    )


  const formNet =
    Math.max(
      round2(
        formGross -
          num(
            form.deductions
          )
      ),
      0
    )


  const openCreate =
    () => {

      setEditing(
        null
      )

      setForm(
        EMPTY_FORM
      )

      setError(
        ''
      )

      setModalOpen(
        true
      )

    }


  const openEdit =
    (structure) => {

      setEditing(
        structure
      )

      setForm({

        user:
          String(
            structure.user
          ),

        effective_from:
          structure.effective_from ||
          '',

        basic:
          String(
            structure.basic ??
              ''
          ),

        allowances:
          String(
            structure.allowances ??
              ''
          ),

        incentives:
          String(
            structure.incentives ??
              ''
          ),

        bonus:
          String(
            structure.bonus ??
              ''
          ),

        other:
          String(
            structure.other ??
              ''
          ),

        deductions:
          String(
            structure.deductions ??
              ''
          ),

        note:
          structure.note ||
          '',

      })


      setError(
        ''
      )

      setModalOpen(
        true
      )

    }


  const closeModal =
    () => {

      if (
        saving
      ) {
        return
      }

      setModalOpen(
        false
      )

      setEditing(
        null
      )

      setError(
        ''
      )

    }


  const handleChange =
    (event) => {

      const {
        name,
        value,
      } =
        event.target

      setForm(
        (current) => ({
          ...current,
          [name]:
            value,
        })
      )

    }


  const save =
    async (event) => {

      event.preventDefault()


      if (
        !form.user
      ) {

        setError(
          'Please select an employee.'
        )

        return

      }


      if (
        !(num(
          form.basic
        ) > 0)
      ) {

        setError(
          'Basic salary must be greater than zero.'
        )

        return

      }


      if (
        num(
          form.deductions
        ) >
        formGross
      ) {

        setError(
          'Deductions cannot be more than gross salary.'
        )

        return

      }


      const employee =
        employeeById.get(
          Number(
            form.user
          )
        )


      if (!employee) {

        setError(
          'Employee record was not found.'
        )

        return

      }


      setSaving(
        true
      )

      setError(
        ''
      )


      try {

        const payload = {

          user:
            Number(
              form.user
            ),

          company:
            Number(
              employee.primary_company
            ),

          effective_from:
            form.effective_from ||
            null,

          basic:
            num(
              form.basic
            ),

          allowances:
            num(
              form.allowances
            ),

          incentives:
            num(
              form.incentives
            ),

          bonus:
            num(
              form.bonus
            ),

          other:
            num(
              form.other
            ),

          deductions:
            num(
              form.deductions
            ),

          note:
            form.note.trim(),

        }


        if (
          editing?.virtual
        ) {

          await hrService.createSalaryStructure(
            payload
          )

          await hrService.updateEmployee(
            employee.id,
            {
              monthly_salary:
                num(
                  form.basic
                ),
            }
          )

        } else if (
          editing
        ) {

          await hrService.updateSalaryStructure(
            editing.id,
            payload
          )

          await hrService.updateEmployee(
            employee.id,
            {
              monthly_salary:
                num(
                  form.basic
                ),
            }
          )

        } else {

          await hrService.createSalaryStructure(
            payload
          )

          await hrService.updateEmployee(
            employee.id,
            {
              monthly_salary:
                num(
                  form.basic
                ),
            }
          )

        }


        closeModal()

        await load()

      } catch (err) {

        setError(
          getErrorMessage(
            err
          )
        )

      } finally {

        setSaving(
          false
        )

      }

    }


  const remove =
    async (
      structure
    ) => {

      if (
        structure.virtual
      ) {

        setError(
          'This salary comes from the employee profile. Edit it instead of removing it.'
        )

        return

      }


      if (
        !window.confirm(
          `Remove the salary structure of ${structure.employee_name}?`
        )
      ) {
        return
      }


      setError(
        ''
      )


      try {

        await hrService.removeSalaryStructure(
          structure.id
        )

        await load()

      } catch (err) {

        setError(
          getErrorMessage(
            err
          )
        )

      }

    }


  const setAdjustment =
    (
      userId,
      value
    ) => {

      setAdjustments(
        (current) => ({

          ...current,

          [`${month}|${userId}`]:
            value,

        })
      )

    }


  const markPaid =
    (row) => {

      if (
        row.payment?.status ===
        'PAID'
      ) {
        return
      }


      const confirmed =
        window.confirm(
          `Mark ${row.name}'s ${month} salary of ${formatMoney(row.net)} as PAID?`
        )


      if (!confirmed) {
        return
      }


      const key =
        paymentKey(
          month,
          row
        )


      const paidAt =
        new Date()
          .toISOString()


      const nextPayment = {

        status:
          'PAID',

        paidAt,

        paidBy:
          user?.first_name ||
          user?.username ||
          'Admin',

        amount:
          row.net,

      }


      setPayments(
        (current) => ({

          ...current,

          [key]:
            nextPayment,

        })
      )


      recordAudit({

        action:
          'erp/payrollPayment',

        payload: {

          user:
            row.user,

          company:
            row.company,

          month,

          amount:
            row.net,

          status:
            'PAID',

        },

      })

    }


  const downloadSlip =
    (row) => {

      if (
        row.payment?.status !==
        'PAID'
      ) {

        setError(
          'Salary slip becomes available after the salary is marked as paid.'
        )

        return

      }


      downloadSalarySlip({

        row,

        month,

        companies,

        payment:
          row.payment,

      })

    }


  const exportPayroll =
    () => {

      downloadCsv(

        `payroll-${month}.csv`,

        [

          {
            key:
              'code',
            label:
              'Employee ID',
          },

          {
            key:
              'name',
            label:
              'Employee',
          },

          {
            key:
              'company',

            label:
              'Company',

            csv:
              (row) =>
                companyDisplayName(
                  row.company,
                  companies
                ),
          },

          {
            key:
              'days',
            label:
              'Days in month',
          },

          {
            key:
              'payableDays',
            label:
              'Payable days',
          },

          {
            key:
              'unpaidDays',
            label:
              'Unpaid days',
          },

          {
            key:
              'earnings',
            label:
              'Earnings',
          },

          {
            key:
              'deductions',
            label:
              'Deductions',
          },

          {
            key:
              'adjustment',
            label:
              'Adjustment',
          },

          {
            key:
              'net',
            label:
              'Net payable',
          },

          {
            key:
              'payment_status',

            label:
              'Payment status',

            csv:
              (row) =>
                row.payment?.status ||
                'UNPAID',
          },

          {
            key:
              'paid_at',

            label:
              'Paid at',

            csv:
              (row) =>
                row.payment?.paidAt ||
                '',
          },

        ],

        payrollRows
      )

    }


  if (
    !canManage
  ) {

    return (

      <div className="hr-page">

        <section className="company-panel company-no-access">

          <h1>
            Payroll
          </h1>

          <p>
            Your current role does not
            have access to payroll management.
          </p>

        </section>

      </div>

    )
  }


  return (

    <div className="hr-page">

      <div className="hr-header">

        <div>

          <span
            className="dash-pill"
            style={{
              marginBottom: 6,
              display: 'inline-block',
            }}
          >
            HRMS
          </span>

          <h1>
            Payroll
          </h1>

          <p>
            Manage employee salary
            structures, calculate monthly
            payable salary, mark salary as
            paid and download company-specific
            salary slips.
          </p>

        </div>

      </div>


      {error &&
        !modalOpen && (
          <Alert type="error">
            {error}
          </Alert>
        )}


      <section className="company-panel">

        <div className="company-toolbar">

          <div>

            <h2>
              Payroll Management
            </h2>

            <p>
              Salary is taken from the
              employee profile first. A salary
              structure can then be edited here
              for allowances, deductions and
              other components.
            </p>

          </div>


          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >

            <select
              className="field-input"
              value={
                companyFilter
              }
              onChange={(event) =>
                setCompanyFilter(
                  event.target.value
                )
              }
              style={{
                minWidth: 150,
              }}
            >

              <option value="ALL">
                All companies
              </option>

              {companies.map(
                (company) => (

                  <option
                    key={
                      company.id
                    }
                    value={
                      company.id
                    }
                  >
                    {companyDisplayName(
                      company.id,
                      companies
                    )}
                  </option>

                )
              )}

            </select>


            <Button
              onClick={
                openCreate
              }
            >
              + Add salary structure
            </Button>

          </div>

        </div>


        <div className="hr-tabs">

          <button
            type="button"
            className={
              tab ===
              'structures'
                ? 'hr-tab active'
                : 'hr-tab'
            }
            onClick={() =>
              setTab(
                'structures'
              )
            }
          >
            Salary Structures
          </button>


          <button
            type="button"
            className={
              tab ===
              'payroll'
                ? 'hr-tab active'
                : 'hr-tab'
            }
            onClick={() =>
              setTab(
                'payroll'
              )
            }
          >
            Monthly Payroll
          </button>

        </div>


        {tab ===
          'structures' && (

          <div className="company-table-wrap">

            <table className="company-table">

              <thead>

                <tr>

                  <th>
                    Employee
                  </th>

                  <th>
                    Company
                  </th>

                  <th className="hr-num">
                    Basic
                  </th>

                  <th className="hr-num">
                    Allowances
                  </th>

                  <th className="hr-num">
                    Other
                  </th>

                  <th className="hr-num">
                    Deductions
                  </th>

                  <th className="hr-num">
                    Net
                  </th>

                  <th>
                    Effective
                  </th>

                  <th>
                    Source
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
                      colSpan="10"
                      className="company-empty"
                    >
                      Loading salary structures...
                    </td>

                  </tr>

                )}


                {!loading &&
                  visibleStructures.map(
                    (structure) => (

                      <tr
                        key={
                          structure.id
                        }
                      >

                        <td>

                          <strong>
                            {
                              structure.employee_name
                            }
                          </strong>

                          <span className="company-address">
                            {
                              employeeById.get(
                                Number(
                                  structure.user
                                )
                              )?.employee_id ||
                              '—'
                            }
                          </span>

                        </td>


                        <td>
                          {companyDisplayName(
                            structure.company,
                            companies
                          )}
                        </td>


                        <td className="hr-num">
                          {formatMoney(
                            structure.basic
                          )}
                        </td>


                        <td className="hr-num">
                          {formatMoney(
                            structure.allowances
                          )}
                        </td>


                        <td className="hr-num">
                          {formatMoney(
                            num(
                              structure.incentives
                            ) +
                              num(
                                structure.bonus
                              ) +
                              num(
                                structure.other
                              )
                          )}
                        </td>


                        <td className="hr-num">
                          {formatMoney(
                            structure.deductions
                          )}
                        </td>


                        <td className="hr-num">

                          <strong>
                            {formatMoney(
                              netOf(
                                structure
                              )
                            )}
                          </strong>

                        </td>


                        <td>
                          {formatDate(
                            structure.effective_from
                          )}
                        </td>


                        <td>

                          <span className="company-status active">
                            {
                              structure.virtual
                                ? 'Employee profile'
                                : 'Salary structure'
                            }
                          </span>

                        </td>


                        <td className="company-actions">

                          <button
                            type="button"
                            className="company-link"
                            onClick={() =>
                              openEdit(
                                structure
                              )
                            }
                          >
                            Edit salary
                          </button>


                          {!structure.virtual && (

                            <button
                              type="button"
                              className="company-link danger"
                              onClick={() =>
                                remove(
                                  structure
                                )
                              }
                            >
                              Remove
                            </button>

                          )}

                        </td>

                      </tr>

                    )
                  )}


                {!loading &&
                  visibleStructures.length ===
                    0 && (

                    <tr>

                      <td
                        colSpan="10"
                        className="company-empty"
                      >
                        No salary is configured
                        for the selected company.
                      </td>

                    </tr>

                  )}

              </tbody>

            </table>

          </div>

        )}


        {tab ===
          'payroll' && (

          <>

            <div className="company-toolbar">

              <div>

                <h2>
                  Payroll for {month}
                </h2>

                <p>

                  {payrollRows.length}
                  {' '}
                  employee
                  {payrollRows.length ===
                  1
                    ? ''
                    : 's'}

                  {' • '}

                  {totals.paid}
                  {' paid • net payable '}

                  {formatMoney(
                    totals.net
                  )}

                </p>

              </div>


              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >

                <input
                  className="field-input"
                  type="month"
                  value={
                    month
                  }
                  onChange={(event) =>
                    setMonth(
                      event.target.value
                    )
                  }
                />


                <select
                  className="field-input"
                  value={
                    unmarkedPaid
                      ? 'PAID'
                      : 'UNPAID'
                  }
                  onChange={(event) =>
                    setUnmarkedPaid(
                      event.target.value ===
                        'PAID'
                    )
                  }
                >

                  <option value="UNPAID">
                    Unmarked days: unpaid
                  </option>

                  <option value="PAID">
                    Unmarked days: paid
                  </option>

                </select>


                <Button
                  variant="secondary"
                  onClick={
                    exportPayroll
                  }
                  disabled={
                    payrollRows.length ===
                    0
                  }
                >
                  Download CSV
                </Button>

              </div>

            </div>


            {payrollError && (

              <Alert type="error">
                {payrollError}
              </Alert>

            )}


            {payrollRows.length >
              0 && (

              <div className="hr-note">

                Click
                {' '}
                <strong>
                  Pay
                </strong>
                {' '}
                after the amount is
                verified. Once paid, the
                row remains PAID and the
                salary slip becomes
                downloadable.

              </div>

            )}


            <div className="company-table-wrap">

              <table className="company-table">

                <thead>

                  <tr>

                    <th>
                      Employee
                    </th>

                    <th>
                      Company
                    </th>

                    <th className="hr-num">
                      Payable days
                    </th>

                    <th className="hr-num">
                      Unpaid days
                    </th>

                    <th className="hr-num">
                      Earnings
                    </th>

                    <th className="hr-num">
                      Deductions
                    </th>

                    <th className="hr-num">
                      Adjustment
                    </th>

                    <th className="hr-num">
                      Net payable
                    </th>

                    <th>
                      Status
                    </th>

                    <th className="company-actions">
                      Action
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {payrollLoading && (

                    <tr>

                      <td
                        colSpan="10"
                        className="company-empty"
                      >
                        Calculating payroll...
                      </td>

                    </tr>

                  )}


                  {!payrollLoading &&
                    payrollRows.map(
                      (row) => {

                        const paid =
                          row.payment?.status ===
                          'PAID'


                        return (

                          <tr
                            key={
                              row.user
                            }
                          >

                            <td>

                              <strong>
                                {row.name}
                              </strong>

                              <span className="company-address">
                                {
                                  row.code ||
                                  '—'
                                }
                              </span>

                            </td>


                            <td>
                              {companyDisplayName(
                                row.company,
                                companies
                              )}
                            </td>


                            <td className="hr-num">
                              {
                                row.payableDays
                              }
                              {' / '}
                              {
                                row.days
                              }
                            </td>


                            <td className="hr-num">
                              {
                                row.unpaidDays
                              }
                            </td>


                            <td className="hr-num">
                              {formatMoney(
                                row.earnings
                              )}
                            </td>


                            <td className="hr-num">
                              {formatMoney(
                                row.deductions
                              )}
                            </td>


                            <td className="hr-num">

                              <input
                                className="hr-adj-input"
                                type="number"
                                step="0.01"
                                value={
                                  adjustments[
                                    `${month}|${row.user}`
                                  ] ?? ''
                                }
                                onChange={(
                                  event
                                ) =>
                                  setAdjustment(
                                    row.user,
                                    event.target.value
                                  )
                                }
                                disabled={
                                  paid
                                }
                              />

                            </td>


                            <td className="hr-num">

                              <strong>
                                {formatMoney(
                                  row.net
                                )}
                              </strong>

                            </td>


                            <td>

                              <span
                                className={
                                  paid
                                    ? 'company-status active'
                                    : 'company-status inactive'
                                }
                              >
                                {
                                  paid
                                    ? 'Paid'
                                    : 'Unpaid'
                                }
                              </span>

                            </td>


                            <td className="company-actions">

                              <button
                                type="button"
                                className="company-link"
                                onClick={() =>
                                  markPaid(
                                    row
                                  )
                                }
                                disabled={
                                  paid
                                }
                              >
                                {
                                  paid
                                    ? 'Paid'
                                    : 'Pay'
                                }
                              </button>


                              <button
                                type="button"
                                className="company-link"
                                onClick={() =>
                                  downloadSlip(
                                    row
                                  )
                                }
                                disabled={
                                  !paid
                                }
                              >
                                Salary Slip
                              </button>

                            </td>

                          </tr>

                        )

                      }
                    )}


                  {!payrollLoading &&
                    payrollRows.length ===
                      0 && (

                    <tr>

                      <td
                        colSpan="10"
                        className="company-empty"
                      >
                        No salary configured
                        for this company/month.
                      </td>

                    </tr>

                  )}


                  {!payrollLoading &&
                    payrollRows.length >
                      0 && (

                    <tr className="hr-total-row">

                      <td colSpan="4">
                        Total
                      </td>

                      <td className="hr-num">
                        {formatMoney(
                          totals.earnings
                        )}
                      </td>

                      <td className="hr-num">
                        {formatMoney(
                          totals.deductions
                        )}
                      </td>

                      <td className="hr-num">
                        {formatMoney(
                          totals.adjustment
                        )}
                      </td>

                      <td className="hr-num">
                        {formatMoney(
                          totals.net
                        )}
                      </td>

                      <td colSpan="2" />

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          </>

        )}

      </section>


      {modalOpen && (

        <Modal
          title={
            editing
              ? 'Edit salary structure'
              : 'Add salary structure'
          }
          onClose={
            closeModal
          }
          footer={(
            <>
              <Button
                variant="secondary"
                onClick={
                  closeModal
                }
              >
                Cancel
              </Button>

              <Button
                loading={
                  saving
                }
                onClick={
                  save
                }
              >
                {
                  editing
                    ? 'Save changes'
                    : 'Add structure'
                }
              </Button>
            </>
          )}
        >

          {error && (
            <Alert type="error">
              {error}
            </Alert>
          )}


          <form
            onSubmit={
              save
            }
          >

            <div className="company-form-grid">

              <div className="field company-form-full">

                <label className="field-label">
                  Employee
                </label>

                <select
                  className="field-input"
                  name="user"
                  value={
                    form.user
                  }
                  onChange={
                    handleChange
                  }
                  disabled={
                    Boolean(
                      editing
                    )
                  }
                  required
                >

                  <option value="">
                    Select employee
                  </option>

                  {(
                    editing
                      ? employees
                      : availableEmployees
                  ).map(
                    (employee) => (

                      <option
                        key={
                          employee.id
                        }
                        value={
                          employee.id
                        }
                      >

                        {
                          employee.display_name ||
                          employee.username
                        }

                        {
                          employee.employee_id
                            ? ` (${employee.employee_id})`
                            : ''
                        }

                        {' - '}

                        {
                          companyDisplayName(
                            employee.primary_company,
                            companies
                          )
                        }

                      </option>

                    )
                  )}

                </select>

              </div>


              <Input
                label="Basic / Monthly Salary"
                name="basic"
                type="number"
                min="0"
                step="0.01"
                value={
                  form.basic
                }
                onChange={
                  handleChange
                }
                required
              />


              <Input
                label="Allowances"
                name="allowances"
                type="number"
                min="0"
                step="0.01"
                value={
                  form.allowances
                }
                onChange={
                  handleChange
                }
              />


              <Input
                label="Incentives"
                name="incentives"
                type="number"
                min="0"
                step="0.01"
                value={
                  form.incentives
                }
                onChange={
                  handleChange
                }
              />


              <Input
                label="Bonus"
                name="bonus"
                type="number"
                min="0"
                step="0.01"
                value={
                  form.bonus
                }
                onChange={
                  handleChange
                }
              />


              <Input
                label="Other earnings"
                name="other"
                type="number"
                min="0"
                step="0.01"
                value={
                  form.other
                }
                onChange={
                  handleChange
                }
              />


              <Input
                label="Deductions"
                name="deductions"
                type="number"
                min="0"
                step="0.01"
                value={
                  form.deductions
                }
                onChange={
                  handleChange
                }
              />


              <div className="field">

                <label className="field-label">
                  Effective from
                </label>

                <input
                  className="field-input"
                  type="date"
                  name="effective_from"
                  value={
                    form.effective_from
                  }
                  onChange={
                    handleChange
                  }
                />

              </div>


              <div className="field">

                <label className="field-label">
                  Note
                </label>

                <input
                  className="field-input"
                  name="note"
                  value={
                    form.note
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="Optional"
                />

              </div>

            </div>


            <div className="hr-note">

              Gross
              {' '}
              <strong>
                {formatMoney(
                  formGross
                )}
              </strong>

              {' • Net '}

              <strong>
                {formatMoney(
                  formNet
                )}
              </strong>

              {' per full month.'}

              <br />

              The basic amount is also
              synchronized back to the
              employee monthly salary field.

            </div>

          </form>

        </Modal>

      )}

    </div>
  )
}