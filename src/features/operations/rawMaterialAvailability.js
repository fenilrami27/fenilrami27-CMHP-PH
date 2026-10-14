/**
 * CMHP Pharmaceutical ERP - Raw Material Auto-Fetch & Inventory Availability Check
 * 
 * Helper functions for:
 * 1. Finding APPROVED formula only (ignoring draft/unapproved).
 * 2. Scaling formula quantities by order quantity live.
 * 3. Unit normalization and dimension-aware conversion (mg <-> g <-> kg, ml <-> L).
 * 4. Cross-referencing current stock in Inventory (commonRawMaterials & Stock Ledger).
 * 5. Calculating shortage and determining "In Stock" vs "Not Available in Inventory".
 */

import {
  UNIT_TYPES,
  getUnitType,
  toDimensionBase,
  formatPharmaNumber,
} from '../products/formulaCalculation'

/**
 * Normalizes a unit string for safe matching (e.g. 'KG' -> 'kg', 'LTR' -> 'L', etc.)
 */
export function normalizeUnit(unit = '') {
  if (!unit) return 'kg'
  const u = String(unit).trim().toLowerCase()
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) return 'kg'
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(u)) return 'g'
  if (['mg', 'mgs', 'milligram', 'milligrams'].includes(u)) return 'mg'
  if (['l', 'ltr', 'ltrs', 'litre', 'liter', 'liters', 'litres'].includes(u)) return 'L'
  if (['ml', 'mls', 'milliliter', 'milliliters', 'millilitres'].includes(u)) return 'ml'
  if (['nos', 'box', 'boxes', 'pack', 'packs', 'pcs', 'piece', 'pieces'].includes(u)) return 'pcs'
  return unit
}

/**
 * Converts quantity from source unit to target unit if compatible dimension.
 * Falls back to direct quantity if unit types don't match mass/volume.
 */
export function convertQuantity(qty, fromUnit, toUnit) {
  const num = Number(qty) || 0
  const normFrom = normalizeUnit(fromUnit)
  const normTo = normalizeUnit(toUnit)

  if (normFrom === normTo) return num

  const fromType = getUnitType(normFrom)
  const toType = getUnitType(normTo)

  if (fromType === toType && fromType !== UNIT_TYPES.COUNT) {
    const inBase = toDimensionBase(num, normFrom)
    if (fromType === UNIT_TYPES.MASS) {
      if (normTo === 'kg') return inBase / 1000
      if (normTo === 'g') return inBase
      if (normTo === 'mg') return inBase * 1000
    }
    if (fromType === UNIT_TYPES.VOLUME) {
      if (normTo === 'L') return inBase / 1000
      if (normTo === 'ml') return inBase
    }
  }

  return num
}

/**
 * Looks up the single APPROVED formula for a product.
 * Strictly ignores draft, pending, or unapproved formulas.
 */
export function getApprovedFormula(product, formulaApprovals = [], formulas = []) {
  if (!product) return null

  const prodId = product.id !== undefined && product.id !== null ? String(product.id) : null
  const prodCode = product.code ? String(product.code).trim().toLowerCase() : null
  const prodName = product.name ? String(product.name).trim().toLowerCase() : null

  if (!prodId && !prodCode && !prodName) return null

  // 1. Look for an APPROVED record in formulaApprovals
  const approvedApproval = (formulaApprovals || []).find((a) => {
    if (!a || a.status !== 'APPROVED') return false
    const matchId = prodId && String(a.productId) === prodId
    const matchCode = prodCode && a.productCode && String(a.productCode).trim().toLowerCase() === prodCode
    const matchName = prodName && a.productName && String(a.productName).trim().toLowerCase() === prodName
    return Boolean(matchId || matchCode || matchName)
  })

  if (approvedApproval) {
    const rawMaterials = Array.isArray(approvedApproval.materials)
      ? approvedApproval.materials
      : []

    return {
      source: 'APPROVAL',
      id: approvedApproval.id,
      formulaId: approvedApproval.formulaId,
      name: approvedApproval.formulaName || approvedApproval.revisionName || 'Master Formula',
      revisionId: approvedApproval.revisionId || 'rev-00',
      revisionName: approvedApproval.revisionName || 'Approved Commercial Revision',
      baseQuantity: Number(approvedApproval.formulaBaseQuantity || approvedApproval.batchQuantity) || 100,
      baseUnit: approvedApproval.formulaBaseUnit || approvedApproval.batchUnit || 'kg',
      materials: rawMaterials.map((m, idx) => ({
        id: m.id || idx + 1,
        code: m.rmCode || m.rm_code || m.code || `RM-${idx + 1}`,
        name: m.name || m.materialName || 'Raw Material',
        unit: m.baseUnit || m.unit || 'kg',
        formulaQuantity: Number(m.baseQuantity ?? m.base_quantity ?? m.scaledQuantity ?? 0),
        labelClaim: m.labelClaim || m.label_claim || '',
        arNo: m.arNo || '',
      })),
    }
  }

  // 2. Fallback: check master formulas list with explicit approved status
  const matchedFormula = (formulas || []).find((f) => {
    if (!f) return false
    const matchId = prodId && String(f.product_id) === prodId
    const matchCode = prodCode && f.product_code && String(f.product_code).trim().toLowerCase() === prodCode
    const isAppr = f.status === 'APPROVED' || f.is_approved === true || f.approved === true
    return Boolean((matchId || matchCode) && isAppr)
  })

  if (matchedFormula) {
    const rev = Array.isArray(matchedFormula.revisions) && matchedFormula.revisions.length > 0
      ? matchedFormula.revisions[0]
      : null

    const rawMaterials = rev && Array.isArray(rev.materials)
      ? rev.materials
      : (Array.isArray(matchedFormula.materials) ? matchedFormula.materials : [])

    return {
      source: 'FORMULA_MASTER',
      id: matchedFormula.id,
      formulaId: matchedFormula.id,
      name: matchedFormula.name || 'Master Formula',
      revisionId: rev?.id || 'rev-00',
      revisionName: rev?.name || 'Approved Revision',
      baseQuantity: Number(matchedFormula.base_quantity) || 100,
      baseUnit: matchedFormula.base_unit || 'kg',
      materials: rawMaterials.map((m, idx) => ({
        id: m.id || idx + 1,
        code: m.rm_code || m.rmCode || m.code || `RM-${idx + 1}`,
        name: m.name || m.materialName || 'Raw Material',
        unit: m.unit || m.baseUnit || 'kg',
        formulaQuantity: Number(m.base_quantity ?? m.baseQuantity ?? 0),
        labelClaim: m.label_claim || m.labelClaim || '',
        arNo: m.ar_no || m.arNo || '',
      })),
    }
  }

  return null
}

