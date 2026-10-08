import { useState, useMemo, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import {
  addProduct,
  editProduct,
  deleteProduct,
  saveProductLastSelection,
  saveFormula,
  addFormulaRevision,
  saveRevisionMaterials,
} from '../../store/erpSlice'
import { previewDocumentNumber, commitDocumentNumber } from '../../utils/documentNumbers'
import {
  SUPPORTED_UNITS,
  calculateBatchScaleFactor,
  calculateRevisionRequirements,
  formatPharmaNumber,
} from './formulaCalculation'
import './Products.css'

const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Ointment',
  'Cream',
  'Gel',
  'Drops',
  'Inhaler',
  'Solution',
  'Powder',
  'Emulsion',
]

const COMMON_RAW_MATERIALS = [
  'Paracetamol IP/BP (Active API)',
  'Amoxicillin Trihydrate Compacted (API)',
  'Omeprazole Base BP (Active API)',
  'Microcrystalline Cellulose (Avicel PH-101)',
  'Microcrystalline Cellulose (Avicel PH-102)',
  'Maize Starch BP (Binder & Disintegrant)',
  'Povidone K-30 (Wet Granulating Binder)',
  'Croscarmellose Sodium (Superdisintegrant)',
  'Crosspovidone XL (Superdisintegrant)',
  'Magnesium Stearate (Lubricant)',
  'Talc Purified USP (Glidant & Anti-tacking)',
  'Colloidal Silicon Dioxide (Aerosil 200)',
  'Lactose Monohydrate',
  'Sucrose Extra Fine (Sweetener)',
  'Sodium Benzoate (Preservative)',
  'Sodium Citrate Dihydrate (Buffer)',
  'Xanthan Gum (Suspending Agent)',
  'Hypromellose (HPMC 2910)',
  'Methacrylic Acid Copolymer Type C',
  'Triethyl Citrate (Plasticizer)',
  'Purified Water USP',
]

