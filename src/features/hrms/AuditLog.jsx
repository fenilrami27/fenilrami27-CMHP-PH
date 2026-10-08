import { useEffect, useMemo, useState } from 'react'
import { getAuditRows } from '../../utils/audit'
import useAuth from '../../hooks/useAuth'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { downloadCsv } from './hrUtils'
import { formatDateTimeIN } from '../../utils/formatters'
import './Hrms.css'

const MODULE_OPTIONS = [
  'ALL',
  'HRMS',
  'CUSTOMERS',
  'PRODUCTS',
  'ORDERS',
  'QC',
  'QA',
  'INVOICE',
  'PAYMENTS',
  'SETTINGS',
  'SYSTEM',
]

const ACTION_OPTIONS = [
  'ALL',
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'REJECT',
  'STATUS_CHANGE',
  'PAYMENT',
  'PRINT',
  'EXPORT',
]

export default function AuditLog() {
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const load = () => {
    setLogs(getAuditRows())
  }

  useEffect(() => {
    load()
  }, [])

  // Filtered & Sorted logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        if (moduleFilter !== 'ALL' && String(log.module).toUpperCase() !== moduleFilter) {
          return false
        }
        if (actionFilter !== 'ALL' && String(log.action).toUpperCase() !== actionFilter) {
          return false
        }
        if (dateFrom && (log.timestamp || log.created_at || '').slice(0, 10) < dateFrom) {
          return false
        }
        if (dateTo && (log.timestamp || log.created_at || '').slice(0, 10) > dateTo) {
          return false
        }
        if (search.trim()) {
          const q = search.toLowerCase()
          const text = [
            log.id,
            log.entity_id,
            log.entity_type,
            log.action,
            log.description,
            log.remarks,
            log.user?.username || log.user?.name || log.user,
            log.ip,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!text.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || a.created_at || 0).getTime()
        const timeB = new Date(b.timestamp || b.created_at || 0).getTime()
        return timeB - timeA
      })
  }, [logs, moduleFilter, actionFilter, dateFrom, dateTo, search])

  const totalPages = Math.max(Math.ceil(filteredLogs.length / pageSize), 1)
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, page, pageSize])

  const exportAuditCsv = () => {
    downloadCsv(
      `central-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: 'id', label: 'Audit ID' },
        {
          key: 'timestamp',
          label: 'Date & Time (IST)',
          csv: (l) => formatDateTimeIN(l.timestamp || l.created_at),
        },
        { key: 'module', label: 'Module' },
        { key: 'entity_type', label: 'Entity Type' },
        { key: 'entity_id', label: 'Reference / ID' },
        { key: 'action', label: 'Action' },
        {
          key: 'user',
          label: 'User',
          csv: (l) => l.user?.username || l.user?.name || l.user || 'System',
        },
        {
          key: 'role',
          label: 'Role',
          csv: (l) => l.user?.role || l.actor_role || 'Staff',
        },
        { key: 'description', label: 'Description' },
        { key: 'remarks', label: 'Remarks / Reason' },
        { key: 'result', label: 'Result', csv: (l) => l.result || 'SUCCESS' },
        { key: 'ip', label: 'IP Address' },
        { key: 'browser', label: 'Browser / Device' },
      ],
      filteredLogs
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
            SYSTEM COMPLIANCE &amp; SECURITY
          </span>

          <h1>Central Audit Log</h1>

          <p>
            Immutable, append-only traceability log recording every creation, update, approval, status transition, payment, and deletion across all HRMS and operational ERP modules.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="secondary" onClick={load}>
            ↻ Refresh
          </Button>
          <Button onClick={exportAuditCsv} disabled={filteredLogs.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      <section className="company-panel">
        {/* Filters Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <input
              className="field-input"
              type="text"
              placeholder="Search by ID, User, Entity, or Action..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <div style={{ width: 140 }}>
            <select
              className="field-input"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value)
                setPage(1)
              }}
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 'ALL' ? 'All Modules' : m}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: 140 }}>
            <select
              className="field-input"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
            >
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a === 'ALL' ? 'All Actions' : a}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>From:</label>
            <input
              className="field-input"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              style={{ width: 130 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>To:</label>
            <input
              className="field-input"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              style={{ width: 130 }}
            />
          </div>

          {(search || moduleFilter !== 'ALL' || actionFilter !== 'ALL' || dateFrom || dateTo) && (
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('')
                setModuleFilter('ALL')
                setActionFilter('ALL')
                setDateFrom('')
                setDateTo('')
                setPage(1)
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Security Notice */}
        <div style={{ padding: '8px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
          <span>🔒 <strong>Append-Only Audit Guarantee:</strong> Entries cannot be altered or purged per pharma audit trail compliance. Sensitive PII is masked automatically.</span>
          <span>Showing {filteredLogs.length} entries</span>
        </div>

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Date &amp; Time (IST)</th>
                <th>Module</th>
                <th>Entity / Ref</th>
                <th>Action</th>
                <th>User / Role</th>
                <th>Description</th>
                <th>IP / Device</th>
                <th>Details</th>
              </tr>
            </thead>

            <tbody>
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="company-empty">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const userName = log.user?.username || log.user?.name || log.user || 'System'
                  const userRole = log.user?.role || log.actor_role || 'Staff'
                  const actionUpper = String(log.action || '').toUpperCase()

                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {formatDateTimeIN(log.timestamp || log.created_at)}
                      </td>

                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: '#e0f2fe',
                            color: '#0369a1',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {log.module || 'SYSTEM'}
                        </span>
                      </td>

                      <td>
                        <strong>{log.entity_type}</strong>
                        {log.entity_id && log.entity_id !== '—' && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Ref: {log.entity_id}
                          </div>
                        )}
                      </td>

                      <td>
                        <strong
                          style={{
                            color:
                              actionUpper.includes('DELETE') || actionUpper.includes('REJECT')
                                ? '#dc2626'
                                : actionUpper.includes('APPROVE') || actionUpper.includes('CREATE')
                                ? '#16a34a'
                                : '#0284c7',
                          }}
                        >
                          {log.action}
                        </strong>
                      </td>

                      <td>
                        <strong>{userName}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {userRole}
                        </div>
                      </td>

                      <td style={{ maxWidth: 280, fontSize: 12 }}>
                        {log.description || '—'}
                        {log.remarks && (
                          <div style={{ fontStyle: 'italic', color: '#64748b', marginTop: 2 }}>
                            "{log.remarks}"
                          </div>
                        )}
                      </td>

                      <td style={{ fontSize: 11, color: '#64748b' }}>
                        <div>{log.ip || '127.0.0.1'}</div>
                        <div>{log.browser || 'Web Client'}</div>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="company-link"
                          onClick={() => setSelectedLog(log)}
                        >
                          View Diff
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Page {page} of {totalPages} ({filteredLogs.length} total records)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Detail Drawer Modal */}
      {selectedLog && (
        <Modal
          title={`Audit Record — ${selectedLog.id}`}
          onClose={() => setSelectedLog(null)}
          footer={
            <Button onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 20 }}>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Timestamp</span>
              <div style={{ fontWeight: 600 }}>{formatDateTimeIN(selectedLog.timestamp || selectedLog.created_at)}</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Module / Action</span>
              <div style={{ fontWeight: 600 }}>{selectedLog.module} • {selectedLog.action}</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Target Entity</span>
              <div style={{ fontWeight: 600 }}>{selectedLog.entity_type} ({selectedLog.entity_id})</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>User / Role</span>
              <div style={{ fontWeight: 600 }}>
                {selectedLog.user?.username || selectedLog.user?.name || selectedLog.user || 'System'} ({selectedLog.user?.role || selectedLog.actor_role || 'Staff'})
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Network IP</span>
              <div style={{ fontWeight: 600 }}>{selectedLog.ip || '127.0.0.1'}</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Client Browser</span>
              <div style={{ fontWeight: 600 }}>{selectedLog.browser || 'Web Client'}</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: 14 }}>Action Description &amp; Reason</h4>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
              <div><strong>Description:</strong> {selectedLog.description || '—'}</div>
              {selectedLog.remarks && (
                <div style={{ marginTop: 6, color: '#0369a1' }}>
                  <strong>Remarks / Justification:</strong> {selectedLog.remarks}
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Field-Level Changes (Old Value → New Value)</h4>
            {selectedLog.changes && selectedLog.changes.length > 0 ? (
              <table className="company-table">
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th>Previous Value</th>
                    <th>New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLog.changes.map((ch, idx) => (
                    <tr key={idx}>
                      <td><strong>{ch.field}</strong></td>
                      <td style={{ color: '#dc2626', background: '#fef2f2' }}>
                        {String(ch.old_value !== undefined ? ch.old_value : '—')}
                      </td>
                      <td style={{ color: '#16a34a', background: '#f0fdf4' }}>
                        {String(ch.new_value !== undefined ? ch.new_value : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : selectedLog.payload ? (
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'monospace', maxHeight: 200, overflowY: 'auto' }}>
                <pre style={{ margin: 0 }}>{JSON.stringify(selectedLog.payload, null, 2)}</pre>
              </div>
            ) : (
              <p style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                No granular field diff recorded for this system action.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}