/**
 * Scales formula materials according to order quantity / batch size.
 */
export function calculateRequiredMaterials({
  approvedFormula,
  orderQuantity = 100,
  batchSize = '',
}) {
  if (!approvedFormula || !Array.isArray(approvedFormula.materials)) {
    return []
  }

  const orderQtyNum = Math.max(0, Number(orderQuantity) || 0)
  const baseQty = Number(approvedFormula.baseQuantity) || 100

  // Calculate live scaling multiplier
  // Q_required = (m.formulaQuantity / baseQty) * orderQuantity
  const multiplier = baseQty > 0 ? orderQtyNum / baseQty : 0

  return approvedFormula.materials.map((mat) => {
    const fQty = Number(mat.formulaQuantity) || 0
    const reqQty = fQty * multiplier
    const roundedReq = Math.round(reqQty * 1000) / 1000

    return {
      ...mat,
      orderQuantity: orderQtyNum,
      multiplier,
      requiredQuantity: roundedReq,
      formattedFormulaQuantity: `${formatPharmaNumber(fQty, 3)} ${mat.unit}`,
      formattedRequiredQuantity: `${formatPharmaNumber(roundedReq, 3)} ${mat.unit}`,
    }
  })
}

/**
 * Checks inventory availability for each raw material against commonRawMaterials.
 * Single source of truth is Inventory.
 */
export function checkInventoryAvailability({
  requiredMaterials = [],
  commonRawMaterials = [],
  stockLedgerEntries = [],
}) {
  return requiredMaterials.map((mat) => {
    const reqQty = Number(mat.requiredQuantity) || 0
    const matCodeNorm = String(mat.code || '').trim().toLowerCase()
    const matNameNorm = String(mat.name || '').trim().toLowerCase()

    // Match in commonRawMaterials (Inventory)
    const matchedInInventory = (commonRawMaterials || []).find((invMat) => {
      const invCode = String(invMat.code || '').trim().toLowerCase()
      const invName = String(invMat.name || '').trim().toLowerCase()
      return (
        (invCode && invCode === matCodeNorm) ||
        (invName && invName === matNameNorm) ||
        (invName.includes(matNameNorm) || matNameNorm.includes(invName))
      )
    })

    let rawAvailableStock = 0
    let inventoryUnit = mat.unit

    if (matchedInInventory) {
      rawAvailableStock = Number(matchedInInventory.current_stock ?? 0)
      inventoryUnit = matchedInInventory.uom || matchedInInventory.unit || mat.unit
    }

    // Convert available stock to the material's formula unit if needed
    const availableInMatUnit = convertQuantity(rawAvailableStock, inventoryUnit, mat.unit)
    const availableStockRounded = Math.round(availableInMatUnit * 1000) / 1000

    const inStock = availableStockRounded >= reqQty
    const shortageQty = inStock ? 0 : Math.round(Math.max(0, reqQty - availableStockRounded) * 1000) / 1000

    return {
      ...mat,
      matchedInInventory: Boolean(matchedInInventory),
      inventoryItemCode: matchedInInventory?.code || null,
      inventoryItemName: matchedInInventory?.name || null,
      availableStock: availableStockRounded,
      formattedAvailableStock: `${formatPharmaNumber(availableStockRounded, 3)} ${mat.unit}`,
      shortageQuantity: shortageQty,
      formattedShortage: `${formatPharmaNumber(shortageQty, 3)} ${mat.unit}`,
      status: inStock ? 'IN_STOCK' : 'NOT_AVAILABLE',
      statusLabel: inStock ? 'In Stock' : 'Not Available in Inventory',
    }
  })
}