export default function Products() {
  const dispatch = useDispatch()
  const { products = [], formulas = [] } = useSelector((state) => state.erp)

  // Navigation & View Mode
  const [activeView, setActiveView] = useState('list') // 'list' | 'formula'
  const [selectedProductId, setSelectedProductId] = useState(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [dosageFilter, setDosageFilter] = useState('')

  // Notifications
  const [notification, setNotification] = useState({ type: '', message: '' })

  // Modals
  const [productModalMode, setProductModalMode] = useState(null) // 'add' | 'edit' | null
  const [productForm, setProductForm] = useState({
    name: '',
    code: '',
    dosage_form: 'Tablet',
    strength: '',
    pack_size: '',
    description: '',
  })
  const [modalError, setModalError] = useState('')
  const [deleteProductTarget, setDeleteProductTarget] = useState(null)

  // Formula Flow State
  const [formulaStep, setFormulaStep] = useState(1) // 1: Formula & Revision, 2: Raw Materials
  const [selectedFormulaId, setSelectedFormulaId] = useState(null)
  const [selectedRevisionId, setSelectedRevisionId] = useState(null)

  // Step 1: Add Formula / Add Revision forms
  const [showAddFormulaForm, setShowAddFormulaForm] = useState(false)
  const [newFormulaData, setNewFormulaData] = useState({
    name: '',
    base_quantity: '100',
    base_unit: 'g',
  })
  const [formulaFormError, setFormulaFormError] = useState('')

  const [showAddRevisionForm, setShowAddRevisionForm] = useState(false)
  const [newRevisionData, setNewRevisionData] = useState({
    name: '',
    description: '',
    copyCurrentMaterials: true,
  })
  const [revisionFormError, setRevisionFormError] = useState('')

  // Step 2: Add Raw Material Form
  const [materialForm, setMaterialForm] = useState({
    name: '',
    base_quantity: '',
    unit: 'g',
  })
  const [materialFormError, setMaterialFormError] = useState('')
  const [editingMaterialId, setEditingMaterialId] = useState(null)
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState(null)

  // Calculation Engine State
  const [requiredBatchQty, setRequiredBatchQty] = useState('1')
  const [requiredBatchUnit, setRequiredBatchUnit] = useState('kg')

  // Auto-clear notification after 4s
  useEffect(() => {
    if (notification.message) {
      const timer = setTimeout(() => setNotification({ type: '', message: '' }), 4000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // Get active product
  const activeProduct = useMemo(() => {
    return products.find((p) => String(p.id) === String(selectedProductId)) || null
  }, [products, selectedProductId])

  // Get formulas for active product
  const productFormulas = useMemo(() => {
    if (!activeProduct) return []
    return formulas.filter((f) => String(f.product_id) === String(activeProduct.id))
  }, [formulas, activeProduct])

  // Get active formula
  const activeFormula = useMemo(() => {
    if (!productFormulas.length) return null
    if (selectedFormulaId) {
      const found = productFormulas.find((f) => String(f.id) === String(selectedFormulaId))
      if (found) return found
    }
    return productFormulas[0]
  }, [productFormulas, selectedFormulaId])

  // Get active revision
  const activeRevision = useMemo(() => {
    if (!activeFormula || !Array.isArray(activeFormula.revisions) || activeFormula.revisions.length === 0) {
      return null
    }
    if (selectedRevisionId) {
      const found = activeFormula.revisions.find((r) => String(r.id) === String(selectedRevisionId))
      if (found) return found
    }
    return activeFormula.revisions[0]
  }, [activeFormula, selectedRevisionId])

  // Sync batch unit when formula base unit changes if not touched
  useEffect(() => {
    if (activeFormula?.base_unit) {
      // Suggest matching default batch unit
      if (activeFormula.base_unit === 'g' || activeFormula.base_unit === 'mg') {
        setRequiredBatchUnit('kg')
      } else if (activeFormula.base_unit === 'kg') {
        setRequiredBatchUnit('kg')
      } else if (activeFormula.base_unit === 'ml' || activeFormula.base_unit === 'L') {
        setRequiredBatchUnit('L')
      }
    }
  }, [activeFormula?.base_unit])

  // When switching active product or entering formula view, auto-load saved formula & revision
  const handleOpenFormulaView = (product) => {
    setSelectedProductId(product.id)
    setActiveView('formula')
    setFormulaStep(1)
    setShowAddFormulaForm(false)
    setShowAddRevisionForm(false)
    setMaterialFormError('')

    const productFormulasList = formulas.filter((f) => String(f.product_id) === String(product.id))

    if (productFormulasList.length > 0) {
      // Restore last selected formula or fallback to first
      const targetFormula =
        productFormulasList.find((f) => String(f.id) === String(product.last_formula_id)) ||
        productFormulasList[0]

      setSelectedFormulaId(targetFormula.id)

      if (Array.isArray(targetFormula.revisions) && targetFormula.revisions.length > 0) {
        const targetRev =
          targetFormula.revisions.find((r) => String(r.id) === String(product.last_revision_id)) ||
          targetFormula.revisions[0]
        setSelectedRevisionId(targetRev.id)
      } else {
        setSelectedRevisionId(null)
      }
    } else {
      setSelectedFormulaId(null)
      setSelectedRevisionId(null)
    }
  }

  // Update product last selection on formula/revision change
  const handleSelectFormula = (fId) => {
    setSelectedFormulaId(fId)
    const targetF = productFormulas.find((f) => String(f.id) === String(fId))
    const firstRevId = targetF?.revisions?.[0]?.id || null
    setSelectedRevisionId(firstRevId)

    if (activeProduct) {
      dispatch(
        saveProductLastSelection({
          productId: activeProduct.id,
          formulaId: fId,
          revisionId: firstRevId,
        })
      )
    }
  }

  const handleSelectRevision = (rId) => {
    setSelectedRevisionId(rId)
    if (activeProduct && activeFormula) {
      dispatch(
        saveProductLastSelection({
          productId: activeProduct.id,
          formulaId: activeFormula.id,
          revisionId: rId,
        })
      )
    }
  }

  // Filtered Products List
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !searchQuery.trim() ||
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.strength && p.strength.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.dosage_form && p.dosage_form.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchDosage = !dosageFilter || p.dosage_form === dosageFilter
      return matchSearch && matchDosage
    })
  }, [products, searchQuery, dosageFilter])

  // Calculation Results
  const calculatedMaterials = useMemo(() => {
    if (!activeFormula || !activeRevision || !Array.isArray(activeRevision.materials)) {
      return []
    }
    return calculateRevisionRequirements({
      formulaBaseQty: activeFormula.base_quantity,
      formulaBaseUnit: activeFormula.base_unit,
      requiredBatchQty: requiredBatchQty,
      requiredBatchUnit: requiredBatchUnit,
      materials: activeRevision.materials,
    })
  }, [activeFormula, activeRevision, requiredBatchQty, requiredBatchUnit])

  // Multiplier / Scale Factor
  const currentScaleFactor = useMemo(() => {
    if (!activeFormula) return 1
    return calculateBatchScaleFactor(
      activeFormula.base_quantity,
      activeFormula.base_unit,
      requiredBatchQty,
      requiredBatchUnit
    )
  }, [activeFormula, requiredBatchQty, requiredBatchUnit])

  /* =========================================================
     PRODUCT ACTIONS (ADD, EDIT, DELETE)
     ========================================================= */

  const handleOpenAddProduct = () => {
    setModalError('')
    const generatedCode = previewDocumentNumber('PRODUCT')
    setProductForm({
      name: '',
      code: generatedCode,
      dosage_form: 'Tablet',
      strength: '',
      pack_size: '',
      description: '',
    })
    setProductModalMode('add')
  }

  const handleOpenEditProduct = (product) => {
    setModalError('')
    setProductForm({
      name: product.name || '',
      code: product.code || '',
      dosage_form: product.dosage_form || 'Tablet',
      strength: product.strength || '',
      pack_size: product.pack_size || '',
      description: product.description || '',
    })
    setProductModalMode('edit')
  }

  const handleSaveProduct = (e) => {
    e.preventDefault()
    setModalError('')

    if (!productForm.name.trim()) {
      setModalError('Product Name is required.')
      return
    }
    if (!productForm.strength.trim()) {
      setModalError('Strength (e.g. 500 mg) is required.')
      return
    }
    if (!productForm.pack_size.trim()) {
      setModalError('Pack Size (e.g. 10x10 Tablets) is required.')
      return
    }

    if (productModalMode === 'add') {
      const finalCode = commitDocumentNumber('PRODUCT')
      dispatch(
        addProduct({
          name: productForm.name.trim(),
          code: finalCode,
          dosage_form: productForm.dosage_form,
          strength: productForm.strength.trim(),
          pack_size: productForm.pack_size.trim(),
          description: productForm.description.trim(),
        })
      )
      setNotification({
        type: 'success',
        message: `Product "${productForm.name}" (${finalCode}) created successfully.`,
      })
    } else if (productModalMode === 'edit') {
      dispatch(
        editProduct({
          id: activeProduct?.id || selectedProductId,
          payload: {
            name: productForm.name.trim(),
            dosage_form: productForm.dosage_form,
            strength: productForm.strength.trim(),
            pack_size: productForm.pack_size.trim(),
            description: productForm.description.trim(),
          },
        })
      )
      setNotification({
        type: 'success',
        message: `Product details updated successfully.`,
      })
    }

    setProductModalMode(null)
  }

  const handleConfirmDeleteProduct = () => {
    if (!deleteProductTarget) return
    dispatch(deleteProduct({ id: deleteProductTarget.id }))
    setNotification({
      type: 'success',
      message: `Product "${deleteProductTarget.name}" deleted.`,
    })
    if (selectedProductId === deleteProductTarget.id) {
      setActiveView('list')
      setSelectedProductId(null)
    }
    setDeleteProductTarget(null)
  }

  /* =========================================================
     FORMULA ACTIONS (STEP 1)
     ========================================================= */

  const handleSaveNewFormula = (e) => {
    e.preventDefault()
    setFormulaFormError('')

    if (!newFormulaData.name.trim()) {
      setFormulaFormError('Formula Name is required.')
      return
    }
    const bQty = Number(newFormulaData.base_quantity)
    if (!bQty || bQty <= 0) {
      setFormulaFormError('Base Quantity must be a number greater than 0.')
      return
    }

    const newFId = Date.now()
    const defaultRevId = 'rev-00'

    dispatch(
      saveFormula({
        id: newFId,
        product_id: activeProduct.id,
        name: newFormulaData.name.trim(),
        base_quantity: bQty,
        base_unit: newFormulaData.base_unit,
        revisions: [
          {
            id: defaultRevId,
            name: 'Rev 00',
            description: 'Initial approved production master formulation',
            created_at: new Date().toISOString(),
            materials: [],
          },
        ],
      })
    )

    dispatch(
      saveProductLastSelection({
        productId: activeProduct.id,
        formulaId: newFId,
        revisionId: defaultRevId,
      })
    )

    setSelectedFormulaId(newFId)
    setSelectedRevisionId(defaultRevId)
    setShowAddFormulaForm(false)
    setNewFormulaData({ name: '', base_quantity: '100', base_unit: 'g' })
    setNotification({
      type: 'success',
      message: `Formula "${newFormulaData.name}" created with Rev 00.`,
    })
  }

  const handleSaveNewRevision = (e) => {
    e.preventDefault()
    setRevisionFormError('')

    if (!activeFormula) {
      setRevisionFormError('Please select or create a formula first.')
      return
    }

    const currentRevs = activeFormula.revisions || []
    const nextRevNum = currentRevs.length
    const revName = newRevisionData.name.trim() || `Rev ${String(nextRevNum).padStart(2, '0')}`

    // Duplicate revision check
    if (currentRevs.some((r) => r.name.toLowerCase() === revName.toLowerCase())) {
      setRevisionFormError(`Revision "${revName}" already exists for this formula.`)
      return
    }

    const newRevId = `rev-${Date.now()}`
    const copiedMaterials =
      newRevisionData.copyCurrentMaterials && activeRevision?.materials
        ? activeRevision.materials.map((m) => ({ ...m, id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}` }))
        : []

    dispatch(
      addFormulaRevision({
        formulaId: activeFormula.id,
        revision: {
          id: newRevId,
          name: revName,
          description: newRevisionData.description.trim() || 'New revision',
          created_at: new Date().toISOString(),
          materials: copiedMaterials,
        },
      })
    )

    dispatch(
      saveProductLastSelection({
        productId: activeProduct.id,
        formulaId: activeFormula.id,
        revisionId: newRevId,
      })
    )

    setSelectedRevisionId(newRevId)
    setShowAddRevisionForm(false)
    setNewRevisionData({ name: '', description: '', copyCurrentMaterials: true })
    setNotification({
      type: 'success',
      message: `Revision "${revName}" created successfully.`,
    })
  }

  /* =========================================================
     RAW MATERIAL ACTIONS (STEP 2)
     ========================================================= */

  const handleAddMaterial = (e) => {
    e.preventDefault()
    setMaterialFormError('')

    if (!activeFormula || !activeRevision) {
      setMaterialFormError('Please ensure a formula and revision are selected.')
      return
    }

    const matName = materialForm.name.trim()
    if (!matName) {
      setMaterialFormError('Raw Material Name is required.')
      return
    }

    const baseQty = Number(materialForm.base_quantity)
    if (!baseQty || baseQty <= 0) {
      setMaterialFormError('Base Quantity must be greater than 0.')
      return
    }

    const currentMaterials = activeRevision.materials || []

    if (editingMaterialId) {
      // Editing existing material
      const duplicate = currentMaterials.find(
        (m) => m.id !== editingMaterialId && m.name.toLowerCase() === matName.toLowerCase()
      )
      if (duplicate) {
        setMaterialFormError(`Material "${matName}" already exists in this revision.`)
        return
      }

      const updated = currentMaterials.map((m) => {
        if (m.id === editingMaterialId) {
          return {
            ...m,
            name: matName,
            base_quantity: baseQty,
            unit: materialForm.unit,
          }
        }
        return m
      })

      dispatch(
        saveRevisionMaterials({
          formulaId: activeFormula.id,
          revisionId: activeRevision.id,
          materials: updated,
        })
      )

      setEditingMaterialId(null)
      setMaterialForm({ name: '', base_quantity: '', unit: 'g' })
      setNotification({ type: 'success', message: `Material updated.` })
      return
    }

    // Adding new material: Duplicate check!
    const isDuplicate = currentMaterials.some(
      (m) => m.name.toLowerCase() === matName.toLowerCase()
    )
    if (isDuplicate) {
      setMaterialFormError(`Material "${matName}" is already present in this revision.`)
      return
    }

    const newMaterial = {
      id: `mat-${Date.now()}`,
      name: matName,
      base_quantity: baseQty,
      unit: materialForm.unit,
    }

    const nextMaterials = [...currentMaterials, newMaterial]

    dispatch(
      saveRevisionMaterials({
        formulaId: activeFormula.id,
        revisionId: activeRevision.id,
        materials: nextMaterials,
      })
    )

    setMaterialForm({ name: '', base_quantity: '', unit: materialForm.unit })
    setNotification({
      type: 'success',
      message: `Added "${matName}" (${baseQty} ${materialForm.unit}) to ${activeRevision.name}.`,
    })
  }

  const handleStartEditMaterial = (material) => {
    setEditingMaterialId(material.id)
    setMaterialForm({
      name: material.name,
      base_quantity: String(material.base_quantity),
      unit: material.unit,
    })
    setMaterialFormError('')
  }

  const handleCancelEditMaterial = () => {
    setEditingMaterialId(null)
    setMaterialForm({ name: '', base_quantity: '', unit: 'g' })
    setMaterialFormError('')
  }

  const handleConfirmDeleteMaterial = () => {
    if (!deleteMaterialTarget || !activeFormula || !activeRevision) return
    const currentMaterials = activeRevision.materials || []
    const updated = currentMaterials.filter((m) => m.id !== deleteMaterialTarget.id)

    dispatch(
      saveRevisionMaterials({
        formulaId: activeFormula.id,
        revisionId: activeRevision.id,
        materials: updated,
      })
    )

    setNotification({
      type: 'success',
      message: `Removed "${deleteMaterialTarget.name}".`,
    })
    setDeleteMaterialTarget(null)
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="products-page">
      {/* Notifications */}
      {notification.message && (
        <Alert type={notification.type}>{notification.message}</Alert>
      )}

      {/* =========================================================
          VIEW 1: PRODUCT LIST
          ========================================================= */}
      {activeView === 'list' && (
        <>
          {/* Header */}
          <div className="products-header">
            <div className="products-header-title">
              <h1>
                <span>💊</span> Products & Formulations
              </h1>
              <p>
                Pharma-grade product master, master formula records (MFR), revisions, and live batch scaling.
              </p>
            </div>
            <div className="products-stats-row">
              <div className="product-stat-badge">
                <span className="num">{products.length}</span>
                <span className="label">Total Products</span>
              </div>
              <div className="product-stat-badge">
                <span className="num">{formulas.length}</span>
                <span className="label">Master Formulas</span>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="products-toolbar">
            <div className="products-search-filters">
              <div className="products-search-box">
                <span className="products-search-icon">🔍</span>
                <input
                  type="text"
                  className="products-search-input"
                  placeholder="Search product name, code, strength..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="products-filter-select"
                value={dosageFilter}
                onChange={(e) => setDosageFilter(e.target.value)}
              >
                <option value="">All Dosage Forms</option>
                {DOSAGE_FORMS.map((df) => (
                  <option key={df} value={df}>
                    {df}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleOpenAddProduct}>
              + Add Product
            </Button>
          </div>

          {/* Product List Table */}
          <div className="products-card">
            <div className="products-table-wrapper">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Code</th>
                    <th>Dosage Form</th>
                    <th>Strength</th>
                    <th>Pack Size</th>
                    <th>Description</th>
                    <th>Formula Records</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="8">
                        <div className="products-empty-state">
                          <span className="products-empty-icon">📦</span>
                          <h3>No pharmaceutical products found</h3>
                          <p>
                            {searchQuery || dosageFilter
                              ? 'No products match your search and filter criteria.'
                              : 'Get started by creating your first pharmaceutical product.'}
                          </p>
                          <Button onClick={handleOpenAddProduct}>
                            + Add Product
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((prod) => {
                      const prodFormulas = formulas.filter(
                        (f) => String(f.product_id) === String(prod.id)
                      )
                      const dosageClass = `dosage-${prod.dosage_form?.toLowerCase() || 'default'}`

                      return (
                        <tr key={prod.id}>
                          <td style={{ fontWeight: 600, color: '#123f61' }}>
                            {prod.name}
                          </td>
                          <td>
                            <span className="prd-code-tag">{prod.code}</span>
                          </td>
                          <td>
                            <span className={`dosage-badge ${dosageClass}`}>
                              {prod.dosage_form}
                            </span>
                          </td>
                          <td>
                            <strong>{prod.strength}</strong>
                          </td>
                          <td>{prod.pack_size}</td>
                          <td style={{ color: '#64748b', maxWidth: '240px' }}>
                            {prod.description || '—'}
                          </td>
                          <td>
                            {prodFormulas.length > 0 ? (
                              <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>
                                🧪 {prodFormulas.length} Formula{prodFormulas.length > 1 ? 's' : ''} (
                                {prodFormulas[0].revisions?.[0]?.name || 'Rev 00'})
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                No Formula Defined
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="prd-actions-cell">
                              <button
                                type="button"
                                className="btn-action-edit"
                                onClick={() => {
                                  setSelectedProductId(prod.id)
                                  handleOpenEditProduct(prod)
                                }}
                                title="Edit Product Details"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-action-delete"
                                onClick={() => setDeleteProductTarget(prod)}
                                title="Delete Product"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className="btn-action-formula"
                                onClick={() => handleOpenFormulaView(prod)}
                                title="Manage Master Formula & Batch Calculations"
                              >
                                <span>🧪</span> Formula
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
          VIEW 2: FORMULA FLOW & LIVE BATCH CALCULATION
          ========================================================= */}
      {activeView === 'formula' && activeProduct && (
        <div className="formula-flow-panel">
          {/* Active Product Banner */}
          <div className="formula-banner-card">
            <div className="formula-banner-info">
              <div className="formula-banner-title">
                <h2>{activeProduct.name}</h2>
                <span className="prd-code-tag">{activeProduct.code}</span>
                <span
                  className={`dosage-badge dosage-${activeProduct.dosage_form?.toLowerCase() || 'default'}`}
                >
                  {activeProduct.dosage_form}
                </span>
              </div>
              <div className="formula-banner-meta">
                <span>
                  Strength: <strong>{activeProduct.strength}</strong>
                </span>
                <span>
                  Pack Size: <strong>{activeProduct.pack_size}</strong>
                </span>
                {activeProduct.description && (
                  <span>
                    Indication: <em>{activeProduct.description}</em>
                  </span>
                )}
              </div>
            </div>

            <div className="formula-banner-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveView('list')
                  setSelectedProductId(null)
                }}
              >
                ← Back to Products List
              </Button>
            </div>
          </div>

          {/* Clear Step Indicator */}
          <div className="step-indicator-bar">
            <button
              type="button"
              className={`step-tab-btn ${formulaStep === 1 ? 'active' : ''} ${
                activeFormula ? 'completed' : ''
              }`}
              onClick={() => setFormulaStep(1)}
            >
              <span className="step-number-circle">1</span>
              <span>Step 1: Formula & Revision</span>
            </button>
            <button
              type="button"
              className={`step-tab-btn ${formulaStep === 2 ? 'active' : ''} ${
                activeRevision && (activeRevision.materials || []).length > 0 ? 'completed' : ''
              }`}
              onClick={() => {
                if (activeFormula) {
                  setFormulaStep(2)
                } else {
                  setNotification({
                    type: 'error',
                    message: 'Please select or add a formula first.',
                  })
                }
              }}
            >
              <span className="step-number-circle">2</span>
              <span>Step 2: Raw Materials & Formulation</span>
            </button>
            <button
              type="button"
              className={`step-tab-btn ${formulaStep === 3 ? 'active' : ''}`}
              onClick={() => {
                if (activeFormula && activeRevision) {
                  setFormulaStep(3)
                } else {
                  setNotification({
                    type: 'error',
                    message: 'Please select a formula and revision first.',
                  })
                }
              }}
            >
              <span className="step-number-circle">3</span>
              <span>Step 3: Batch Calculation</span>
            </button>
          </div>

          {/* STEP 1: FORMULA AND REVISION */}
          {formulaStep === 1 && (
            <div className="formula-step-card">
              <div className="formula-step-card-header">
                <h3>Step 1: Formula & Revision Selection</h3>
                <p>
                  Select an approved Master Formula and Revision, or create a new formulation profile for this drug product.
                </p>
              </div>

              <div className="formula-selector-group">
                {/* Select Formula Row */}
                <div className="formula-field-row">
                  <label>Select Master Formula</label>
                  <div className="formula-dropdown-action-row">
                    <select
                      className="formula-select"
                      value={activeFormula?.id || ''}
                      onChange={(e) => handleSelectFormula(Number(e.target.value) || e.target.value)}
                      disabled={productFormulas.length === 0}
                    >
                      {productFormulas.length === 0 ? (
                        <option value="">No formulas defined yet</option>
                      ) : (
                        productFormulas.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} (Base: {f.base_quantity} {f.base_unit})
                          </option>
                        ))
                      )}
                    </select>

                    <Button
                      variant="secondary"
                      onClick={() => setShowAddFormulaForm(!showAddFormulaForm)}
                    >
                      {showAddFormulaForm ? 'Cancel' : '+ Add New Formula'}
                    </Button>
                  </div>

                  {/* Add New Formula Inline Form */}
                  {showAddFormulaForm && (
                    <form className="inline-form-box" onSubmit={handleSaveNewFormula}>
                      <h4>Create New Master Formula</h4>
                      {formulaFormError && <Alert type="error">{formulaFormError}</Alert>}
                      <div className="form-grid-row">
                        <div>
                          <label className="field-label">Formula Name</label>
                          <input
                            type="text"
                            className="field-input"
                            placeholder="e.g. Master Wet Granulation Formula"
                            value={newFormulaData.name}
                            onChange={(e) =>
                              setNewFormulaData({ ...newFormulaData, name: e.target.value })
                            }
                            required
                          />
                        </div>

                        <div>
                          <label className="field-label">Base Quantity & Unit</label>
                          <div className="form-field-unit-group">
                            <input
                              type="number"
                              step="any"
                              min="0.0001"
                              className="field-input"
                              placeholder="e.g. 100"
                              value={newFormulaData.base_quantity}
                              onChange={(e) =>
                                setNewFormulaData({
                                  ...newFormulaData,
                                  base_quantity: e.target.value,
                                })
                              }
                              required
                            />
                            <select
                              value={newFormulaData.base_unit}
                              onChange={(e) =>
                                setNewFormulaData({
                                  ...newFormulaData,
                                  base_unit: e.target.value,
                                })
                              }
                            >
                              {SUPPORTED_UNITS.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.value}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="inline-form-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setShowAddFormulaForm(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit">Save Formula</Button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Choose Revision Row */}
                {activeFormula && (
                  <div className="formula-field-row">
                    <label>Choose Revision</label>
                    <div className="formula-dropdown-action-row">
                      <select
                        className="formula-select"
                        value={activeRevision?.id || ''}
                        onChange={(e) => handleSelectRevision(e.target.value)}
                      >
                        {activeFormula.revisions?.map((rev) => (
                          <option key={rev.id} value={rev.id}>
                            {rev.name}
                            {rev.description ? ` — ${rev.description}` : ''} ({rev.materials?.length || 0} materials)
                          </option>
                        ))}
                      </select>

                      <Button
                        variant="secondary"
                        onClick={() => setShowAddRevisionForm(!showAddRevisionForm)}
                      >
                        {showAddRevisionForm ? 'Cancel' : '+ Add New Revision'}
                      </Button>
                    </div>

                    {/* Add New Revision Inline Form */}
                    {showAddRevisionForm && (
                      <form className="inline-form-box" onSubmit={handleSaveNewRevision}>
                        <h4>Create New Revision for "{activeFormula.name}"</h4>
                        {revisionFormError && <Alert type="error">{revisionFormError}</Alert>}
                        <div className="form-grid-row">
                          <div>
                            <label className="field-label">Revision Code / Name</label>
                            <input
                              type="text"
                              className="field-input"
                              placeholder={`e.g. Rev ${String(
                                activeFormula.revisions?.length || 0
                              ).padStart(2, '0')}`}
                              value={newRevisionData.name}
                              onChange={(e) =>
                                setNewRevisionData({ ...newRevisionData, name: e.target.value })
                              }
                            />
                          </div>

                          <div>
                            <label className="field-label">Revision Description / Purpose</label>
                            <input
                              type="text"
                              className="field-input"
                              placeholder="e.g. Formulation optimized for disintegration"
                              value={newRevisionData.description}
                              onChange={(e) =>
                                setNewRevisionData({
                                  ...newRevisionData,
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        {activeRevision?.materials?.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              id="copyMatCheck"
                              checked={newRevisionData.copyCurrentMaterials}
                              onChange={(e) =>
                                setNewRevisionData({
                                  ...newRevisionData,
                                  copyCurrentMaterials: e.target.checked,
                                })
                              }
                            />
                            <label htmlFor="copyMatCheck" style={{ fontSize: '13px', cursor: 'pointer' }}>
                              Copy {activeRevision.materials.length} raw materials from{' '}
                              <strong>{activeRevision.name}</strong> into this new revision
                            </label>
                          </div>
                        )}

                        <div className="inline-form-actions">
                          <Button
                            variant="secondary"
                            onClick={() => setShowAddRevisionForm(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit">Create Revision</Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Step 1 Footer Action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <Button
                  onClick={() => setFormulaStep(2)}
                  disabled={!activeFormula || !activeRevision}
                >
                  Next: Raw Materials →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: RAW MATERIALS */}
          {formulaStep === 2 && activeFormula && activeRevision && (
            <div className="formula-step-card">
              <div className="formula-step-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3>Step 2: Raw Materials Specification</h3>
                  <p>
                    Formula: <strong>{activeFormula.name}</strong> • Active Revision:{' '}
                    <strong>{activeRevision.name}</strong> (Base: {activeFormula.base_quantity}{' '}
                    {activeFormula.base_unit})
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
              </div>

              {/* Add / Edit Raw Material Toolbar */}
              <form onSubmit={handleAddMaterial}>
                <div className="materials-entry-toolbar">
                  <div className="material-input-col">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Raw Material Name {editingMaterialId && '(Editing)'}
                    </label>
                    <input
                      type="text"
                      className="field-input"
                      list="common-materials-list"
                      placeholder="e.g. Paracetamol IP, Maize Starch, etc."
                      value={materialForm.name}
                      onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                    />
                    <datalist id="common-materials-list">
                      {COMMON_RAW_MATERIALS.map((mat) => (
                        <option key={mat} value={mat} />
                      ))}
                    </datalist>
                  </div>

                  <div className="material-qty-col">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Base Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.00001"
                      className="field-input"
                      placeholder="e.g. 50"
                      value={materialForm.base_quantity}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, base_quantity: e.target.value })
                      }
                    />
                  </div>

                  <div className="material-unit-col">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Unit
                    </label>
                    <select
                      className="field-input"
                      value={materialForm.unit}
                      onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })}
                    >
                      {SUPPORTED_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="material-btn-col">
                    {editingMaterialId ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="submit">Update</Button>
                        <Button variant="secondary" onClick={handleCancelEditMaterial}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button type="submit">+ Add New</Button>
                    )}
                  </div>
                </div>
              </form>

              {materialFormError && <Alert type="error">{materialFormError}</Alert>}

              {/* Raw Materials Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <table className="materials-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Raw Material Name</th>
                      <th>Base Quantity</th>
                      <th>Unit</th>
                      <th>% of Formula Base</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!activeRevision.materials || activeRevision.materials.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                          <div>No raw materials added to this revision yet.</div>
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            Use the form above to add API and excipients.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      activeRevision.materials.map((mat, idx) => {
                        const pct =
                          activeFormula.base_quantity > 0
                            ? (Number(mat.base_quantity) / Number(activeFormula.base_quantity)) * 100
                            : 0

                        return (
                          <tr key={mat.id}>
                            <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ fontWeight: 600, color: '#123f61' }}>{mat.name}</td>
                            <td>
                              <strong>{formatPharmaNumber(mat.base_quantity, 3)}</strong>
                            </td>
                            <td>
                              <span className="prd-code-tag">{mat.unit}</span>
                            </td>
                            <td>
                              {pct > 0 ? (
                                <span className="calc-share-badge">{pct.toFixed(2)}%</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn-action-edit"
                                  onClick={() => handleStartEditMaterial(mat)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-action-delete"
                                  onClick={() => setDeleteMaterialTarget(mat)}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Step 2 Footer Navigation */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '16px',
                  borderTop: '1px solid #f1f5f9',
                  marginTop: '16px',
                }}
              >
                <Button variant="secondary" onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
                <Button onClick={() => setFormulaStep(3)}>
                  Next: Calculation →
                </Button>
              </div>
            </div>
          )}

          {/* =========================================================
              STEP 3: BATCH CALCULATION
              ========================================================= */}
          {formulaStep === 3 && (!activeFormula || !activeRevision) && (
            <div className="formula-step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
              <h3 style={{ fontSize: '18px', color: '#123f61', marginBottom: '8px' }}>
                No Formula or Revision Selected
              </h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '480px', margin: '0 auto 20px auto' }}>
                Please select or create an approved Master Formula and Revision in Step 1 before calculating batch requirements.
              </p>
              <div>
                <Button onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
              </div>
            </div>
          )}

          {formulaStep === 3 && activeFormula && activeRevision && (!activeRevision.materials || activeRevision.materials.length === 0) && (
            <div className="formula-step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚖️</div>
              <h3 style={{ fontSize: '18px', color: '#123f61', marginBottom: '8px' }}>
                No Raw Materials Defined
              </h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '520px', margin: '0 auto 20px auto' }}>
                Formula <strong>{activeFormula.name}</strong> ({activeRevision.name}) has no raw materials defined yet. Add raw materials in Step 2 to generate live batch formulation calculations.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <Button variant="secondary" onClick={() => setFormulaStep(1)}>
                  ← Back to Step 1
                </Button>
                <Button onClick={() => setFormulaStep(2)}>
                  ← Back to Step 2 (Add Materials)
                </Button>
              </div>
            </div>
          )}

          {formulaStep === 3 && activeFormula && activeRevision && activeRevision.materials && activeRevision.materials.length > 0 && (
            <div className="calculation-master-card">
              <div className="calc-card-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                  <div className="calc-card-title">
                    <div className="calc-icon-badge">⚖️</div>
                    <div>
                      <h3>Step 3: Live Batch Formulation Calculation Engine</h3>
                      <p>
                        Precision stoichiometric scaling with automatic multi-unit conversion and best-fit representation.
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setFormulaStep(2)}>
                    ← Back to Step 2
                  </Button>
                </div>

                <div className="calc-context-pill-row">
                  <div className="calc-context-pill">
                    Product: <strong>{activeProduct.name}</strong>
                  </div>
                  <div className="calc-context-pill">
                    Formula: <strong>{activeFormula.name}</strong>
                  </div>
                  <div className="calc-context-pill">
                    Revision: <strong>{activeRevision.name}</strong>
                  </div>
                  <div className="calc-context-pill">
                    Formula Base: <strong>{activeFormula.base_quantity} {activeFormula.base_unit}</strong>
                  </div>
                </div>
              </div>

              {/* Batch Quantity Input Panel */}
              <div className="calc-input-panel">
                <div className="calc-batch-entry">
                  <span className="calc-batch-label">Required Batch Quantity:</span>
                  <div className="calc-batch-input-group">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      className="calc-batch-number-input"
                      value={requiredBatchQty}
                      onChange={(e) => setRequiredBatchQty(e.target.value)}
                      placeholder="e.g. 1"
                    />
                    <select
                      className="calc-unit-select"
                      value={requiredBatchUnit}
                      onChange={(e) => setRequiredBatchUnit(e.target.value)}
                    >
                      {SUPPORTED_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="calc-multiplier-badge">
                  <span className="scale-label">Batch Scale Factor</span>
                  <span className="scale-val">
                    {currentScaleFactor > 0 ? `${formatPharmaNumber(currentScaleFactor, 3)}×` : '—'}
                  </span>
                </div>
              </div>

              {/* Calculation Live Table */}
              <div className="calc-table-wrapper">
                <table className="calc-table">
                  <thead>
                    <tr>
                      <th>Material Name</th>
                      <th>Unit</th>
                      <th>Base Quantity</th>
                      <th>Required Quantity (Scaled)</th>
                      <th>Formulation Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedMaterials.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                          No raw materials defined in <strong>{activeRevision.name}</strong>. Add materials in Step 2 to generate live batch requirements.
                        </td>
                      </tr>
                    ) : (
                      calculatedMaterials.map((mat) => (
                        <tr key={mat.id}>
                          <td style={{ fontWeight: 600, color: '#123f61' }}>
                            {mat.name}
                          </td>
                          <td>
                            <span className="prd-code-tag">{mat.baseUnit}</span>
                          </td>
                          <td>
                            <strong>{mat.formattedBaseQuantity}</strong>
                          </td>
                          <td>
                            <div>
                              <span className="calc-qty-highlight">
                                {mat.bestFit.formatted}
                              </span>
                              {mat.bestFit.isDifferent && (
                                <span className="calc-qty-sub">
                                  ({mat.formattedRequiredQuantity})
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {mat.percentage !== null ? (
                              <span className="calc-share-badge">
                                {mat.percentage}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Calculation Summary Footer */}
              {calculatedMaterials.length > 0 && (
                <div className="calc-summary-footer">
                  <div>
                    Batch Target: <strong>{requiredBatchQty} {requiredBatchUnit}</strong> • Total Ingredients:{' '}
                    <strong>{calculatedMaterials.length} Materials</strong>
                  </div>
                  <div>
                    Formula: Required Qty = (Material Base Qty ÷ Formula Base Qty) × Required Batch Qty
                  </div>
                </div>
              )}

              {/* Step 3 Footer Navigation */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  paddingTop: '16px',
                  borderTop: '1px solid #e2e8f0',
                  marginTop: '16px',
                }}
              >
                <Button variant="secondary" onClick={() => setFormulaStep(2)}>
                  ← Back to Step 2
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          MODALS
          ========================================================= */}

      {/* Add / Edit Product Modal */}
      {productModalMode && (
        <Modal
          title={productModalMode === 'add' ? 'Add New Product' : 'Edit Product'}
          onClose={() => setProductModalMode(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setProductModalMode(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveProduct}>
                {productModalMode === 'add' ? 'Create Product' : 'Save Changes'}
              </Button>
            </div>
          }
        >
          <form className="pharma-modal-form" onSubmit={handleSaveProduct}>
            {modalError && <Alert type="error">{modalError}</Alert>}

            <div className="pharma-form-row">
              <label>
                Product Name <span className="req">*</span>
              </label>
              <input
                type="text"
                className="pharma-input"
                placeholder="e.g. Paracetamol Tablets"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                required
              />
            </div>

            <div className="pharma-form-row">
              <label>Product Code</label>
              <input
                type="text"
                className="pharma-input"
                value={productForm.code}
                readOnly
                title="Auto-generated pharmaceutical product code"
              />
            </div>

            <div className="pharma-form-row">
              <label>
                Dosage Form <span className="req">*</span>
              </label>
              <select
                className="pharma-select"
                value={productForm.dosage_form}
                onChange={(e) => setProductForm({ ...productForm, dosage_form: e.target.value })}
              >
                {DOSAGE_FORMS.map((df) => (
                  <option key={df} value={df}>
                    {df}
                  </option>
                ))}
              </select>
            </div>

            <div className="pharma-form-row">
              <label>
                Strength <span className="req">*</span>
              </label>
              <input
                type="text"
                className="pharma-input"
                placeholder="e.g. 500 mg or 125 mg / 5 mL"
                value={productForm.strength}
                onChange={(e) => setProductForm({ ...productForm, strength: e.target.value })}
                required
              />
            </div>

            <div className="pharma-form-row">
              <label>
                Pack Size <span className="req">*</span>
              </label>
              <input
                type="text"
                className="pharma-input"
                placeholder="e.g. 10x10 Tablets Blister or 100 mL Bottle"
                value={productForm.pack_size}
                onChange={(e) => setProductForm({ ...productForm, pack_size: e.target.value })}
                required
              />
            </div>

            <div className="pharma-form-row">
              <label>Description / Therapeutic Indication</label>
              <textarea
                className="pharma-textarea"
                placeholder="e.g. Analgesic and antipyretic oral solid dosage form."
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteProductTarget && (
        <Modal
          title="Delete Product"
          onClose={() => setDeleteProductTarget(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setDeleteProductTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteProduct}>
                Confirm Delete
              </Button>
            </div>
          }
        >
          <div>
            <p>
              Are you sure you want to delete product <strong>{deleteProductTarget.name}</strong> (
              {deleteProductTarget.code})?
            </p>
            <Alert type="warning">
              All master formulas, revisions, and raw material associations linked to this product will also be removed.
            </Alert>
          </div>
        </Modal>
      )}

      {/* Delete Material Confirmation Modal */}
      {deleteMaterialTarget && (
        <Modal
          title="Remove Raw Material"
          onClose={() => setDeleteMaterialTarget(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setDeleteMaterialTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteMaterial}>
                Remove
              </Button>
            </div>
          }
        >
          <p>
            Are you sure you want to remove <strong>{deleteMaterialTarget.name}</strong> ({deleteMaterialTarget.base_quantity}{' '}
            {deleteMaterialTarget.unit}) from <strong>{activeRevision?.name}</strong>?
          </p>
        </Modal>
      )}
    </div>
  )
}
