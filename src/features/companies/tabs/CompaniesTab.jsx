import { useEffect, useState } from 'react'

import { companyService } from '../companyService'
import { canManageCompanies } from '../permissions'
import useAuth from '../../../hooks/useAuth'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Modal from '../../inventory/components/Modal'
import { getErrorMessage } from '../../../utils/errors'

const EMPTY_EDIT_FORM = {
  id: '',
  name: '',
  legal_name: '',
  code: '',
  gstin: '',
  pan: '',
  cin: '',
  drug_license_no_20b: '',
  drug_license_no_21b: '',
  license_validity: '',
  registered_address: '',
  contact_email: '',
  contact_phone: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_branch: '',
}

export default function CompaniesTab() {
  const { user } = useAuth()
  const isAuthorized = canManageCompanies(user)

  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [editingCompany, setEditingCompany] = useState(null)
  const [form, setForm] = useState(EMPTY_EDIT_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await companyService.getAllCompanies()
      setCompanies(response.data || [])
    } catch (err) {
      setError(getErrorMessage(err) || 'Unable to load company masters.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenEdit = (company) => {
    setFormError('')
    setSuccess('')
    setEditingCompany(company)
    setForm({
      id: company.id,
      name: company.name || '',
      legal_name: company.legal_name || company.name || '',
      code: company.code || '',
      gstin: company.gstin || '',
      pan: company.pan || '',
      cin: company.cin || '',
      drug_license_no_20b: company.drug_license_no_20b || '',
      drug_license_no_21b: company.drug_license_no_21b || '',
      license_validity: company.license_validity || '',
      registered_address: company.registered_address || '',
      contact_email: company.contact_email || '',
      contact_phone: company.contact_phone || '',
      bank_name: company.bank_name || '',
      bank_account_number: company.bank_account_number || '',
      bank_ifsc: company.bank_ifsc || '',
      bank_branch: company.bank_branch || '',
    })
  }

  const handleCloseModal = () => {
    if (!saving) {
      setEditingCompany(null)
      setFormError('')
    }
  }

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSaveCompany = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!form.legal_name.trim()) {
      setFormError('Legal company name is mandatory.')
      return
    }

    if (form.gstin && form.gstin.length !== 15) {
      setFormError('GSTIN must be exactly 15 characters (e.g. 24AAACC1234A1Z5).')
      return
    }

    if (form.pan && form.pan.length !== 10) {
      setFormError('PAN must be exactly 10 alphanumeric characters (e.g. AAACC1234A).')
      return
    }

    try {
      setSaving(true)
      await companyService.updateCompany(form.id, {
        name: form.name.trim(),
        legal_name: form.legal_name.trim(),
        code: form.code.trim().toUpperCase(),
        gstin: form.gstin.trim().toUpperCase(),
        pan: form.pan.trim().toUpperCase(),
        cin: form.cin.trim().toUpperCase(),
        drug_license_no_20b: form.drug_license_no_20b.trim(),
        drug_license_no_21b: form.drug_license_no_21b.trim(),
        license_validity: form.license_validity,
        registered_address: form.registered_address.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim(),
        bank_name: form.bank_name.trim(),
        bank_account_number: form.bank_account_number.trim(),
        bank_ifsc: form.bank_ifsc.trim().toUpperCase(),
        bank_branch: form.bank_branch.trim(),
      })

      setSuccess(`Company "${form.legal_name}" details successfully updated.`)
      setEditingCompany(null)
      await loadData()
    } catch (err) {
      setFormError(getErrorMessage(err) || 'Failed to update company.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="company-panel">
      {/* Top Banner */}
      <div
        style={{
          padding: '24px 28px',
          borderBottom: '1px solid #e5edf1',
          background: 'linear-gradient(180deg, #fbfdfe 0%, #f4f8fb 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: '#123f61',
                fontSize: '19px',
                fontWeight: 800,
                letterSpacing: '-0.3px',
              }}
            >
              Pharmaceutical Legal Entities &amp; Company Masters
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                color: '#658197',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              Centralized corporate profile, GSTIN tax identifiers, FDA Drug Licenses (Form 20B/21B), and statutory banking details.
            </p>
          </div>

          <span
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              background: '#e6f3fa',
              color: '#0b73df',
              fontSize: '11px',
              fontWeight: 700,
              border: '1px solid #bce1fb',
            }}
          >
            Multi-Company Architecture (US-MC-1)
          </span>
        </div>
      </div>

      {error && (
        <div style={{ margin: '18px 24px' }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {success && (
        <div style={{ margin: '18px 24px' }}>
          <Alert type="success">{success}</Alert>
        </div>
      )}

      {/* Content Area */}
      <div style={{ padding: '24px' }}>
        {loading ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: '#6d8699',
              fontSize: '13px',
            }}
          >
            Loading legal company records...
          </div>
        ) : companies.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: '#6d8699',
              fontSize: '13px',
            }}
          >
            No active legal entities found.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
              gap: '24px',
            }}
          >
            {companies.map((company) => (
              <div
                key={company.id}
                style={{
                  border: '1px solid #d5e5ef',
                  borderRadius: '16px',
                  background: '#ffffff',
                  boxShadow: '0 4px 20px rgba(18, 63, 97, 0.05)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Card Header */}
                <div
                  style={{
                    padding: '20px 22px',
                    borderBottom: '1px solid #e7f0f6',
                    background:
                      company.id === 1
                        ? 'linear-gradient(90deg, #f0f7ff 0%, #ffffff 100%)'
                        : 'linear-gradient(90deg, #f3faf8 0%, #ffffff 100%)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          letterSpacing: '0.8px',
                          color: company.id === 1 ? '#0b73df' : '#0c8c6f',
                          background: company.id === 1 ? '#e1effe' : '#def6ee',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {company.code}
                      </span>
                      <h3
                        style={{
                          margin: 0,
                          color: '#123f61',
                          fontSize: '17px',
                          fontWeight: 850,
                        }}
                      >
                        {company.name}
                      </h3>
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: '#49677e',
                        fontWeight: 600,
                      }}
                    >
                      {company.legal_name}
                    </div>
                  </div>

                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      color: '#0d7d59',
                      background: '#e8f8f2',
                      border: '1px solid #c2eedf',
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.5px',
                    }}
                  >
                    ACTIVE ENTITY
                  </span>
                </div>

                {/* Card Body with Detailed Pharma Attributes */}
                <div
                  style={{
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                    flex: 1,
                  }}
                >
                  {/* Statutory Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      background: '#f8fafc',
                      padding: '14px',
                      borderRadius: '10px',
                      border: '1px solid #e7eef4',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#7b95a8',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        GSTIN
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#163f5c',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          marginTop: '2px',
                        }}
                      >
                        {company.gstin || '—'}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#7b95a8',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        PAN
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#163f5c',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          marginTop: '2px',
                        }}
                      >
                        {company.pan || '—'}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#7b95a8',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        CIN
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#163f5c',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {company.cin || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Drug Licenses Section */}
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#0e6aa8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>FDA Drug Licenses</span>
                      {company.license_validity && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#17795e',
                            fontWeight: 700,
                            textTransform: 'none',
                          }}
                        >
                          Valid thru: {company.license_validity}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 12px',
                          background: '#f2f8fc',
                          borderRadius: '8px',
                          border: '1px solid #dbebf6',
                        }}
                      >
                        <div style={{ fontSize: '10px', color: '#688599', fontWeight: 700 }}>
                          Form 20B (Wholesale Allopathic)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#164364', marginTop: '2px' }}>
                          {company.drug_license_no_20b || 'Under Application'}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          background: '#f2f8fc',
                          borderRadius: '8px',
                          border: '1px solid #dbebf6',
                        }}
                      >
                        <div style={{ fontSize: '10px', color: '#688599', fontWeight: 700 }}>
                          Form 21B (Specified Schedule C/C1)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#164364', marginTop: '2px' }}>
                          {company.drug_license_no_21b || 'Under Application'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Registered Facility Address */}
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: '#7b95a8',
                        textTransform: 'uppercase',
                        marginBottom: '4px',
                      }}
                    >
                      Registered Manufacturing &amp; Office Address
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#345269',
                        lineHeight: 1.5,
                        background: '#fafbfc',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e9edf1',
                      }}
                    >
                      {company.registered_address || 'Address not configured.'}
                    </div>
                  </div>

                  {/* Remittance Banking Information */}
                  <div
                    style={{
                      background: '#fcfdfd',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px dashed #c9dce8',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: '#53758e',
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                      }}
                    >
                      Settlement &amp; Remittance Bank Account
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1.2fr 1fr',
                        gap: '8px',
                        fontSize: '11px',
                        color: '#1a415e',
                      }}
                    >
                      <div>
                        <strong>Bank:</strong> {company.bank_name || '—'}
                      </div>
                      <div>
                        <strong>A/C No:</strong> {company.bank_account_number || '—'}
                      </div>
                      <div>
                        <strong>IFSC:</strong> {company.bank_ifsc || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div
                  style={{
                    padding: '14px 22px',
                    borderTop: '1px solid #eaf0f4',
                    background: '#f9fbfd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#7994a7' }}>
                    Shared Common Store Access: <strong>Enabled</strong>
                  </span>

                  {isAuthorized && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenEdit(company)}
                    >
                      Edit Legal Master
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Company Details Modal */}
      {editingCompany && (
        <Modal
          title={`Edit Legal Master — ${editingCompany.code}`}
          onClose={handleCloseModal}
        >
          <form onSubmit={handleSaveCompany}>
            {formError && (
              <div style={{ marginBottom: '14px' }}>
                <Alert type="error">{formError}</Alert>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                maxHeight: '65vh',
                overflowY: 'auto',
                paddingRight: '6px',
              }}
            >
              <Input
                label="Display Name / Short Name"
                value={form.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                required
              />

              <Input
                label="Full Registered Legal Entity Name"
                value={form.legal_name}
                onChange={(e) => handleFieldChange('legal_name', e.target.value)}
                required
              />

              <Input
                label="Company Code (Fixed)"
                value={form.code}
                disabled
              />

              <Input
                label="GSTIN (15 characters)"
                value={form.gstin}
                onChange={(e) => handleFieldChange('gstin', e.target.value)}
                maxLength={15}
                placeholder="24AAACC1234A1Z5"
                required
              />

              <Input
                label="PAN (10 characters)"
                value={form.pan}
                onChange={(e) => handleFieldChange('pan', e.target.value)}
                maxLength={10}
                placeholder="AAACC1234A"
              />

              <Input
                label="CIN (Corporate Identification No)"
                value={form.cin}
                onChange={(e) => handleFieldChange('cin', e.target.value)}
                placeholder="U24232GJ2020PTC112345"
              />

              <Input
                label="Drug License Form 20B"
                value={form.drug_license_no_20b}
                onChange={(e) => handleFieldChange('drug_license_no_20b', e.target.value)}
                placeholder="G/20B/12345/2020"
              />

              <Input
                label="Drug License Form 21B"
                value={form.drug_license_no_21b}
                onChange={(e) => handleFieldChange('drug_license_no_21b', e.target.value)}
                placeholder="G/21B/12346/2020"
              />

              <Input
                label="Drug License Validity Date"
                type="date"
                value={form.license_validity}
                onChange={(e) => handleFieldChange('license_validity', e.target.value)}
              />

              <Input
                label="Official Email Address"
                type="email"
                value={form.contact_email}
                onChange={(e) => handleFieldChange('contact_email', e.target.value)}
                placeholder="compliance@company.com"
              />

              <Input
                label="Contact Phone"
                value={form.contact_phone}
                onChange={(e) => handleFieldChange('contact_phone', e.target.value)}
                placeholder="+91 79 2583 0001"
              />

              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#345269',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                  }}
                >
                  Registered Manufacturing Address
                </label>
                <textarea
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #c9dce8',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    minHeight: '60px',
                  }}
                  value={form.registered_address}
                  onChange={(e) => handleFieldChange('registered_address', e.target.value)}
                  placeholder="Plot/Survey number, Industrial Zone, City, State, PIN"
                />
              </div>

              {/* Bank Details Sub-section */}
              <div
                style={{
                  gridColumn: '1 / -1',
                  marginTop: '8px',
                  paddingTop: '12px',
                  borderTop: '1px solid #e5edf1',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 10px',
                    fontSize: '12px',
                    color: '#123f61',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  Primary Remittance Bank Details
                </h4>
              </div>

              <Input
                label="Bank Name"
                value={form.bank_name}
                onChange={(e) => handleFieldChange('bank_name', e.target.value)}
                placeholder="HDFC Bank Ltd"
              />

              <Input
                label="Account Number"
                value={form.bank_account_number}
                onChange={(e) => handleFieldChange('bank_account_number', e.target.value)}
                placeholder="50200012345678"
              />

              <Input
                label="IFSC Code"
                value={form.bank_ifsc}
                onChange={(e) => handleFieldChange('bank_ifsc', e.target.value)}
                maxLength={11}
                placeholder="HDFC0001234"
              />

              <Input
                label="Branch"
                value={form.bank_branch}
                onChange={(e) => handleFieldChange('bank_branch', e.target.value)}
                placeholder="Vatva Industrial Area"
              />
            </div>

            <div
              style={{
                marginTop: '20px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                borderTop: '1px solid #e7edf2',
                paddingTop: '14px',
              }}
            >
              <Button type="button" variant="secondary" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Save Legal Master
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}