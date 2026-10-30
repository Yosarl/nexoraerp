/// <reference types="vite/client" />
import axios from 'axios';

// In development, Vite proxies /api → localhost:5000 so relative '/api' works.
// In the packaged Electron app there is no proxy, so we hit the backend directly.
const isElectronProd = !import.meta.env.DEV && typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).electronAPI;

// When using a remote API (e.g. Render), use a longer timeout for cold starts (~30–60s)
const isRemoteApi = !!import.meta.env.VITE_API_URL;
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (isElectronProd ? 'http://localhost:5000/api' : '/api'),
  headers: { 'Content-Type': 'application/json' },
  timeout: isRemoteApi ? 60000 : 0,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const companyId = localStorage.getItem('selectedCompanyId');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (companyId) config.headers['X-Company-Id'] = companyId;
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    try {
      const method = res.config?.method?.toLowerCase();
      if (method && ['post', 'put', 'patch', 'delete'].includes(method)) {
        const url = res.config?.url || '';
        if (url.includes('/products')) {
          window.dispatchEvent(new CustomEvent('app:products-updated', { detail: { url, method } }));
        }
        if (url.includes('/ledger') || url.includes('/customer') || url.includes('/supplier')) {
          window.dispatchEvent(new CustomEvent('app:ledgers-updated', { detail: { url, method } }));
        }
        window.dispatchEvent(new CustomEvent('app:database-updated', { detail: { url, method } }));
      }
    } catch {
      // ignore
    }
    return res;
  },
  (err) => {
    // Don't redirect on 401 from login endpoint — let the Login page show the error
    const isLoginRequest = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ success: boolean; data: { user: unknown; token: string } }>('/auth/login', { username, password }),
  me: () => api.get<{ success: boolean; data: unknown }>('/auth/me'),
};

export const companyApi = {
  list: () => api.get<{ success: boolean; data: unknown[] }>('/companies'),
  get: (id: string) => api.get<{ success: boolean; data: unknown }>(`/companies/${id}`),
  getNextCode: () => api.get<{ success: boolean; data: { code: string } }>('/companies/next-code'),
  create: (data: Record<string, unknown>) => api.post<{ success: boolean; data: unknown }>('/companies', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<{ success: boolean; data: unknown }>(`/companies/${id}`, data),
};

export const financialYearApi = {
  list: (companyId: string) => api.get<{ success: boolean; data: unknown[] }>('/financial-years', { params: { companyId } }),
  getCurrent: (companyId: string) => api.get<{ success: boolean; data: unknown }>('/financial-years/current', { params: { companyId } }),
  setCurrent: (companyId: string, financialYearId: string) =>
    api.post('/financial-years/set-current', { companyId, financialYearId }),
};

export const productApi = {
  list: (companyId: string, params?: { search?: string; page?: number; limit?: number; categoryId?: string }) =>
    api.get<{ success: boolean; data: { products: unknown[]; total: number } }>('/products', { params: { companyId, ...params } }),
  get: (id: string, companyId: string) => api.get<{ success: boolean; data: unknown }>(`/products/${id}`, { params: { companyId } }),
  getNextCode: (companyId: string) =>
    api.get<{ success: boolean; data: { code: string } }>('/products/next-code', { params: { companyId } }),
  checkFieldUsage: (companyId: string, type: 'category' | 'unit' | 'itemGroup' | 'brand', identifier: string) =>
    api.get<{
      success: boolean;
      data: {
        inUse: boolean;
        hasTransactions: boolean;
        count: number;
        products: Array<{
          _id: string;
          code: string;
          name: string;
          imei: string;
          retailPrice: number;
          hasTransactions: boolean;
        }>;
      };
    }>('/products/check-usage', { params: { companyId, type, identifier } }),
  getByImei: (companyId: string, imei: string) =>
    api.get<{ success: boolean; data: unknown }>('/products/imei', { params: { companyId, imei } }),
  getCategories: (companyId: string) =>
    api.get<{ success: boolean; data: unknown[] }>('/products/categories', { params: { companyId } }),
  createCategory: (companyId: string, data: { name: string; code?: string }) =>
    api.post<{ success: boolean; data: unknown }>('/products/categories', { companyId, ...data }),
  updateCategory: (id: string, companyId: string, data: { name: string; code?: string }) =>
    api.patch<{ success: boolean; data: unknown }>(`/products/categories/${id}`, { companyId, ...data }),
  deleteCategory: (id: string, companyId: string) =>
    api.delete<{ success: boolean; message?: string }>(`/products/categories/${id}`, { params: { companyId } }),
  getItemGroups: (companyId: string) =>
    api.get<{ success: boolean; data: string[] }>('/products/item-groups', { params: { companyId } }),
  updateItemGroup: (companyId: string, oldName: string, newName: string) =>
    api.patch<{ success: boolean; modifiedCount: number }>('/products/item-groups', { companyId, oldName, newName }),
  deleteItemGroup: (companyId: string, name: string) =>
    api.delete<{ success: boolean; modifiedCount: number }>('/products/item-groups', { params: { companyId, name } }),
  getBrands: (companyId: string) =>
    api.get<{ success: boolean; data: string[] }>('/products/brands', { params: { companyId } }),
  updateBrand: (companyId: string, oldName: string, newName: string) =>
    api.patch<{ success: boolean; modifiedCount: number }>('/products/brands', { companyId, oldName, newName }),
  deleteBrand: (companyId: string, name: string) =>
    api.delete<{ success: boolean; modifiedCount: number }>('/products/brands', { params: { companyId, name } }),
  getByBarcode: (companyId: string, barcode: string) =>
    api.get<{ success: boolean; data: unknown }>('/products/barcode', { params: { companyId, barcode } }),
  getUnits: (companyId: string) => api.get<{ success: boolean; data: unknown[] }>('/products/units', { params: { companyId } }),
  createUnit: (companyId: string, data: { name: string; shortCode?: string }) =>
    api.post<{ success: boolean; data: unknown }>('/products/units', { companyId, ...data }),
  updateUnit: (id: string, data: { name?: string; shortCode?: string }) =>
    api.patch<{ success: boolean; data: unknown }>(`/products/units/${id}`, data),
  deleteUnit: (id: string) =>
    api.delete<{ success: boolean; message?: string }>(`/products/units/${id}`),
  create: (data: Record<string, unknown>) => api.post<{ success: boolean; data: unknown }>('/products', data),
  update: (id: string, companyId: string, data: Record<string, unknown>) =>
    api.patch<{ success: boolean; data: unknown }>(`/products/${id}`, data, { params: { companyId } }),
  delete: (id: string, companyId: string) =>
    api.delete(`/products/${id}`, { params: { companyId } }),
  uploadImage: (companyId: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ success: boolean; data: { url: string } }>('/products/upload-image', formData, {
      params: { companyId },
    });
  },
};

