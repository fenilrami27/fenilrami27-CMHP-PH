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

import {
  formatINR,
  numberToWordsINR,
  formatDateIN,
  maskBankAcc,
} from '../../utils/formatters'

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
import MySalary from './MySalary'


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

const STATUTORY_CONFIG_KEY =
  'cmhp_payroll_statutory_config_v1'

const PAYROLL_RUNS_KEY =
  'cmhp_payroll_runs_v2'

const DEFAULT_STATUTORY = {
  pfEnabled: true,
  pfEmployeeRate: 12,
  pfEmployerRate: 12,
  pfWageCap: 15000,
  esiEnabled: true,
  esiEmployeeRate: 0.75,
  esiGrossLimit: 21000,
  ptEnabled: true,
  ptSlabThreshold: 12000,
  ptAmount: 200,
  tdsEnabled: false,
}

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
  statutoryConfig,
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

  const proratedBasic =
    round2(
      (
        num(structure.basic) *
        payableDays
      ) / days
    )

  const earnings =
    round2(
      proratedFixed +
        variableEarnings
    )

  // Statutory deductions: PF, ESI, Professional Tax
  let pfDeduction = 0
  if (statutoryConfig?.pfEnabled) {
    const pfBasis = statutoryConfig.pfWageCap > 0
      ? Math.min(proratedBasic, statutoryConfig.pfWageCap)
      : proratedBasic
    pfDeduction = round2(pfBasis * ((statutoryConfig.pfEmployeeRate || 12) / 100))
  }

  let esiDeduction = 0
  if (statutoryConfig?.esiEnabled && earnings <= (statutoryConfig.esiGrossLimit || 21000)) {
    esiDeduction = round2(earnings * ((statutoryConfig.esiEmployeeRate || 0.75) / 100))
  }

  let ptDeduction = 0
  if (statutoryConfig?.ptEnabled && earnings > (statutoryConfig.ptSlabThreshold || 12000)) {
    ptDeduction = round2(statutoryConfig.ptAmount || 200)
  }

  const otherDeductions = num(structure.deductions)
  const deductions = round2(otherDeductions + pfDeduction + esiDeduction + ptDeduction)

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

    proratedBasic,

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

    pfDeduction,

    esiDeduction,

    ptDeduction,

    otherDeductions,

    deductions,

    adjustment,

    net,

    employee,

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
  const companyName = companyDisplayName(row.company, companies)
  const paidDate = payment?.paidAt ? formatDateIN(payment.paidAt) : '—'
  const netInWords = numberToWordsINR(row.net)

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salary Slip - ${row.name} - ${month}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 15mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #f1f5f9;
    margin: 0;
    padding: 24px;
    color: #1e293b;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .slip-container {
    max-width: 820px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 32px;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
  }
  .no-print {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-bottom: 20px;
  }
  .btn-print {
    background: #0284c7;
    color: #fff;
    border: none;
    padding: 9px 18px;
    font-weight: 600;
    font-size: 14px;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-print:hover { background: #0369a1; }
  .header {
    border-bottom: 2px solid #0284c7;
    padding-bottom: 16px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .company-title {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px 0;
  }
  .company-sub {
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }
  .slip-badge {
    text-align: right;
  }
  .badge-tag {
    display: inline-block;
    background: #e0f2fe;
    color: #0369a1;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .month-text {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
  }
  .grid-info {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 20px;
    font-size: 12px;
  }
  .info-item label {
    display: block;
    color: #64748b;
    font-size: 11px;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .info-item span {
    font-weight: 600;
    color: #0f172a;
  }
  .att-summary {
    display: flex;
    justify-content: space-between;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 10px 16px;
    margin-bottom: 20px;
    font-size: 12px;
  }
  .att-item {
    text-align: center;
  }
  .att-item div:first-child {
    font-size: 11px;
    color: #166534;
  }
  .att-item div:last-child {
    font-size: 14px;
    font-weight: 700;
    color: #14532d;
  }
  .tables-wrap {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  table.comp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  table.comp-table th {
    background: #f1f5f9;
    color: #334155;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 2px solid #cbd5e1;
    font-weight: 700;
  }
  table.comp-table th:last-child {
    text-align: right;
  }
  table.comp-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #f1f5f9;
  }
  table.comp-table td:last-child {
    text-align: right;
    font-weight: 600;
  }
  .total-row td {
    border-top: 1px solid #cbd5e1;
    border-bottom: none;
    font-weight: 700 !important;
    background: #f8fafc;
    padding-top: 9px;
    padding-bottom: 9px;
  }
  .net-box {
    background: #0f172a;
    color: #ffffff;
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .net-label {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #94a3b8;
  }
  .net-words {
    font-size: 12px;
    color: #cbd5e1;
    margin-top: 4px;
    font-style: italic;
  }
  .net-amount {
    font-size: 24px;
    font-weight: 700;
    color: #38bdf8;
  }
  .sign-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-top: 36px;
    padding-top: 20px;
  }
  .sign-line {
    border-top: 1px dashed #94a3b8;
    text-align: center;
    padding-top: 6px;
    font-size: 12px;
    color: #64748b;
    font-weight: 600;
  }
  .footer-note {
    margin-top: 24px;
    text-align: center;
    font-size: 11px;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 12px;
  }
  @media print {
    body {
      background: #fff;
      padding: 0;
    }
    .slip-container {
      border: none;
      box-shadow: none;
      padding: 0;
      max-width: 100%;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
</head>
<body>
  <div class="slip-container">
    <div class="no-print">
      <button class="btn-print" onclick="window.print()">🖨️ Print Payslip</button>
    </div>

    <div class="header">
      <div>
        <h1 class="company-title">${companyName}</h1>
        <p class="company-sub">Pharmaceutical Formulation & Healthcare ERP • Registered Office</p>
      </div>
      <div class="slip-badge">
        <span class="badge-tag">PAYSLIP</span>
        <div class="month-text">Month: ${month}</div>
      </div>
    </div>

    <div class="grid-info">
      <div class="info-item">
        <label>Employee Name</label>
        <span>${row.name}</span>
      </div>
      <div class="info-item">
        <label>Employee ID</label>
        <span>${row.code || '—'}</span>
      </div>
      <div class="info-item">
        <label>Company</label>
        <span>${companyName}</span>
      </div>
      <div class="info-item">
        <label>Payment Status</label>
        <span style="color:#16a34a;">PAID (${paidDate})</span>
      </div>
      <div class="info-item">
        <label>Bank Name</label>
        <span>${row.employee?.bank_name || 'Bank Transfer'}</span>
      </div>
      <div class="info-item">
        <label>Bank Account</label>
        <span>${row.employee?.bank_account_no ? maskBankAcc(row.employee.bank_account_no) : '—'}</span>
      </div>
      <div class="info-item">
        <label>IFSC Code</label>
        <span>${row.employee?.bank_ifsc || '—'}</span>
      </div>
      <div class="info-item">
        <label>Disbursement</label>
        <span>NEFT / Direct Credit</span>
      </div>
    </div>

    <div class="att-summary">
      <div class="att-item">
        <div>Calendar Days</div>
        <div>${row.days}</div>
      </div>
      <div class="att-item">
        <div>Days Worked</div>
        <div>${row.worked}</div>
      </div>
      <div class="att-item">
        <div>Paid Leaves</div>
        <div>${row.paidLeave}</div>
      </div>
      <div class="att-item">
        <div>Holidays / Offs</div>
        <div>${row.holidayDays + row.offDays}</div>
      </div>
      <div class="att-item">
        <div>Loss of Pay (LOP)</div>
        <div style="color:#dc2626;">${row.unpaidDays}</div>
      </div>
      <div class="att-item">
        <div>Payable Days</div>
        <div style="color:#0284c7;">${row.payableDays}</div>
      </div>
    </div>

    <div class="tables-wrap">
      <div>
        <table class="comp-table">
          <thead>
            <tr>
              <th>Earnings</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Salary (Prorated)</td>
              <td>${formatINR(row.proratedBasic || row.basic)}</td>
            </tr>
            <tr>
              <td>Special Allowances / HRA</td>
              <td>${formatINR(row.allowances)}</td>
            </tr>
            ${row.incentives > 0 ? `<tr><td>Incentives</td><td>${formatINR(row.incentives)}</td></tr>` : ''}
            ${row.bonus > 0 ? `<tr><td>Bonus</td><td>${formatINR(row.bonus)}</td></tr>` : ''}
            ${row.other > 0 ? `<tr><td>Other Allowances</td><td>${formatINR(row.other)}</td></tr>` : ''}
            <tr class="total-row">
              <td>Gross Earnings</td>
              <td>${formatINR(row.earnings)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <table class="comp-table">
          <thead>
            <tr>
              <th>Deductions</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Provident Fund (EPF)</td>
              <td>${formatINR(row.pfDeduction || 0)}</td>
            </tr>
            <tr>
              <td>ESIC Contribution</td>
              <td>${formatINR(row.esiDeduction || 0)}</td>
            </tr>
            <tr>
              <td>Professional Tax (PT)</td>
              <td>${formatINR(row.ptDeduction || 0)}</td>
            </tr>
            ${row.otherDeductions > 0 ? `<tr><td>Other Deductions</td><td>${formatINR(row.otherDeductions)}</td></tr>` : ''}
            ${row.adjustment !== 0 ? `<tr><td>Adjustments (${row.adjustment > 0 ? '+' : '-'})</td><td>${formatINR(row.adjustment)}</td></tr>` : ''}
            <tr class="total-row">
              <td>Total Deductions</td>
              <td>${formatINR(row.deductions)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="net-box">
      <div>
        <div class="net-label">Net Salary Payable</div>
        <div class="net-words">In Words: ${netInWords}</div>
      </div>
      <div class="net-amount">${formatINR(row.net)}</div>
    </div>

    <div class="sign-grid">
      <div class="sign-line">Employee Signature</div>
      <div class="sign-line">Authorized Signatory • For ${companyName}</div>
    </div>

    <div class="footer-note">
      This is a system generated document. No physical signature is required. Generated via CMHP ERP Payroll Management.
    </div>
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `salary-slip-${row.code || row.user}-${month}.html`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
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

  const [
    statutoryConfig,
  ] = useState(() =>
    loadJson(STATUTORY_CONFIG_KEY, DEFAULT_STATUTORY)
  )

  const [
    payrollRuns,
    setPayrollRuns,
  ] = useState(() =>
    loadJson(PAYROLL_RUNS_KEY, [])
  )


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
      saveJson(
        STATUTORY_CONFIG_KEY,
        statutoryConfig
      )
    },
    [statutoryConfig]
  )

  useEffect(
    () => {
      saveJson(
        PAYROLL_RUNS_KEY,
        payrollRuns
      )
    },
    [payrollRuns]
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

                  statutoryConfig,

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
        statutoryConfig,
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


  const currentRun = useMemo(() => {
    return (
      payrollRuns.find(
        (r) =>
          r.month === month &&
          (companyFilter === 'ALL' || Number(r.company) === Number(companyFilter))
      ) || null
    )
  }, [payrollRuns, month, companyFilter])

  const runStatus = currentRun?.status || 'DRAFT'

  const processPayroll = () => {
    const runId = currentRun?.id || `RUN-${month}-${companyFilter}`
    const updated = {
      id: runId,
      month,
      company: companyFilter === 'ALL' ? 1 : Number(companyFilter),
      status: 'PROCESSED',
      processedAt: new Date().toISOString(),
      processedBy: user?.first_name || user?.username || 'Admin',
      totalGross: totals.earnings,
      totalDeductions: totals.deductions,
      totalNet: totals.net,
      count: payrollRows.length,
      statutoryConfig,
    }
    const nextRuns = payrollRuns.filter((r) => r.id !== runId).concat(updated)
    setPayrollRuns(nextRuns)
    saveJson(PAYROLL_RUNS_KEY, nextRuns)
    recordAudit({
      action: 'hr/payrollProcessed',
      entityType: 'PayrollRun',
      entityId: runId,
      payload: { month, company: companyFilter, totalGross: totals.earnings, totalNet: totals.net, count: payrollRows.length },
    })
  }

  const approvePayroll = () => {
    const runId = currentRun?.id || `RUN-${month}-${companyFilter}`
    const updated = {
      ...(currentRun || {}),
      id: runId,
      month,
      company: companyFilter === 'ALL' ? 1 : Number(companyFilter),
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvedBy: user?.first_name || user?.username || 'Admin',
      totalGross: totals.earnings,
      totalDeductions: totals.deductions,
      totalNet: totals.net,
      count: payrollRows.length,
    }
    const nextRuns = payrollRuns.filter((r) => r.id !== runId).concat(updated)
    setPayrollRuns(nextRuns)
    saveJson(PAYROLL_RUNS_KEY, nextRuns)
    recordAudit({
      action: 'hr/payrollApproved',
      entityType: 'PayrollRun',
      entityId: runId,
      payload: { month, approvedBy: user?.username },
    })
  }

  const markAllPaid = () => {
    if (payrollRows.length === 0) return
    const confirmed = window.confirm(
      `Mark all ${payrollRows.length} salaries for ${month} (${formatINR(totals.net)}) as PAID?`
    )
    if (!confirmed) return

    const now = new Date().toISOString()
    const nextPayments = { ...payments }
    payrollRows.forEach((row) => {
      const key = paymentKey(month, row)
      nextPayments[key] = {
        status: 'PAID',
        paidAt: now,
        paidBy: user?.first_name || user?.username || 'Admin',
        amount: row.net,
      }
    })
    setPayments(nextPayments)
    saveJson(PAYMENTS_KEY, nextPayments)

    const runId = currentRun?.id || `RUN-${month}-${companyFilter}`
    const updated = {
      ...(currentRun || {}),
      id: runId,
      month,
      company: companyFilter === 'ALL' ? 1 : Number(companyFilter),
      status: 'PAID',
      paidAt: now,
      paidBy: user?.first_name || user?.username || 'Admin',
      totalGross: totals.earnings,
      totalDeductions: totals.deductions,
      totalNet: totals.net,
      count: payrollRows.length,
    }
    const nextRuns = payrollRuns.filter((r) => r.id !== runId).concat(updated)
    setPayrollRuns(nextRuns)
    saveJson(PAYROLL_RUNS_KEY, nextRuns)
    recordAudit({
      action: 'hr/payrollFinalized',
      entityType: 'PayrollRun',
      entityId: runId,
      payload: { month, totalNet: totals.net, count: payrollRows.length },
    })
  }

  const revertPayroll = (targetStatus = 'DRAFT') => {
    if (!currentRun) return
    const confirmed = window.confirm(
      `Revert payroll run for ${month} back to ${targetStatus}?`
    )
    if (!confirmed) return
    const updated = {
      ...currentRun,
      status: targetStatus,
    }
    const nextRuns = payrollRuns.map((r) => (r.id === currentRun.id ? updated : r))
    setPayrollRuns(nextRuns)
    saveJson(PAYROLL_RUNS_KEY, nextRuns)
    recordAudit({
      action: 'hr/payrollReverted',
      entityType: 'PayrollRun',
      entityId: currentRun.id,
      payload: { month, revertedTo: targetStatus },
    })
  }

  const exportBankTransfer = () => {
    downloadCsv(
      `bank-transfer-${month}.csv`,
      [
        { key: 'sr', label: 'Sr No', csv: (_, index) => index + 1 },
        { key: 'code', label: 'Employee ID' },
        { key: 'name', label: 'Beneficiary Name' },
        { key: 'bank_name', label: 'Bank Name', csv: (row) => row.employee?.bank_name || 'Bank Transfer' },
        { key: 'account', label: 'Account Number', csv: (row) => row.employee?.bank_account_no || '—' },
        { key: 'ifsc', label: 'IFSC Code', csv: (row) => row.employee?.bank_ifsc || '—' },
        { key: 'net', label: 'Amount (INR)', csv: (row) => row.net.toFixed(2) },
        { key: 'remarks', label: 'Remarks', csv: () => `Salary for ${month}` },
      ],
      payrollRows
    )
  }

  const exportPayroll = () => {
    downloadCsv(
      `payroll-register-${month}.csv`,
      [
        { key: 'code', label: 'Employee ID' },
        { key: 'name', label: 'Employee' },
        {
          key: 'company',
          label: 'Company',
          csv: (row) => companyDisplayName(row.company, companies),
        },
        { key: 'days', label: 'Days in month' },
        { key: 'payableDays', label: 'Payable days' },
        { key: 'unpaidDays', label: 'Unpaid days' },
        { key: 'basic', label: 'Basic' },
        { key: 'allowances', label: 'Allowances' },
        { key: 'earnings', label: 'Gross Earnings' },
        { key: 'pfDeduction', label: 'EPF Deduction' },
        { key: 'esiDeduction', label: 'ESIC Deduction' },
        { key: 'ptDeduction', label: 'PT Deduction' },
        { key: 'otherDeductions', label: 'Other Deductions' },
        { key: 'deductions', label: 'Total Deductions' },
        { key: 'adjustment', label: 'Adjustment' },
        { key: 'net', label: 'Net Payable' },
        {
          key: 'payment_status',
          label: 'Payment Status',
          csv: (row) => row.payment?.status || 'UNPAID',
        },
        {
          key: 'paid_at',
          label: 'Paid At',
          csv: (row) => row.payment?.paidAt || '',
        },
      ],
      payrollRows
    )
  }


  if (!canManage) {
    return <MySalary />
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h2 style={{ margin: 0 }}>
                    Payroll for {month}
                  </h2>
                  <span
                    className={`company-status ${
                      runStatus === 'PAID'
                        ? 'active'
                        : runStatus === 'APPROVED'
                        ? 'active'
                        : runStatus === 'PROCESSED'
                        ? 'pending'
                        : 'inactive'
                    }`}
                    style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}
                  >
                    ● {runStatus}
                  </span>
                </div>

                <p style={{ margin: 0 }}>
                  {payrollRows.length} employee{payrollRows.length === 1 ? '' : 's'} • {totals.paid} paid • Net Payable: <strong>{formatINR(totals.net)}</strong>
                </p>

              </div>


              <div
                style={{
                  display: 'flex',
                  gap: 8,
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

                {runStatus === 'DRAFT' && (
                  <Button
                    onClick={processPayroll}
                    disabled={payrollRows.length === 0 || payrollLoading}
                  >
                    ⚡ Process Payroll
                  </Button>
                )}

                {runStatus === 'PROCESSED' && (
                  <>
                    <Button
                      onClick={approvePayroll}
                      disabled={payrollRows.length === 0}
                    >
                      ✓ Approve Payroll
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => revertPayroll('DRAFT')}
                    >
                      ↺ Revert to Draft
                    </Button>
                  </>
                )}

                {runStatus === 'APPROVED' && (
                  <>
                    <Button
                      onClick={markAllPaid}
                      disabled={payrollRows.length === 0}
                    >
                      💰 Disburse & Mark Paid
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => revertPayroll('PROCESSED')}
                    >
                      ↺ Revert
                    </Button>
                  </>
                )}

                {runStatus === 'PAID' && (
                  <span
                    className="company-status active"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    ✓ Month Locked & Paid
                  </span>
                )}

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
                  Register CSV
                </Button>

                <Button
                  variant="secondary"
                  onClick={
                    exportBankTransfer
                  }
                  disabled={
                    payrollRows.length ===
                    0
                  }
                >
                  Bank Transfer CSV
                </Button>

              </div>

            </div>


            {payrollError && (

              <Alert type="error">
                {payrollError}
              </Alert>

            )}

            {runStatus === 'DRAFT' && (
              <div className="hr-note" style={{ background: '#f8fafc', borderLeft: '4px solid #0284c7' }}>
                📋 <strong>Draft Stage:</strong> Attendance is open for regularization and adjustments can be edited. Click <strong>Process Payroll</strong> to lock attendance and freeze figures for approval.
              </div>
            )}

            {runStatus === 'PROCESSED' && (
              <div className="hr-note" style={{ background: '#fefce8', borderLeft: '4px solid #eab308' }}>
                🔒 <strong>Processed Stage:</strong> Attendance records for {month} are now locked against edits. Verify figures and click <strong>Approve Payroll</strong>.
              </div>
            )}

            {runStatus === 'APPROVED' && (
              <div className="hr-note" style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e' }}>
                ✅ <strong>Approved Stage:</strong> Ready for disbursement. Click <strong>Disburse & Mark Paid</strong> once the bank transfer file is uploaded to your bank portal.
              </div>
            )}

            {runStatus === 'PAID' && (
              <div className="hr-note" style={{ background: '#f0fdf4', borderLeft: '4px solid #16a34a' }}>
                🎉 <strong>Completed & Finalized:</strong> All salaries for {month} have been disbursed and locked. Download individual payslips or bank transfer registers below.
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
                      Gross
                    </th>

                    <th className="hr-num">
                      Statutory (PF/ESI/PT)
                    </th>

                    <th className="hr-num">
                      Other Ded.
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
                        colSpan="11"
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


                            <td className="hr-num" title={`PF: ${formatMoney(row.pfDeduction || 0)} | ESI: ${formatMoney(row.esiDeduction || 0)} | PT: ${formatMoney(row.ptDeduction || 0)}`}>
                              {formatMoney(
                                (row.pfDeduction || 0) + (row.esiDeduction || 0) + (row.ptDeduction || 0)
                              )}
                            </td>

                            <td className="hr-num">
                              {formatMoney(
                                row.otherDeductions || 0
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
                                  paid || runStatus === 'PAID'
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
                                  paid || runStatus === 'PAID'
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
                        colSpan="11"
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
                          payrollRows.reduce((sum, r) => sum + (r.pfDeduction || 0) + (r.esiDeduction || 0) + (r.ptDeduction || 0), 0)
                        )}
                      </td>

                      <td className="hr-num">
                        {formatMoney(
                          payrollRows.reduce((sum, r) => sum + (r.otherDeductions || 0), 0)
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