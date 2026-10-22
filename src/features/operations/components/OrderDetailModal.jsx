import { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { addCustomer, createStockRequest } from '../../../store/erpSlice'
import {
  getOrderRole,
  canEditOrderSection,
  canViewOrderSection,
  canCreateOrders,
} from '../orderPermissions'
import {
  ORDER_PRODUCT_TYPES,
  ORDER_PRODUCT_SUBTYPES,
  ORDER_PRINTING_STATUSES,
  ORDER_PACKING_TYPES,
  ORDER_REQUISITION_STATUSES,
  ORDER_COMPANIES,
  getSectionAStatus,
  getSectionBStatus,
  getSectionCStatus,
} from '../orderConstants'
import {
  getApprovedFormula,
  calculateRequiredMaterials,
  checkInventoryAvailability,
} from '../rawMaterialAvailability'
import { previewDocumentNumber } from '../../../utils/documentNumbers'
import SearchableSelect from '../../../components/SearchableSelect'
import Alert from '../../../components/Alert'
import './OrderDetailModal.css'

export default function OrderDetailModal({
  isOpen,
  onClose,
  mode = 'create', // 'create' | 'edit' | 'view'
  order = null,
  activeCompanyId = 1,
  onSaveOrder,
  currentUser = null,
}) {
  const dispatch = useDispatch()
  const customers = useSelector((state) => state.erp?.customers || [])
  const reduxProducts = useSelector((state) => state.erp?.products || [])
  const commonProducts = useSelector((state) => state.erp?.commonProducts || [])
  const formulaApprovals = useSelector((state) => state.erp?.formulaApprovals || [])
  const formulas = useSelector((state) => state.erp?.formulas || [])
  const commonRawMaterials = useSelector((state) => state.erp?.commonRawMaterials || [])
  const stockLedgerEntries = useSelector((state) => state.erp?.stockLedgerEntries || [])
  const stockRequests = useSelector((state) => state.erp?.stockRequests || [])
  const byCompanyProducts = useSelector((state) => {
    const cmhp = state.erp?.byCompany?.cmhp?.products || []
    const tej = state.erp?.byCompany?.tej?.products || []
    return [...cmhp, ...tej]
  })

  // All combined product catalogue from the Products module
  const allProducts = useMemo(() => {
    const list = []
    const seen = new Set()
    ;[...reduxProducts, ...commonProducts, ...byCompanyProducts].forEach((p) => {
      const key = `${p.id || ''}-${p.name || ''}`.toLowerCase()
      if (p && p.name && !seen.has(key)) {
        seen.add(key)
        const pType = p.dosage_form || p.dosageForm || p.type || p.category || ''
        list.push({
          id: p.id,
          name: p.name,
          code: p.code || (p.id ? `PRD-${p.id}` : ''),
          category: p.category || pType,
          type: pType,
          dosage_form: pType,
          dosageForm: pType,
          unit_cost: p.unit_cost || p.price || 0,
        })
      }
    })
    return list
  }, [reduxProducts, commonProducts, byCompanyProducts])

  const userRole = useMemo(() => getOrderRole(currentUser), [currentUser])
  const isViewOnly = mode === 'view'
  const isCreate = mode === 'create'
  const isEdit = mode === 'edit'

  const defaultCompanyObj = useMemo(() => {
    return (
      ORDER_COMPANIES.find((c) => Number(c.id) === Number(activeCompanyId)) ||
      ORDER_COMPANIES[0]
    )
  }, [activeCompanyId])

  // Check if product is locked due to order lifecycle stage
  const isProductLockedByStage = useMemo(() => {
    if (!order || isCreate) return false
    const st = String(order.status || 'DRAFT').toUpperCase()
    // If order has moved to QC or later, lock Product Name
    return !['DRAFT', 'PENDING'].includes(st)
  }, [order, isCreate])

  const productLockTooltip = isProductLockedByStage
    ? 'Cannot change product after order has moved to QC or production because formula/BOM and inventory requirements are locked.'
    : ''

  // Section-level edit permissions
  const canEditSectionA = useMemo(() => {
    if (isViewOnly) return false
    return canEditOrderSection('A', currentUser, order)
  }, [isViewOnly, currentUser, order])

  const canEditProduct = useMemo(() => {
    return canEditSectionA && !isProductLockedByStage
  }, [canEditSectionA, isProductLockedByStage])

  const canEditSectionB = useMemo(() => {
    if (isViewOnly) return false
    return canEditOrderSection('B', currentUser, order)
  }, [isViewOnly, currentUser, order])

  const canEditSectionC = useMemo(() => {
    if (isViewOnly) return false
    return canEditOrderSection('C', currentUser, order)
  }, [isViewOnly, currentUser, order])

  const canViewSectionC = useMemo(() => {
    return canViewOrderSection('C', currentUser)
  }, [currentUser])

  // Form State
  const [formData, setFormData] = useState({
    // Section A: Order Details (owned by Admin)
    product_id: null,
    product_name: '',
    product_code: '',
    product_type: '',
    product_subtype: '',
    dosage_form: '',
    type: '',
    type_auto_filled: false,
    company: defaultCompanyObj.name,
    company_code: defaultCompanyObj.code,
    company_id: defaultCompanyObj.id,
    date_of_order: new Date().toISOString().slice(0, 10),
    planned_mfg_date: new Date().toISOString().slice(0, 10),
    order_quantity: 100,
    // Additional workflow links (Customer, lines, notes)
    customer: '',
    customer_name: '',
    customer_code: '—',
    order_number: 'Generated after saving',
    currency: 'INR',
    customer_order_reference: '',
    notes: '',
    lines: [
      {
        id: 1,
        line_no: 1,
        product_id: null,
        product_name: '',
        quantity: 100,
        description: '',
        unit: 'Box',
        unit_price: 0,
      },
    ],

    // Section B: Batch & Printing Details (owned by Manager)
    batch_no: previewDocumentNumber('BATCH', activeCompanyId || 1),
    packing_size: '',
    batch_size: '',
    mrp_for_printing: '',
    printing_status: 'Pending',
    batch_notes: '',

    // Section C: Packing & Requisition Details (owned by Store Manager)
    packing_type: 'Blister',
    label: '',
    box: '',
    insert: '',
    requisition_status: 'Pending',
  })

  // Set of material codes requested in current session
  const [requestedMatCodes, setRequestedMatCodes] = useState(new Set())

  // Quick Customer Registration Inline State
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustForm, setNewCustForm] = useState({
    name: '',
    code: '',
    phone: '',
    gstin: '',
  })

  const [customerSearch, setCustomerSearch] = useState('')
  const [errorAlert, setErrorAlert] = useState('')
  const [successAlert, setSuccessAlert] = useState('')

  // Sync form with order prop when opening / editing
  useEffect(() => {
    if (order && (isEdit || isViewOnly)) {
      const orderLines =
        Array.isArray(order.lines) && order.lines.length
          ? order.lines.map((l, idx) => ({
              id: l.id || idx + 1,
              line_no: idx + 1,
              product_id: l.product_id || order.product_id || order.product || null,
              product_name: l.product_name || order.product_name || '',
              quantity: l.quantity || order.quantity || 100,
              description: l.description || '',
              unit: l.unit || 'Box',
              unit_price: l.unit_price || order.price || 0,
            }))
          : [
              {
                id: 1,
                line_no: 1,
                product_id: order.product_id || order.product || null,
                product_name: order.product_name || '',
                quantity: order.quantity || 100,
                description: order.description || '',
                unit: order.unit || 'Box',
                unit_price: order.price || 0,
              },
            ]

      const matchedCust = customers.find(
        (c) =>
          Number(c.id) === Number(order.customer) ||
          c.name === order.customer_name
      )

      const compId = Number(order.company) || activeCompanyId || 1
      const coObj =
        ORDER_COMPANIES.find((c) => Number(c.id) === compId) ||
        ORDER_COMPANIES[0]

      const pType = order.product_type || order.type || order.dosage_form || order.dosageForm || ''

      setFormData({
        // Section A
        product_id: order.product_id || order.product || null,
        product_name: order.product_name || '',
        product_code: order.product_code || order.productCode || '',
        product_type: pType,
        product_subtype: order.product_subtype || order.subtype || '',
        dosage_form: order.dosage_form || order.dosageForm || pType,
        type: order.type || pType,
        type_auto_filled: Boolean(pType),
        company: order.company_name || coObj.name,
        company_code: order.company_code || order.companyCode || coObj.code,
        company_id: compId,
        date_of_order:
          order.date_of_order ||
          order.order_date ||
          new Date().toISOString().slice(0, 10),
        planned_mfg_date:
          order.planned_mfg_date ||
          order.delivery_deadline ||
          new Date().toISOString().slice(0, 10),
        customer: order.customer || '',
        customer_name: matchedCust
          ? matchedCust.name
          : order.customer_name || '',
        customer_code: matchedCust
          ? matchedCust.code || `CUST-${matchedCust.id}`
          : order.customer_code || '—',
        order_number: order.number || `ORD-${order.id}`,
        currency: order.currency || 'INR',
        customer_order_reference:
          order.customer_order_reference || order.reference || '',
        notes: order.notes || '',
        lines: orderLines,

        order_quantity:
          order.quantity ||
          (Array.isArray(orderLines) && orderLines[0]?.quantity) ||
          100,

        // Section B
        batch_no:
          order.batch_no ||
          previewDocumentNumber('BATCH', compId || activeCompanyId || 1),
        packing_size: order.packing_size || '',
        batch_size: order.batch_size || '',
        mrp_for_printing:
          order.mrp_for_printing !== undefined && order.mrp_for_printing !== null
            ? String(order.mrp_for_printing)
            : '',
        printing_status: order.printing_status || 'Pending',
        batch_notes: order.batch_notes || '',

        // Section C
        packing_type: order.packing_type || 'Blister',
        label: order.label || '',
        box: order.box || '',
        insert: order.insert || '',
        requisition_status: order.requisition_status || 'Pending',
      })
      setCustomerSearch(
        matchedCust ? matchedCust.name : order.customer_name || ''
      )
    } else if (isCreate) {
      setFormData({
        product_id: null,
        product_name: '',
        product_code: '',
        product_type: '',
        product_subtype: '',
        dosage_form: '',
        type: '',
        type_auto_filled: false,
        company: defaultCompanyObj.name,
        company_code: defaultCompanyObj.code,
        company_id: defaultCompanyObj.id,
        date_of_order: new Date().toISOString().slice(0, 10),
        planned_mfg_date: new Date().toISOString().slice(0, 10),
        order_quantity: 100,
        customer: customers[0]?.id || '',
        customer_name: customers[0]?.name || '',
        customer_code: customers[0]?.code || 'CUST-1001',
        order_number: 'Generated after saving',
        currency: 'INR',
        customer_order_reference: '',
        notes: '',
        lines: [
          {
            id: 1,
            line_no: 1,
            product_id: null,
            product_name: '',
            quantity: 100,
            description: '',
            unit: 'Box',
            unit_price: 0,
          },
        ],
        batch_no: previewDocumentNumber('BATCH', activeCompanyId || 1),
        packing_size: '',
        batch_size: '',
        mrp_for_printing: '',
        printing_status: 'Pending',
        batch_notes: '',
        packing_type: 'Blister',
        label: '',
        box: '',
        insert: '',
        requisition_status: 'Pending',
      })
      setCustomerSearch(customers[0]?.name || '')
    }
    setErrorAlert('')
    setSuccessAlert('')
  }, [order, mode, isCreate, isEdit, isViewOnly, customers, activeCompanyId, defaultCompanyObj])

  // Handle Product Selection via SearchableSelect (TASK 2 + Raw Material Auto-fetch)
  const handleSelectProduct = (prod) => {
    if (!prod) {
      setFormData((prev) => ({
        ...prev,
        product_id: null,
        product_name: '',
        product_code: '',
        product_type: '',
        product_subtype: '',
        dosage_form: '',
        type: '',
        type_auto_filled: false,
      }))
      return
    }

    const pId = prod.id || null
    const pName = prod.name || ''
    const pCode = prod.code || ''
    const pType = prod.dosage_form || prod.dosageForm || prod.type || prod.category || ''
    const isSolid = String(pType).toLowerCase() === 'solid'
    const pSubtype = isSolid ? (prod.subtype || 'Tablet') : ''

    // Auto-generate batch no if not present
    const generatedBatchNo =
      formData.batch_no ||
      previewDocumentNumber('BATCH', formData.company_id || activeCompanyId || 1)

    setFormData((prev) => {
      const updatedLines = [...prev.lines]
      if (updatedLines[0]) {
        updatedLines[0] = {
          ...updatedLines[0],
          product_id: pId,
          product_name: pName,
          code: pCode,
          unit_price: Number(prod.unit_cost || prod.price || 0),
        }
      }
      return {
        ...prev,
        product_id: pId,
        product_name: pName,
        product_code: pCode,
        batch_no: prev.batch_no || generatedBatchNo,
        product_type: pType,
        product_subtype: pSubtype,
        dosage_form: pType,
        type: pType,
        type_auto_filled: Boolean(pType),
        lines: updatedLines,
      }
    })
  }

  // Handle Company selection & auto-fill
  const handleSelectCompany = (compName) => {
    const found = ORDER_COMPANIES.find((c) => c.name === compName)
    if (found) {
      setFormData((prev) => ({
        ...prev,
        company: found.name,
        company_code: found.code,
        company_id: found.id,
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        company: compName,
      }))
    }
  }

  // Handle Customer Selection
  const handleSelectCustomer = (cust) => {
    setFormData((prev) => ({
      ...prev,
      customer: cust.id,
      customer_name: cust.name,
      customer_code: cust.code || `CUST-${cust.id}`,
    }))
    setCustomerSearch(cust.name)
  }

  // Handle adding new customer inline
  const handleAddNewCustomer = (e) => {
    e.preventDefault()
    if (!newCustForm.name.trim()) {
      setErrorAlert('Please enter a customer name.')
      return
    }
    const newId = Date.now()
    const newCode = newCustForm.code.trim() || `CUST-${String(newId).slice(-4)}`
    const custPayload = {
      id: newId,
      name: newCustForm.name.trim(),
      code: newCode,
      phone: newCustForm.phone.trim(),
      gstin: newCustForm.gstin.trim(),
    }
    dispatch(addCustomer(custPayload))
    handleSelectCustomer(custPayload)
    setShowAddCustomer(false)
    setNewCustForm({ name: '', code: '', phone: '', gstin: '' })
    setSuccessAlert(`Customer "${custPayload.name}" added successfully.`)
  }

  // Current selected product for formula lookup
  const currentProduct = useMemo(() => {
    if (!formData.product_name && !formData.product_id) return null
    return {
      id: formData.product_id,
      code: formData.product_code,
      name: formData.product_name,
    }
  }, [formData.product_id, formData.product_code, formData.product_name])

  // Single APPROVED formula only (draft/unapproved strictly ignored)
  const approvedFormula = useMemo(() => {
    return getApprovedFormula(currentProduct, formulaApprovals, formulas)
  }, [currentProduct, formulaApprovals, formulas])

  // Live order quantity
  const orderQuantity = useMemo(() => {
    const val =
      formData.order_quantity !== undefined && formData.order_quantity !== ''
        ? formData.order_quantity
        : (formData.lines?.[0]?.quantity !== undefined ? formData.lines?.[0]?.quantity : 100)
    return Number(val) || 0
  }, [formData.order_quantity, formData.lines])

  // Live scaled required materials
  const requiredMaterials = useMemo(() => {
    return calculateRequiredMaterials({
      approvedFormula,
      orderQuantity,
      batchSize: formData.batch_size,
    })
  }, [approvedFormula, orderQuantity, formData.batch_size])

  // Inventory availability check against commonRawMaterials (single source of truth)
  const availabilityList = useMemo(() => {
    return checkInventoryAvailability({
      requiredMaterials,
      commonRawMaterials,
      stockLedgerEntries,
    })
  }, [requiredMaterials, commonRawMaterials, stockLedgerEntries])

  const shortageCount = useMemo(() => {
    return availabilityList.filter((m) => m.status === 'NOT_AVAILABLE').length
  }, [availabilityList])

  const inStockCount = useMemo(() => {
    return availabilityList.filter((m) => m.status === 'IN_STOCK').length
  }, [availabilityList])

  const allInStock = useMemo(() => {
    return Boolean(approvedFormula) && availabilityList.length > 0 && shortageCount === 0
  }, [approvedFormula, availabilityList, shortageCount])

  // Check if a material has been requested in this session or in Redux
  const isMaterialRequested = (mat) => {
    if (requestedMatCodes.has(mat.code)) return true
    const orderNum = formData.order_number || ''
    return (stockRequests || []).some((r) => {
      const isSameMat =
        (r.materialCode && r.materialCode === mat.code) ||
        (r.materialName && r.materialName === mat.name)
      const isSameOrder =
        !orderNum ||
        orderNum === 'Generated after saving' ||
        r.orderNumber === orderNum
      const isActive = r.status !== 'Fulfilled' && r.status !== 'Cancelled'
      return isSameMat && isSameOrder && isActive
    })
  }

  // Handle "Send Request to Inventory"
  const handleSendRequestToInventory = (mat) => {
    const shortage = mat.shortageQuantity || 0
    const orderNum =
      formData.order_number && formData.order_number !== 'Generated after saving'
        ? formData.order_number
        : previewDocumentNumber('ORDER', formData.company_id || activeCompanyId || 1) + ' (Draft)'

    const payload = {
      materialId: mat.id,
      materialCode: mat.code,
      materialName: mat.name,
      unit: mat.unit,
      requiredQuantity: mat.requiredQuantity,
      availableQuantity: mat.availableStock,
      shortageQuantity: shortage,
      orderNumber: orderNum,
      orderId: order?.id || null,
      productName: formData.product_name,
      productCode: formData.product_code,
      batchNo: formData.batch_no || 'BAT-PENDING',
      requestedBy: currentUser?.name || currentUser?.username || 'Store Manager',
      companyId: formData.company_id || activeCompanyId || 1,
      companyName: formData.company || 'CMHP Pharma',
    }

    dispatch(createStockRequest(payload))
    setRequestedMatCodes((prev) => new Set([...prev, mat.code]))
    setSuccessAlert(`Stock request sent to Inventory for ${mat.name} (${mat.formattedShortage} needed).`)
  }

  // Dynamic status badges for each section
  const sectionAStatus = useMemo(() => getSectionAStatus(formData), [formData])
  const sectionBStatus = useMemo(() => getSectionBStatus(formData), [formData])
  const sectionCStatus = useMemo(() => getSectionCStatus(formData), [formData])

  // Validation rules for Section A (Task 2 strict product selection validation)
  const validateSectionA = () => {
    if (!formData.product_name || !String(formData.product_name).trim()) {
      return 'Section A: Please select a valid product from the existing products list.'
    }

    // Verify product exists in allProducts (or matches existing snapshot on edit)
    const matchedProduct = allProducts.find(
      (p) =>
        (formData.product_id && String(p?.id) === String(formData.product_id)) ||
        (p?.name && String(p.name).toLowerCase() === String(formData.product_name).toLowerCase())
    )

    if (!matchedProduct && isCreate) {
      return 'Section A: A typed or unverified value is not allowed. You must select a registered product from the Products module.'
    }

    if (!formData.product_type || !String(formData.product_type).trim()) return 'Section A: Type is required (auto-fetched from selected product).'
    if (formData.product_type === 'Solid' && !formData.product_subtype) {
      return 'Section A: Sub-type (Tablet or Capsule) is required when Type is Solid.'
    }
    if (!formData.company) return 'Section A: Company is required.'
    if (!String(formData.company_code || '').trim()) return 'Section A: Company Code is required.'
    if (!formData.date_of_order) return 'Section A: Date of Order is required.'
    if (!formData.planned_mfg_date) return 'Section A: Planned Mfg Date is required.'
    if (formData.planned_mfg_date < formData.date_of_order) {
      return 'Section A: Planned Mfg Date cannot be earlier than Date of Order.'
    }
    if (!String(formData.product_code || '').trim()) return 'Section A: Product Code is required.'
    return null
  }

  // Validation rules for Section B
  const validateSectionB = () => {
    if (!String(formData.batch_no || '').trim()) return 'Section B: Batch No. is required.'
    if (!String(formData.packing_size || '').trim()) return 'Section B: Packing Size is required.'
    if (!String(formData.batch_size || '').trim()) return 'Section B: Batch Size is required.'
    const mrp = Number(formData.mrp_for_printing)
    if (isNaN(mrp) || mrp <= 0) return 'Section B: MRP for Printing must be a valid number greater than 0.'
    if (!formData.printing_status) return 'Section B: Printing Status is required.'
    return null
  }

  // Validation rules for Section C
  const validateSectionC = () => {
    if (!formData.packing_type) return 'Section C: Packing Type is required.'
    if (!String(formData.label || '').trim()) return 'Section C: Label is required.'
    if (!String(formData.box || '').trim()) return 'Section C: Box is required.'
    if (!String(formData.insert || '').trim()) return 'Section C: Insert is required.'
    if (!formData.requisition_status) return 'Section C: Requisition Status is required.'

    if (!currentProduct || !formData.product_name) {
      return 'Section C: Please select a product in Section A before saving Section C.'
    }

    if (!approvedFormula) {
      return 'Section C: No approved formula found for this product. You cannot allocate raw materials or save Section C.'
    }

    if (shortageCount > 0) {
      return `Section C: Cannot proceed: ${shortageCount} raw material${shortageCount > 1 ? 's are' : ' is'} not available in inventory. Send requests to Inventory before advancing the order.`
    }

    return null
  }

  // Save Section A
  const handleSaveSectionA = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setErrorAlert('')

    const valErr = validateSectionA()
    if (valErr) {
      setErrorAlert(valErr)
      return
    }

    if (isCreate && !canCreateOrders(currentUser)) {
      setErrorAlert('Access Denied: Your role is not authorized to create orders.')
      return
    }

    if (onSaveOrder) {
      onSaveOrder(formData, 'A')
    }
  }

  // Save Section B
  const handleSaveSectionB = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setErrorAlert('')

    if (isCreate) {
      setErrorAlert('Please create and save order details (Section A) before saving batch details.')
      return
    }

    const valErr = validateSectionB()
    if (valErr) {
      setErrorAlert(valErr)
      return
    }

    if (!canEditSectionB) {
      setErrorAlert('Access Denied: Only Manager and Admin can edit Section B.')
      return
    }

    if (onSaveOrder) {
      onSaveOrder(formData, 'B')
    }
  }

  // Save Section C (Store Manager Save & Proceed)
  const handleSaveSectionC = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setErrorAlert('')

    if (isCreate) {
      const errA = validateSectionA()
      if (errA) {
        setErrorAlert(errA)
        return
      }
    }

    const valErr = validateSectionC()
    if (valErr) {
      setErrorAlert(valErr)
      return
    }

    if (!canEditSectionC) {
      setErrorAlert('Access Denied: Only Store Manager and Admin can edit Section C.')
      return
    }

    const payload = {
      ...formData,
      materials_allocated: true,
      allocation_date: new Date().toISOString(),
      allocated_by: currentUser?.name || currentUser?.username || 'Store Manager',
      status: 'CONFIRMED',
      approved_formula_id: approvedFormula?.id,
      approved_formula_name: approvedFormula?.name,
      allocated_materials: availabilityList.map((m) => ({
        code: m.code,
        name: m.name,
        unit: m.unit,
        requiredQuantity: m.requiredQuantity,
        availableStock: m.availableStock,
      })),
    }

    if (onSaveOrder) {
      onSaveOrder(payload, 'C')
    }
  }

  if (!isOpen) return null

  return (
    <div className="order-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="order-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="order-modal-header">
          <div className="order-modal-title-group">
            <h2>{isCreate ? 'Add Order' : isEdit ? 'Edit Order' : 'View Order'}</h2>
            <div className="order-modal-subtitle">
              {isCreate
                ? `New Order · Operating company: ${formData.company}`
                : `Order #${formData.order_number} · ${formData.company}`}
            </div>
          </div>
          <button
            type="button"
            className="order-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="order-modal-body">
          {errorAlert && <Alert type="error" message={errorAlert} />}
          {successAlert && <Alert type="success" message={successAlert} />}

          {/* =========================================================
              SECTION A: ORDER DETAILS (OWNED BY ADMIN)
              ========================================================= */}
          <div className="order-section">
            <div className="order-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 className="order-section-title" style={{ margin: 0 }}>
                  Section A: Order Details
                </h3>
                <span className="order-section-role-badge">Admin</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 12,
                    background: sectionAStatus === 'Completed' ? '#dcfce7' : '#fef3c7',
                    color: sectionAStatus === 'Completed' ? '#15803d' : '#b45309',
                    border: `1px solid ${sectionAStatus === 'Completed' ? '#86efac' : '#fde68a'}`,
                  }}
                >
                  {sectionAStatus === 'Completed' ? '✓ Completed' : '● Pending'}
                </span>
              </div>
              <div className="order-section-actions">
                <span className="order-status-editable">
                  {canEditSectionA ? 'You can edit' : 'View only (Admin owned)'}
                </span>
                {canEditSectionA && (
                  <button
                    type="button"
                    className="order-btn-save"
                    onClick={handleSaveSectionA}
                  >
                    {isCreate ? 'Save and Create Order' : 'Save Section A'}
                  </button>
                )}
              </div>
            </div>

            <div className="order-grid-2">
              {/* Product Name (Searchable SELECT matching Task 2) */}
              <div className="order-field-group">
                <label className="order-label">
                  Product Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <SearchableSelect
                  id="order-product-select"
                  value={formData.product_id || formData.product_name}
                  onChange={handleSelectProduct}
                  options={allProducts}
                  placeholder="Select a product from registered catalog..."
                  disabled={!canEditProduct}
                  isLocked={isProductLockedByStage}
                  lockedTooltip={productLockTooltip}
                  emptyStateMessage="No products found. Add a product in the Products module first."
                  navigateToModulePath="/products"
                  navigateToModuleLabel="Go to Products module"
                  canNavigate={['ADMIN', 'MANAGER', 'STORE_MANAGER'].includes(userRole)}
                  labelKey="name"
                  codeKey="code"
                  valueKey="id"
                  required
                />
              </div>

              {/* Product Code (Read-Only as per Task 2 Requirement 6) */}
              <div className="order-field-group">
                <label className="order-label">
                  Product Code <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.product_code}
                  placeholder="Auto-filled from selected product"
                  readOnly
                  disabled
                  title="Product Code is linked to the registered product and cannot be manually modified."
                  style={{ backgroundColor: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}
                />
              </div>

              {/* Type (Auto-filled from selected product, Read-Only like Product Code) */}
              <div className="order-field-group">
                <label className="order-label">
                  Type <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.product_type || ''}
                  placeholder="Auto-filled from selected product"
                  readOnly
                  disabled
                  title="Type is auto-fetched from the selected product and cannot be manually modified."
                  style={{ backgroundColor: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}
                />
              </div>

              {/* Sub-type dropdown (Shown when Solid is selected) */}
              {formData.product_type === 'Solid' && (
                <div className="order-field-group">
                  <label className="order-label">
                    Sub-type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    className="order-select"
                    value={formData.product_subtype}
                    onChange={(e) =>
                      setFormData({ ...formData, product_subtype: e.target.value })
                    }
                    disabled={!canEditSectionA}
                  >
                    <option value="">Select Sub-type</option>
                    {ORDER_PRODUCT_SUBTYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Company dropdown */}
              <div className="order-field-group">
                <label className="order-label">
                  Company <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  className="order-select"
                  value={formData.company}
                  onChange={(e) => handleSelectCompany(e.target.value)}
                  disabled={!canEditSectionA}
                >
                  {ORDER_COMPANIES.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company Code */}
              <div className="order-field-group">
                <label className="order-label">
                  Company Code <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.company_code}
                  onChange={(e) =>
                    setFormData({ ...formData, company_code: e.target.value })
                  }
                  placeholder="e.g. CMHP"
                  disabled={!canEditSectionA}
                />
              </div>

              {/* Date of Order */}
              <div className="order-field-group">
                <label className="order-label">
                  Date of Order <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  className="order-input"
                  value={formData.date_of_order}
                  onChange={(e) =>
                    setFormData({ ...formData, date_of_order: e.target.value })
                  }
                  disabled={!canEditSectionA}
                />
              </div>

              {/* Planned Mfg Date */}
              <div className="order-field-group">
                <label className="order-label">
                  Planned Mfg Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  className="order-input"
                  value={formData.planned_mfg_date}
                  min={formData.date_of_order}
                  onChange={(e) =>
                    setFormData({ ...formData, planned_mfg_date: e.target.value })
                  }
                  disabled={!canEditSectionA}
                />
              </div>

              {/* Customer selection for invoice/dispatch linkage */}
              <div className="order-field-group">
                <label className="order-label">Customer / Buyer</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    className="order-select"
                    value={formData.customer}
                    onChange={(e) => {
                      const cust = customers.find((c) => String(c.id) === e.target.value)
                      if (cust) handleSelectCustomer(cust)
                    }}
                    disabled={!canEditSectionA}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select a customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code || `CUST-${c.id}`})
                      </option>
                    ))}
                  </select>
                  {canEditSectionA && (
                    <button
                      type="button"
                      className="order-btn-add-customer"
                      onClick={() => setShowAddCustomer(!showAddCustomer)}
                      style={{ whiteSpace: 'nowrap', padding: '0 10px', fontSize: 12 }}
                    >
                      {showAddCustomer ? '✕' : '+ New'}
                    </button>
                  )}
                </div>
              </div>

              {/* Customer Order Reference */}
              <div className="order-field-group">
                <label className="order-label">Customer Order Reference</label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.customer_order_reference}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      customer_order_reference: e.target.value,
                    })
                  }
                  placeholder="e.g. PO-2026-9901"
                  disabled={!canEditSectionA}
                />
              </div>

              {/* Order Quantity (Scales live into Section C required materials) */}
              <div className="order-field-group">
                <label className="order-label">
                  Order Quantity <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  className="order-input"
                  value={
                    formData.order_quantity !== undefined && formData.order_quantity !== ''
                      ? formData.order_quantity
                      : (formData.lines?.[0]?.quantity || 100)
                  }
                  onChange={(e) => {
                    const rawVal = e.target.value
                    const numVal = rawVal === '' ? '' : Math.max(0, Number(rawVal) || 0)
                    setFormData((prev) => {
                      const updatedLines = [...(prev.lines || [])]
                      if (updatedLines[0]) {
                        updatedLines[0] = { ...updatedLines[0], quantity: Number(numVal) || 0 }
                      }
                      return {
                        ...prev,
                        order_quantity: numVal,
                        lines: updatedLines,
                      }
                    })
                  }}
                  placeholder="e.g. 100"
                  disabled={!canEditSectionA}
                />
              </div>
            </div>

            {/* Inline Customer Registration card if toggled */}
            {showAddCustomer && canEditSectionA && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                }}
              >
                <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#334155' }}>
                  Register New Customer
                </h4>
                <div className="order-grid-2">
                  <input
                    type="text"
                    className="order-input"
                    placeholder="Customer Name *"
                    value={newCustForm.name}
                    onChange={(e) =>
                      setNewCustForm({ ...newCustForm, name: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    className="order-input"
                    placeholder="Customer Code (e.g. CUST-1008)"
                    value={newCustForm.code}
                    onChange={(e) =>
                      setNewCustForm({ ...newCustForm, code: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    className="order-input"
                    placeholder="Phone"
                    value={newCustForm.phone}
                    onChange={(e) =>
                      setNewCustForm({ ...newCustForm, phone: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    className="order-input"
                    placeholder="GSTIN"
                    value={newCustForm.gstin}
                    onChange={(e) =>
                      setNewCustForm({ ...newCustForm, gstin: e.target.value })
                    }
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="order-btn-cancel"
                    onClick={() => setShowAddCustomer(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="order-btn-save"
                    onClick={handleAddNewCustomer}
                  >
                    Save Customer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* =========================================================
              SECTION B: BATCH & PRINTING DETAILS (OWNED BY MANAGER)
              ========================================================= */}
          <div className="order-section">
            <div className="order-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 className="order-section-title" style={{ margin: 0 }}>
                  Section B: Batch &amp; Printing Details
                </h3>
                <span className="order-section-role-badge">Manager</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 12,
                    background: sectionBStatus === 'Completed' ? '#dcfce7' : '#fef3c7',
                    color: sectionBStatus === 'Completed' ? '#15803d' : '#b45309',
                    border: `1px solid ${sectionBStatus === 'Completed' ? '#86efac' : '#fde68a'}`,
                  }}
                >
                  {sectionBStatus === 'Completed' ? '✓ Completed' : '● Pending'}
                </span>
              </div>
              <div className="order-section-actions">
                <span className="order-status-editable">
                  {canEditSectionB ? 'You can edit' : 'View only (Manager owned)'}
                </span>
                {canEditSectionB && (
                  <button
                    type="button"
                    className="order-btn-save"
                    onClick={handleSaveSectionB}
                  >
                    Save Section B
                  </button>
                )}
              </div>
            </div>

            <div className="order-grid-2">
              {/* Batch No. (Auto-generated, Read-Only) */}
              <div className="order-field-group">
                <label className="order-label">
                  Batch No. <span style={{ color: '#ef4444' }}>*</span>{' '}
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>
                    (Auto-generated, Read-only)
                  </span>
                </label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.batch_no}
                  readOnly
                  disabled
                  placeholder="Auto-generated Batch No."
                  title="Batch No. is auto-generated by the system and read-only."
                  style={{
                    backgroundColor: '#f8fafc',
                    color: '#334155',
                    cursor: 'not-allowed',
                    fontWeight: 600,
                  }}
                />
              </div>

              {/* Packing Size */}
              <div className="order-field-group">
                <label className="order-label">
                  Packing Size <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.packing_size}
                  onChange={(e) =>
                    setFormData({ ...formData, packing_size: e.target.value })
                  }
                  placeholder="e.g. 10 x 10 Blister Strip"
                  disabled={!canEditSectionB}
                />
              </div>

              {/* Batch Size */}
              <div className="order-field-group">
                <label className="order-label">
                  Batch Size <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.batch_size}
                  onChange={(e) =>
                    setFormData({ ...formData, batch_size: e.target.value })
                  }
                  placeholder="e.g. 5000 Packs"
                  disabled={!canEditSectionB}
                />
              </div>

              {/* MRP for Printing */}
              <div className="order-field-group">
                <label className="order-label">
                  MRP for Printing (₹) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="order-input"
                  value={formData.mrp_for_printing}
                  onChange={(e) =>
                    setFormData({ ...formData, mrp_for_printing: e.target.value })
                  }
                  placeholder="Must be > 0 (e.g. 145.00)"
                  disabled={!canEditSectionB}
                />
              </div>

              {/* Printing Status */}
              <div className="order-field-group">
                <label className="order-label">
                  Printing Status <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  className="order-select"
                  value={formData.printing_status}
                  onChange={(e) =>
                    setFormData({ ...formData, printing_status: e.target.value })
                  }
                  disabled={!canEditSectionB}
                >
                  {ORDER_PRINTING_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch Notes */}
              <div className="order-field-group">
                <label className="order-label">Batch Notes</label>
                <input
                  type="text"
                  className="order-input"
                  value={formData.batch_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, batch_notes: e.target.value })
                  }
                  placeholder="Notes for batch manufacturing or packaging run"
                  disabled={!canEditSectionB}
                />
              </div>
            </div>
          </div>

          {/* =========================================================
              SECTION C: RAW MATERIAL ALLOCATION & PACKING (STORE MANAGER ONLY)
              ========================================================= */}
          {canViewSectionC && (
            <div className="order-section">
              <div className="order-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 className="order-section-title" style={{ margin: 0 }}>
                    Section C: Raw Material Allocation &amp; Packing
                  </h3>
                  <span className="order-section-role-badge">Store Manager</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 12,
                      background:
                        !formData.product_name
                          ? '#f1f5f9'
                          : !approvedFormula
                          ? '#fef3c7'
                          : shortageCount > 0
                          ? '#fee2e2'
                          : '#dcfce7',
                      color:
                        !formData.product_name
                          ? '#475569'
                          : !approvedFormula
                          ? '#b45309'
                          : shortageCount > 0
                          ? '#b91c1c'
                          : '#15803d',
                      border: `1px solid ${
                        !formData.product_name
                          ? '#cbd5e1'
                          : !approvedFormula
                          ? '#fde68a'
                          : shortageCount > 0
                          ? '#fca5a5'
                          : '#86efac'
                      }`,
                    }}
                  >
                    {!formData.product_name
                      ? '● Select Product'
                      : !approvedFormula
                      ? '● No Approved Formula'
                      : shortageCount > 0
                      ? `● Shortage (${shortageCount})`
                      : '✓ In Stock & Ready'}
                  </span>
                </div>
                <div className="order-section-actions">
                  <span className="order-status-editable">
                    {canEditSectionC ? 'You can edit' : 'View only (Store Manager owned)'}
                  </span>
                  {canEditSectionC && (
                    <button
                      type="button"
                      className="order-btn-save"
                      onClick={handleSaveSectionC}
                      disabled={!allInStock}
                      title={
                        !formData.product_name
                          ? 'Select a product first'
                          : !approvedFormula
                          ? 'No approved formula found for this product'
                          : shortageCount > 0
                          ? `Raw material stock is insufficient (${shortageCount} shortages). Send requests to Inventory.`
                          : 'Save Section C and allocate materials'
                      }
                      style={{
                        opacity: allInStock ? 1 : 0.6,
                        cursor: allInStock ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Save Section C &amp; Proceed
                    </button>
                  )}
                </div>
              </div>

              {/* Formula & Batch Meta Banner */}
              <div className="order-rm-container">
                <div className="order-rm-meta-banner">
                  <div className="order-rm-meta-title">
                    <span>🔬 Approved Master Formula &amp; Inventory Verification</span>
                  </div>
                  <div className="order-rm-meta-details">
                    <div>
                      <strong>Batch No:</strong>{' '}
                      <span className="order-rm-meta-badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                        {formData.batch_no || 'Auto-generated'} (Read-only)
                      </span>
                    </div>
                    <div>
                      <strong>Product:</strong> {formData.product_name || 'None'} ({formData.product_code || '—'})
                    </div>
                    <div>
                      <strong>Order Quantity:</strong> {orderQuantity} units
                    </div>
                    {approvedFormula && (
                      <div>
                        <strong>Formula:</strong> {approvedFormula.name} ({approvedFormula.revisionName}) [Base: {approvedFormula.baseQuantity} {approvedFormula.baseUnit}]
                      </div>
                    )}
                  </div>
                </div>

                {/* State 1: No product selected */}
                {!formData.product_name && (
                  <div style={{ padding: 18, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                    Select a product from the registered catalog in Section A to auto-fetch the approved formula and run live stock availability checks.
                  </div>
                )}

                {/* State 2: Product selected but NO approved formula */}
                {formData.product_name && !approvedFormula && (
                  <div style={{ padding: 16 }}>
                    <div className="order-rm-alert-box order-rm-alert-warning" style={{ marginTop: 0 }}>
                      <span style={{ fontSize: 22 }}>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          No approved formula found for this product
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                          This product has no active formula with <strong>APPROVED</strong> status in the Formula (BOM) module. Draft, pending, or unapproved formulas are ignored. Raw material allocation is blocked until a formula is approved.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* State 3: Approved Formula Found - Live Raw Materials Table */}
                {formData.product_name && approvedFormula && (
                  <div>
                    <div className="order-rm-table-wrapper">
                      <table className="order-rm-table">
                        <thead>
                          <tr>
                            <th>Raw Material</th>
                            <th>Unit</th>
                            <th>Formula Qty (Base)</th>
                            <th>Required Qty (Order)</th>
                            <th>Available in Inventory</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {availabilityList.map((mat) => {
                            const isInStock = mat.status === 'IN_STOCK'
                            const isRequested = isMaterialRequested(mat)

                            return (
                              <tr key={mat.code || mat.id}>
                                <td>
                                  <div className="order-rm-mat-name">{mat.name}</div>
                                  <div className="order-rm-mat-code">{mat.code}</div>
                                  {mat.labelClaim && (
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                      Claim: {mat.labelClaim}
                                    </div>
                                  )}
                                </td>
                                <td>{mat.unit}</td>
                                <td>{mat.formattedFormulaQuantity}</td>
                                <td style={{ fontWeight: 700, color: '#0f172a' }}>
                                  {mat.formattedRequiredQuantity}
                                </td>
                                <td style={{ fontWeight: 600, color: isInStock ? '#166534' : '#991b1b' }}>
                                  {mat.formattedAvailableStock}
                                </td>
                                <td>
                                  {isInStock ? (
                                    <span className="order-rm-badge-instock">
                                      ✓ In Stock
                                    </span>
                                  ) : (
                                    <div>
                                      <span className="order-rm-badge-shortage">
                                        ● Not Available in Inventory
                                      </span>
                                      <span className="order-rm-shortage-label">
                                        Short by {mat.formattedShortage}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {isInStock ? (
                                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12 }}>
                                      ✓ Ready
                                    </span>
                                  ) : isRequested ? (
                                    <button
                                      type="button"
                                      disabled
                                      className="order-btn-requested"
                                      title="Stock request already created in Inventory"
                                    >
                                      ✓ Requested
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="order-btn-send-request"
                                      onClick={() => handleSendRequestToInventory(mat)}
                                      title={`Send stock request for ${mat.name} (${mat.formattedShortage})`}
                                    >
                                      Send Request to Inventory
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary / Save & Proceed Rule Bar */}
                    <div className="order-rm-summary-box">
                      <div style={{ flex: 1 }}>
                        {shortageCount > 0 ? (
                          <div className="order-rm-alert-box order-rm-alert-error" style={{ margin: 0 }}>
                            <span style={{ fontSize: 20 }}>⚠️</span>
                            <div>
                              <div style={{ fontWeight: 700 }}>
                                Cannot proceed: {shortageCount} raw material{shortageCount > 1 ? 's are' : ' is'} not available in inventory.
                              </div>
                              <div style={{ fontSize: 12, marginTop: 4 }}>
                                <strong>{inStockCount} of {availabilityList.length}</strong> materials in stock.{' '}
                                Missing items:{' '}
                                <span style={{ fontWeight: 600 }}>
                                  {availabilityList
                                    .filter((m) => m.status === 'NOT_AVAILABLE')
                                    .map((m) => `${m.name} (${m.formattedShortage})`)
                                    .join(', ')}
                                </span>
                                . Send requests to Inventory before advancing the order.
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="order-rm-alert-box order-rm-alert-success" style={{ margin: 0 }}>
                            <span style={{ fontSize: 20 }}>✓</span>
                            <div>
                              <div style={{ fontWeight: 700 }}>
                                All {availabilityList.length} raw materials are verified in stock.
                              </div>
                              <div style={{ fontSize: 12, marginTop: 4 }}>
                                Inventory availability confirmed. Save Section C to allocate materials and advance the order to Confirmed stage.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section C: Packing Details Form Grid */}
              <div style={{ marginTop: 18 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#334155', fontWeight: 700 }}>
                  Packaging &amp; Primary Materials Specification
                </h4>
                <div className="order-grid-2">
                  {/* Packing Type */}
                  <div className="order-field-group">
                    <label className="order-label">
                      Packing Type <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      className="order-select"
                      value={formData.packing_type}
                      onChange={(e) =>
                        setFormData({ ...formData, packing_type: e.target.value })
                      }
                      disabled={!canEditSectionC}
                    >
                      {ORDER_PACKING_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Label */}
                  <div className="order-field-group">
                    <label className="order-label">
                      Label <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="order-input"
                      value={formData.label}
                      onChange={(e) =>
                        setFormData({ ...formData, label: e.target.value })
                      }
                      placeholder="e.g. Standard Pharmaceutical Label Rev 2"
                      disabled={!canEditSectionC}
                    />
                  </div>

                  {/* Box */}
                  <div className="order-field-group">
                    <label className="order-label">
                      Box <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="order-input"
                      value={formData.box}
                      onChange={(e) =>
                        setFormData({ ...formData, box: e.target.value })
                      }
                      placeholder="e.g. Mono Carton 350 GSM UV Coated"
                      disabled={!canEditSectionC}
                    />
                  </div>

                  {/* Insert */}
                  <div className="order-field-group">
                    <label className="order-label">
                      Insert <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="order-input"
                      value={formData.insert}
                      onChange={(e) =>
                        setFormData({ ...formData, insert: e.target.value })
                      }
                      placeholder="e.g. Patient Information Leaflet (PIL-EN-GUJ)"
                      disabled={!canEditSectionC}
                    />
                  </div>

                  {/* Requisition Status */}
                  <div className="order-field-group">
                    <label className="order-label">
                      Requisition Status <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      className="order-select"
                      value={formData.requisition_status}
                      onChange={(e) =>
                        setFormData({ ...formData, requisition_status: e.target.value })
                      }
                      disabled={!canEditSectionC}
                    >
                      {ORDER_REQUISITION_STATUSES.map((rs) => (
                        <option key={rs} value={rs}>
                          {rs}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              SAMPLE QUANTITY & PACKAGING ALLOCATION (POST-PRODUCTION)
              ========================================================= */}
          {order && (
            <div className="order-section" style={{ borderLeft: '4px solid #8b7cf6' }}>
              <div className="order-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 className="order-section-title" style={{ margin: 0, color: '#6d28d9' }}>
                    Sample Quantity &amp; Packaging Allocation
                  </h3>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 12,
                      background: order.sample_confirmed ? '#f5f3ff' : '#f1f5f9',
                      color: order.sample_confirmed ? '#7c3aed' : '#64748b',
                      border: `1px solid ${order.sample_confirmed ? '#ddd6fe' : '#cbd5e1'}`,
                    }}
                  >
                    {order.sample_confirmed ? '✓ Sample Confirmed' : '● Not Yet Confirmed'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12, marginTop: 12 }}>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                    Total Produced (Read-only)
                  </span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                    {order.qa_approved_qty || order.produced_quantity || order.quantity || 100} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>pcs</span>
                  </div>
                </div>

                <div style={{ background: '#faf5ff', padding: 12, borderRadius: 8, border: '1px solid #d8b4fe' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', display: 'block' }}>
                    Retained Samples
                  </span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
                    {order.sample_quantity !== undefined ? order.sample_quantity : 0} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>pcs</span>
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, border: '1px solid #86efac' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', display: 'block' }}>
                    Remaining for Packaging
                  </span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 4 }}>
                    {order.packaging_quantity !== undefined
                      ? order.packaging_quantity
                      : (Number(order.qa_approved_qty || order.produced_quantity || order.quantity || 100) - Number(order.sample_quantity || 0))} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>pcs</span>
                  </div>
                </div>
              </div>

              {order.sample_confirmed && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                  Recorded on {order.sample_recorded_at?.slice(0, 10) || '—'} by {order.sample_recorded_by || 'Admin'}. (Samples are unbilled and moved outward in Stock Ledger).
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="order-modal-footer">
          <button type="button" className="order-btn-cancel" onClick={onClose}>
            Close
          </button>
          {isCreate && canEditSectionA && (
            <button
              type="button"
              className="order-btn-save"
              onClick={handleSaveSectionA}
            >
              Confirm and Create Order
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
