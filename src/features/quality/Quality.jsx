import { useEffect, useMemo, useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { operationsService } from '../operations/operationsService'
import { qualityService } from './qualityService'
import useAuth from '../../hooks/useAuth'
import './Quality.css'

const TABS = [
  { key: 'order_qc', label: 'Order QC Inspections' },
  { key: 'order_qa', label: 'Order QA Releases' },
  { key: 'qc', label: 'Batch QC Review' },
  { key: 'qa', label: 'Batch QA Release' },
  { key: 'trace', label: 'Batch Traceability' },
]

const QC_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const QA_FILTERS = ['ALL', 'PENDING', 'RELEASED', 'REJECTED']

const ORDER_QC_FILTERS = ['ALL', 'PENDING', 'PASSED', 'PARTIAL', 'FAILED']
const ORDER_QA_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']

const listData = (response) =>
  Array.isArray(response.data) ? response.data : response.data?.results || []

function qcTone(status) {
  if (status === 'APPROVED' || status === 'PASSED') return 'success'
  if (status === 'REJECTED' || status === 'FAILED') return 'danger'
  if (status === 'PARTIAL') return 'warning'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

function qaTone(status) {
  if (status === 'RELEASED' || status === 'APPROVED') return 'success'
  if (status === 'REJECTED' || status === 'HOLD') return 'danger'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

export default function Quality() {
  const { user } = useAuth()
  const [tab, setTab] = useState('order_qc')
  const [batches, setBatches] = useState([])
  const [orderQcRecords, setOrderQcRecords] = useState([])
  const [orderQaRecords, setOrderQaRecords] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Batch filters
  const [qcFilter, setQcFilter] = useState('PENDING')
  const [qaFilter, setQaFilter] = useState('PENDING')

  // Order filters
  const [orderQcFilter, setOrderQcFilter] = useState('ALL')
  const [orderQaFilter, setOrderQaFilter] = useState('ALL')

  // Batch QC / QA decision modal
  const [decisionModal, setDecisionModal] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)

  // Order QC inspection modal
  const [orderQcModal, setOrderQcModal] = useState(null)
  const [qcParams, setQcParams] = useState({
    appearance: 'PASS',
    packaging: 'PASS',
    labeling: 'PASS',
    specs: 'PASS',
  })
  const [qcInspectedQty, setQcInspectedQty] = useState(0)
  const [qcAcceptedQty, setQcAcceptedQty] = useState(0)
  const [qcRejectedQty, setQcRejectedQty] = useState(0)
  const [qcRemarks, setQcRemarks] = useState('')

  // Order QA release modal
  const [orderQaModal, setOrderQaModal] = useState(null)
  const [qaParams, setQaParams] = useState({
    bmr_review: 'PASS',
    coa_verification: 'PASS',
    compliance_signoff: 'PASS',
  })
  const [qaApprovedQty, setQaApprovedQty] = useState(0)
  const [qaRemarks, setQaRemarks] = useState('')

  // Traceability
  const [traceBatchId, setTraceBatchId] = useState('')
  const [trace, setTrace] = useState(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [batchRes, qcRes, qaRes] = await Promise.all([
        operationsService.getBatches(),
        qualityService.getQcRecords(),
        qualityService.getQaRecords(),
      ])
      setBatches(listData(batchRes))
      setOrderQcRecords(listData(qcRes))
      setOrderQaRecords(listData(qaRes))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Filtered rows
  const qcRows = useMemo(
    () =>
      batches.filter(
        (batch) => qcFilter === 'ALL' || batch.qc_status === qcFilter
      ),
    [batches, qcFilter]
  )

  const qaRows = useMemo(
    () =>
      batches.filter(
        (batch) => qaFilter === 'ALL' || batch.qa_status === qaFilter
      ),
    [batches, qaFilter]
  )

  const orderQcRows = useMemo(
    () =>
      orderQcRecords.filter(
        (rec) => orderQcFilter === 'ALL' || rec.status === orderQcFilter
      ),
    [orderQcRecords, orderQcFilter]
  )

  const orderQaRows = useMemo(
    () =>
      orderQaRecords.filter(
        (rec) => orderQaFilter === 'ALL' || rec.status === orderQaFilter
      ),
    [orderQaRecords, orderQaFilter]
  )

  // Batch QC/QA decision handlers
  const openDecision = (type, batch) => {
    setError('')
    setSuccess('')
    setRemarks('')
    setDecisionModal({ type, batch })
  }

  const closeDecision = () => {
    if (!saving) setDecisionModal(null)
  }

  const submitDecision = async (decision) => {
    if (!decisionModal) return
    setSaving(true)
    setError('')

    try {
      const { type, batch } = decisionModal

      if (type === 'qc') {
        await qualityService.qcDecision(batch.id, { decision, remarks })
        setSuccess(
          `Batch ${batch.number} QC ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`
        )
      } else {
        await qualityService.qaDecision(batch.id, { decision, remarks })
        setSuccess(
          `Batch ${batch.number} QA ${decision === 'RELEASE' ? 'released' : 'put on hold'}.`
        )
      }

      setDecisionModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Order QC Inspection Modal Handlers
  const openOrderQc = (qc) => {
    setError('')
    setSuccess('')
    setOrderQcModal(qc)
    setQcInspectedQty(qc.ordered_qty || 0)
    setQcAcceptedQty(qc.ordered_qty || 0)
    setQcRejectedQty(0)
    setQcRemarks(qc.remarks || '')
    setQcParams(
      qc.parameters || {
        appearance: 'PASS',
        packaging: 'PASS',
        labeling: 'PASS',
        specs: 'PASS',
      }
    )
  }

  const submitOrderQc = async (outcome) => {
    if (!orderQcModal) return
    setSaving(true)
    setError('')

    try {
      await qualityService.submitQcInspection(orderQcModal.id, {
        outcome,
        inspectedQty: qcInspectedQty,
        acceptedQty: qcAcceptedQty,
        rejectedQty: qcRejectedQty,
        remarks: qcRemarks,
        parameters: qcParams,
        user,
      })

      setSuccess(
        `Order QC #${orderQcModal.number} marked as ${outcome}. ${
          outcome === 'PASS' || outcome === 'PARTIAL'
            ? 'Order has progressed to QA Release queue.'
            : 'Order returned as QC Failed.'
        }`
      )
      setOrderQcModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Order QA Release Modal Handlers
  const openOrderQa = (qa) => {
    setError('')
    setSuccess('')
    setOrderQaModal(qa)
    setQaApprovedQty(qa.qc_accepted_qty || qa.ordered_qty || 0)
    setQaRemarks(qa.remarks || '')
    setQaParams(
      qa.parameters || {
        bmr_review: 'PASS',
        coa_verification: 'PASS',
        compliance_signoff: 'PASS',
      }
    )
  }

  const submitOrderQa = async (decision) => {
    if (!orderQaModal) return
    setSaving(true)
    setError('')

    try {
      await qualityService.submitQaRelease(orderQaModal.id, {
        decision,
        approvedQty: qaApprovedQty,
        remarks: qaRemarks,
        parameters: qaParams,
        user,
      })

      setSuccess(
        `Order QA #${orderQaModal.number} ${decision === 'APPROVE' ? 'approved' : 'rejected'}. ${
          decision === 'APPROVE'
            ? `Billable quantity ${qaApprovedQty} is now ready to invoice in the Invoicing module.`
            : 'Order marked as QA Rejected.'
        }`
      )
      setOrderQaModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Traceability
  const loadTrace = async (batchId) => {
    setTraceBatchId(batchId)
    setTrace(null)
    setTraceError('')

    if (!batchId) return

    setTraceLoading(true)
    try {
      const response = await qualityService.getBatchTraceability(batchId)
      setTrace(response.data)
    } catch (err) {
      setTraceError(getErrorMessage(err))
    } finally {
      setTraceLoading(false)
    }
  }

  const selectedTraceBatch = batches.find(
    (batch) => String(batch.id) === String(traceBatchId)
  )

  return (
    <div className="inv">
      <div className="inv-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            Quality Assurance &amp; Compliance
          </span>
          <h1>Quality Control &amp; QA</h1>
          <p>
            Verify Order inspection parameters (QC), grant QA release sign-off for billable invoicing, review production batches, and trace manufacturing history end-to-end.
          </p>
        </div>
      </div>

      <div className="inv-tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'inv-tab active' : 'inv-tab'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && !decisionModal && !orderQcModal && !orderQaModal && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* ========================================================
          ORDER QC INSPECTIONS
          ======================================================== */}
      {tab === 'order_qc' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Order Quality Inspections (QC)</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Inspection parameters, accepted/rejected quantities, and outcome clearance before QA release.
              </p>
            </div>
            <div className="qc-filter-group">
              {ORDER_QC_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={orderQcFilter === f ? 'qc-filter active' : 'qc-filter'}
                  onClick={() => setOrderQcFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>QC Number</th>
                  <th>Order Number</th>
                  <th>Customer</th>
                  <th>Company</th>
                  <th>Ordered Qty</th>
                  <th>Inspected</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Status</th>
                  <th>Inspector</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orderQcRows.map((qc) => (
                  <tr key={qc.id}>
                    <td className="cell-strong">{qc.number}</td>
                    <td><strong>{qc.order_number}</strong></td>
                    <td>{qc.customer_name}</td>
                    <td>{qc.company_name}</td>
                    <td>{qc.ordered_qty}</td>
                    <td>{qc.inspected_qty}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{qc.accepted_qty}</td>
                    <td style={{ color: qc.rejected_qty > 0 ? '#dc2626' : undefined }}>{qc.rejected_qty}</td>
                    <td>
                      <StatusPill tone={qcTone(qc.status)}>
                        {qc.status}
                      </StatusPill>
                    </td>
                    <td>{qc.inspector || '—'}</td>
                    <td>{qc.inspection_date || '—'}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => openOrderQc(qc)}
                      >
                        {qc.status === 'PENDING' ? 'Inspect' : 'Review'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && orderQcRows.length === 0 && (
              <p className="inv-empty">No Order QC inspection records found. Confirm an order in the Orders module to generate a QC inspection.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          ORDER QA RELEASES
          ======================================================== */}
      {tab === 'order_qa' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Order QA Release (Final Sign-off)</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                QA release sign-off is required before invoicing. QA-approved quantity becomes the billable quantity.
              </p>
            </div>
            <div className="qc-filter-group">
              {ORDER_QA_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={orderQaFilter === f ? 'qc-filter active' : 'qc-filter'}
                  onClick={() => setOrderQaFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>QA Number</th>
                  <th>Order Number</th>
                  <th>QC Ref</th>
                  <th>Customer</th>
                  <th>Company</th>
                  <th>QC Accepted Qty</th>
                  <th>QA Billable Qty</th>
                  <th>Status</th>
                  <th>QA Officer</th>
                  <th>Released At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orderQaRows.map((qa) => (
                  <tr key={qa.id}>
                    <td className="cell-strong">{qa.number}</td>
                    <td><strong>{qa.order_number}</strong></td>
                    <td>{qa.qc_number}</td>
                    <td>{qa.customer_name}</td>
                    <td>{qa.company_name}</td>
                    <td>{qa.qc_accepted_qty}</td>
                    <td style={{ color: '#0284c7', fontWeight: 700 }}>{qa.qa_approved_qty}</td>
                    <td>
                      <StatusPill tone={qaTone(qa.status)}>
                        {qa.status}
                      </StatusPill>
                    </td>
                    <td>{qa.release_officer || '—'}</td>
                    <td>{qa.released_at ? new Date(qa.released_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <Button
                        variant={qa.status === 'PENDING' ? 'primary' : 'secondary'}
                        onClick={() => openOrderQa(qa)}
                      >
                        {qa.status === 'PENDING' ? 'Take Approval' : 'Details'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && orderQaRows.length === 0 && (
              <p className="inv-empty">No Order QA release records found. Orders will appear here once their QC inspection passes.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          BATCH QC REVIEW
          ======================================================== */}
      {tab === 'qc' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batches awaiting quality control</h3>
            <div className="qc-filter-group">
              {QC_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={qcFilter === f ? 'qc-filter active' : 'qc-filter'}
                  onClick={() => setQcFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>Formula</th>
                  <th>Planned</th>
                  <th>Produced</th>
                  <th>QC Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {qcRows.map((batch) => (
                  <tr key={batch.id}>
                    <td className="cell-strong">{batch.number}</td>
                    <td>{batch.company_name}</td>
                    <td>{batch.product_name}</td>
                    <td>{batch.formula_name}</td>
                    <td>{batch.planned_quantity}</td>
                    <td>{batch.produced_quantity}</td>
                    <td>
                      <StatusPill tone={qcTone(batch.qc_status)}>
                        {batch.qc_status || 'PENDING'}
                      </StatusPill>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => openDecision('qc', batch)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && qcRows.length === 0 && (
              <p className="inv-empty">No batches in this filter.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          BATCH QA RELEASE
          ======================================================== */}
      {tab === 'qa' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batches awaiting QA release</h3>
            <div className="qc-filter-group">
              {QA_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={qaFilter === f ? 'qc-filter active' : 'qc-filter'}
                  onClick={() => setQaFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>QC Status</th>
                  <th>QA Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {qaRows.map((batch) => {
                  const qcCleared = batch.qc_status === 'APPROVED'
                  return (
                    <tr key={batch.id}>
                      <td className="cell-strong">{batch.number}</td>
                      <td>{batch.company_name}</td>
                      <td>{batch.product_name}</td>
                      <td>
                        <StatusPill tone={qcTone(batch.qc_status)}>
                          {batch.qc_status || 'PENDING'}
                        </StatusPill>
                      </td>
                      <td>
                        <StatusPill tone={qaTone(batch.qa_status)}>
                          {batch.qa_status || 'PENDING'}
                        </StatusPill>
                      </td>
                      <td>
                        <Button
                          variant={batch.qa_status === 'PENDING' ? 'primary' : 'secondary'}
                          disabled={!qcCleared}
                          title={qcCleared ? undefined : 'Awaiting QC approval'}
                          onClick={() => openDecision('qa', batch)}
                        >
                          {batch.qa_status === 'PENDING' ? 'Take Approval' : 'Review'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && qaRows.length === 0 && (
              <p className="inv-empty">No batches in this filter.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          BATCH TRACEABILITY
          ======================================================== */}
      {tab === 'trace' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batch traceability</h3>
          </div>

          <div className="field qc-trace-picker">
            <label className="field-label">Select a batch</label>
            <select
              className="field-input"
              value={traceBatchId}
              onChange={(e) => loadTrace(e.target.value)}
            >
              <option value="">Select batch to trace</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.number} — {batch.company_name} — {batch.product_name}
                </option>
              ))}
            </select>
          </div>

          {traceLoading && <p className="inv-empty">Loading traceability…</p>}
          {traceError && <Alert type="error">{traceError}</Alert>}

          {!traceLoading && !traceError && selectedTraceBatch && (
            <div className="qc-trace-grid">
              <div className="qc-trace-block">
                <h4>Batch summary</h4>
                <dl>
                  <div>
                    <dt>Batch</dt>
                    <dd>{selectedTraceBatch.number}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{selectedTraceBatch.company_name}</dd>
                  </div>
                  <div>
                    <dt>Product</dt>
                    <dd>{selectedTraceBatch.product_name}</dd>
                  </div>
                  <div>
                    <dt>Formula</dt>
                    <dd>{selectedTraceBatch.formula_name}</dd>
                  </div>
                  <div>
                    <dt>Order</dt>
                    <dd>{selectedTraceBatch.order_number || '—'}</dd>
                  </div>
                  <div>
                    <dt>Planned / Produced</dt>
                    <dd>
                      {selectedTraceBatch.planned_quantity} / {selectedTraceBatch.produced_quantity}
                    </dd>
                  </div>
                  <div>
                    <dt>QC / QA</dt>
                    <dd>
                      <StatusPill tone={qcTone(selectedTraceBatch.qc_status)}>
                        {selectedTraceBatch.qc_status || 'PENDING'}
                      </StatusPill>{' '}
                      <StatusPill tone={qaTone(selectedTraceBatch.qa_status)}>
                        {selectedTraceBatch.qa_status || 'PENDING'}
                      </StatusPill>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="qc-trace-block">
                <h4>Material consumption</h4>
                {trace?.material_consumption?.length ? (
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Lot</th>
                        <th>Qty</th>
                        <th>Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.material_consumption.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.item_code} — {row.item_name}</td>
                          <td>{row.lot_number}</td>
                          <td>{row.quantity} {row.uom}</td>
                          <td>{row.issued_at ? new Date(row.issued_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="inv-empty">
                    No consumption data returned by the backend yet.
                  </p>
                )}
              </div>

              <div className="qc-trace-block">
                <h4>QC / QA history</h4>
                <ul className="qc-timeline">
                  {[...(trace?.qc_history || []), ...(trace?.qa_history || [])].length ? (
                    [...(trace?.qc_history || []), ...(trace?.qa_history || [])].map(
                      (event, idx) => (
                        <li key={idx}>
                          <strong>{event.decision}</strong> — {event.remarks || 'No remarks'}
                          <span>{event.by} · {event.at ? new Date(event.at).toLocaleString() : ''}</span>
                        </li>
                      )
                    )
                  ) : (
                    <p className="inv-empty">No QC/QA decisions recorded yet.</p>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          MODAL: ORDER QC INSPECTION
          ======================================================== */}
      {orderQcModal && (
        <Modal
          title={`Order QC Inspection — ${orderQcModal.number}`}
          onClose={() => !saving && setOrderQcModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => setOrderQcModal(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => submitOrderQc('FAIL')}
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  ✗ Fail Inspection
                </Button>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => submitOrderQc('PARTIAL')}
                >
                  ⚠️ Partial Pass
                </Button>
                <Button
                  loading={saving}
                  onClick={() => submitOrderQc('PASS')}
                >
                  ✓ Pass Inspection
                </Button>
              </div>
            </div>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Order Number</dt>
                <dd><strong>{orderQcModal.order_number}</strong></dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{orderQcModal.customer_name}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{orderQcModal.company_name}</dd>
              </div>
              <div>
                <dt>Ordered Quantity</dt>
                <dd><strong>{orderQcModal.ordered_qty} units</strong></dd>
              </div>
            </dl>
          </div>

          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Inspection Parameters Checklist</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.appearance === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, appearance: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Appearance &amp; Packaging Integrity
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.packaging === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, packaging: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Physical &amp; Chemical Specifications
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.labeling === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, labeling: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Labeling, Batch &amp; Expiry Legibility
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.specs === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, specs: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Weight / Volume Variation Check
            </label>
          </div>

          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Inspection Quantities</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="field">
              <label className="field-label">Inspected Quantity</label>
              <input
                className="field-input"
                type="number"
                value={qcInspectedQty}
                onChange={(e) => setQcInspectedQty(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label className="field-label">Accepted Quantity</label>
              <input
                className="field-input"
                type="number"
                value={qcAcceptedQty}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0
                  setQcAcceptedQty(val)
                  setQcRejectedQty(Math.max((qcInspectedQty || 0) - val, 0))
                }}
              />
            </div>
            <div className="field">
              <label className="field-label">Rejected Quantity</label>
              <input
                className="field-input"
                type="number"
                value={qcRejectedQty}
                onChange={(e) => setQcRejectedQty(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="field field-full">
            <label className="field-label">Inspection Remarks / Failure Reason</label>
            <textarea
              className="field-input"
              rows={3}
              value={qcRemarks}
              onChange={(e) => setQcRemarks(e.target.value)}
              placeholder="State observations, reasons for rejection or conditional acceptance..."
            />
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: ORDER QA RELEASE
          ======================================================== */}
      {orderQaModal && (
        <Modal
          title={`Order QA Release Sign-off — ${orderQaModal.number}`}
          onClose={() => !saving && setOrderQaModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => setOrderQaModal(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => submitOrderQa('REJECT')}
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  ✗ Reject Release
                </Button>
                <Button
                  loading={saving}
                  onClick={() => submitOrderQa('APPROVE')}
                >
                  ✓ Authorize QA Release (Make Billable)
                </Button>
              </div>
            </div>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Order Number</dt>
                <dd><strong>{orderQaModal.order_number}</strong></dd>
              </div>
              <div>
                <dt>QC Reference</dt>
                <dd>{orderQaModal.qc_number}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{orderQaModal.customer_name}</dd>
              </div>
              <div>
                <dt>QC Accepted Qty</dt>
                <dd style={{ color: '#16a34a', fontWeight: 600 }}>{orderQaModal.qc_accepted_qty} units</dd>
              </div>
            </dl>
          </div>

          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>QA Release Sign-off Verification</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qaParams.bmr_review === 'PASS'}
                onChange={(e) => setQaParams(p => ({ ...p, bmr_review: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Batch Manufacturing Record (BMR) &amp; Packaging Records Complete &amp; Verified
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qaParams.coa_verification === 'PASS'}
                onChange={(e) => setQaParams(p => ({ ...p, coa_verification: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Certificate of Analysis (CoA) Conforms to IP/BP Pharmacopoeia Standards
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qaParams.compliance_signoff === 'PASS'}
                onChange={(e) => setQaParams(p => ({ ...p, compliance_signoff: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Regulatory &amp; Statutory Clearance for Commercial Sale &amp; Invoicing
            </label>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label className="field-label">Approved Billable Quantity (Units to Invoice)</label>
            <input
              className="field-input"
              type="number"
              value={qaApprovedQty}
              onChange={(e) => setQaApprovedQty(Number(e.target.value) || 0)}
            />
            <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
              This QA-approved quantity becomes the maximum billable quantity when creating an invoice.
            </span>
          </div>

          <div className="field field-full">
            <label className="field-label">QA Sign-off Remarks</label>
            <textarea
              className="field-input"
              rows={3}
              value={qaRemarks}
              onChange={(e) => setQaRemarks(e.target.value)}
              placeholder="Enter release authorization notes or conditions of sale..."
            />
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: BATCH DECISION
          ======================================================== */}
      {decisionModal && (
        <Modal
          title={
            decisionModal.type === 'qc'
              ? `QC review — ${decisionModal.batch.number}`
              : `QA release — ${decisionModal.batch.number}`
          }
          onClose={closeDecision}
          footer={
            <>
              <Button variant="secondary" onClick={closeDecision} disabled={saving}>
                Cancel
              </Button>

              {decisionModal.type === 'qc' ? (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => submitDecision('REJECT')}
                  >
                    Reject
                  </Button>
                  <Button loading={saving} onClick={() => submitDecision('APPROVE')}>
                    Approve QC
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => submitDecision('HOLD')}
                  >
                    Hold
                  </Button>
                  <Button loading={saving} onClick={() => submitDecision('RELEASE')}>
                    Release QA
                  </Button>
                </>
              )}
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Company</dt>
                <dd>{decisionModal.batch.company_name}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>{decisionModal.batch.product_name}</dd>
              </div>
              <div>
                <dt>Produced quantity</dt>
                <dd>{decisionModal.batch.produced_quantity}</dd>
              </div>
            </dl>
          </div>

          <div className="field field-full">
            <label className="field-label">Remarks</label>
            <textarea
              className="field-input"
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add QC/QA remarks (visible in batch traceability)"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}