export interface OpeningStockBatchPayload {
  productId: string;
  productCode?: string;
  productName?: string;
  batchNumber?: string;
  purchasePrice: number;
  quantity: number;
  discAmount?: number;
  expiryDate?: string;
  retail?: number;
  wholesale?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  multiUnitId?: string;
}

export interface OpeningStockEntryData {
  _id: string;
  entryNo: string;
  date: string;
  vatType: string;
  taxMode: string;
  narration: string;
  totalAmount: number;
  batches: Array<{
    productId: string;
    productCode: string;
    productName: string;
    batchNumber: string;
    purchasePrice: number;
    quantity: number;
    discAmount: number;
    expiryDate?: string;
    retail: number;
    wholesale: number;
    specialPrice1: number;
    specialPrice2: number;
    multiUnitId?: string;
  }>;
}

export interface OpeningStockListItem {
  _id: string;
  entryNo: string;
  date: string;
  totalAmount: number;
}

export const openingStockApi = {
  post: (data: { companyId: string; financialYearId: string; items: Array<{ productId: string; quantity: number; costPrice: number }> }) =>
    api.post<{ success: boolean; data: unknown }>('/opening-stock', data),
  importProductsAndStock: (
    companyId: string,
    financialYearId: string,
    data: { mapping: Record<string, number>; rows: string[][]; headers: string[] }
  ) =>
    api.post<{ success: boolean; data: { created: number; updated: number; errors: string[] } }>(
      '/opening-stock/import',
      { companyId, financialYearId, ...data }
    ),
  entries: {
    list: (companyId: string, financialYearId: string) =>
      api.get<{ success: boolean; data: OpeningStockListItem[] }>('/opening-stock/entries', {
        params: { companyId, financialYearId },
      }),
    getNextEntryNo: (companyId: string, financialYearId: string) =>
      api.get<{ success: boolean; data: { entryNo: string } }>('/opening-stock/entries/next-entry-no', {
        params: { companyId, financialYearId },
      }),
    getById: (id: string, companyId: string) =>
      api.get<{ success: boolean; data: OpeningStockEntryData }>(`/opening-stock/entries/${id}`, {
        params: { companyId },
      }),
    create: (data: {
      companyId: string;
      financialYearId: string;
      date?: string;
      vatType?: 'Vat' | 'NonVat';
      taxMode?: 'inclusive' | 'exclusive';
      narration?: string;
      batches: OpeningStockBatchPayload[];
    }) =>
      api.post<{ success: boolean; data: { entryId: string; entryNo: string } }>('/opening-stock/entries', data),
    update: (
      id: string,
      data: {
        companyId: string;
        financialYearId: string;
        date?: string;
        vatType?: 'Vat' | 'NonVat';
        taxMode?: 'inclusive' | 'exclusive';
        narration?: string;
        batches: OpeningStockBatchPayload[];
      }
    ) =>
      api.put<{ success: boolean; data: { entryId: string; entryNo: string } }>(`/opening-stock/entries/${id}`, data),
    delete: (id: string, companyId: string) =>
      api.delete<{ success: boolean; message?: string }>(`/opening-stock/entries/${id}`, { params: { companyId } }),
  },
};

export const openingPurchaseApi = openingStockApi;
export type OpeningPurchaseBatchPayload = OpeningStockBatchPayload;
export type OpeningPurchaseEntryData = OpeningStockEntryData;
export type OpeningPurchaseListItem = OpeningStockListItem;

export interface B2CLineItem {
  productId: string;
  productCode?: string;
  imei?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discount?: number;
  vatRate?: number;
  multiUnitId?: string;
  unitId?: string;
  unitName?: string;
  batchNumber?: string;
  expiryDate?: string;
  isRx?: boolean;
  dosageInstructions?: any;
  duration?: string;
  timing?: string;
  frequency?: string;
}

export interface B2CPayment {
  mode: string;
  amount: number;
  reference?: string;
  accountId?: string;
}

export interface B2CInvoiceInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  type?: 'B2C' | 'B2B' | 'Quotation' | 'POS';
  items: B2CLineItem[];
  customerId?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  salesmanId?: string;
  rateType?: 'Retail' | 'WSale' | 'Special1' | 'Special2';
  paymentType?: 'Cash' | 'Credit';
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  cashAccountId?: string;
  cardAccountId?: string;
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  lendAddLess?: number;
  roundOff?: number;
  cashReceived?: number;
  paymentDetails?: B2CPayment[];
  narration?: string;
  // Shipping Address
  shippingName?: string;
  shippingAddress?: string;
  shippingPhone?: string;
  shippingContactPerson?: string;
  patientName?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  emiratesId?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  isRiayati?: boolean;
  visitNumber?: string;
}

