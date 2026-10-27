/**
 * Single Source of Truth Stock Selector & Calculation Engine
 *
 * Guarantees that stock numbers across Products, Common Inventory,
 * Stock Ledger, Orders, and Production are always strictly 100% consistent.
 */

export function getItemLedgerEntries(state, itemIdentifier) {
  const erp = state?.erp || state || {}
  const entries = Array.isArray(erp.stockLedgerEntries) ? erp.stockLedgerEntries : []
  if (!itemIdentifier) return entries

  const id = itemIdentifier.id ? String(itemIdentifier.id) : null
  const code = itemIdentifier.code ? String(itemIdentifier.code).trim().toLowerCase() : null
  const name = itemIdentifier.name ? String(itemIdentifier.name).trim().toLowerCase() : null

  return entries.filter((entry) => {
    if (id && String(entry.item_id) === id) return true
    if (code && String(entry.item_code).trim().toLowerCase() === code) return true
    if (name && String(entry.item_name).trim().toLowerCase() === name) return true
    return false
  })
}

export function getMaterialLedgerSummary(state, itemIdentifier, defaultStock = 0) {
  const entries = getItemLedgerEntries(state, itemIdentifier)

  let totalInward = 0
  let totalOutward = 0
  let runningBalance = 0

  if (entries.length === 0) {
    const fallback = Number(defaultStock) || 0
    return {
      totalInward: fallback,
      totalOutward: 0,
      availableQuantity: fallback,
      runningBalance: fallback,
      entries: [],
    }
  }

  // Chronological sort: date asc, then id asc
  const sorted = [...entries].sort((a, b) => {
    const da = a.date || ''
    const db = b.date || ''
    if (da !== db) return da.localeCompare(db)
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })

  const enrichedEntries = sorted.map((entry) => {
    if (entry.reversed) {
      return {
        ...entry,
        inwardQty: 0,
        outwardQty: 0,
        runningBalance,
      }
    }

    let inwardQty = 0
    let outwardQty = 0

    if (entry.type === 'OPENING' || entry.type === 'INWARD') {
      inwardQty = Number(entry.received_quantity) || 0
      totalInward += inwardQty
      runningBalance += inwardQty
    } else if (entry.type === 'OUTWARD') {
      outwardQty = Number(entry.issued_quantity) || 0
      totalOutward += outwardQty
      runningBalance -= outwardQty
    } else if (entry.type === 'ADJUSTMENT') {
      if (entry.physical_stock !== undefined && entry.physical_stock !== null) {
        const diff = Number(entry.physical_stock) - runningBalance
        runningBalance = Number(entry.physical_stock)
        if (diff >= 0) {
          inwardQty = diff
          totalInward += diff
        } else {
          outwardQty = Math.abs(diff)
          totalOutward += Math.abs(diff)
        }
      } else {
        const variance = Number(entry.variance) || 0
        runningBalance += variance
        if (variance >= 0) {
          inwardQty = variance
          totalInward += variance
        } else {
          outwardQty = Math.abs(variance)
          totalOutward += Math.abs(variance)
        }
      }
    }

    return {
      ...entry,
      inwardQty,
      outwardQty,
      runningBalance,
    }
  })

  const availableQuantity = Math.max(0, runningBalance)

  return {
    totalInward,
    totalOutward,
    availableQuantity,
    runningBalance,
    entries: enrichedEntries,
  }
}

export function calculateItemStockFromLedger(state, itemIdentifier, defaultStock = 0) {
  const summary = getMaterialLedgerSummary(state, itemIdentifier, defaultStock)
  return summary.availableQuantity
}

/**
 * Primary selector for an item's current available stock
 */
export function selectItemStock(state, itemIdentifier) {
  const erp = state?.erp || state || {}
  if (!itemIdentifier) return 0

  const id = itemIdentifier.id ? String(itemIdentifier.id) : null
  const code = itemIdentifier.code ? String(itemIdentifier.code).trim().toLowerCase() : null
  const name = itemIdentifier.name ? String(itemIdentifier.name).trim().toLowerCase() : null

  // Check Common Raw Materials
  const rawMaterials = Array.isArray(erp.commonRawMaterials) ? erp.commonRawMaterials : []
  const rawMatch = rawMaterials.find(
    (m) =>
      (id && String(m.id) === id) ||
      (code && String(m.code).trim().toLowerCase() === code) ||
      (name && String(m.name).trim().toLowerCase() === name)
  )

  // Check Common Products
  const products = Array.isArray(erp.commonProducts) ? erp.commonProducts : []
  const prodMatch = products.find(
    (p) =>
      (id && String(p.id) === id) ||
      (code && String(p.code).trim().toLowerCase() === code) ||
      (name && String(p.name).trim().toLowerCase() === name)
  )

  const defaultStock = rawMatch ? rawMatch.current_stock : prodMatch ? prodMatch.current_stock : 0

  return calculateItemStockFromLedger(state, itemIdentifier, defaultStock)
}

/**
 * Checks whether required stock is available (prevents negative stock)
 */
export function selectCanIssueStock(state, itemIdentifier, requiredQty) {
  const current = selectItemStock(state, itemIdentifier)
  const req = Number(requiredQty) || 0
  return {
    available: current,
    required: req,
    sufficient: current >= req,
    shortage: Math.max(0, req - current),
  }
}

/**
 * Calculate BOM formula requirements against current stock
 * and identify any raw material shortages.
 */
export function checkFormulaStockAvailability(state, formula, requiredBatchQty, requiredBatchUnit = 'kg') {
  if (!formula) {
    return {
      canProduce: false,
      error: 'Formula not provided',
      materials: [],
      hasShortage: true,
      totalShortageCount: 1,
    }
  }

  const fBaseQty = Number(formula.base_quantity) || 1
  const reqBatchQty = Number(requiredBatchQty) || 0

  if (reqBatchQty <= 0) {
    return {
      canProduce: false,
      error: 'Batch quantity must be greater than 0',
      materials: [],
      hasShortage: false,
      totalShortageCount: 0,
    }
  }

  const activeRevision = (formula.revisions && formula.revisions[formula.revisions.length - 1]) || {}
  const formulaMaterials = activeRevision.materials || []

  // Scale factor: requiredBatchQty / formulaBaseQty
  const scaleFactor = reqBatchQty / fBaseQty

  let hasShortage = false
  let totalShortageCount = 0

  const materialChecks = formulaMaterials.map((mat) => {
    const baseQty = Number(mat.base_quantity) || 0
    const requiredAmount = baseQty * scaleFactor

    // Look up material in common raw materials or items
    const availableStock = selectItemStock(state, {
      id: mat.id || mat.item_id,
      code: mat.code,
      name: mat.name,
    })

    const shortage = Math.max(0, requiredAmount - availableStock)
    const isSufficient = availableStock >= requiredAmount

    if (!isSufficient) {
      hasShortage = true
      totalShortageCount += 1
    }

    return {
      id: mat.id,
      name: mat.name,
      code: mat.code,
      unit: mat.unit || 'kg',
      baseQuantity: baseQty,
      requiredAmount,
      availableStock,
      shortage,
      isSufficient,
    }
  })

  return {
    canProduce: !hasShortage,
    hasShortage,
    totalShortageCount,
    scaleFactor,
    materials: materialChecks,
  }
}
