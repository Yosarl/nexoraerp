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
  (res) => res,
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
  type?: 'B2C' | 'B2B' | 'Quotation';
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
}

export const salesApi = {
  createPOS: (data: {
    companyId: string;
    financialYearId: string;
    items: Array<{ productId: string; quantity: number; unitPrice: number; discount?: number }>;
    paymentDetails: Array<{ mode: string; amount: number }>;
    billDiscount?: number;
  }) => api.post<{ success: boolean; data: { invoiceId: string; invoiceNo: string } }>('/sales/pos', data),

  // B2C endpoints
  getNextB2CInvoiceNo: (companyId: string, financialYearId: string, type?: 'B2C' | 'B2B' | 'Quotation') =>
    api.get<{ success: boolean; data: { invoiceNo: string } }>('/sales/b2c/next-invoice-no', {
      params: { companyId, financialYearId, type },
    }),
  listB2C: (companyId: string, financialYearId: string, params?: { search?: string; fromDate?: string; toDate?: string; page?: number; limit?: number; type?: 'B2C' | 'B2B' | 'Quotation' }) =>
    api.get<{ success: boolean; data: { invoices: unknown[]; total: number } }>('/sales/b2c', {
      params: { companyId, financialYearId, ...params },
    }),
  getB2C: (id: string, companyId: string, type?: 'B2C' | 'B2B' | 'Quotation', excludeReturnId?: string) =>
    api.get<{ success: boolean; data: unknown }>(`/sales/b2c/${id}`, { params: { companyId, type, excludeReturnId } }),
  searchB2CByInvoiceNo: (companyId: string, invoiceNo: string, type?: 'B2C' | 'B2B' | 'Quotation', excludeReturnId?: string) =>
    api.get<{ success: boolean; data: unknown }>('/sales/b2c/search', { params: { companyId, invoiceNo, type, excludeReturnId } }),
  createB2C: (data: B2CInvoiceInput) =>
    api.post<{ success: boolean; data: { invoiceId: string; invoiceNo: string } }>('/sales/b2c', data),
  updateB2C: (id: string, data: B2CInvoiceInput) =>
    api.put<{ success: boolean; data: { invoiceId: string; invoiceNo: string } }>(`/sales/b2c/${id}`, data),
  deleteB2C: (id: string, companyId: string) =>
    api.delete(`/sales/b2c/${id}`, { params: { companyId } }),
  getProductCustomerHistory: (companyId: string, productId: string, customerId?: string, type?: 'POS' | 'B2C' | 'B2B' | 'Quotation') =>
    api.get<{ success: boolean; data: { history: Array<{ invoiceNo: string; date: string; customerName: string; quantity: number; unitPrice: number; unitName: string; discount: number; total: number; batchNumber: string }>; totalPurchased: number; totalReturned: number; netReturnable: number } }>(
      `/sales/b2c/product-history/${productId}`,
      { params: { companyId, ...(customerId ? { customerId } : {}), type } }
    ),

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

  getProductStock: (companyId: string, productId: string) =>
    api.get<{ success: boolean; data: { stock: number } }>(`/stock/product-stock/${productId}`, {
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

export const ledgerApi = {
  entriesByVoucher: (voucherId: string) =>
    api.get<{ success: boolean; data: Array<{ ledgerAccountCode: string; ledgerAccountName: string; debitAmount: number; creditAmount: number; narration?: string }> }>(
      '/ledger/entries-by-voucher',
      { params: { voucherId } }
    ),
  trialBalance: (companyId: string, financialYearId: string, asAtDate?: string) =>
    api.get<{ success: boolean; data: { rows: unknown[]; totalDebit: number; totalCredit: number; balanced: boolean } }>(
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
    api.get<{ success: boolean; data: { income: number; expenses: number; netProfit: number; groups: unknown[] } }>(
      '/ledger/profit-loss',
      { params: { companyId, financialYearId, fromDate, toDate } }
    ),
  balanceSheet: (companyId: string, financialYearId: string, asAtDate?: string) =>
    api.get<{ success: boolean; data: { assets: number; liabilities: number; equity: number; balanced: boolean; groups: unknown[] } }>(
      '/ledger/balance-sheet',
      { params: { companyId, financialYearId, asAtDate } }
    ),
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
  list: (companyId: string, type?: string, search?: string) =>
    api.get<{ success: boolean; data: unknown[] }>('/ledger-accounts', { params: { companyId, type, search } }),
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

export const auditLogApi = {
  list: (params?: { companyId?: string; userId?: string; entityType?: string; action?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }) =>
    api.get<{ success: boolean; data: { logs: unknown[]; total: number } }>('/audit-logs', { params }),
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