export const salesApi = {
  getNextPOSInvoiceNo: (companyId: string, financialYearId: string) =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/sales/pos/next-invoice-no', {
      params: { companyId, financialYearId },
    }),

  createPOS: (data: {
    companyId: string;
    financialYearId: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      vatRate?: number;
      batchNumber?: string;
      expiryDate?: string;
      multiUnitId?: string;
      dosageInstructions?: any;
      duration?: string;
      timing?: string;
      frequency?: string;
    }>;
    paymentDetails: Array<{ mode: string; amount: number; reference?: string; accountId?: string }>;
    paymentType?: 'Cash' | 'Credit';
    cashReceived?: number;
    billDiscount?: number;
    roundOff?: number;
    customerId?: string;
    customerName?: string;
    cashAccountId?: string;
    cardAccountId?: string;
    salesmanId?: string;
    emiratesId?: string;
    patientName?: string;
    doctorName?: string;
    doctorLicenseNo?: string;
    prescriptionNumber?: string;
    prescriptionDate?: string;
    visitNumber?: string;
    isRiayati?: boolean;
  }) => api.post<{ success: boolean; data: { invoiceId: string; invoiceNo: string; riayatiSubmission?: any } }>('/sales/pos', data),

  // Doctors
  getDoctors: (companyId: string) =>
    api.get<{ success: boolean; data: Array<{ _id: string; name: string; licenseNumber: string; licensingAuthority?: string; phone?: string; specialty?: string }> }>(
      '/sales/doctors',
      { params: { companyId } }
    ),
  createDoctor: (data: { companyId: string; name: string; licenseNumber: string; licensingAuthority?: string; phone?: string; specialty?: string }) =>
    api.post<{ success: boolean; data: any }>('/sales/doctors', data),

  // Patients
  getPatients: (companyId: string, search?: string) =>
    api.get<{ success: boolean; data: any[] }>('/sales/patients', { params: { companyId, search } }),
  findPatientByEmiratesId: (companyId: string, emiratesId: string) =>
    api.get<{ success: boolean; data: any }>('/sales/patients/by-emirates-id', { params: { companyId, emiratesId } }),
  createPatient: (data: any) =>
    api.post<{ success: boolean; data: any }>('/sales/patients', data),

  // B2C endpoints
  getNextB2CInvoiceNo: (companyId: string, financialYearId: string, type?: 'B2C' | 'B2B' | 'Quotation' | 'POS') =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/sales/b2c/next-invoice-no', {
      params: { companyId, financialYearId, type },
    }),
  listB2C: (companyId: string, financialYearId: string, params?: { search?: string; fromDate?: string; toDate?: string; page?: number; limit?: number; type?: 'B2C' | 'B2B' | 'Quotation' | 'POS' }) =>
    api.get<{ success: boolean; data: { invoices: unknown[]; total: number } }>('/sales/b2c', {
      params: { companyId, financialYearId, ...params },
    }),
  listB2CIds: (companyId: string, financialYearId: string, type?: 'B2C' | 'B2B' | 'Quotation' | 'POS') =>
    api.get<{ success: boolean; data: { invoices: Array<{ _id: string }>; total: number } }>('/sales/b2c', {
      params: { companyId, financialYearId, type, idsOnly: 1, limit: 10000 },
    }),
  getB2C: (id: string, companyId: string, type?: 'B2C' | 'B2B' | 'Quotation' | 'POS', excludeReturnId?: string) =>
    api.get<{ success: boolean; data: unknown }>(`/sales/b2c/${id}`, { params: { companyId, type, excludeReturnId } }),
  searchB2CByInvoiceNo: (companyId: string, invoiceNo: string, type?: 'B2C' | 'B2B' | 'Quotation' | 'POS', excludeReturnId?: string) =>
    api.get<{ success: boolean; data: unknown }>('/sales/b2c/search', { params: { companyId, invoiceNo, type, excludeReturnId } }),
  createB2C: (data: B2CInvoiceInput) =>
    api.post<{ success: boolean; data: { invoiceId: string; invoiceNo: string; riayatiSubmission?: any } }>('/sales/b2c', data),
  updateB2C: (id: string, data: B2CInvoiceInput) =>
    api.put<{ success: boolean; data: { invoiceId: string; invoiceNo: string; riayatiSubmission?: any } }>(`/sales/b2c/${id}`, data),
  deleteB2C: (id: string, companyId: string) =>
    api.delete(`/sales/b2c/${id}`, { params: { companyId } }),
  getProductCustomerHistory: (companyId: string, productId: string, customerId?: string, type?: 'POS' | 'B2C' | 'B2B' | 'Quotation') =>
    api.get<{ success: boolean; data: { history: Array<{ invoiceNo: string; date: string; customerName: string; quantity: number; unitPrice: number; unitName: string; discount: number; total: number; batchNumber: string }>; totalPurchased: number; totalReturned: number; netReturnable: number } }>(
      `/sales/b2c/product-history/${productId}`,
      { params: { companyId, ...(customerId ? { customerId } : {}), type } }
    ),
  getSalesReport: (params: {
    companyId: string;
    financialYearId?: string;
    filterType?: 'default' | 'product' | 'product_total' | 'month' | 'daily' | 'monthly';
    salesType?: 'ALL' | 'B2C' | 'B2B' | 'POS' | 'Return' | 'Quotation' | string;
    productId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }) =>
    api.get<{
      success: boolean;
      data: {
        filterType: 'default' | 'product' | 'product_total' | 'month' | 'daily' | 'monthly';
        isSpecificProduct?: boolean;
        months?: Array<{ key: string; label: string }>;
        rows: any[];
      };
    }>('/sales/report', { params }),

  // Sales Return
  getNextReturnInvoiceNo: (companyId: string, financialYearId: string) =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/sales/return/next-invoice-no', {
      params: { companyId, financialYearId },
    }),
  createSalesReturn: (data: {
    companyId: string;
    financialYearId: string;
    date?: string;
    returnType: 'OnAccount' | 'ByRef';
    originalInvoiceId?: string;
    customerId?: string;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
    cashAccountId?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    items: Array<{
      productId: string;
      productCode?: string;
      imei?: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      discountPercent?: number;
      discount?: number;
      unitId?: string;
      unitName?: string;
      multiUnitId?: string;
      batchNumber?: string;
    }>;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    lendAddLess?: number;
    roundOff?: number;
    narration?: string;
  }) => api.post<{ success: boolean; data: { invoiceId: string; invoiceNo: string } }>('/sales/return', data),
  updateSalesReturn: (
    returnId: string,
    data: {
      companyId: string;
      financialYearId: string;
      date?: string;
      returnType: 'OnAccount' | 'ByRef';
      originalInvoiceId?: string;
      customerId?: string;
      customerName?: string;
      customerAddress?: string;
      cashAccountId?: string;
      vatType?: 'Vat' | 'NonVat';
      taxMode?: 'inclusive' | 'exclusive';
      items: Array<{
        productId: string;
        productCode?: string;
        imei?: string;
        description?: string;
        quantity: number;
        unitPrice: number;
        discountPercent?: number;
        discount?: number;
        unitId?: string;
        unitName?: string;
        batchNumber?: string;
      }>;
      otherDiscount?: number;
      otherCharges?: number;
      freightCharge?: number;
      lendAddLess?: number;
      roundOff?: number;
      narration?: string;
    }
  ) => api.put<{ success: boolean; data: { invoiceId: string; invoiceNo: string } }>(`/sales/return/${returnId}`, data),
  searchSalesReturn: (companyId: string, invoiceNo: string) =>
    api.get('/sales/return/search', { params: { companyId, invoiceNo } }),
  listSalesReturns: (companyId: string, financialYearId: string) =>
    api.get<{ success: boolean; data: Array<{ _id: string; invoiceNo: string; date: string; customerName?: string; totalAmount?: number }> }>(
      '/sales/returns',
      { params: { companyId, financialYearId } }
    ),
  getSalesReturn: (invoiceId: string, companyId: string) =>
    api.get(`/sales/return/${invoiceId}`, { params: { companyId } }),
  deleteSalesReturn: (invoiceId: string, companyId: string) =>
    api.delete(`/sales/return/${invoiceId}`, { params: { companyId } }),
};

