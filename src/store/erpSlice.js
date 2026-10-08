import { createSlice } from '@reduxjs/toolkit'


let lastGeneratedId =
  Date.now()


const nextId = () => {

  const now =
    Date.now()


  if (
    now >
    lastGeneratedId
  ) {

    lastGeneratedId =
      now

  } else {

    lastGeneratedId += 1

  }


  return lastGeneratedId

}


const nowIso = () =>
  new Date().toISOString()


function patchById(
  list,
  id,
  payload
) {

  const item =
    list.find(
      (x) =>
        Number(x.id) ===
        Number(id)
    )


  if (item) {

    Object.assign(
      item,
      payload
    )

  }

}


function deleteById(
  list,
  id
) {

  const index =
    list.findIndex(
      (x) =>
        Number(x.id) ===
        Number(id)
    )


  if (
    index !== -1
  ) {

    list.splice(
      index,
      1
    )

  }

}


function setStatusById(
  list,
  id,
  is_active
) {

  const item =
    list.find(
      (x) =>
        Number(x.id) ===
        Number(id)
    )


  if (item) {

    item.is_active =
      is_active

  }

}


/*
|--------------------------------------------------------------------------
| INITIAL STATE
|--------------------------------------------------------------------------
*/


export const initialState = {

  activeCompanyId: null,

  /*
  |--------------------------------------------------------------------------
  | FIXED COMPANIES
  |--------------------------------------------------------------------------
  */

  companies: [

    {
      id: 1,
      name: 'CMHP Pharma',
      legal_name: 'CMHP Pharmaceuticals Pvt. Ltd.',
      code: 'CMHP',
      gstin: '24AAACC1234F1Z5',
      pan: 'AAACC1234F',
      state: 'Gujarat',
      state_code: '24',
      registered_address: 'Plot No. 102, GIDC Industrial Estate, Ankleshwar, Gujarat, India - 393002',
      contact_email: 'billing@cmhp.com',
      contact_phone: '+91 98765 43210',
      bank_name: 'State Bank of India',
      bank_account_number: '38491029384',
      bank_ifsc: 'SBIN0001234',
      bank_branch: 'GIDC Ankleshwar',
      terms_and_conditions: '1. Goods once sold will not be accepted back.\n2. Interest @18% p.a. will be charged on overdue payments.\n3. Subject to Ankleshwar jurisdiction.',
      tax_enabled: true,
      default_tax_rate: 18,
      is_active: true,
    },

    {
      id: 2,
      name: 'Tej Biocare',
      legal_name: 'Tej Biocare Healthcare Pvt. Ltd.',
      code: 'TEJ',
      gstin: '24BBBCC5678G1Z2',
      pan: 'BBBCC5678G',
      state: 'Gujarat',
      state_code: '24',
      registered_address: 'Survey No. 45/2, Chhatral GIDC, Gandhinagar, Gujarat, India - 382729',
      contact_email: 'accounts@tejbiocare.com',
      contact_phone: '+91 98765 99999',
      bank_name: 'HDFC Bank',
      bank_account_number: '50200012345678',
      bank_ifsc: 'HDFC0001824',
      bank_branch: 'Gandhinagar',
      terms_and_conditions: '1. Payment due as per agreed terms.\n2. Goods dispatched at buyer\'s risk.\n3. Subject to Gandhinagar jurisdiction.',
      tax_enabled: true,
      default_tax_rate: 18,
      is_active: true,
    },

  ],


  /*
  |--------------------------------------------------------------------------
  | SYSTEM / ADMINISTRATION
  |--------------------------------------------------------------------------
  */

  departments: [],


  users: [

    {
      id: 1,

      username:
        'admin',

      password:
        'admin123',

      first_name:
        'Fenil',

      last_name:
        'Rami',

      email:
        'admin@cmhp.com',

      role:
        'SUPER_ADMIN',

      companies:
        [1, 2],

      department:
        null,

      employee_id:
        'EMP-0001',

      designation:
        'System Administrator',

      phone:
        '',

      joining_date:
        '',

      employment_status:
        'ACTIVE',

      can_access_common_inventory:
        true,

      is_active:
        true,

    },

  ],


  /*
  |--------------------------------------------------------------------------
  | UOM
  |--------------------------------------------------------------------------
  */

  uoms: [

    {
      id: 1,
      code: 'KG',
      name: 'Kilogram',
      is_active: true,
    },

    {
      id: 2,
      code: 'GM',
      name: 'Gram',
      is_active: true,
    },

    {
      id: 3,
      code: 'LTR',
      name: 'Litre',
      is_active: true,
    },

    {
      id: 4,
      code: 'NOS',
      name: 'Numbers',
      is_active: true,
    },

    {
      id: 5,
      code: 'BOX',
      name: 'Box',
      is_active: true,
    },

  ],


  /*
  |--------------------------------------------------------------------------
  | INVENTORY
  |--------------------------------------------------------------------------
  */

  locations: [],

  items: [],

  lots: [],

  transactions: [],


  /*
  |--------------------------------------------------------------------------
  | OPERATIONS
  |--------------------------------------------------------------------------
  */

  products: [],

  customers: [],

  formulas: [],

  qcRecords: [],

  qaRecords: [],

  payments: [],

  payrollRuns: [],

  payrollAdjustments: [],

  attendanceRegularizations: [],

  payrollSettings: {
    pf_enabled: true,
    pf_rate: 12,
    pf_cap: 15000,
    esi_enabled: true,
    esi_rate: 0.75,
    esi_threshold: 21000,
    pt_enabled: true,
    pt_amount: 200,
  },

  quotations: [],

  orders: [],

  batches: [],


  /*
  |--------------------------------------------------------------------------
  | INVOICING
  |--------------------------------------------------------------------------
  */

  invoices: [],


  /*
  |--------------------------------------------------------------------------
  | SUPPLY CHAIN
  |--------------------------------------------------------------------------
  */

  suppliers: [],

  purchaseOrders: [],

  goodsReceipts: [],

  purchaseBills: [],

  internalAllocations: [],

  dispatches: [],

  salesReturns: [],

  recalls: [],

  creditNotes: [],


  /*
  |--------------------------------------------------------------------------
  | HRMS MASTERS
  |--------------------------------------------------------------------------
  */

  designations: [],

  shifts: [],

  holidays: [],

  leaveTypes: [],


  /*
  |--------------------------------------------------------------------------
  | HRMS ATTENDANCE / LEAVE
  |--------------------------------------------------------------------------
  */

  attendance: [],

  leaveRequests: [],


  /*
  |--------------------------------------------------------------------------
  | PAYROLL
  |--------------------------------------------------------------------------
  */

  salaryStructures: [],

}


