/**
 * CMHP Pharmaceutical ERP - Central Document & Entity ID Generator
 *
 * Rules:
 * - Master entities (EMP, CUST, VEND, PROD, ITEM, LOC) are global continuous sequences.
 * - Transactional documents (INV, SO, QT, PO, GRN, BILL, BATCH, DSP, CN, LR, WO)
 *   are partitioned per company and calendar year.
 * - Sequence counters never decrement or repeat.
 */

export const DOCUMENT_CONFIGS = {
  // Master Entities (Global)
  EMPLOYEE: { prefix: 'EMP', padding: 4, includeYear: false, scopedByCompany: false },
  CUSTOMER: { prefix: 'CUST', padding: 4, includeYear: false, scopedByCompany: false },
  VENDOR: { prefix: 'VEND', padding: 4, includeYear: false, scopedByCompany: false },
  ITEM: { prefix: 'ITM', padding: 4, includeYear: false, scopedByCompany: false },
  PRODUCT: { prefix: 'PRD', padding: 4, includeYear: false, scopedByCompany: false },
  LOCATION: { prefix: 'LOC', padding: 4, includeYear: false, scopedByCompany: false },

  // Commercial & Sales (Per-Company, Per-Year)
  INVOICE: { prefix: 'INV', padding: 4, includeYear: true, scopedByCompany: true },
  SALES_ORDER: { prefix: 'SO', padding: 4, includeYear: true, scopedByCompany: true },
  QUOTATION: { prefix: 'QT', padding: 4, includeYear: true, scopedByCompany: true },
  CREDIT_NOTE: { prefix: 'CN', padding: 4, includeYear: true, scopedByCompany: true },
  DELIVERY: { prefix: 'DSP', padding: 4, includeYear: true, scopedByCompany: true },

  // Procurement & Supply Chain (Per-Company, Per-Year)
  PURCHASE_REQUEST: { prefix: 'PR', padding: 4, includeYear: true, scopedByCompany: true },
  PURCHASE_ORDER: { prefix: 'PO', padding: 4, includeYear: true, scopedByCompany: true },
  GRN: { prefix: 'GRN', padding: 4, includeYear: true, scopedByCompany: true },
  BILL: { prefix: 'BILL', padding: 4, includeYear: true, scopedByCompany: true },

  // Operations & Manufacturing (Per-Company, Per-Year)
  BATCH: { prefix: 'BAT', padding: 4, includeYear: true, scopedByCompany: true },
  WORK_ORDER: { prefix: 'WO', padding: 4, includeYear: true, scopedByCompany: true },

  // HRMS & Administration (Per-Company, Per-Year)
  LEAVE_REQUEST: { prefix: 'LR', padding: 4, includeYear: true, scopedByCompany: true },
  USER: { prefix: 'USR', padding: 4, includeYear: false, scopedByCompany: false },
};

const SEQUENCE_STORAGE_KEY = 'cmhp_document_sequences_v1';

/**
 * Reads sequence registry from localStorage.
 */
export function getSequenceRegistry() {
  try {
    const raw = localStorage.getItem(SEQUENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Could not read sequence storage:', error);
    return {};
  }
}

/**
 * Writes sequence registry to localStorage.
 */
export function saveSequenceRegistry(registry) {
  try {
    localStorage.setItem(SEQUENCE_STORAGE_KEY, JSON.stringify(registry));
  } catch (error) {
    console.warn('Could not save sequence storage:', error);
  }
}

/**
 * Builds sequence key.
 */
export function buildSequenceKey(docType, companyId = null, year = null) {
  const cfg = DOCUMENT_CONFIGS[docType];
  if (!cfg) throw new Error(`Unknown document type: ${docType}`);

  const parts = [docType];
  if (cfg.scopedByCompany && companyId) {
    parts.push(String(companyId).toUpperCase());
  } else if (cfg.scopedByCompany) {
    parts.push('GLOBAL');
  }

  if (cfg.includeYear) {
    parts.push(String(year || new Date().getFullYear()));
  }

  return parts.join(':');
}

/**
 * Formats a sequence number into the official document number string.
 */
export function formatDocumentNumber(docType, sequenceNumber, year = null) {
  const cfg = DOCUMENT_CONFIGS[docType];
  if (!cfg) throw new Error(`Unknown document type: ${docType}`);

  const paddedSeq = String(sequenceNumber).padStart(cfg.padding, '0');
  const targetYear = year || new Date().getFullYear();

  if (cfg.includeYear) {
    return `${cfg.prefix}-${targetYear}-${paddedSeq}`;
  }
  return `${cfg.prefix}-${paddedSeq}`;
}

/**
 * Returns the next available sequence value without advancing the counter.
 */
export function peekNextDocumentNumber(docType, companyId = null, year = null) {
  const registry = getSequenceRegistry();
  const key = buildSequenceKey(docType, companyId, year);
  const currentSeq = registry[key] || 0;
  const nextSeq = currentSeq + 1;
  return formatDocumentNumber(docType, nextSeq, year);
}

/**
 * Previews the next number (for display in open forms before submission).
 */
export function previewDocumentNumber(docType, companyId = null, year = null) {
  return peekNextDocumentNumber(docType, companyId, year);
}

/**
 * Finalizes and commits the document number, incrementing the persistent sequence counter.
 */
export function commitDocumentNumber(docType, companyId = null, year = null) {
  const registry = getSequenceRegistry();
  const key = buildSequenceKey(docType, companyId, year);
  const currentSeq = registry[key] || 0;
  const nextSeq = currentSeq + 1;

  registry[key] = nextSeq;
  saveSequenceRegistry(registry);

  return formatDocumentNumber(docType, nextSeq, year);
}

/**
 * Seeds and migrates initial sequences from existing records.
 */
export function migrateDocumentNumbers(entities = {}) {
  const registry = getSequenceRegistry();
  let changed = false;

  const checkMax = (list = [], docType, extractor) => {
    if (!Array.isArray(list) || !DOCUMENT_CONFIGS[docType]) return;
    const cfg = DOCUMENT_CONFIGS[docType];

    list.forEach((item) => {
      const val = extractor(item);
      if (!val || typeof val !== 'string') return;

      const regex = cfg.includeYear
        ? new RegExp(`^${cfg.prefix}-(\\d{4})-(\\d+)$`, 'i')
        : new RegExp(`^${cfg.prefix}-(\\d+)$`, 'i');

      const match = val.match(regex);
      if (match) {
        let yr = null;
        let seq = 0;
        if (cfg.includeYear) {
          yr = match[1];
          seq = parseInt(match[2], 10);
        } else {
          seq = parseInt(match[1], 10);
        }

        const compId = item.companyId || item.company_id || null;
        const key = buildSequenceKey(docType, compId, yr);
        const existing = registry[key] || 0;

        if (seq > existing) {
          registry[key] = seq;
          changed = true;
        }
      }
    });
  };

  if (entities.users) {
    checkMax(entities.users, 'EMPLOYEE', (u) => u.employee_id || u.employeeId);
  }
  if (entities.employees) {
    checkMax(entities.employees, 'EMPLOYEE', (e) => e.employee_id || e.employeeId || e.id);
  }
  if (entities.invoices) {
    checkMax(entities.invoices, 'INVOICE', (i) => i.invoice_number || i.invoiceNumber || i.id);
  }
  if (entities.customers) {
    checkMax(entities.customers, 'CUSTOMER', (c) => c.customer_id || c.customerId || c.id);
  }

  if (changed) {
    saveSequenceRegistry(registry);
  }
  return registry;
}