export interface StockMovementItem {
  id: string;
  sl?: number;
  productId: string;
  itemCode: string;
  itemName: string;
  category?: string;
  brand?: string;
  opening: number;
  purchase: number;
  returnQty: number; // Return
  stockAdjPlus: number; // SA+ (Stock Adj +)
  stockAdjMinus: number; // SA- (Stock Adj -)
  damage: number; // Damage
  qty: number; // Qty (Closing)
  purchaseRate: number;
  stockValue: number; // Cost Value
  grossValue: number; // Gross Value (without VAT)
}

export const stockApi = {
  getReport: (companyId: string, params?: { search?: string; searchField?: string; page?: number; limit?: number; mode?: string }) =>
    api.get<{
      success: boolean;
      data: {
        items: Array<{
          rowId: string;
          productId: string;
          imei: string;
          itemName: string;
          batchNumber?: string | null;
          itemGroup: string;
          brand: string;
          category: string;
          qtyAvailable: number;
          purchaseRate: number;
          totalPurchaseRate: number;
          grossValue: number;
          sellingPrice: number;
          retailPrice: number;
          wholesalePrice: number;
          specialPrice1: number;
          specialPrice2: number;
          expiryDate: string | null;
          branch: string;
          sellerName: string;
        }>;
        total: number;
      };
    }>('/stock/report', { params: { companyId, ...params } }),

  getMovement: (
    companyId: string,
    params?: {
      financialYearId?: string;
      productId?: string;
      fromDate?: string;
      toDate?: string;
      type?: string;
      category?: string;
      brand?: string;
      search?: string;
    }
  ) =>
    api.get<{
      success: boolean;
      data: {
        items: StockMovementItem[];
        summary: {
          totalOpening: number;
          totalPurchase: number;
          totalReturn: number;
          totalStockAdjPlus: number;
          totalStockAdjMinus: number;
          totalDamage: number;
          totalQty: number;
          totalStockValue: number;
          totalGrossValue: number;
          count: number;
        };
      };
    }>('/stock/movement', { params: { companyId, ...params } }),

  getProductStock: (companyId: string, productId: string) =>
    api.get<{ success: boolean; data: { stock: number } }>(`/stock/product-stock/${productId}`, {
      params: { companyId },
    }),

  getProductTransactions: (
    productId: string,
    companyId: string,
    params?: { fromDate?: string; toDate?: string; type?: string; financialYearId?: string }
  ) =>
    api.get<{ success: boolean; data: ProductTransactionsResponse }>(
      `/stock/product-transactions/${productId}`,
      { params: { companyId, ...params } }
    ),
};

export interface ProductTransactionDetail {
  id: string;
  date: string;
  type: string;
  voucherName: string;
  voucherNo: string;
  referenceType: string;
  referenceId: string;
  invoiceType?: string;
  batchNumber?: string;
  quantityIn: number;
  quantityOut: number;
  rate: number;
  amount: number;
  runningBalance: number;
  partyName?: string;
  partyId?: string;
  partyType?: 'Customer' | 'Supplier' | 'Other';
  narration?: string;
}

export interface ProductTransactionsResponse {
  product: {
    id: string;
    name: string;
    sku: string;
    code?: string;
    barcode?: string;
    unit?: string;
    sellingPrice: number;
    purchasePrice: number;
    currentStock: number;
  };
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  totalValueIn: number;
  totalValueOut: number;
  transactions: ProductTransactionDetail[];
}


export interface StockAdjustmentItemPayload {
  productId: string;
  productCode?: string;
  productName?: string;
  barcode?: string;
  batchNumber?: string;
  adjustmentType: 'ADD' | 'REDUCE';
  quantity: number;
  costPrice?: number;
  reason?: string;
}

export interface StockAdjustmentPayload {
  companyId: string;
  financialYearId: string;
  adjustmentNo?: string;
  entryType?: 'ADJUSTMENT' | 'DAMAGE';
  prefix?: string;
  date: string;
  reason: string;
  narration?: string;
  items: StockAdjustmentItemPayload[];
}

export interface StockAdjustmentData {
  _id: string;
  companyId: string;
  financialYearId: string;
  adjustmentNo: string;
  entryType?: 'ADJUSTMENT' | 'DAMAGE';
  date: string;
  reason: string;
  narration?: string;
  items: Array<{
    productId: string;
    productCode: string;
    productName: string;
    barcode?: string;
    batchNumber?: string;
    currentStock: number;
    adjustmentType: 'ADD' | 'REDUCE';
    quantity: number;
    newStock: number;
    costPrice: number;
    totalValue: number;
    reason?: string;
  }>;
  totalItems: number;
  totalLossValue: number;
  totalGainValue: number;
  netAdjustmentValue: number;
  voucherId?: { _id: string; voucherNo: string } | string;
  createdBy?: { _id: string; username?: string; fullName?: string };
  createdAt: string;
}

export const stockAdjustmentApi = {
  getNextNo: (companyId: string, financialYearId: string, params?: { entryType?: string; prefix?: string }) =>
    api.get<{ success: boolean; data: { adjustmentNo: string } }>('/stock-adjustments/next-no', {
      params: { companyId, financialYearId, ...params },
    }),
  create: (data: StockAdjustmentPayload) =>
    api.post<{ success: boolean; data: StockAdjustmentData }>('/stock-adjustments', data),
  update: (id: string, data: StockAdjustmentPayload) =>
    api.put<{ success: boolean; data: StockAdjustmentData }>(`/stock-adjustments/${id}`, data),
  list: (
    companyId: string,
    financialYearId: string,
    params?: { search?: string; page?: number; limit?: number; fromDate?: string; toDate?: string; entryType?: string; prefix?: string; productId?: string }
  ) =>
    api.get<{ success: boolean; data: { list: StockAdjustmentData[]; total: number } }>('/stock-adjustments', {
      params: { companyId, financialYearId, ...params },
    }),
  getById: (id: string, companyId: string) =>
    api.get<{ success: boolean; data: StockAdjustmentData }>(`/stock-adjustments/${id}`, {
      params: { companyId },
    }),
  delete: (id: string, companyId: string) =>
    api.delete<{ success: boolean; message: string }>(`/stock-adjustments/${id}`, {
      params: { companyId },
    }),
};

