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


const HOLIDAY_TYPES = [
  ['NATIONAL', 'National Holiday'],
  ['FESTIVAL', 'Festival'],
  ['OPTIONAL', 'Optional / Restricted'],
  ['COMPANY', 'Company Holiday'],
]

const HOLIDAY_TYPE_LABELS = Object.fromEntries(HOLIDAY_TYPES)

const currentYear = new Date().getFullYear().toString()

const EMPTY_FORM = {
  name: '',
  date: '',
  type: 'NATIONAL',
  description: '',
  company: '',
}


export default function Holidays() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  const [holidays, setHolidays] = useState([])
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState(currentYear)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [companyFilter, setCompanyFilter] = useState('ALL')
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
      const [holidaysResponse, companiesResponse] = await Promise.all([
        hrService.getHolidays(scopedCompanies),
        companyService.getCompanies(),
      ])

      setHolidays(holidaysResponse.data || [])
      setCompanies((companiesResponse.data || []).filter((c) => c.is_active))
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
  }, [search, yearFilter, typeFilter, companyFilter])


  const companyName = (id) => {
    if (!id) {
      return 'Both companies'
    }

    return companies.find((c) => Number(c.id) === Number(id))?.name || '\u2014'
  }

  // Derive available years from holiday dates
  const availableYears = Array.from(
    new Set([
      currentYear,
      ...holidays.map((h) => h.date?.slice(0, 4)).filter(Boolean),
    ])
  ).sort().reverse()


  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }


  const openEdit = (holiday) => {
    setEditing(holiday)

    setForm({
      name: holiday.name || '',
      date: holiday.date || '',
      type: holiday.type || 'NATIONAL',
      description: holiday.description || '',
      company: holiday.company ? String(holiday.company) : '',
    })

    setError('')
    setModalOpen(true)
  }


  const save = async (event) => {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Holiday name is required.')
      return
    }

    if (!form.date) {
      setError('Holiday date is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        type: form.type || 'NATIONAL',
        description: form.description.trim(),
        company: form.company ? Number(form.company) : null,
      }

      if (editing) {
        await hrService.updateHoliday(editing.id, payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Holiday',
          entityId: String(editing.id),
          referenceNumber: payload.name,
          action: 'UPDATE',
          before: {
            name: editing.name,
            date: editing.date,
            type: editing.type,
            company: editing.company,
          },
          after: payload,
        })
      } else {
        await hrService.createHoliday(payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Holiday',
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


  const remove = async (holiday) => {
    if (!window.confirm(`Remove "${holiday.name}" from the holiday calendar?`)) {
      return
    }

    setError('')

    try {
      await hrService.deleteHoliday(holiday.id)

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Holiday',
        entityId: String(holiday.id),
        referenceNumber: holiday.name,
        action: 'DELETE',
        before: holiday,
      })

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const filteredHolidays = holidays
    .filter((h) => {
      if (yearFilter !== 'ALL' && h.date) {
        return h.date.startsWith(yearFilter)
      }
      return true
    })
    .filter((h) => {
      if (typeFilter !== 'ALL') {
        return (h.type || 'NATIONAL') === typeFilter
      }
      return true
    })
    .filter((h) => {
      if (companyFilter !== 'ALL') {
        return !h.company || Number(h.company) === Number(companyFilter)
      }
      return true
    })
    .filter((h) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return [h.name, h.date, h.description, companyName(h.company)]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q))
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const totalPages = Math.max(1, Math.ceil(filteredHolidays.length / pageSize))
  const paginatedHolidays = filteredHolidays.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="hr-page">
      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Holidays</h1>
          <p>
            Organization-wide holiday calendar. Categorized as national, festival, optional,
            or company holidays. Automatically feeds Attendance, Leave deductions, and Payroll (US-HR-7).
          </p>
        </div>
      </div>

      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Holiday calendar</h2>
            <p>
              {holidays.length} holiday{holidays.length === 1 ? '' : 's'} configured &middot;{' '}
              {filteredHolidays.length} matching filter
            </p>
          </div>

          {canManage && <Button onClick={openCreate}>+ Add holiday</Button>}
        </div>

        <div className="hr-filters">
          <input
            className="company-search"
            placeholder="Search holiday name, date, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="company-select"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="ALL">All years</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Year {yr}
              </option>
            ))}
          </select>

          <select
            className="company-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All types</option>
            {HOLIDAY_TYPES.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

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
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Holiday</th>
                <th>Type</th>
                <th>Company</th>
                {canManage && <th className="company-actions">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="company-empty">
                    Loading holidays...
                  </td>
                </tr>
              )}

              {!loading &&
                paginatedHolidays.map((holiday) => (
                  <tr key={holiday.id}>
                    <td>
                      <strong>{holiday.date}</strong>
                    </td>
                    <td>
                      <div>
                        <strong>{holiday.name}</strong>
                      </div>
                      {holiday.description && (
                        <div className="hr-subtext" style={{ fontSize: 12, color: '#6d859a' }}>
                          {holiday.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className="company-status"
                        style={{
                          background:
                            holiday.type === 'NATIONAL'
                              ? '#eff6ff'
                              : holiday.type === 'FESTIVAL'
                              ? '#fef3c7'
                              : holiday.type === 'OPTIONAL'
                              ? '#f3e8ff'
                              : '#ecfdf5',
                          color:
                            holiday.type === 'NATIONAL'
                              ? '#1d4ed8'
                              : holiday.type === 'FESTIVAL'
                              ? '#b45309'
                              : holiday.type === 'OPTIONAL'
                              ? '#7e22ce'
                              : '#047857',
                          fontWeight: 600,
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                        }}
                      >
                        {HOLIDAY_TYPE_LABELS[holiday.type] || 'Holiday'}
                      </span>
                    </td>
                    <td>{companyName(holiday.company)}</td>

                    {canManage && (
                      <td className="company-actions">
                        <button
                          type="button"
                          className="company-link"
                          onClick={() => openEdit(holiday)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="company-link danger"
                          onClick={() => remove(holiday)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

              {!loading && filteredHolidays.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="company-empty">
                    {holidays.length === 0
                      ? 'No holidays configured yet.'
                      : 'No holidays match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '0 4px', fontSize: 13, color: '#6d859a' }}>
          <div>
            Showing {filteredHolidays.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredHolidays.length)} of {filteredHolidays.length} holiday{filteredHolidays.length === 1 ? '' : 's'}
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
          title={editing ? 'Edit holiday' : 'Add holiday'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>

              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add holiday'}
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={save}>
            <div className="company-form-grid">
              <Input
                label="Holiday name"
                placeholder="e.g. Independence Day, Diwali"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Date</label>
                <input
                  className="field-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Holiday type</label>
                <select
                  className="field-input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {HOLIDAY_TYPES.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label">Applies to</label>
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

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <Input
                  label="Description / Notes"
                  placeholder="Optional remarks or details"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}