const erpSlice = createSlice({

  name:
    'erp',

  initialState,


  reducers: {


    /*
    |--------------------------------------------------------------------------
    | COMPANIES
    |--------------------------------------------------------------------------
    */


    setActiveCompanyId: (
      state,
      action
    ) => {
      state.activeCompanyId = action.payload
    },

    editCompany: (
      state,
      action
    ) => {

      patchById(

        state.companies,

        action.payload.id,

        action.payload.payload

      )

    },


    setCompanyStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.companies,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | DEPARTMENTS
    |--------------------------------------------------------------------------
    */


    addDepartment: (
      state,
      action
    ) => {

      state.departments.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editDepartment: (
      state,
      action
    ) => {

      patchById(

        state.departments,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteDepartment: (
      state,
      action
    ) => {

      deleteById(

        state.departments,

        action.payload.id

      )

    },


    setDepartmentStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.departments,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | USERS
    |--------------------------------------------------------------------------
    */


    addUser: (
      state,
      action
    ) => {

      state.users.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editUserAccess: (
      state,
      action
    ) => {

      patchById(

        state.users,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteUser: (
      state,
      action
    ) => {

      deleteById(

        state.users,

        action.payload.id

      )

    },


    setUserStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.users,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | LOCATIONS
    |--------------------------------------------------------------------------
    */


    addLocation: (
      state,
      action
    ) => {

      state.locations.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editLocation: (
      state,
      action
    ) => {

      patchById(

        state.locations,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteLocation: (
      state,
      action
    ) => {

      deleteById(

        state.locations,

        action.payload.id

      )

    },


    setLocationStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.locations,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | ITEMS
    |--------------------------------------------------------------------------
    */


    addItem: (
      state,
      action
    ) => {

      state.items.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editItem: (
      state,
      action
    ) => {

      patchById(

        state.items,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteItem: (
      state,
      action
    ) => {

      deleteById(

        state.items,

        action.payload.id

      )

    },


    setItemStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.items,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | RECEIVE STOCK
    |--------------------------------------------------------------------------
    */


    receiveStock: (
      state,
      action
    ) => {

      const p =
        action.payload


      const quantity =
        Number(
          p.received_quantity
        )


      if (!p.item) {

        return

      }


      if (!p.location) {

        return

      }


      if (!p.lot_number) {

        return

      }


      if (
        !Number.isFinite(
          quantity
        ) ||
        quantity <= 0
      ) {

        return

      }


      const lotId =
        nextId()


      state.lots.push({

        id:
          lotId,

        item:
          Number(
            p.item
          ),

        lot_number:
          p.lot_number,

        location:
          Number(
            p.location
          ),

        qc_status:
          'PENDING',

        qc_reason:
          '',

        expiry_date:
          p.expiry_date ||
          null,

        manufacture_date:
          p.manufacture_date ||
          null,

        received_quantity:
          quantity,

        available_quantity:
          quantity,

        supplier:
          p.supplier
            ? Number(
                p.supplier
              )
            : null,

        supplier_name:
          p.supplier_name ||
          '',

        created_at:
          nowIso(),

      })


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'RECEIPT',

        item:
          Number(
            p.item
          ),

        lot:
          lotId,

        quantity,

        company:
          null,

        reference_note:
          p.reference_note ||
          '',

        created_by:
          p.created_by ||
          'system',

        created_at:
          nowIso(),

      })

    },


    /*
    |--------------------------------------------------------------------------
    | LOT QC
    |--------------------------------------------------------------------------
    */


    setLotQcStatus: (
      state,
      action
    ) => {

      const {
        lotId,
        to_status,
        reason,
      } = action.payload


      const lot =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lotId)
        )


      if (!lot) {

        return

      }


      lot.qc_status =
        to_status

      lot.qc_reason =
        reason || ''

    },


    /*
    |--------------------------------------------------------------------------
    | ISSUE STOCK
    |--------------------------------------------------------------------------
    */


    issueStock: (
      state,
      action
    ) => {

      const {
        lot,
        company,
        quantity,
        reference_note,
      } = action.payload


      const qty =
        Number(
          quantity
        )


      const lotObj =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lot)
        )


      if (!lotObj) {

        return

      }


      if (
        !Number.isFinite(qty) ||
        qty <= 0
      ) {

        return

      }


      const available =
        Number(
          lotObj.available_quantity
        ) || 0


      if (
        qty >
        available
      ) {

        return

      }


      lotObj.available_quantity =
        available - qty


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'ISSUE',

        item:
          lotObj.item,

        lot:
          Number(
            lot
          ),

        quantity:
          qty,

        company:
          company
            ? Number(
                company
              )
            : null,

        reference_note:
          reference_note ||
          '',

        created_by:
          'system',

        created_at:
          nowIso(),

      })

    },


    /*
    |--------------------------------------------------------------------------
    | RETURN STOCK
    |--------------------------------------------------------------------------
    */


    returnStock: (
      state,
      action
    ) => {

      const {
        lot,
        company,
        quantity,
        reference_note,
      } = action.payload


      const qty =
        Number(
          quantity
        )


      const lotObj =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lot)
        )


      if (!lotObj) {

        return

      }


      if (
        !Number.isFinite(qty) ||
        qty <= 0
      ) {

        return

      }


      lotObj.available_quantity =
        Number(
          lotObj.available_quantity
        ) +
        qty


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'RETURN',

        item:
          lotObj.item,

        lot:
          Number(
            lot
          ),

        quantity:
          qty,

        company:
          company
            ? Number(
                company
              )
            : null,

        reference_note:
          reference_note ||
          '',

        created_by:
          'system',

        created_at:
          nowIso(),

      })

    },


    /*
    |--------------------------------------------------------------------------
    | STOCK ADJUSTMENT
    |--------------------------------------------------------------------------
    */


    adjustStock: (
      state,
      action
    ) => {

      const {
        lot,
        quantity,
        reference_note,
      } = action.payload


      const qty =
        Number(
          quantity
        )


      const lotObj =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lot)
        )


      if (!lotObj) {

        return

      }


      if (
        !Number.isFinite(qty)
      ) {

        return

      }


      const current =
        Number(
          lotObj.available_quantity
        ) || 0


      const next =
        current +
        qty


      if (
        next < 0
      ) {

        return

      }


      lotObj.available_quantity =
        next


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'ADJUSTMENT',

        item:
          lotObj.item,

        lot:
          Number(
            lot
          ),

        quantity:
          qty,

        company:
          null,

        reference_note:
          reference_note ||
          '',

        created_by:
          'system',

        created_at:
          nowIso(),

      })

    },


    /*
    |--------------------------------------------------------------------------
    | PRODUCTS
    |--------------------------------------------------------------------------
    */


    addProduct: (
      state,
      action
    ) => {

      state.products.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editProduct: (
      state,
      action
    ) => {

      patchById(

        state.products,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteProduct: (
      state,
      action
    ) => {

      deleteById(

        state.products,

        action.payload.id

      )

      state.formulas = state.formulas.filter(
        (f) => String(f.product_id) !== String(action.payload.id)
      )

    },


    saveProductLastSelection: (
      state,
      action
    ) => {

      const { productId, formulaId, revisionId } = action.payload || {}

      const prod = state.products.find(
        (p) => String(p.id) === String(productId)
      )

      if (prod) {
        if (formulaId !== undefined) prod.last_formula_id = formulaId
        if (revisionId !== undefined) prod.last_revision_id = revisionId
      }

    },


    /*
    |--------------------------------------------------------------------------
    | CUSTOMERS
    |--------------------------------------------------------------------------
    */


    addCustomer: (
      state,
      action
    ) => {

      state.customers.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editCustomer: (
      state,
      action
    ) => {

      patchById(

        state.customers,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteCustomer: (
      state,
      action
    ) => {

      deleteById(

        state.customers,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | FORMULAS
    |--------------------------------------------------------------------------
    */


    addFormula: (
      state,
      action
    ) => {

      state.formulas.push({

        id:
          nextId(),

        revisions: [],

        ...action.payload,

      })

    },


    saveFormula: (
      state,
      action
    ) => {

      const { id, product_id, name, base_quantity, base_unit, revisions } = action.payload || {}

      const existing = state.formulas.find(
        (f) => String(f.id) === String(id)
      )

      if (existing) {
        if (name !== undefined) existing.name = name
        if (base_quantity !== undefined) existing.base_quantity = Number(base_quantity)
        if (base_unit !== undefined) existing.base_unit = base_unit
        if (revisions !== undefined) existing.revisions = revisions
      } else {
        state.formulas.push({
          id: id || nextId(),
          product_id: Number(product_id) || product_id,
          name: name || 'Standard Formula',
          base_quantity: Number(base_quantity) || 100,
          base_unit: base_unit || 'g',
          revisions: revisions || [
            {
              id: 'rev-00',
              name: 'Rev 00',
              description: 'Initial revision',
              created_at: nowIso(),
              materials: [],
            },
          ],
        })
      }

    },


    editFormula: (
      state,
      action
    ) => {

      patchById(

        state.formulas,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteFormula: (
      state,
      action
    ) => {

      deleteById(

        state.formulas,

        action.payload.id

      )

    },


    addFormulaRevision: (
      state,
      action
    ) => {

      const { formulaId, revision } = action.payload || {}

      const formula = state.formulas.find(
        (f) => String(f.id) === String(formulaId)
      )

      if (formula) {
        if (!Array.isArray(formula.revisions)) {
          formula.revisions = []
        }
        formula.revisions.push(revision)
      }

    },


    saveRevisionMaterials: (
      state,
      action
    ) => {

      const { formulaId, revisionId, materials } = action.payload || {}

      const formula = state.formulas.find(
        (f) => String(f.id) === String(formulaId)
      )

      if (formula && Array.isArray(formula.revisions)) {
        const rev = formula.revisions.find(
          (r) => String(r.id) === String(revisionId)
        )
        if (rev) {
          rev.materials = materials || []
        }
      }

    },


    deleteFormulaRevision: (
      state,
      action
    ) => {

      const { formulaId, revisionId } = action.payload || {}

      const formula = state.formulas.find(
        (f) => String(f.id) === String(formulaId)
      )

      if (formula && Array.isArray(formula.revisions)) {
        formula.revisions = formula.revisions.filter(
          (r) => String(r.id) !== String(revisionId)
        )
      }

    },


    /*
    |--------------------------------------------------------------------------
    | QUOTATIONS
    |--------------------------------------------------------------------------
    */


    addQuotation: (
      state,
      action
    ) => {

      state.quotations.push({

        id:
          nextId(),

        status:
          'DRAFT',

        lines:
          [],

        ...action.payload,

      })

    },


    deleteQuotation: (
      state,
      action
    ) => {

      deleteById(

        state.quotations,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | ORDERS
    |--------------------------------------------------------------------------
    |
    | NEW:
    |
    | editOrder
    |
    | This reducer is used by OperationsService after
    | the service has already filtered the fields according
    | to the current user's role.
    |
    */


    addOrder: (
      state,
      action
    ) => {

      state.orders.push({

        id:
          nextId(),

        status:
          'CONFIRMED',

        lines:
          [],

        ...action.payload,

      })

    },


    editOrder: (
      state,
      action
    ) => {

      patchById(

        state.orders,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteOrder: (
      state,
      action
    ) => {

      deleteById(

        state.orders,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | BATCHES
    |--------------------------------------------------------------------------
    */


    addBatch: (
      state,
      action
    ) => {

      state.batches.push({

        id:
          nextId(),

        produced_quantity:
          0,

        qc_status:
          'PENDING',

        qa_status:
          'PENDING',

        status:
          'IN_PROGRESS',

        material_consumption:
          [],

        qc_history:
          [],

        qa_history:
          [],

        ...action.payload,

      })

    },


    editBatch: (
      state,
      action
    ) => {

      patchById(

        state.batches,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteBatch: (
      state,
      action
    ) => {

      deleteById(

        state.batches,

        action.payload.id

      )

    },


    consumeBatchMaterial: (
      state,
      action
    ) => {

      const {
        batchId,
        lot,
        quantity,
      } =
        action.payload


      const qty =
        Number(
          quantity
        )


      const batch =
        state.batches.find(
          (x) =>
            Number(x.id) ===
            Number(batchId)
        )


      const lotObj =
        state.lots.find(
          (x) =>
            Number(x.id) ===
            Number(lot)
        )


      if (
        !batch ||
        !lotObj
      ) {

        return

      }


      if (
        !Number.isFinite(qty) ||
        qty <= 0
      ) {

        return

      }


      const available =
        Number(
          lotObj.available_quantity
        ) || 0


      if (
        qty >
        available
      ) {

        return

      }


      lotObj.available_quantity =
        available -
        qty


      batch.material_consumption.push({

        item:
          lotObj.item,

        lot:
          Number(
            lot
          ),

        lot_number:
          lotObj.lot_number ||
          '',

        quantity:
          qty,

        issued_at:
          nowIso(),

      })


      state.transactions.unshift({

        id:
          nextId(),

        transaction_type:
          'ISSUE',

        item:
          lotObj.item,

        lot:
          Number(
            lot
          ),

        quantity:
          qty,

        company:
          batch.company ||
          null,

        reference_note:
          `Consumed by batch ${
            batch.number || ''
          }`,

        created_by:
          'system',

        created_at:
          nowIso(),

      })

    },


    setBatchQc: (
      state,
      action
    ) => {

      const {
        batchId,
        decision,
        remarks,
      } =
        action.payload


      const batch =
        state.batches.find(
          (x) =>
            Number(x.id) ===
            Number(batchId)
        )


      if (!batch) {

        return

      }


      batch.qc_status =
        decision ===
        'APPROVE'
          ? 'APPROVED'
          : 'REJECTED'


      batch.qc_history.push({

        decision:
          batch.qc_status,

        remarks:
          remarks || '',

        by:
          'Current user',

        at:
          nowIso(),

      })

    },


    setBatchQa: (
      state,
      action
    ) => {

      const {
        batchId,
        decision,
        remarks,
      } =
        action.payload


      const batch =
        state.batches.find(
          (x) =>
            Number(x.id) ===
            Number(batchId)
        )


      if (!batch) {

        return

      }


      batch.qa_status =
        decision ===
        'RELEASE'
          ? 'RELEASED'
          : 'HOLD'


      batch.qa_history.push({

        decision:
          batch.qa_status,

        remarks:
          remarks || '',

        by:
          'Current user',

        at:
          nowIso(),

      })


      if (
        batch.qa_status ===
        'RELEASED'
      ) {

        batch.status =
          'COMPLETED'

      }

    },


    /*
    |--------------------------------------------------------------------------
    | INVOICES
    |--------------------------------------------------------------------------
    */


    addInvoice: (
      state,
      action
    ) => {

      state.invoices.push({

        id:
          nextId(),

        status:
          'DRAFT',

        ...action.payload,

      })

    },


    editInvoice: (
      state,
      action
    ) => {

      patchById(

        state.invoices,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteInvoice: (
      state,
      action
    ) => {

      deleteById(

        state.invoices,

        action.payload.id

      )

    },


    setInvoiceStatus: (
      state,
      action
    ) => {

      const {
        id,
        status,
        paid_on,
      } =
        action.payload


      const invoice =
        state.invoices.find(
          (x) =>
            Number(x.id) ===
            Number(id)
        )


      if (!invoice) {

        return

      }


      invoice.status =
        status


      if (paid_on) {

        invoice.paid_on =
          paid_on

      }

    },

    setOrderStatus: (
      state,
      action
    ) => {
      const order = state.orders.find(
        (o) => Number(o.id) === Number(action.payload.id)
      )
      if (order) {
        order.status = action.payload.status
        if (action.payload.qc_status) order.qc_status = action.payload.qc_status
        if (action.payload.qa_status) order.qa_status = action.payload.qa_status
        if (action.payload.invoiced_qty !== undefined) order.invoiced_qty = action.payload.invoiced_qty
      }
    },

    addQcRecord: (
      state,
      action
    ) => {
      state.qcRecords.push({
        id: nextId(),
        created_at: new Date().toISOString(),
        ...action.payload,
      })
    },

    editQcRecord: (
      state,
      action
    ) => {
      patchById(
        state.qcRecords,
        action.payload.id,
        action.payload.payload
      )
    },

    addQaRecord: (
      state,
      action
    ) => {
      state.qaRecords.push({
        id: nextId(),
        created_at: new Date().toISOString(),
        ...action.payload,
      })
    },

    editQaRecord: (
      state,
      action
    ) => {
      patchById(
        state.qaRecords,
        action.payload.id,
        action.payload.payload
      )
    },

    addPaymentRecord: (
      state,
      action
    ) => {
      state.payments.push({
        id: nextId(),
        created_at: new Date().toISOString(),
        ...action.payload,
      })
    },


    /*
    |--------------------------------------------------------------------------
    | SUPPLIERS
    |--------------------------------------------------------------------------
    */


    addSupplier: (
      state,
      action
    ) => {

      state.suppliers.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editSupplier: (
      state,
      action
    ) => {

      patchById(

        state.suppliers,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteSupplier: (
      state,
      action
    ) => {

      deleteById(

        state.suppliers,

        action.payload.id

      )

    },


    setSupplierStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.suppliers,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | PURCHASE ORDERS
    |--------------------------------------------------------------------------
    */


    addPurchaseOrder: (
      state,
      action
    ) => {

      state.purchaseOrders.push({

        id:
          nextId(),

        status:
          'DRAFT',

        lines:
          [],

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    editPurchaseOrder: (
      state,
      action
    ) => {

      patchById(

        state.purchaseOrders,

        action.payload.id,

        action.payload.payload

      )

    },


    deletePurchaseOrder: (
      state,
      action
    ) => {

      deleteById(

        state.purchaseOrders,

        action.payload.id

      )

    },


    approvePurchaseOrder: (
      state,
      action
    ) => {

      const po =
        state.purchaseOrders.find(
          (x) =>
            Number(x.id) ===
            Number(
              action.payload.id
            )
        )


      if (!po) {

        return

      }


      po.status =
        'APPROVED'

      po.approved_at =
        nowIso()

      po.approved_by =
        action.payload.actor_name ||
        'Current user'

    },


    cancelPurchaseOrder: (
      state,
      action
    ) => {

      const po =
        state.purchaseOrders.find(
          (x) =>
            Number(x.id) ===
            Number(
              action.payload.id
            )
        )


      if (!po) {

        return

      }


      po.status =
        'CANCELLED'

      po.cancelled_at =
        nowIso()

      po.cancelled_by =
        action.payload.actor_name ||
        'Current user'

    },


    /*
    |--------------------------------------------------------------------------
    | GOODS RECEIPTS
    |--------------------------------------------------------------------------
    */


    addGoodsReceipt: (
      state,
      action
    ) => {

      state.goodsReceipts.push({

        id:
          nextId(),

        status:
          'RECEIVED',

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    editGoodsReceipt: (
      state,
      action
    ) => {

      patchById(

        state.goodsReceipts,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteGoodsReceipt: (
      state,
      action
    ) => {

      deleteById(

        state.goodsReceipts,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | PURCHASE BILLS
    |--------------------------------------------------------------------------
    */


    addPurchaseBill: (
      state,
      action
    ) => {

      state.purchaseBills.push({

        id:
          nextId(),

        status:
          'DRAFT',

        paid_amount:
          0,

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    editPurchaseBill: (
      state,
      action
    ) => {

      patchById(

        state.purchaseBills,

        action.payload.id,

        action.payload.payload

      )

    },


    deletePurchaseBill: (
      state,
      action
    ) => {

      deleteById(

        state.purchaseBills,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | INTERNAL ALLOCATION
    |--------------------------------------------------------------------------
    */


    addInternalAllocation: (
      state,
      action
    ) => {

      state.internalAllocations.push({

        id:
          nextId(),

        status:
          'ALLOCATED',

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    deleteInternalAllocation: (
      state,
      action
    ) => {

      deleteById(

        state.internalAllocations,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | DISPATCH
    |--------------------------------------------------------------------------
    */


    addDispatch: (
      state,
      action
    ) => {

      state.dispatches.push({

        id:
          nextId(),

        status:
          'DRAFT',

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    editDispatch: (
      state,
      action
    ) => {

      patchById(

        state.dispatches,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteDispatch: (
      state,
      action
    ) => {

      deleteById(

        state.dispatches,

        action.payload.id

      )

    },


    setDispatchStatus: (
      state,
      action
    ) => {

      const dispatch =
        state.dispatches.find(
          (x) =>
            Number(x.id) ===
            Number(
              action.payload.id
            )
        )


      if (dispatch) {

        dispatch.status =
          action.payload.status

      }

    },


    /*
    |--------------------------------------------------------------------------
    | SALES RETURNS
    |--------------------------------------------------------------------------
    */


    addSalesReturn: (
      state,
      action
    ) => {

      state.salesReturns.push({

        id:
          nextId(),

        status:
          'PENDING',

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    decideSalesReturn: (
      state,
      action
    ) => {

      const row =
        state.salesReturns.find(
          (x) =>
            Number(x.id) ===
            Number(
              action.payload.id
            )
        )


      if (!row) {

        return

      }


      row.status =
        action.payload.status

      row.decision_reason =
        action.payload.reason ||
        ''

      row.decided_at =
        nowIso()

    },


    deleteSalesReturn: (
      state,
      action
    ) => {

      deleteById(

        state.salesReturns,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | RECALLS
    |--------------------------------------------------------------------------
    */


    addRecall: (
      state,
      action
    ) => {

      state.recalls.push({

        id:
          nextId(),

        status:
          'OPEN',

        returned_quantity:
          0,

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    logRecallReturn: (
      state,
      action
    ) => {

      const recall =
        state.recalls.find(
          (x) =>
            Number(x.id) ===
            Number(
              action.payload.id
            )
        )


      if (!recall) {

        return

      }


      const qty =
        Number(
          action.payload.quantity
        ) || 0


      if (
        qty <= 0
      ) {

        return

      }


      recall.returned_quantity =
        Number(
          recall.returned_quantity
        ) +
        qty

    },


    closeRecall: (
      state,
      action
    ) => {

      const recall =
        state.recalls.find(
          (x) =>
            Number(x.id) ===
            Number(
              action.payload.id
            )
        )


      if (!recall) {

        return

      }


      recall.status =
        'CLOSED'

      recall.closed_at =
        nowIso()

    },


    deleteRecall: (
      state,
      action
    ) => {

      deleteById(

        state.recalls,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | CREDIT NOTES
    |--------------------------------------------------------------------------
    */


    addCreditNote: (
      state,
      action
    ) => {

      state.creditNotes.push({

        id:
          nextId(),

        status:
          'DRAFT',

        created_at:
          nowIso(),

        ...action.payload,

      })

    },


    deleteCreditNote: (
      state,
      action
    ) => {

      deleteById(

        state.creditNotes,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - DESIGNATIONS
    |--------------------------------------------------------------------------
    */


    addDesignation: (
      state,
      action
    ) => {

      state.designations.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editDesignation: (
      state,
      action
    ) => {

      patchById(

        state.designations,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteDesignation: (
      state,
      action
    ) => {

      deleteById(

        state.designations,

        action.payload.id

      )

    },


    setDesignationStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.designations,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - SHIFTS
    |--------------------------------------------------------------------------
    */


    addShift: (
      state,
      action
    ) => {

      state.shifts.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editShift: (
      state,
      action
    ) => {

      patchById(

        state.shifts,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteShift: (
      state,
      action
    ) => {

      deleteById(

        state.shifts,

        action.payload.id

      )

    },


    setShiftStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.shifts,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - HOLIDAYS
    |--------------------------------------------------------------------------
    */


    addHoliday: (
      state,
      action
    ) => {

      state.holidays.push({

        id:
          nextId(),

        ...action.payload,

      })

    },


    editHoliday: (
      state,
      action
    ) => {

      patchById(

        state.holidays,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteHoliday: (
      state,
      action
    ) => {

      deleteById(

        state.holidays,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - LEAVE TYPES
    |--------------------------------------------------------------------------
    */


    addLeaveType: (
      state,
      action
    ) => {

      state.leaveTypes.push({

        id:
          nextId(),

        is_active:
          true,

        ...action.payload,

      })

    },


    editLeaveType: (
      state,
      action
    ) => {

      patchById(

        state.leaveTypes,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteLeaveType: (
      state,
      action
    ) => {

      deleteById(

        state.leaveTypes,

        action.payload.id

      )

    },


    setLeaveTypeStatus: (
      state,
      action
    ) => {

      setStatusById(

        state.leaveTypes,

        action.payload.id,

        action.payload.is_active

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - ATTENDANCE
    |--------------------------------------------------------------------------
    */


    checkIn: (
      state,
      action
    ) => {

      const {
        user,
        company,
        shift,
      } =
        action.payload


      const today =
        nowIso()
          .slice(
            0,
            10
          )


      const existing =
        state.attendance.find(
          (record) =>

            Number(
              record.user
            ) ===
            Number(
              user
            ) &&

            record.date ===
            today
        )


      if (existing) {

        if (
          !existing.check_in
        ) {

          existing.check_in =
            nowIso()

          existing.status =
            existing.status ||
            'PRESENT'

        }

        return

      }


      state.attendance.push({

        id:
          nextId(),

        user:
          Number(
            user
          ),

        company:
          company
            ? Number(
                company
              )
            : null,

        shift:
          shift
            ? Number(
                shift
              )
            : null,

        date:
          today,

        check_in:
          nowIso(),

        check_out:
          null,

        working_hours:
          null,

        status:
          'PRESENT',

        note:
          '',

      })

    },


    checkOut: (
      state,
      action
    ) => {

      const {
        user,
      } =
        action.payload


      const today =
        nowIso()
          .slice(
            0,
            10
          )


      const record =
        state.attendance.find(
          (r) =>

            Number(
              r.user
            ) ===
            Number(
              user
            ) &&

            r.date ===
            today
        )


      if (
        !record ||
        !record.check_in ||
        record.check_out
      ) {

        return

      }


      record.check_out =
        nowIso()


      const hours =
        (
          new Date(
            record.check_out
          ) -
          new Date(
            record.check_in
          )
        ) /
        (
          1000 *
          60 *
          60
        )


      record.working_hours =
        Math.round(
          hours * 100
        ) /
        100

    },


    markAttendance: (
      state,
      action
    ) => {

      const p =
        action.payload


      const existing =
        state.attendance.find(
          (r) =>

            Number(
              r.user
            ) ===
            Number(
              p.user
            ) &&

            r.date ===
            p.date
        )


      if (existing) {

        Object.assign(
          existing,
          p
        )

        return

      }


      state.attendance.push({

        id:
          nextId(),

        check_in:
          null,

        check_out:
          null,

        working_hours:
          null,

        note:
          '',

        ...p,

      })

    },


    editAttendance: (
      state,
      action
    ) => {

      patchById(

        state.attendance,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteAttendance: (
      state,
      action
    ) => {

      deleteById(

        state.attendance,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - LEAVE REQUESTS
    |--------------------------------------------------------------------------
    */


    applyLeave: (
      state,
      action
    ) => {

      state.leaveRequests.push({

        id:
          nextId(),

        status:
          'PENDING',

        applied_at:
          nowIso(),

        decided_by:
          null,

        decided_at:
          null,

        decision_note:
          '',

        ...action.payload,

      })

    },


    decideLeave: (
      state,
      action
    ) => {

      const {
        id,
        status,
        decided_by,
        decision_note,
      } =
        action.payload


      patchById(

        state.leaveRequests,

        id,

        {

          status,

          decided_by:
            decided_by ||
            null,

          decided_at:
            nowIso(),

          decision_note:
            decision_note ||
            '',

        }

      )

    },


    cancelLeave: (
      state,
      action
    ) => {

      patchById(

        state.leaveRequests,

        action.payload.id,

        {
          status:
            'CANCELLED',
        }

      )

    },


    deleteLeaveRequest: (
      state,
      action
    ) => {

      deleteById(

        state.leaveRequests,

        action.payload.id

      )

    },


    /*
    |--------------------------------------------------------------------------
    | HRMS - SALARY STRUCTURE
    |--------------------------------------------------------------------------
    */


    addSalaryStructure: (
      state,
      action
    ) => {

      state.salaryStructures.push({

        id:
          nextId(),

        ...action.payload,

      })

    },


    editSalaryStructure: (
      state,
      action
    ) => {

      patchById(

        state.salaryStructures,

        action.payload.id,

        action.payload.payload

      )

    },


    deleteSalaryStructure: (
      state,
      action
    ) => {

      deleteById(

        state.salaryStructures,

        action.payload.id

      )

    },

  },

})


/*
|--------------------------------------------------------------------------
| EXPORT ACTIONS
|--------------------------------------------------------------------------
*/


export const {

  // companies

  setActiveCompanyId,

  editCompany,

  setCompanyStatus,


  // departments

  addDepartment,

  editDepartment,

  deleteDepartment,

  setDepartmentStatus,


  // users

  addUser,

  editUserAccess,

  deleteUser,

  setUserStatus,


  // locations

  addLocation,

  editLocation,

  deleteLocation,

  setLocationStatus,


  // items

  addItem,

  editItem,

  deleteItem,

  setItemStatus,


  // inventory

  receiveStock,

  setLotQcStatus,

  issueStock,

  returnStock,

  adjustStock,


  // operations

  addProduct,

  editProduct,

  deleteProduct,

  saveProductLastSelection,


  addCustomer,

  editCustomer,

  deleteCustomer,


  addFormula,

  saveFormula,

  editFormula,

  deleteFormula,

  addFormulaRevision,

  saveRevisionMaterials,

  deleteFormulaRevision,


  addQuotation,

  deleteQuotation,


  addOrder,

  /*
   * NEW ACTION
   */
  editOrder,

  deleteOrder,


  addBatch,

  editBatch,

  deleteBatch,

  consumeBatchMaterial,

  setBatchQc,

  setBatchQa,


  // invoices

  addInvoice,

  editInvoice,

  deleteInvoice,

  setInvoiceStatus,

  setOrderStatus,

  addQcRecord,

  editQcRecord,

  addQaRecord,

  editQaRecord,

  addPaymentRecord,


  // suppliers

  addSupplier,

  editSupplier,

  deleteSupplier,

  setSupplierStatus,


  // purchase

  addPurchaseOrder,

  editPurchaseOrder,

  deletePurchaseOrder,

  approvePurchaseOrder,

  cancelPurchaseOrder,


  addGoodsReceipt,

  editGoodsReceipt,

  deleteGoodsReceipt,


  addPurchaseBill,

  editPurchaseBill,

  deletePurchaseBill,


  // internal allocation

  addInternalAllocation,

  deleteInternalAllocation,


  // dispatch

  addDispatch,

  editDispatch,

  deleteDispatch,

  setDispatchStatus,


  // returns

  addSalesReturn,

  decideSalesReturn,

  deleteSalesReturn,


  // recall

  addRecall,

  logRecallReturn,

  closeRecall,

  deleteRecall,


  // credit note

  addCreditNote,

  deleteCreditNote,


  // hrms - designations

  addDesignation,

  editDesignation,

  deleteDesignation,

  setDesignationStatus,


  // hrms - shifts

  addShift,

  editShift,

  deleteShift,

  setShiftStatus,


  // hrms - holidays

  addHoliday,

  editHoliday,

  deleteHoliday,


  // hrms - leave types

  addLeaveType,

  editLeaveType,

  deleteLeaveType,

  setLeaveTypeStatus,


  // hrms - attendance

  checkIn,

  checkOut,

  markAttendance,

  editAttendance,

  deleteAttendance,


  // hrms - leave requests

  applyLeave,

  decideLeave,

  cancelLeave,

  deleteLeaveRequest,


  // hrms - salary structure

  addSalaryStructure,

  editSalaryStructure,

  deleteSalaryStructure,

} =
  erpSlice.actions


export default erpSlice.reducer