export interface PurchaseInvoiceData {
  _id: string;
  companyId: string;
  financialYearId: string;
  invoiceNo: string;
  supplierInvoiceNo: string;
  date: string;
  supplierId: string;
  supplierName: string;
  vatType: 'Vat' | 'NonVat';
  narration: string;
  totalAmount: number;
  voucherId?: string;
  voucherNo?: string;
  itemsDiscount?: number;
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  roundOff?: number;
  taxMode?: 'inclusive' | 'exclusive';
  paymentType?: string;
  cashAccountId?: string | null;
  batches: Array<{
    productId: string;
    productCode: string;
    productName: string;
    batchNumber: string;
    purchasePrice: number;
    quantity: number;
    discAmount?: number;
    expiryDate: string;
    retail: number;
    wholesale: number;
    specialPrice1: number;
    specialPrice2: number;
  }>;
}

export interface PurchaseListItem {
  _id: string;
  invoiceNo: string;
  date: string;
  supplierName: string;
  totalAmount: number;
}

export const purchaseApi = {
  create: (data: {
    companyId: string;
    financialYearId: string;
    invoiceNo: string;
    supplierInvoiceNo?: string;
    date?: string;
    supplierId?: string;
    supplierName?: string;
    paymentType?: 'Cash' | 'Credit';
    cashAccountId?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    narration?: string;
    itemsDiscount?: number;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    roundOff?: number;
    batches: Array<{
      productId: string;
      productCode?: string;
      productName?: string;
      purchasePrice: number;
      discAmount?: number;
      expiryDate?: string;
      quantity: number;
      retail?: number;
      wholesale?: number;
      specialPrice1?: number;
      specialPrice2?: number;
      batchNumber?: string;
      multiUnitId?: string;
    }>;
  }) =>
    api.post<{ success: boolean; data: { purchaseId: string; invoiceNo: string; batchCount: number } }>(
      '/purchases',
      data
    ),

  update: (id: string, data: {
    companyId: string;
    financialYearId: string;
    invoiceNo: string;
    supplierInvoiceNo?: string;
    date?: string;
    supplierId?: string;
    supplierName?: string;
    paymentType?: 'Cash' | 'Credit';
    cashAccountId?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    narration?: string;
    itemsDiscount?: number;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    roundOff?: number;
    batches: Array<{
      productId: string;
      productCode?: string;
      productName?: string;
      purchasePrice: number;
      discAmount?: number;
      expiryDate?: string;
      quantity: number;
      retail?: number;
      wholesale?: number;
      specialPrice1?: number;
      specialPrice2?: number;
      batchNumber?: string;
      multiUnitId?: string;
    }>;
  }) =>
    api.put<{ success: boolean; data: { purchaseId: string; invoiceNo: string; batchCount: number } }>(
      `/purchases/${id}`,
      data
    ),

  list: (companyId: string, financialYearId?: string) =>
    api.get<{ success: boolean; data: PurchaseListItem[] }>('/purchases', {
      params: { companyId, financialYearId },
    }),

  getById: (id: string) =>
    api.get<{ success: boolean; data: PurchaseInvoiceData }>(`/purchases/${id}`),

  search: (companyId: string, invoiceNo: string) =>
    api.get<{ success: boolean; data: PurchaseInvoiceData }>('/purchases/search', {
      params: { companyId, invoiceNo },
    }),

  getNextInvoiceNo: (companyId: string) =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/purchases/next-invoice-no', {
      params: { companyId },
    }),

  getNextBatchNo: (companyId: string) =>
    api.get<{ success: boolean; data: { batchNumber: string } }>('/purchases/next-batch-no', {
      params: { companyId },
    }),

  getProductBatches: (companyId: string, productId: string) =>
    api.get<{
      success: boolean; data: Array<{
        batchNumber: string;
        productId: string;
        productName: string;
        purchasePrice: number;
        expiryDate: string;
        quantity: number;
        retail: number;
        wholesale: number;
      }>
    }>(`/purchases/product-batches/${productId}`, {
      params: { companyId },
    }),

  getPurchaseReport: (params: {
    companyId: string;
    financialYearId?: string;
    filterType?: 'default' | 'product' | 'product_total' | 'month' | 'daily' | 'monthly';
    purchaseType?: 'Purchase' | 'PurchaseOrder' | 'PurchaseReturn' | 'OpeningStock' | string;
    productId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }) =>
    api.get<{
      success: boolean;
      data: {
        filterType: 'default' | 'product' | 'product_total' | 'month' | 'daily' | 'monthly';
        purchaseType?: string;
        isSpecificProduct?: boolean;
        months?: Array<{ key: string; label: string }>;
        rows: any[];
      };
    }>('/purchases/report', { params }),
};

// ─── Purchase Order API ─────────────────────────────────────

export interface PurchaseOrderListItem {
  _id: string;
  invoiceNo: string;
  date: string;
  supplierName: string;
  totalAmount: number;
}

export const purchaseOrderApi = {
  create: (data: {
    companyId: string;
    financialYearId: string;
    invoiceNo: string;
    supplierInvoiceNo?: string;
    date?: string;
    supplierId?: string;
    supplierName?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    narration?: string;
    itemsDiscount?: number;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    roundOff?: number;
    batches: Array<{
      productId: string;
      productCode?: string;
      productName?: string;
      purchasePrice: number;
      discAmount?: number;
      expiryDate?: string;
      quantity: number;
      retail?: number;
      wholesale?: number;
      specialPrice1?: number;
      specialPrice2?: number;
      batchNumber?: string;
      multiUnitId?: string;
    }>;
  }) =>
    api.post<{ success: boolean; data: { purchaseOrderId: string; invoiceNo: string; batchCount: number } }>(
      '/purchase-orders',
      data
    ),

  update: (id: string, data: {
    companyId: string;
    financialYearId: string;
    invoiceNo: string;
    supplierInvoiceNo?: string;
    date?: string;
    supplierId?: string;
    supplierName?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    narration?: string;
    itemsDiscount?: number;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    roundOff?: number;
    batches: Array<{
      productId: string;
      productCode?: string;
      productName?: string;
      purchasePrice: number;
      discAmount?: number;
      expiryDate?: string;
      quantity: number;
      retail?: number;
      wholesale?: number;
      specialPrice1?: number;
      specialPrice2?: number;
      batchNumber?: string;
      multiUnitId?: string;
    }>;
  }) =>
    api.put<{ success: boolean; data: { purchaseOrderId: string; invoiceNo: string; batchCount: number } }>(
      `/purchase-orders/${id}`,
      data
    ),

  delete: (id: string, companyId: string) =>
    api.delete(`/purchase-orders/${id}`, { params: { companyId } }),

  list: (companyId: string, financialYearId?: string) =>
    api.get<{ success: boolean; data: PurchaseOrderListItem[] }>('/purchase-orders', {
      params: { companyId, financialYearId },
    }),

  getById: (id: string) =>
    api.get<{ success: boolean; data: PurchaseInvoiceData }>(`/purchase-orders/${id}`),

  search: (companyId: string, invoiceNo: string) =>
    api.get<{ success: boolean; data: PurchaseInvoiceData }>('/purchase-orders/search', {
      params: { companyId, invoiceNo },
    }),

  getNextInvoiceNo: (companyId: string) =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/purchase-orders/next-invoice-no', {
      params: { companyId },
    }),
};

// ─── Purchase Return API ────────────────────────────────────
export interface PurchaseReturnListItem {
  _id: string;
  invoiceNo: string;
  date: string;
  supplierName?: string;
  totalAmount: number;
}

export interface PurchaseReturnData {
  _id: string;
  invoiceNo: string;
  date: string;
  returnType: 'OnAccount' | 'ByRef';
  originalPurchaseId?: string;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo?: string;
  cashAccountId?: string;
  vatType: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  narration?: string;
  totalAmount: number;
  itemsDiscount: number;
  otherDiscount: number;
  otherCharges: number;
  freightCharge: number;
  roundOff: number;
  items: Array<{
    productId: string;
    productCode: string;
    productName: string;
    batchNumber: string;
    quantity: number;
    purchasePrice: number;
    discAmount: number;
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
  }>;
}

export const purchaseReturnApi = {
  create: (data: {
    companyId: string;
    financialYearId: string;
    date?: string;
    returnType: 'OnAccount' | 'ByRef';
    originalPurchaseId?: string;
    supplierId?: string;
    supplierName?: string;
    supplierInvoiceNo?: string;
    cashAccountId?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    items: Array<{
      productId: string;
      productCode?: string;
      productName?: string;
      quantity: number;
      purchasePrice: number;
      discAmount?: number;
      batchNumber?: string;
      unitId?: string;
      unitName?: string;
      multiUnitId?: string;
    }>;
    itemsDiscount?: number;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    roundOff?: number;
    narration?: string;
  }) =>
    api.post<{ success: boolean; data: { returnId: string; invoiceNo: string } }>('/purchase-returns', data),

  list: (companyId: string, financialYearId: string) =>
    api.get<{ success: boolean; data: PurchaseReturnListItem[] }>('/purchase-returns', {
      params: { companyId, financialYearId },
    }),

  getNextInvoiceNo: (companyId: string, financialYearId: string) =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/purchase-returns/next-invoice-no', {
      params: { companyId, financialYearId },
    }),

  getById: (id: string, companyId: string) =>
    api.get<{ success: boolean; data: PurchaseReturnData }>(`/purchase-returns/${id}`, { params: { companyId } }),

  search: (companyId: string, invoiceNo: string) =>
    api.get<{ success: boolean; data: PurchaseReturnData | null }>('/purchase-returns/search', {
      params: { companyId, invoiceNo },
    }),

  update: (
    id: string,
    companyId: string,
    data: {
      companyId: string;
      financialYearId: string;
      date?: string;
      returnType: 'OnAccount' | 'ByRef';
      originalPurchaseId?: string;
      supplierId?: string;
      supplierName?: string;
      supplierInvoiceNo?: string;
      cashAccountId?: string;
      vatType?: 'Vat' | 'NonVat';
      taxMode?: 'inclusive' | 'exclusive';
      items: Array<{
        productId: string;
        productCode?: string;
        productName?: string;
        quantity: number;
        purchasePrice: number;
        discAmount?: number;
        batchNumber?: string;
        unitId?: string;
        unitName?: string;
        multiUnitId?: string;
      }>;
      itemsDiscount?: number;
      otherDiscount?: number;
      otherCharges?: number;
      freightCharge?: number;
      roundOff?: number;
      narration?: string;
    }
  ) =>
    api.put<{ success: boolean; data: { returnId: string; invoiceNo: string } }>(`/purchase-returns/${id}`, data, { params: { companyId } }),

  delete: (id: string, companyId: string) =>
    api.delete(`/purchase-returns/${id}`, { params: { companyId } }),
};

export interface ProfitLossLedgerItem {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  amount: number;
}

export interface ProfitLossGroupNode {
  groupId: string;
  groupName: string;
  groupCode?: string;
  category: 'Direct' | 'Indirect';
  type: 'Income' | 'Expense';
  totalAmount: number;
  totalDebit: number;
  totalCredit: number;
  accounts: ProfitLossLedgerItem[];
}

export interface ProfitLossData {
  income: number;
  expenses: number;
  netProfit: number;
  grossProfit: number;
  directIncome: number;
  indirectIncome: number;
  directExpenses: number;
  indirectExpenses: number;
  tree: {
    income: ProfitLossGroupNode[];
    expenses: ProfitLossGroupNode[];
  };
  groups: Array<{ type: string; name: string; amount: number; groupName?: string; code?: string; category?: string }>;
}

export interface BalanceSheetLedgerItem {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  amount: number;
  groupName?: string;
  groupCode?: string;
  parentName?: string;
}

export interface BalanceSheetGroupNode {
  groupId: string;
  groupName: string;
  groupCode?: string;
  parentName?: string;
  type: 'Asset' | 'Liability' | 'Equity';
  totalAmount: number;
  totalDebit: number;
  totalCredit: number;
  accounts: BalanceSheetLedgerItem[];
}

export interface BalanceSheetParentNode {
  parentId: string;
  parentName: string;
  parentCode?: string;
  type: 'Asset' | 'Liability' | 'Equity';
  totalAmount: number;
  totalDebit: number;
  totalCredit: number;
  groups: BalanceSheetGroupNode[];
}

export interface BalanceSheetData {
  assets: number;
  liabilities: number;
  equity: number;
  netProfit: number;
  balanced: boolean;
  tree: {
    assets: BalanceSheetParentNode[];
    liabilities: BalanceSheetParentNode[];
    equity: BalanceSheetParentNode[];
  };
  groups: Array<{
    id?: string;
    code?: string;
    name: string;
    type: string;
    groupName?: string;
    groupCode?: string;
    parentName?: string;
    amount: number;
  }>;
}

export interface TrialBalanceRow {
  ledgerAccountId: string;
  name: string;
  code: string;
  debit: number;
  credit: number;
  groupName?: string;
  groupCode?: string;
  groupType?: string;
}

export interface TrialBalanceData {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export const ledgerApi = {
  entriesByVoucher: (voucherId: string) =>
    api.get<{ success: boolean; data: Array<{ ledgerAccountCode: string; ledgerAccountName: string; debitAmount: number; creditAmount: number; narration?: string }> }>(
      '/ledger/entries-by-voucher',
      { params: { voucherId } }
    ),
  trialBalance: (companyId: string, financialYearId: string, asAtDate?: string) =>
    api.get<{ success: boolean; data: TrialBalanceData }>(
      '/ledger/trial-balance',
      { params: { companyId, financialYearId, asAtDate } }
    ),
  exportTrialBalance: (companyId: string, financialYearId: string, asAtDate?: string) =>
    api.get('/ledger/trial-balance/export', {
      params: { companyId, financialYearId, asAtDate, format: 'xlsx' },
      responseType: 'blob',
    }),
  report: (companyId: string, financialYearId: string, ledgerAccountId: string, fromDate: string, toDate: string) =>
    api.get<{ success: boolean; data: unknown }>('/ledger/report', {
      params: { companyId, financialYearId, ledgerAccountId, fromDate, toDate },
    }),
  profitLoss: (companyId: string, financialYearId: string, fromDate?: string, toDate?: string) =>
    api.get<{ success: boolean; data: ProfitLossData }>(
      '/ledger/profit-loss',
      { params: { companyId, financialYearId, fromDate, toDate } }
    ),
  exportProfitLoss: (companyId: string, financialYearId: string, fromDate?: string, toDate?: string) =>
    api.get('/ledger/profit-loss/export', {
      params: { companyId, financialYearId, fromDate, toDate },
      responseType: 'blob',
    }),
  balanceSheet: (companyId: string, financialYearId: string, asAtDate?: string) =>
    api.get<{ success: boolean; data: BalanceSheetData }>(
      '/ledger/balance-sheet',
      { params: { companyId, financialYearId, asAtDate } }
    ),
  dayBook: (companyId: string, financialYearId: string, params?: { fromDate?: string; toDate?: string; voucherType?: string; search?: string; page?: number; limit?: number }) =>
    api.get<{
      success: boolean;
      data: {
        vouchers: any[];
        totalCount: number;
        page: number;
        limit: number;
        totalPages: number;
        summary: {
          totalTransactions: number;
          totalDebit: number;
          totalCredit: number;
          netMovement: number;
          typeCounts: Record<string, number>;
          typeTotals: Record<string, { debit: number; credit: number; count: number }>;
        };
      };
    }>('/ledger/day-book', { params: { companyId, financialYearId, ...params } }),
  exportDayBook: (companyId: string, financialYearId: string, params?: { fromDate?: string; toDate?: string; voucherType?: string; search?: string }) =>
    api.get('/ledger/day-book/export', {
      params: { companyId, financialYearId, ...params },
      responseType: 'blob',
    }),
};

export interface BankReconciliationItem {
  voucherId: string;
  voucherNo: string;
  voucherType: string;
  bookDate: string;
  particulars: string;
  chequeNumber: string;
  chequeDate?: string;
  withdrawals: number;
  deposits: number;
  bankDate: string;
  chequeStatus: 'PENDING' | 'CLEARED' | 'BOUNCED';
  isReconciled: boolean;
  isBounced: boolean;
  narration?: string;
}

export interface BankReconciliationData {
  bankAccount: {
    _id: string;
    name: string;
    code: string;
  };
  fromDate: string;
  toDate: string;
  expectedBankBalance: number;
  expectedIsDebit: boolean;
  statementBalance: number;
  statementIsDebit: boolean;
  unreconciledAmount: number;
  unreconciledCount: number;
  reconciledCount: number;
  bouncedCount: number;
  pendingChequesCount?: number;
  items: BankReconciliationItem[];
}

export const bankReconciliationApi = {
  get: (companyId: string, financialYearId: string, bankAccountId: string, fromDate: string, toDate: string, status?: string) =>
    api.get<{ success: boolean; data: BankReconciliationData }>('/bank-reconciliation', {
      params: { companyId, financialYearId, bankAccountId, fromDate, toDate, status },
    }),
  save: (data: {
    companyId: string;
    financialYearId: string;
    bankAccountId: string;
    items: Array<{
      voucherId: string;
      bankDate?: string | null;
      isBounced?: boolean;
    }>;
  }) => api.post<{ success: boolean; data: { updatedCount: number } }>('/bank-reconciliation/save', data),
};

export const ledgerAccountApi = {
  list: (companyId: string, type?: string, search?: string, financialYearId?: string, lite?: boolean) =>
    api.get<{ success: boolean; data: unknown[] }>('/ledger-accounts', { params: { companyId, type, search, financialYearId, lite: lite ? 1 : undefined } }),
  get: (id: string, companyId: string) =>
    api.get<{ success: boolean; data: unknown }>(`/ledger-accounts/${id}`, { params: { companyId } }),
  create: (data: Record<string, unknown>) =>
    api.post<{ success: boolean; data: unknown }>('/ledger-accounts', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<{ success: boolean; data: unknown }>(`/ledger-accounts/${id}`, data),
  delete: (id: string, companyId: string) =>
    api.delete(`/ledger-accounts/${id}`, { params: { companyId } }),
};

export const ledgerGroupApi = {
  list: (companyId: string, search?: string) =>
    api.get<{ success: boolean; data: unknown[] }>('/ledger-groups', { params: { companyId, search } }),
  get: (id: string, companyId: string) =>
    api.get<{ success: boolean; data: unknown }>(`/ledger-groups/${id}`, { params: { companyId } }),
  getNextCode: (companyId: string) =>
    api.get<{ success: boolean; data: { code: string } }>('/ledger-groups/next-code', { params: { companyId } }),
  create: (data: Record<string, unknown>) =>
    api.post<{ success: boolean; data: unknown }>('/ledger-groups', data),
  update: (id: string, companyId: string, data: Record<string, unknown>) =>
    api.put<{ success: boolean; data: unknown }>(`/ledger-groups/${id}`, data, { params: { companyId } }),
  delete: (id: string, companyId: string) =>
    api.delete<{ success: boolean; message: string }>(`/ledger-groups/${id}`, { params: { companyId } }),
};

export const voucherApi = {
  list: (companyId: string, financialYearId: string, params?: { voucherType?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }) =>
    api.get<{ success: boolean; data: { vouchers: unknown[]; total: number } }>('/vouchers', { params: { companyId, financialYearId, ...params } }),
  create: (data: Record<string, unknown>) =>
    api.post<{ success: boolean; data: unknown }>('/vouchers', data),
  getNextNo: (companyId: string, financialYearId: string, voucherType: string) =>
    api.get<{ success: boolean; data: { voucherNo: string } }>('/vouchers/next-no', { params: { companyId, financialYearId, voucherType } }),
  getById: (id: string) =>
    api.get<{ success: boolean; data: unknown }>(`/vouchers/${id}`),
  delete: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/vouchers/${id}`),
};

export const userApi = {
  list: (companyId?: string) =>
    api.get<{ success: boolean; data: unknown[] }>('/users', { params: { companyId } }),
  get: (id: string) => api.get<{ success: boolean; data: unknown }>(`/users/${id}`),
  create: (data: Record<string, unknown>) =>
    api.post<{ success: boolean; data: unknown }>('/users', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<{ success: boolean; data: unknown }>(`/users/${id}`, data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { newPassword }),
};

export interface AuditLogItem {
  _id: string;
  timestamp: string;
  form?: string;
  entityType: string;
  entityId?: string;
  action: string;
  userId?: { _id?: string; username: string; fullName: string; role?: string } | string;
  details?: string;
  entryNo?: string;
  salesType?: string;
  voucherType?: string;
  editedDate?: string;
  editedTime?: string;
  eventTime?: string;
  oldAmount?: number | null;
  newAmount?: number | null;
  systemName?: string;
  ip?: string;
  userAgent?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export const auditLogApi = {
  list: (params?: {
    companyId?: string;
    userId?: string;
    entityType?: string;
    form?: string;
    action?: string;
    entryNo?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) =>
    api.get<{ success: boolean; data: { logs: AuditLogItem[]; total: number } }>('/audit-logs', { params }),
};

export interface OutstandingBill {
  billNumber: string;
  date: string;
  totalAmount: number;
  settledAmount: number;
  outstandingAmount: number;
  drCr: 'Dr' | 'Cr';
  referenceType: string;
  referenceId: string;
}

export const billReferenceApi = {
  getOutstanding: (companyId: string, ledgerAccountId: string) =>
    api.get<{ success: boolean; data: OutstandingBill[] }>('/bill-references/outstanding', {
      params: { companyId, ledgerAccountId },
    }),
  getHistory: (companyId: string, ledgerAccountId: string) =>
    api.get<{ success: boolean; data: unknown[] }>('/bill-references/history', {
      params: { companyId, ledgerAccountId },
    }),
  settle: (data: {
    companyId: string;
    financialYearId: string;
    voucherId: string;
    date: string;
    settlements: Array<{
      ledgerAccountId: string;
      billNumber: string;
      amount: number;
      drCr: 'Dr' | 'Cr';
      narration?: string;
    }>;
  }) => api.post<{ success: boolean; data: unknown }>('/bill-references/settle', data),
};

export interface Hl7ListenerStatusData {
  isRunning: boolean;
  port: number;
  totalReceived: number;
  activeConnections: number;
  startedAt?: string;
  endpointConfig?: {
    host: string;
    port: number;
    sendingApp: string;
    facilityCode: string;
    facilityName: string;
    processingId: string;
  };
}

export interface Hl7LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'INCOMING' | 'OUTGOING' | 'ERROR';
  messageType?: string;
  controlId?: string;
  summary: string;
  rawMessage?: string;
  rawResponse?: string;
}

export interface RiayatiInvoiceItem {
  _id: string;
  invoiceNo: string;
  invoiceDate: string;
  type?: string;
  customerName?: string;
  patientName?: string;
  emiratesId?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  doctorLicenseProvider?: string;
  totalAmount: number;
  isRiayati?: boolean;
  riayatiStatus: 'Success' | 'Failed' | 'Partial' | 'Offline' | 'Pending' | 'NotApplicable';
  riayatiVisitNumber?: string;
  riayatiAckCode?: string;
  riayatiError?: string;
  riayatiSubmittedAt?: string;
  itemCount?: number;
}

export interface RiayatiStatusKpis {
  total: number;
  success: number;
  failed: number;
  pending: number;
  offline: number;
}

export const riayatiApi = {
  getStatus: () => api.get<{ success: boolean; data: Hl7ListenerStatusData }>('/riayati/listener/status'),
  startListener: (port: number) => api.post<{ success: boolean; data: any }>('/riayati/listener/start', { port }),
  stopListener: () => api.post<{ success: boolean; data: any }>('/riayati/listener/stop'),
  getLogs: (limit = 100) => api.get<{ success: boolean; data: Hl7LogEntry[] }>('/riayati/listener/logs', { params: { limit } }),
  clearLogs: () => api.post<{ success: boolean; message: string }>('/riayati/listener/clear-logs'),
  testSendSample: (payload: { messageType?: string; emiratesId?: string; doctorLicense?: string; invoiceNo?: string }) =>
    api.post<{ success: boolean; data: any }>('/riayati/test/send-sample', payload),
  queryPatientDemographics: (emiratesId: string) =>
    api.post<{ success: boolean; data: any }>('/riayati/query-demographics', { emiratesId }),
  getInvoices: (params?: {
    status?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) =>
    api.get<{
      success: boolean;
      data: {
        invoices: RiayatiInvoiceItem[];
        kpis: RiayatiStatusKpis;
        pagination: { total: number; page: number; pages: number };
      };
    }>('/riayati/invoices', { params }),
  resendSubmission: (invoiceId: string) =>
    api.post<{ success: boolean; message?: string; data: any }>(`/riayati/resend/${invoiceId}`),
  resendAllFailed: () =>
    api.post<{ success: boolean; message?: string; data: any }>('/riayati/resend-all-failed'),
};


