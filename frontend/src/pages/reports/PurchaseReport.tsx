import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Autocomplete,
  TextField,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  CircularProgress,
  InputAdornment,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Print as PrintIcon,
  FileDownload as FileDownloadIcon,
  FilterList as FilterListIcon,
  CalendarMonth as CalendarMonthIcon,
  ShoppingCart as ShoppingCartIcon,
  AttachMoney as AttachMoneyIcon,
  ReceiptLong as ReceiptLongIcon,
  Clear as ClearIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  FilterAlt as FilterAltIcon,
  Close as CloseIcon,
  Inventory2 as Inventory2Icon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { purchaseApi, productApi } from '../../services/api';
import DateInput, { getCurrentDate, formatDateDisplay } from '../../components/DateInput';
import ColumnManagerDrawer, { ColumnDefinition } from '../../components/reports/ColumnManagerDrawer';

// Interfaces
interface ProductOption {
  _id: string;
  name: string;
  code?: string;
  sku?: string;
  systemBarcode?: string;
  internationalBarcode?: string;
  genericName?: string;
  officialCode?: string;
  purchasePrice?: number;
}

type FilterType = 'default' | 'daily' | 'monthly' | 'product' | 'product_total' | 'month';
type PurchaseTypeOption = 'Purchase' | 'PurchaseOrder' | 'PurchaseReturn' | 'OpeningStock' | 'OpeningPurchase';

const formatAED = (val?: number | null) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Storage Keys for F5 Column Customization
const STORAGE_KEY_INVOICE = 'purchase_report_invoice_cols_v2';
const STORAGE_KEY_DAILY = 'purchase_report_daily_cols_v1';
const STORAGE_KEY_MONTHLY = 'purchase_report_monthly_cols_v1';
const STORAGE_KEY_PROD_SUM = 'purchase_report_prod_sum_cols_v1';
const STORAGE_KEY_PROD_DET = 'purchase_report_prod_det_cols_v1';
const STORAGE_KEY_MONTH_BASE = 'purchase_report_month_base_cols_v1';

// Default Column Definitions
const DEFAULT_INVOICE_COLUMNS: ColumnDefinition[] = [
  { id: 'entryNumber', label: 'Entry Number', defaultLabel: 'Entry Number', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'supplierInvoiceNo', label: 'Supplier Inv No', defaultLabel: 'Supplier Inv No', width: 125, defaultWidth: 125, visible: true, align: 'left' },
  { id: 'date', label: 'Date', defaultLabel: 'Date', width: 95, defaultWidth: 95, visible: true, align: 'left' },
  { id: 'supplierName', label: 'Supplier Name', defaultLabel: 'Supplier Name', width: 180, defaultWidth: 180, visible: true, align: 'left' },
  { id: 'paymentType', label: 'Payment Type', defaultLabel: 'Payment Type', width: 105, defaultWidth: 105, visible: true, align: 'left' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'itemsDiscount', label: 'Items Discount', defaultLabel: 'Items Discount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'otherDiscount', label: 'Other Discount', defaultLabel: 'Other Discount', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'freightCharge', label: 'Freight Charge', defaultLabel: 'Freight Charge', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'otherCharge', label: 'Other Charge', defaultLabel: 'Other Charge', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'vatAmount', label: 'VAT Amount', defaultLabel: 'VAT Amount', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'roundoff', label: 'Round Off', defaultLabel: 'Round Off', width: 85, defaultWidth: 85, visible: true, align: 'right' },
  { id: 'grandTotal', label: 'Grand Total', defaultLabel: 'Grand Total', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'user', label: 'User', defaultLabel: 'User', width: 100, defaultWidth: 100, visible: true, align: 'left' },
  { id: 'location', label: 'Location', defaultLabel: 'Location', width: 110, defaultWidth: 110, visible: true, align: 'left' },
];

const DEFAULT_DAILY_COLUMNS: ColumnDefinition[] = [
  { id: 'date', label: 'Date', defaultLabel: 'Date', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'itemsDiscount', label: 'Items Discount', defaultLabel: 'Items Discount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'otherDiscount', label: 'Other Discount', defaultLabel: 'Other Discount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'freightCharge', label: 'Freight Charge', defaultLabel: 'Freight Charge', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'otherCharge', label: 'Other Charge', defaultLabel: 'Other Charge', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'vatAmount', label: 'VAT Amount', defaultLabel: 'VAT Amount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'roundoff', label: 'Round Off', defaultLabel: 'Round Off', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'grandTotal', label: 'Grand Total', defaultLabel: 'Grand Total', width: 120, defaultWidth: 120, visible: true, align: 'right' },
  { id: 'totalQuantity', label: 'Total Qty', defaultLabel: 'Total Qty', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'invoiceCount', label: 'Invoice Count', defaultLabel: 'Invoice Count', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'cashPaid', label: 'Cash Paid', defaultLabel: 'Cash Paid', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'creditAmount', label: 'Credit Amount', defaultLabel: 'Credit Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
];

const DEFAULT_MONTHLY_COLUMNS: ColumnDefinition[] = [
  { id: 'month', label: 'Month', defaultLabel: 'Month', width: 140, defaultWidth: 140, visible: true, align: 'left' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'itemsDiscount', label: 'Items Discount', defaultLabel: 'Items Discount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'otherDiscount', label: 'Other Discount', defaultLabel: 'Other Discount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'freightCharge', label: 'Freight Charge', defaultLabel: 'Freight Charge', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'otherCharge', label: 'Other Charge', defaultLabel: 'Other Charge', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'vatAmount', label: 'VAT Amount', defaultLabel: 'VAT Amount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'roundoff', label: 'Round Off', defaultLabel: 'Round Off', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'grandTotal', label: 'Grand Total', defaultLabel: 'Grand Total', width: 120, defaultWidth: 120, visible: true, align: 'right' },
  { id: 'totalQuantity', label: 'Total Qty', defaultLabel: 'Total Qty', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'invoiceCount', label: 'Invoice Count', defaultLabel: 'Invoice Count', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'cashPaid', label: 'Cash Paid', defaultLabel: 'Cash Paid', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'creditAmount', label: 'Credit Amount', defaultLabel: 'Credit Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
];

const DEFAULT_PROD_SUM_COLUMNS: ColumnDefinition[] = [
  { id: 'productCode', label: 'Product Code', defaultLabel: 'Product Code', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'productName', label: 'Product Name', defaultLabel: 'Product Name', width: 220, defaultWidth: 220, visible: true, align: 'left' },
  { id: 'productBarcode', label: 'Product Barcode', defaultLabel: 'Product Barcode', width: 130, defaultWidth: 130, visible: true, align: 'left' },
  { id: 'productOfficialName', label: 'Product Official Name', defaultLabel: 'Product Official Name', width: 150, defaultWidth: 150, visible: true, align: 'left' },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'supplierName', label: 'Supplier Name', defaultLabel: 'Supplier Name', width: 180, defaultWidth: 180, visible: true, align: 'left' },
  { id: 'unit', label: 'Unit', defaultLabel: 'Unit', width: 75, defaultWidth: 75, visible: true, align: 'left' },
  { id: 'qty', label: 'Qty', defaultLabel: 'Qty', width: 80, defaultWidth: 80, visible: true, align: 'right' },
  { id: 'avgPurchasePrice', label: 'Avg Purchase Rate', defaultLabel: 'Avg Purchase Rate', width: 125, defaultWidth: 125, visible: true, align: 'right' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'discount', label: 'Discount', defaultLabel: 'Discount', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'vat', label: 'VAT', defaultLabel: 'VAT', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'totalAmount', label: 'Total Amount', defaultLabel: 'Total Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'invoiceCount', label: 'Invoice Count', defaultLabel: 'Invoice Count', width: 95, defaultWidth: 95, visible: true, align: 'right' },
];

const DEFAULT_PROD_DET_COLUMNS: ColumnDefinition[] = [
  { id: 'date', label: 'Date', defaultLabel: 'Date', width: 95, defaultWidth: 95, visible: true, align: 'left' },
  { id: 'invNumber', label: 'Inv Number', defaultLabel: 'Inv Number', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'supplierInvoiceNo', label: 'Supplier Inv No', defaultLabel: 'Supplier Inv No', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'supplierName', label: 'Supplier Name', defaultLabel: 'Supplier Name', width: 160, defaultWidth: 160, visible: true, align: 'left' },
  { id: 'productCode', label: 'Product Code', defaultLabel: 'Product Code', width: 105, defaultWidth: 105, visible: true, align: 'left' },
  { id: 'productName', label: 'Product Name', defaultLabel: 'Product Name', width: 180, defaultWidth: 180, visible: true, align: 'left' },
  { id: 'productBarcode', label: 'Product Barcode', defaultLabel: 'Product Barcode', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'productOfficialName', label: 'Product Official Name', defaultLabel: 'Product Official Name', width: 140, defaultWidth: 140, visible: true, align: 'left' },
  { id: 'batchNumber', label: 'Batch Number', defaultLabel: 'Batch Number', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'expiryDate', label: 'Expiry Date', defaultLabel: 'Expiry Date', width: 100, defaultWidth: 100, visible: true, align: 'left' },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'unit', label: 'Unit', defaultLabel: 'Unit', width: 75, defaultWidth: 75, visible: true, align: 'left' },
  { id: 'qty', label: 'Qty', defaultLabel: 'Qty', width: 80, defaultWidth: 80, visible: true, align: 'right' },
  { id: 'purchasePrice', label: 'Purchase Rate', defaultLabel: 'Purchase Rate', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'discount', label: 'Discount', defaultLabel: 'Discount', width: 85, defaultWidth: 85, visible: true, align: 'right' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'vat', label: 'VAT', defaultLabel: 'VAT', width: 90, defaultWidth: 90, visible: true, align: 'right' },
  { id: 'totalAmount', label: 'Total Amount', defaultLabel: 'Total Amount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'retail', label: 'Retail Price', defaultLabel: 'Retail Price', width: 100, defaultWidth: 100, visible: true, align: 'right' },
];

const DEFAULT_MONTH_BASE_COLUMNS: ColumnDefinition[] = [
  { id: 'itemName', label: 'Item Name', defaultLabel: 'Item Name', width: 220, defaultWidth: 220, visible: true, align: 'left' },
  { id: 'barcode', label: 'Barcode', defaultLabel: 'Barcode', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'officialName', label: 'Official Name', defaultLabel: 'Official Name', width: 150, defaultWidth: 150, visible: true, align: 'left' },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'supplierName', label: 'Supplier Name', defaultLabel: 'Supplier Name', width: 160, defaultWidth: 160, visible: true, align: 'left' },
];

function loadSavedColumns(key: string, defaultCols: ColumnDefinition[]): ColumnDefinition[] {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed: ColumnDefinition[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged: ColumnDefinition[] = [];
        const seen = new Set<string>();
        for (const col of parsed) {
          const def = defaultCols.find((d) => d.id === col.id);
          if (def) {
            merged.push({
              ...def,
              label: col.label || def.defaultLabel,
              width: typeof col.width === 'number' && col.width >= 20 ? col.width : def.defaultWidth,
              visible: typeof col.visible === 'boolean' ? col.visible : def.visible,
            });
            seen.add(col.id);
          }
        }
        for (const def of defaultCols) {
          if (!seen.has(def.id)) {
            merged.push(def);
          }
        }
        return merged;
      }
    }
  } catch {
    // fallback
  }
  return defaultCols;
}

export default function PurchaseReport() {
  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Filter States
  const [filterType, setFilterType] = useState<FilterType>('default');
  const [purchaseType, setPurchaseType] = useState<PurchaseTypeOption>('Purchase');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);

  // Invoice-Wise Specific Filter States (Supplier Name, User, Payment Type, Location)
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterPaymentType, setFilterPaymentType] = useState<string>('ALL');
  const [filterLocation, setFilterLocation] = useState<string>('');
  // Temp states for invoice filter dialog
  const [tempSupplier, setTempSupplier] = useState<string>('');
  const [tempUser, setTempUser] = useState<string>('');
  const [tempPaymentType, setTempPaymentType] = useState<string>('ALL');
  const [tempLocation, setTempLocation] = useState<string>('');

  // Product-Wise Specific Filter States (Supplier Name, Barcode, Official Name, Category, Brand)
  const [productFilterModalOpen, setProductFilterModalOpen] = useState<boolean>(false);
  const [filterProdSupplier, setFilterProdSupplier] = useState<string>('');
  const [filterProdBarcode, setFilterProdBarcode] = useState<string>('');
  const [filterProdOfficialName, setFilterProdOfficialName] = useState<string>('');
  const [filterProdCategory, setFilterProdCategory] = useState<string>('');
  const [filterProdBrand, setFilterProdBrand] = useState<string>('');
  // Temp states for product filter dialog
  const [tempProdSupplier, setTempProdSupplier] = useState<string>('');
  const [tempProdBarcode, setTempProdBarcode] = useState<string>('');
  const [tempProdOfficialName, setTempProdOfficialName] = useState<string>('');
  const [tempProdCategory, setTempProdCategory] = useState<string>('');
  const [tempProdBrand, setTempProdBrand] = useState<string>('');

  // Date filters: default to start of current month until today
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });
  const [toDate, setToDate] = useState<string>(() => getCurrentDate());
  const [datePreset, setDatePreset] = useState<'today' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'>('thisMonth');

  // Search & Progressive Scroll Rendering (Loads screen-fitting rows first, more on scroll)
  const INITIAL_ROW_COUNT = 40;
  const BATCH_ROW_COUNT = 40;
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [displayedCount, setDisplayedCount] = useState<number>(INITIAL_ROW_COUNT);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Helper to scroll table container to top
  const scrollToTop = useCallback(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, []);

  // Row selection & Keyboard Navigation (Up/Down arrow)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // Data states
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<any[]>([]);
  const [monthsMeta, setMonthsMeta] = useState<Array<{ key: string; label: string }>>([]);

  // Products for Autocomplete
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);

  // Column Manager State (F5 Window)
  const [columnManagerOpen, setColumnManagerOpen] = useState<boolean>(false);
  const [invoiceColumns, setInvoiceColumns] = useState<ColumnDefinition[]>(() =>
    loadSavedColumns(STORAGE_KEY_INVOICE, DEFAULT_INVOICE_COLUMNS)
  );
  const [dailyColumns, setDailyColumns] = useState<ColumnDefinition[]>(() =>
    loadSavedColumns(STORAGE_KEY_DAILY, DEFAULT_DAILY_COLUMNS)
  );
  const [monthlyColumns, setMonthlyColumns] = useState<ColumnDefinition[]>(() =>
    loadSavedColumns(STORAGE_KEY_MONTHLY, DEFAULT_MONTHLY_COLUMNS)
  );
  const [prodSumColumns, setProdSumColumns] = useState<ColumnDefinition[]>(() =>
    loadSavedColumns(STORAGE_KEY_PROD_SUM, DEFAULT_PROD_SUM_COLUMNS)
  );
  const [prodDetColumns, setProdDetColumns] = useState<ColumnDefinition[]>(() =>
    loadSavedColumns(STORAGE_KEY_PROD_DET, DEFAULT_PROD_DET_COLUMNS)
  );
  const [monthBaseColumns, setMonthBaseColumns] = useState<ColumnDefinition[]>(() =>
    loadSavedColumns(STORAGE_KEY_MONTH_BASE, DEFAULT_MONTH_BASE_COLUMNS)
  );

  // F5 Keyboard Shortcut listener for Column Manager Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        setColumnManagerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Determine current active columns & storage key based on active view
  const activeColumns = useMemo(() => {
    if (filterType === 'default') return invoiceColumns;
    if (filterType === 'daily') return dailyColumns;
    if (filterType === 'monthly') return monthlyColumns;
    if (filterType === 'product') return prodDetColumns;
    if (filterType === 'product_total') return prodSumColumns;
    return monthBaseColumns;
  }, [filterType, invoiceColumns, dailyColumns, monthlyColumns, prodDetColumns, prodSumColumns, monthBaseColumns]);

  const activeStorageKey = useMemo(() => {
    if (filterType === 'default') return STORAGE_KEY_INVOICE;
    if (filterType === 'daily') return STORAGE_KEY_DAILY;
    if (filterType === 'monthly') return STORAGE_KEY_MONTHLY;
    if (filterType === 'product') return STORAGE_KEY_PROD_DET;
    if (filterType === 'product_total') return STORAGE_KEY_PROD_SUM;
    return STORAGE_KEY_MONTH_BASE;
  }, [filterType]);

  const handleColumnsChange = useCallback(
    (newCols: ColumnDefinition[]) => {
      if (filterType === 'default') {
        setInvoiceColumns(newCols);
      } else if (filterType === 'daily') {
        setDailyColumns(newCols);
      } else if (filterType === 'monthly') {
        setMonthlyColumns(newCols);
      } else if (filterType === 'product') {
        setProdDetColumns(newCols);
      } else if (filterType === 'product_total') {
        setProdSumColumns(newCols);
      } else {
        setMonthBaseColumns(newCols);
      }
    },
    [filterType]
  );

  const handleResetColumns = useCallback(() => {
    if (filterType === 'default') {
      setInvoiceColumns(DEFAULT_INVOICE_COLUMNS);
      try { localStorage.removeItem(STORAGE_KEY_INVOICE); } catch {}
    } else if (filterType === 'daily') {
      setDailyColumns(DEFAULT_DAILY_COLUMNS);
      try { localStorage.removeItem(STORAGE_KEY_DAILY); } catch {}
    } else if (filterType === 'monthly') {
      setMonthlyColumns(DEFAULT_MONTHLY_COLUMNS);
      try { localStorage.removeItem(STORAGE_KEY_MONTHLY); } catch {}
    } else if (filterType === 'product') {
      setProdDetColumns(DEFAULT_PROD_DET_COLUMNS);
      try { localStorage.removeItem(STORAGE_KEY_PROD_DET); } catch {}
    } else if (filterType === 'product_total') {
      setProdSumColumns(DEFAULT_PROD_SUM_COLUMNS);
      try { localStorage.removeItem(STORAGE_KEY_PROD_SUM); } catch {}
    } else {
      setMonthBaseColumns(DEFAULT_MONTH_BASE_COLUMNS);
      try { localStorage.removeItem(STORAGE_KEY_MONTH_BASE); } catch {}
    }
  }, [filterType]);

  // Load products list for the product dropdown
  useEffect(() => {
    if (!companyId) return;
    setLoadingProducts(true);
    productApi
      .list(companyId, { limit: 5000 })
      .then((res) => {
        const d = res.data?.data as { products: ProductOption[] };
        setProducts(d?.products || []);
      })
      .catch((err) => {
        console.error('Failed to load products list:', err);
      })
      .finally(() => {
        setLoadingProducts(false);
      });
  }, [companyId]);

  // Fetch report data
  const fetchReport = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    purchaseApi
      .getPurchaseReport({
        companyId,
        financialYearId: financialYearId || undefined,
        filterType,
        purchaseType,
        productId: (filterType === 'product' || filterType === 'product_total' || filterType === 'month') && selectedProduct ? selectedProduct._id : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: searchQuery.trim() || undefined,
      })
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setRows(res.data.data.rows || []);
          setMonthsMeta(res.data.data.months || []);
        } else {
          setRows([]);
        }
        setDisplayedCount(INITIAL_ROW_COUNT);
        scrollToTop();
      })
      .catch((err) => {
        console.error('Failed to fetch purchase report:', err);
        setRows([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [companyId, financialYearId, filterType, purchaseType, selectedProduct, fromDate, toDate, searchQuery, scrollToTop]);

  // Automatically trigger fetch when key filters change
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/purchase-report') {
        fetchReport();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/purchase-report') || window.location.pathname.includes('/report/purchase-report')) {
        fetchReport();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [fetchReport]);

  // Handle Preset Date selection
  const handleApplyPreset = (preset: 'today' | 'thisMonth' | 'lastMonth' | 'thisYear') => {
    setDatePreset(preset);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    if (preset === 'today') {
      const cur = getCurrentDate();
      setFromDate(cur);
      setToDate(cur);
    } else if (preset === 'thisMonth') {
      const y = today.getFullYear();
      const m = pad(today.getMonth() + 1);
      const lastDay = pad(new Date(y, today.getMonth() + 1, 0).getDate());
      setFromDate(`${y}-${m}-01`);
      setToDate(`${y}-${m}-${lastDay}`);
    } else if (preset === 'lastMonth') {
      const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
      const m = pad(today.getMonth() === 0 ? 12 : today.getMonth());
      const lastDay = pad(new Date(y, Number(m), 0).getDate());
      setFromDate(`${y}-${m}-01`);
      setToDate(`${y}-${m}-${lastDay}`);
    } else if (preset === 'thisYear') {
      const y = today.getFullYear();
      setFromDate(`${y}-01-01`);
      setToDate(`${y}-12-31`);
    }
  };

  // Visible columns calculated from activeColumns and current purchaseType filter
  const visibleColumns = useMemo(() => {
    let cols = activeColumns.filter((c) => c.visible);

    if (purchaseType === 'PurchaseOrder') {
      // If purchase order no need payment type column
      cols = cols.filter((c) => c.id !== 'paymentType');
    } else if (purchaseType === 'OpeningStock') {
      // Remove payment type and customer/supplier name on opening stock type, plus supplier invoice no
      cols = cols.filter((c) => c.id !== 'paymentType' && c.id !== 'supplierName' && c.id !== 'supplierInvoiceNo');
    }

    return cols;
  }, [activeColumns, purchaseType]);

  // Total min width for table container
  const tableMinWidth = useMemo(() => {
    if (filterType === 'month') {
      const baseWidth = visibleColumns.reduce((sum, col) => sum + col.width, 0);
      return Math.max(1100, baseWidth + monthsMeta.length * 160 + 160);
    }
    return Math.max(1050, visibleColumns.reduce((sum, col) => sum + col.width, 0));
  }, [visibleColumns, filterType, monthsMeta]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!rows.length) return;
    let headers: string[] = [];
    let csvRows: string[] = [];

    if (filterType === 'month') {
      headers = visibleColumns.map((c) => c.label);
      monthsMeta.forEach((m) => {
        headers.push(`${m.label} Qty`);
        headers.push(`${m.label} Amount`);
      });
      headers.push('Total Qty');
      headers.push('Total Amount');

      csvRows = rows.map((r) => {
        const line = visibleColumns.map((c) => `"${(r[c.id] || '').toString().replace(/"/g, '""')}"`);
        monthsMeta.forEach((m) => {
          const md = r.monthlyData?.[m.key] || { qty: 0, amount: 0 };
          line.push(String(md.qty ?? 0));
          line.push(String(md.amount ?? 0));
        });
        line.push(String(r.totalQty ?? 0));
        line.push(String(r.totalAmount ?? 0));
        return line.join(',');
      });
    } else {
      headers = visibleColumns.map((c) => c.label);
      csvRows = rows.map((r) => {
        const line = visibleColumns.map((c) => {
          const val = r[c.id];
          if (c.id === 'date') return `"${formatDateDisplay(val)}"`;
          if (typeof val === 'number') return String(val);
          return `"${(val || '').toString().replace(/"/g, '""')}"`;
        });
        return line.join(',');
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PurchaseReport_${filterType}_${purchaseType}_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Count active invoice filters
  const activeInvoiceFilterCount = useMemo(() => {
    let count = 0;
    if (filterSupplier.trim()) count++;
    if (filterUser.trim()) count++;
    if (filterPaymentType !== 'ALL') count++;
    if (filterLocation.trim()) count++;
    return count;
  }, [filterSupplier, filterUser, filterPaymentType, filterLocation]);

  // Distinct options for supplier, user, location from rows
  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.supplierName && typeof r.supplierName === 'string') set.add(r.supplierName);
    });
    return Array.from(set).sort();
  }, [rows]);

  const userOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.user && typeof r.user === 'string') set.add(r.user);
    });
    return Array.from(set).sort();
  }, [rows]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.location && typeof r.location === 'string') set.add(r.location);
    });
    return Array.from(set).sort();
  }, [rows]);

  const handleOpenFilterModal = () => {
    setTempSupplier(filterSupplier);
    setTempUser(filterUser);
    setTempPaymentType(filterPaymentType);
    setTempLocation(filterLocation);
    setFilterModalOpen(true);
  };

  const handleApplyFilters = () => {
    setFilterSupplier(tempSupplier);
    setFilterUser(tempUser);
    setFilterPaymentType(tempPaymentType);
    setFilterLocation(tempLocation);
    setFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  const handleClearFilters = () => {
    setTempSupplier('');
    setTempUser('');
    setTempPaymentType('ALL');
    setTempLocation('');
    setFilterSupplier('');
    setFilterUser('');
    setFilterPaymentType('ALL');
    setFilterLocation('');
    setFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  // Count active product filters
  const activeProductFilterCount = useMemo(() => {
    let count = 0;
    if (filterProdSupplier.trim()) count++;
    if (filterProdBarcode.trim()) count++;
    if (filterProdOfficialName.trim()) count++;
    if (filterProdCategory.trim()) count++;
    if (filterProdBrand.trim()) count++;
    return count;
  }, [filterProdSupplier, filterProdBarcode, filterProdOfficialName, filterProdCategory, filterProdBrand]);

  // Distinct options for product filters from rows
  const prodSupplierOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (Array.isArray(r.supplierNames)) {
        r.supplierNames.forEach((sn: string) => sn && set.add(sn));
      } else if (r.supplierName && typeof r.supplierName === 'string') {
        set.add(r.supplierName);
      }
    });
    return Array.from(set).sort();
  }, [rows]);

  const prodBarcodeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const b = r.productBarcode || r.barcode;
      if (b && typeof b === 'string') set.add(b);
    });
    return Array.from(set).sort();
  }, [rows]);

  const prodOfficialNameOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const o = r.productOfficialName || r.officialName;
      if (o && typeof o === 'string') set.add(o);
    });
    return Array.from(set).sort();
  }, [rows]);

  const prodCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.category && typeof r.category === 'string') set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  const prodBrandOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.brand && typeof r.brand === 'string') set.add(r.brand);
    });
    return Array.from(set).sort();
  }, [rows]);

  const handleOpenProductFilterModal = () => {
    setTempProdSupplier(filterProdSupplier);
    setTempProdBarcode(filterProdBarcode);
    setTempProdOfficialName(filterProdOfficialName);
    setTempProdCategory(filterProdCategory);
    setTempProdBrand(filterProdBrand);
    setProductFilterModalOpen(true);
  };

  const handleApplyProductFilters = () => {
    setFilterProdSupplier(tempProdSupplier);
    setFilterProdBarcode(tempProdBarcode);
    setFilterProdOfficialName(tempProdOfficialName);
    setFilterProdCategory(tempProdCategory);
    setFilterProdBrand(tempProdBrand);
    setProductFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  const handleClearProductFilters = () => {
    setTempProdSupplier('');
    setTempProdBarcode('');
    setTempProdOfficialName('');
    setTempProdCategory('');
    setTempProdBrand('');
    setFilterProdSupplier('');
    setFilterProdBarcode('');
    setFilterProdOfficialName('');
    setFilterProdCategory('');
    setFilterProdBrand('');
    setProductFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  // Filtered rows by search query, invoice-wise, and product-wise filters
  const filteredRows = useMemo(() => {
    let result = rows;

    if (filterType === 'default') {
      if (filterSupplier.trim()) {
        const sTarget = filterSupplier.trim().toLowerCase();
        result = result.filter((r) => r.supplierName && r.supplierName.toLowerCase() === sTarget);
      }
      if (filterUser.trim()) {
        const uTarget = filterUser.trim().toLowerCase();
        result = result.filter((r) => r.user && r.user.toLowerCase() === uTarget);
      }
      if (filterPaymentType !== 'ALL') {
        result = result.filter((r) => r.paymentType === filterPaymentType);
      }
      if (filterLocation.trim()) {
        const lTarget = filterLocation.trim().toLowerCase();
        result = result.filter((r) => r.location && r.location.toLowerCase() === lTarget);
      }
    }

    if (filterType === 'product' || filterType === 'product_total' || filterType === 'month') {
      if (filterProdSupplier.trim()) {
        const sTarget = filterProdSupplier.trim().toLowerCase();
        result = result.filter((r) => {
          if (Array.isArray(r.supplierNames)) {
            return r.supplierNames.some((sn: string) => sn && sn.toLowerCase().includes(sTarget));
          }
          return r.supplierName && r.supplierName.toLowerCase().includes(sTarget);
        });
      }
      if (filterProdBarcode.trim()) {
        const bTarget = filterProdBarcode.trim().toLowerCase();
        result = result.filter((r) => {
          const b = r.productBarcode || r.barcode;
          return b && b.toLowerCase().includes(bTarget);
        });
      }
      if (filterProdOfficialName.trim()) {
        const oTarget = filterProdOfficialName.trim().toLowerCase();
        result = result.filter((r) => {
          const o = r.productOfficialName || r.officialName;
          return o && o.toLowerCase().includes(oTarget);
        });
      }
      if (filterProdCategory.trim()) {
        const catTarget = filterProdCategory.trim().toLowerCase();
        result = result.filter((r) => r.category && r.category.toLowerCase().includes(catTarget));
      }
      if (filterProdBrand.trim()) {
        const brTarget = filterProdBrand.trim().toLowerCase();
        result = result.filter((r) => r.brand && r.brand.toLowerCase().includes(brTarget));
      }
    }

    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase().trim();
    return result.filter((r) => {
      if (filterType === 'default') {
        return (
          (r.entryNumber && String(r.entryNumber).toLowerCase().includes(q)) ||
          (r.supplierInvoiceNo && String(r.supplierInvoiceNo).toLowerCase().includes(q)) ||
          (r.supplierName && String(r.supplierName).toLowerCase().includes(q)) ||
          (r.user && String(r.user).toLowerCase().includes(q)) ||
          (r.location && String(r.location).toLowerCase().includes(q)) ||
          (r.paymentType && String(r.paymentType).toLowerCase().includes(q))
        );
      }
      if (filterType === 'product') {
        return (
          (r.productName && String(r.productName).toLowerCase().includes(q)) ||
          (r.productCode && String(r.productCode).toLowerCase().includes(q)) ||
          (r.productBarcode && String(r.productBarcode).toLowerCase().includes(q)) ||
          (r.productOfficialName && String(r.productOfficialName).toLowerCase().includes(q)) ||
          (r.category && String(r.category).toLowerCase().includes(q)) ||
          (r.brand && String(r.brand).toLowerCase().includes(q)) ||
          (r.invNumber && String(r.invNumber).toLowerCase().includes(q)) ||
          (r.supplierInvoiceNo && String(r.supplierInvoiceNo).toLowerCase().includes(q)) ||
          (r.supplierName && String(r.supplierName).toLowerCase().includes(q)) ||
          (r.batchNumber && String(r.batchNumber).toLowerCase().includes(q))
        );
      }
      if (filterType === 'product_total') {
        return (
          (r.productName && String(r.productName).toLowerCase().includes(q)) ||
          (r.productCode && String(r.productCode).toLowerCase().includes(q)) ||
          (r.productBarcode && String(r.productBarcode).toLowerCase().includes(q)) ||
          (r.productOfficialName && String(r.productOfficialName).toLowerCase().includes(q)) ||
          (r.category && String(r.category).toLowerCase().includes(q)) ||
          (r.brand && String(r.brand).toLowerCase().includes(q)) ||
          (r.supplierName && String(r.supplierName).toLowerCase().includes(q))
        );
      }
      if (filterType === 'daily') {
        const formatted = formatDateDisplay(r.date).toLowerCase();
        return formatted.includes(q) || String(r.date).toLowerCase().includes(q);
      }
      if (filterType === 'monthly') {
        return (
          (r.month && String(r.month).toLowerCase().includes(q)) ||
          (r.monthKey && String(r.monthKey).toLowerCase().includes(q))
        );
      }
      if (filterType === 'month') {
        return (
          (r.itemName && String(r.itemName).toLowerCase().includes(q)) ||
          (r.barcode && String(r.barcode).toLowerCase().includes(q)) ||
          (r.officialName && String(r.officialName).toLowerCase().includes(q)) ||
          (r.category && String(r.category).toLowerCase().includes(q)) ||
          (r.brand && String(r.brand).toLowerCase().includes(q)) ||
          (r.supplierName && String(r.supplierName).toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [
    rows,
    searchQuery,
    filterType,
    filterSupplier,
    filterUser,
    filterPaymentType,
    filterLocation,
    filterProdSupplier,
    filterProdBarcode,
    filterProdOfficialName,
    filterProdCategory,
    filterProdBrand,
  ]);

  // Progressively Displayed Rows (Loads batch by batch on scroll for instant window speed)
  const visibleRows = useMemo(() => {
    return filteredRows.slice(0, displayedCount);
  }, [filteredRows, displayedCount]);

  // Reset selected row and scroll when filters or data change
  useEffect(() => {
    setSelectedRowIndex(-1);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  }, [
    filterType,
    purchaseType,
    fromDate,
    toDate,
    filterSupplier,
    filterUser,
    filterPaymentType,
    filterLocation,
    filterProdSupplier,
    filterProdBarcode,
    filterProdOfficialName,
    filterProdCategory,
    filterProdBrand,
    searchQuery,
    scrollToTop,
  ]);

  // Progressive Scroll Handler: loads next batch of rows when scrolling table
  const handleTableScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;
      if (scrollHeight - scrollTop - clientHeight < 250) {
        setDisplayedCount((prev) => {
          if (prev >= filteredRows.length) return prev;
          return Math.min(prev + BATCH_ROW_COUNT, filteredRows.length);
        });
      }
    },
    [filteredRows.length]
  );

  // Double-click / Enter key handler: drill down or open purchase invoice
  const handleRowDoubleClick = useCallback(
    (row: any) => {
      if (!row) return;

      // 1. Product Summary & 12-Month Matrix -> Drill down to detailed itemized product history
      if (filterType === 'product_total' || filterType === 'month') {
        const prodId = row.productId || row._id;
        if (prodId) {
          const prod = products.find((p) => p._id === prodId);
          if (prod) {
            setFilterType('product');
            setSelectedProduct(prod);
          } else {
            // Fallback product object if not in list yet
            setFilterType('product');
            setSelectedProduct({
              _id: prodId,
              name: row.productName || row.itemName || '',
              code: row.productCode || '',
              sku: row.productBarcode || row.barcode || '',
              systemBarcode: row.productBarcode || row.barcode || '',
              genericName: row.productOfficialName || row.officialName || '',
              officialCode: row.productOfficialName || row.officialName || '',
            });
          }
        }
        return;
      }

      // 2. Monthly Wise -> Drill down to Daily breakdown for that month
      if (filterType === 'monthly') {
        if (row.monthKey && row.monthKey !== 'Unknown') {
          const [y, m] = row.monthKey.split('-');
          const lastDay = new Date(Number(y), Number(m), 0).getDate();
          setFromDate(`${y}-${m}-01`);
          setToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
          setDatePreset('custom');
          setFilterType('daily');
        }
        return;
      }

      // 3. Daily Wise -> Drill down to Invoices of that specific date
      if (filterType === 'daily') {
        if (row.date) {
          const dStr = typeof row.date === 'string' ? row.date.substring(0, 10) : '';
          if (dStr) {
            setFromDate(dStr);
            setToDate(dStr);
            setDatePreset('custom');
            setFilterType('default');
          }
        }
        return;
      }

      // 4. Invoice Wise (default) & Product Wise (detailed history) -> Open actual Purchase Invoice, Order, Return, or Opening Stock
      const invNo = row.entryNumber || row.invNumber || row.invoiceNo || '';
      const rawId = row.invoiceId || row._id || '';
      const invId = rawId ? rawId.split('_')[0] : '';
      if (!invNo && !invId) return;

      const pType = row.purchaseType || purchaseType;

      if (pType === 'PurchaseOrder') {
        navigate('/entry/purchase-order', {
          state: {
            orderId: invId,
            invoiceId: invId,
            id: invId,
            invoiceNo: invNo,
          },
        });
        return;
      }
      if (pType === 'PurchaseReturn') {
        navigate('/entry/purchase-return', {
          state: {
            returnId: invId,
            invoiceId: invId,
            id: invId,
            invoiceNo: invNo,
          },
        });
        return;
      }
      if (pType === 'OpeningStock' || pType === 'OpeningPurchase') {
        navigate('/entry/opening-purchase', {
          state: {
            entryId: invId,
            invoiceId: invId,
            id: invId,
            entryNo: invNo,
            invoiceNo: invNo,
          },
        });
        return;
      }

      navigate('/entry/purchase', {
        state: {
          invoiceId: invId,
          id: invId,
          purchaseId: invId,
          invoiceNo: invNo,
        },
      });
    },
    [filterType, purchaseType, products, navigate]
  );

  // Up and Down Arrow Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.getAttribute('role') === 'combobox'
      ) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedRowIndex((prev) => {
          const next = prev < filteredRows.length - 1 ? prev + 1 : prev;
          if (next >= displayedCount - 8 && displayedCount < filteredRows.length) {
            setDisplayedCount((c) => Math.min(c + BATCH_ROW_COUNT, filteredRows.length));
          }
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedRowIndex((prev) => {
          return prev > 0 ? prev - 1 : 0;
        });
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        setSelectedRowIndex((prev) => {
          const next = Math.min(prev + 10, filteredRows.length - 1);
          if (next >= displayedCount - 8 && displayedCount < filteredRows.length) {
            setDisplayedCount((c) => Math.min(c + BATCH_ROW_COUNT * 2, filteredRows.length));
          }
          return next;
        });
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.max(prev - 10, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedRowIndex(0);
        scrollToTop();
      } else if (e.key === 'End') {
        e.preventDefault();
        setSelectedRowIndex(filteredRows.length - 1);
      } else if (e.key === 'Enter') {
        if (selectedRowIndex >= 0 && selectedRowIndex < filteredRows.length) {
          e.preventDefault();
          handleRowDoubleClick(filteredRows[selectedRowIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredRows, displayedCount, selectedRowIndex, handleRowDoubleClick, scrollToTop]);

  // Keep selected row in view when moving via keyboard
  useEffect(() => {
    if (selectedRowIndex >= 0 && rowRefs.current[selectedRowIndex]) {
      const el = rowRefs.current[selectedRowIndex];
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedRowIndex]);

  // Summary KPI Calculations
  const totals = useMemo(() => {
    if (filterType === 'default' || filterType === 'daily' || filterType === 'monthly') {
      return filteredRows.reduce(
        (acc, r) => ({
          grossAmount: acc.grossAmount + (r.grossAmount || 0),
          itemsDiscount: acc.itemsDiscount + (r.itemsDiscount || 0),
          otherDiscount: acc.otherDiscount + (r.otherDiscount || 0),
          totalDiscount: acc.totalDiscount + (r.totalDiscount || (r.itemsDiscount || 0) + (r.otherDiscount || 0)),
          freightCharge: acc.freightCharge + (r.freightCharge || 0),
          otherCharge: acc.otherCharge + (r.otherCharge || 0),
          vatAmount: acc.vatAmount + (r.vatAmount || 0),
          roundoff: acc.roundoff + (r.roundoff || 0),
          grandTotal: acc.grandTotal + (r.grandTotal || 0),
          totalQuantity: acc.totalQuantity + (r.totalQuantity || 0),
          itemCount: acc.itemCount + (r.itemCount || 0),
          cashPaid: acc.cashPaid + (r.cashPaid || (r.paymentType === 'Cash' ? r.grandTotal : 0)),
          creditAmount: acc.creditAmount + (r.creditAmount || (r.paymentType === 'Credit' ? r.grandTotal : 0)),
        }),
        {
          grossAmount: 0,
          itemsDiscount: 0,
          otherDiscount: 0,
          totalDiscount: 0,
          freightCharge: 0,
          otherCharge: 0,
          vatAmount: 0,
          roundoff: 0,
          grandTotal: 0,
          totalQuantity: 0,
          itemCount: 0,
          cashPaid: 0,
          creditAmount: 0,
        }
      );
    }
    if (filterType === 'product' || filterType === 'product_total') {
      return filteredRows.reduce(
        (acc, r) => ({
          qty: acc.qty + (r.qty || 0),
          grossAmount: acc.grossAmount + (r.grossAmount || 0),
          discount: acc.discount + (r.discount || 0),
          vat: acc.vat + (r.vat || 0),
          totalAmount: acc.totalAmount + (r.totalAmount || 0),
        }),
        { qty: 0, grossAmount: 0, discount: 0, vat: 0, totalAmount: 0 }
      );
    }
    if (filterType === 'month') {
      const monthTotals: Record<string, { qty: number; amount: number }> = {};
      monthsMeta.forEach((m) => {
        monthTotals[m.key] = { qty: 0, amount: 0 };
      });
      let grandQty = 0;
      let grandAmount = 0;

      filteredRows.forEach((r) => {
        monthsMeta.forEach((m) => {
          const md = r.monthlyData?.[m.key] || { qty: 0, amount: 0 };
          monthTotals[m.key].qty += md.qty || 0;
          monthTotals[m.key].amount += md.amount || 0;
        });
        grandQty += r.totalQty || 0;
        grandAmount += r.totalAmount || 0;
      });

      return {
        monthTotals,
        grandQty,
        grandAmount,
      };
    }
    return {};
  }, [filteredRows, filterType, monthsMeta]);

  // Helper to render dynamic row cells based on column configuration
  const renderCellContent = (colId: string, row: any) => {
    switch (colId) {
      case 'date':
        return <Typography sx={{ fontSize: '0.80rem', whiteSpace: 'nowrap' }}>{formatDateDisplay(row.date)}</Typography>;
      case 'month':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{row.month}</Typography>;
      case 'entryNumber':
      case 'invNumber':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#0f766e' }}>{row[colId]}</Typography>;
      case 'supplierInvoiceNo':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500, color: '#475569' }}>{row.supplierInvoiceNo || '—'}</Typography>;
      case 'supplierName':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500 }}>{row.supplierName}</Typography>;
      case 'paymentType':
        return (
          <Chip
            label={row.paymentType || 'Credit'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.68rem',
              fontWeight: 600,
              bgcolor: row.paymentType === 'Cash' ? '#ecfdf5' : '#eff6ff',
              color: row.paymentType === 'Cash' ? '#047857' : '#1d4ed8',
              border: `1px solid ${row.paymentType === 'Cash' ? '#a7f3d0' : '#bfdbfe'}`,
            }}
          />
        );
      case 'productCode':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155' }}>{row.productCode || '—'}</Typography>;
      case 'productName':
      case 'itemName':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#0f172a' }}>{row[colId]}</Typography>;
      case 'productBarcode':
      case 'barcode':
        return <Typography sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>{row[colId] || '—'}</Typography>;
      case 'productOfficialName':
      case 'officialName':
        return <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>{row[colId] || '—'}</Typography>;
      case 'batchNumber':
        return <Typography sx={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#0369a1' }}>{row.batchNumber || '—'}</Typography>;
      case 'expiryDate':
        return <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>{row.expiryDate ? formatDateDisplay(row.expiryDate) : '—'}</Typography>;
      case 'category':
      case 'brand':
        return <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>{row[colId] || '—'}</Typography>;
      case 'unit':
        return <Typography sx={{ fontSize: '0.80rem' }}>{row.unit || 'Pcs'}</Typography>;
      case 'qty':
      case 'totalQuantity':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f766e', textAlign: 'right' }}>{row[colId]}</Typography>;
      case 'itemCount':
      case 'invoiceCount':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#475569', textAlign: 'right' }}>{row[colId]}</Typography>;
      case 'itemsDiscount':
      case 'otherDiscount':
      case 'discount':
        return (
          <Typography sx={{ fontSize: '0.80rem', textAlign: 'right', color: row[colId] > 0 ? '#dc2626' : 'inherit' }}>
            {formatAED(row[colId])}
          </Typography>
        );
      case 'vatAmount':
      case 'vat':
        return <Typography sx={{ fontSize: '0.80rem', textAlign: 'right', color: '#b45309' }}>{formatAED(row[colId])}</Typography>;
      case 'grandTotal':
      case 'totalAmount':
        return (
          <Typography sx={{ fontSize: '0.80rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
            {formatAED(row[colId])}
          </Typography>
        );
      case 'purchasePrice':
      case 'avgPurchasePrice':
        return <Typography sx={{ fontSize: '0.80rem', textAlign: 'right', color: '#1e293b' }}>{formatAED(row[colId])}</Typography>;
      case 'user':
      case 'location':
      case 'cashAccount':
        return <Typography sx={{ fontSize: '0.80rem' }}>{row[colId] || '—'}</Typography>;
      case 'cashPaid':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500, color: '#047857', textAlign: 'right' }}>{formatAED(row.cashPaid)}</Typography>;
      case 'creditAmount':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500, color: '#1d4ed8', textAlign: 'right' }}>{formatAED(row.creditAmount)}</Typography>;
      case 'grossAmount':
      case 'freightCharge':
      case 'otherCharge':
      case 'roundoff':
      case 'retail':
      case 'wholesale':
        return <Typography sx={{ fontSize: '0.80rem', textAlign: 'right' }}>{formatAED(row[colId])}</Typography>;
      default:
        return <Typography sx={{ fontSize: '0.80rem' }}>{row[colId] ?? '—'}</Typography>;
    }
  };

  // Helper to render total for each visible column in footer
  const renderFooterTotal = (colId: string) => {
    const t = totals as any;
    switch (colId) {
      case 'grossAmount':
        return formatAED(t.grossAmount);
      case 'itemsDiscount':
        return formatAED(t.itemsDiscount);
      case 'otherDiscount':
        return formatAED(t.otherDiscount);
      case 'discount':
        return formatAED(t.discount);
      case 'freightCharge':
        return formatAED(t.freightCharge);
      case 'otherCharge':
        return formatAED(t.otherCharge);
      case 'vatAmount':
        return formatAED(t.vatAmount);
      case 'vat':
        return formatAED(t.vat);
      case 'roundoff':
        return formatAED(t.roundoff);
      case 'grandTotal':
        return formatAED(t.grandTotal);
      case 'totalAmount':
        return formatAED(t.totalAmount);
      case 'totalQuantity':
      case 'qty':
        return (t.totalQuantity ?? t.qty ?? 0).toLocaleString();
      case 'itemCount':
        return t.itemCount ?? 0;
      case 'invoiceCount':
        return filteredRows.length;
      case 'cashPaid':
        return formatAED(t.cashPaid);
      case 'creditAmount':
        return formatAED(t.creditAmount);
      default:
        return '';
    }
  };

  return (
    <Box
      sx={{
        px: { xs: 1, md: 1.5 },
        pt: 0.5,
        pb: 1,
        bgcolor: '#f8fafc',
        height: 'calc(100vh - 54px)',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Printable Style Sheet */}
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-full-width { width: 100% !important; margin: 0 !important; box-shadow: none !important; }
          table { width: 100% !important; font-size: 9px !important; }
          th, td { padding: 3px 5px !important; }
        }
      `}</style>

      {/* TOP HEADER & TITLE (FITS IN DEFAULT SCREEN) */}
      <Box
        className="no-print"
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1.2,
          mb: 0.6,
          flexShrink: 0,
          width: '100%',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: 1.2,
                bgcolor: '#0f766e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 1px 4px rgba(15,118,110,0.2)',
              }}
            >
              <ShoppingCartIcon sx={{ fontSize: 14 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', fontSize: '0.90rem', lineHeight: 1.15 }}>
                Purchase Report
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500, fontSize: '0.62rem', lineHeight: 1, display: 'block' }}>
                {filterType === 'default' && 'Comprehensive Invoice-Wise Purchase Ledger & Supplier Transactions'}
                {filterType === 'daily' && 'Consolidated Daily Purchase Procurement & Spending Summary'}
                {filterType === 'monthly' && 'Consolidated Month-Wise Purchase Procurement Summary'}
                {filterType === 'product' && !selectedProduct && 'Detailed Product Purchase History (All Products)'}
                {filterType === 'product' && selectedProduct && `Detailed Purchase History for: ${selectedProduct.name}`}
                {filterType === 'product_total' && !selectedProduct && 'Aggregated Product-Wise Purchase Volume & Cost Summary (All Products)'}
                {filterType === 'product_total' && selectedProduct && `Aggregated Purchase Summary for: ${selectedProduct.name}`}
                {filterType === 'month' && 'Monthly Product Purchase Quantities & Spend Matrix'}
                {purchaseType !== 'Purchase' && ` • Type: ${purchaseType === 'PurchaseOrder' ? 'Purchase Order' : purchaseType === 'PurchaseReturn' ? 'Purchase Return' : (purchaseType === 'OpeningStock' || purchaseType === 'OpeningPurchase') ? 'Opening Purchase' : purchaseType}`}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: 13 }} />}
            onClick={fetchReport}
            disabled={loading}
            sx={{
              height: 24,
              px: 0.9,
              py: 0,
              fontSize: '0.64rem',
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#cbd5e1',
              color: '#334155',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' },
            }}
          >
            Refresh
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon sx={{ fontSize: 13 }} />}
            onClick={handleExportCSV}
            disabled={!rows.length}
            sx={{
              height: 24,
              px: 0.9,
              py: 0,
              fontSize: '0.64rem',
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#cbd5e1',
              color: '#0f766e',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f0fdfa', borderColor: '#0d9488' },
            }}
          >
            Export CSV
          </Button>

          <Button
            variant="contained"
            size="small"
            startIcon={<PrintIcon sx={{ fontSize: 13 }} />}
            onClick={() => {
              setDisplayedCount(filteredRows.length);
              setTimeout(() => {
                window.print();
              }, 120);
            }}
            sx={{
              height: 24,
              px: 0.9,
              py: 0,
              fontSize: '0.64rem',
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: '#0f766e',
              boxShadow: '0 1px 4px rgba(15,118,110,0.2)',
              '&:hover': { bgcolor: '#115e59' },
            }}
          >
            Print
          </Button>
        </Box>
      </Box>

      {/* FILTER & CONTROL PANEL (FITS IN DEFAULT SCREEN) */}
      <Card
        className="no-print"
        elevation={0}
        sx={{
          p: 0.8,
          mb: 0.6,
          borderRadius: 1.5,
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: 'none',
          flexShrink: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* ROW 1: PRIMARY REPORT FILTER RADIOS & EXTENSION BAR */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            pb: 0.8,
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <FilterListIcon sx={{ color: '#0f766e', fontSize: 14 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.70rem', color: '#1e293b' }}>
              Report Filter Mode:
            </Typography>
          </Box>

          <FormControl component="fieldset">
            <RadioGroup
              row
              value={filterType}
              onChange={(e) => {
                const nextType = e.target.value as FilterType;
                setFilterType(nextType);
                setSearchQuery('');
                if (nextType !== 'product' && nextType !== 'product_total' && nextType !== 'month') {
                  setSelectedProduct(null);
                }
              }}
              sx={{ gap: { xs: 0.8, md: 1.2 } }}
            >
              {/* 1. Default (Invoice Wise) */}
              <FormControlLabel
                value="default"
                control={
                  <Radio
                    size="small"
                    sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 13 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: filterType === 'default' ? 700 : 500, color: filterType === 'default' ? '#0f766e' : '#334155' }}>
                      Invoice Wise (Default)
                    </Typography>
                    {filterType === 'default' && (
                      <Chip label="Active" size="small" sx={{ height: 14, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.4 }} />
                    )}
                  </Box>
                }
                sx={{
                  m: 0,
                  px: 0.9,
                  py: 0.15,
                  borderRadius: 1.2,
                  bgcolor: filterType === 'default' ? '#f0fdfa' : 'transparent',
                  border: filterType === 'default' ? '1px solid #99f6e4' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              />

              {/* 2. Daily Wise */}
              <FormControlLabel
                value="daily"
                control={
                  <Radio
                    size="small"
                    sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 13 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: filterType === 'daily' ? 700 : 500, color: filterType === 'daily' ? '#0f766e' : '#334155' }}>
                      Daily Wise
                    </Typography>
                    {filterType === 'daily' && (
                      <Chip label="Active" size="small" sx={{ height: 14, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.4 }} />
                    )}
                  </Box>
                }
                sx={{
                  m: 0,
                  px: 0.9,
                  py: 0.15,
                  borderRadius: 1.2,
                  bgcolor: filterType === 'daily' ? '#f0fdfa' : 'transparent',
                  border: filterType === 'daily' ? '1px solid #99f6e4' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              />

              {/* 3. Month Wise */}
              <FormControlLabel
                value="monthly"
                control={
                  <Radio
                    size="small"
                    sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 13 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: filterType === 'monthly' ? 700 : 500, color: filterType === 'monthly' ? '#0f766e' : '#334155' }}>
                      Month Wise
                    </Typography>
                    {filterType === 'monthly' && (
                      <Chip label="Active" size="small" sx={{ height: 14, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.4 }} />
                    )}
                  </Box>
                }
                sx={{
                  m: 0,
                  px: 0.9,
                  py: 0.15,
                  borderRadius: 1.2,
                  bgcolor: filterType === 'monthly' ? '#f0fdfa' : 'transparent',
                  border: filterType === 'monthly' ? '1px solid #99f6e4' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              />

              {/* 4. Product Wise */}
              <FormControlLabel
                value="product"
                control={
                  <Radio
                    size="small"
                    sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 13 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: filterType === 'product' ? 700 : 500, color: filterType === 'product' ? '#0f766e' : '#334155' }}>
                      Product Wise
                    </Typography>
                    {filterType === 'product' && (
                      <Chip label="Active" size="small" sx={{ height: 14, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.4 }} />
                    )}
                  </Box>
                }
                sx={{
                  m: 0,
                  px: 0.9,
                  py: 0.15,
                  borderRadius: 1.2,
                  bgcolor: filterType === 'product' ? '#f0fdfa' : 'transparent',
                  border: filterType === 'product' ? '1px solid #99f6e4' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              />

              {/* 5. Product Wise Total */}
              <FormControlLabel
                value="product_total"
                control={
                  <Radio
                    size="small"
                    sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 13 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: filterType === 'product_total' ? 700 : 500, color: filterType === 'product_total' ? '#0f766e' : '#334155' }}>
                      Product Wise Total
                    </Typography>
                    {filterType === 'product_total' && (
                      <Chip label="Active" size="small" sx={{ height: 14, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.4 }} />
                    )}
                  </Box>
                }
                sx={{
                  m: 0,
                  px: 0.9,
                  py: 0.15,
                  borderRadius: 1.2,
                  bgcolor: filterType === 'product_total' ? '#f0fdfa' : 'transparent',
                  border: filterType === 'product_total' ? '1px solid #99f6e4' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              />

              {/* 6. Month Wise Items */}
              <FormControlLabel
                value="month"
                control={
                  <Radio
                    size="small"
                    sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 13 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: filterType === 'month' ? 700 : 500, color: filterType === 'month' ? '#0f766e' : '#334155' }}>
                      Month Wise Items
                    </Typography>
                    {filterType === 'month' && (
                      <Chip label="Active" size="small" sx={{ height: 14, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.4 }} />
                    )}
                  </Box>
                }
                sx={{
                  m: 0,
                  px: 0.9,
                  py: 0.15,
                  borderRadius: 1.2,
                  bgcolor: filterType === 'month' ? '#f0fdfa' : 'transparent',
                  border: filterType === 'month' ? '1px solid #99f6e4' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              />
            </RadioGroup>
          </FormControl>

          {/* F5: Column Manager Button */}
          <Tooltip title="Press F5 anytime or click to customize order, width, and labels of columns!">
            <Button
              size="small"
              variant="outlined"
              onClick={() => setColumnManagerOpen(true)}
              startIcon={<AddCircleOutlineIcon sx={{ fontSize: '13px !important', color: '#0f766e' }} />}
              sx={{
                height: 22,
                px: 1,
                py: 0,
                borderColor: '#99f6e4',
                bgcolor: '#f0fdfa',
                color: '#0f766e',
                fontWeight: 600,
                fontSize: '0.64rem',
                textTransform: 'none',
                borderRadius: 1.5,
                '&:hover': { bgcolor: '#ccfbf1', borderColor: '#0d9488' },
              }}
            >
              Columns (F5)
            </Button>
          </Tooltip>
        </Box>

        {/* ROW 2: SUB-FILTER (PRODUCT SELECTOR IF PRODUCT WISE, PRODUCT WISE TOTAL, OR MONTH WISE ITEMS SELECTED) */}
        {(filterType === 'product' || filterType === 'product_total' || filterType === 'month') && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.2,
              p: 0.8,
              my: 0.8,
              borderRadius: 1.5,
              bgcolor: '#f8fafc',
              border: '1px dashed #cbd5e1',
            }}
          >
            <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, color: '#334155', minWidth: 100 }}>
              {filterType === 'product_total' ? 'Filter by Product:' : filterType === 'month' ? 'Filter by Product:' : 'Select Product:'}
            </Typography>

            <Box sx={{ minWidth: 260, flex: 1 }}>
              <Autocomplete
                size="small"
                loading={loadingProducts}
                options={products}
                value={selectedProduct}
                onChange={(_, newValue) => {
                  setSelectedProduct(newValue);
                  setDisplayedCount(INITIAL_ROW_COUNT);
                  scrollToTop();
                }}
                getOptionLabel={(option) => {
                  const barcode = option.systemBarcode || option.internationalBarcode || option.sku || '';
                  return `${option.name} ${option.code ? `[${option.code}]` : ''} ${barcode ? `(${barcode})` : ''}`;
                }}
                isOptionEqualToValue={(option, val) => option._id === val._id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search by Product Name, Code, Barcode, or SKU (or leave empty for All)"
                    sx={{
                      '& .MuiInputBase-root': {
                        height: 26,
                        fontSize: '0.70rem',
                        bgcolor: '#ffffff',
                      },
                    }}
                  />
                )}
              />
            </Box>

            {selectedProduct && (
              <Button
                size="small"
                variant="text"
                color="secondary"
                startIcon={<ClearIcon sx={{ fontSize: 13 }} />}
                onClick={() => {
                  setSelectedProduct(null);
                  setDisplayedCount(INITIAL_ROW_COUNT);
                  scrollToTop();
                }}
                sx={{ height: 26, fontSize: '0.66rem', textTransform: 'none', px: 1 }}
              >
                Clear Product Filter
              </Button>
            )}
          </Box>
        )}

        {/* ROW 3: DATE RANGE, PRESETS & QUICK FILTER DIALOG BUTTON */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.2,
            pt: 0.8,
          }}
        >
          {/* Left: Date Presets & Date Inputs */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarMonthIcon sx={{ color: '#0f766e', fontSize: 14 }} />
              <Typography sx={{ fontWeight: 600, fontSize: '0.68rem', color: '#475569' }}>
                Period:
              </Typography>
            </Box>

            {/* Date Preset Buttons */}
            <Box sx={{ display: 'flex', gap: 0.4 }}>
              {(['today', 'thisMonth', 'lastMonth', 'thisYear'] as const).map((preset) => (
                <Button
                  key={preset}
                  size="small"
                  variant={datePreset === preset ? 'contained' : 'outlined'}
                  onClick={() => handleApplyPreset(preset)}
                  sx={{
                    height: 22,
                    px: 0.8,
                    py: 0,
                    fontSize: '0.62rem',
                    borderRadius: 1.2,
                    textTransform: 'none',
                    fontWeight: datePreset === preset ? 700 : 500,
                    bgcolor: datePreset === preset ? '#0f766e' : '#ffffff',
                    borderColor: datePreset === preset ? '#0f766e' : '#cbd5e1',
                    color: datePreset === preset ? '#ffffff' : '#475569',
                    boxShadow: 'none',
                    '&:hover': {
                      bgcolor: datePreset === preset ? '#115e59' : '#f1f5f9',
                      borderColor: datePreset === preset ? '#115e59' : '#94a3b8',
                      boxShadow: 'none',
                    },
                  }}
                >
                  {preset === 'today' && 'Today'}
                  {preset === 'thisMonth' && 'This Month'}
                  {preset === 'lastMonth' && 'Last Month'}
                  {preset === 'thisYear' && 'This Year'}
                </Button>
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, ml: { xs: 0, md: 0.8 } }}>
              <Typography sx={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 500 }}>From:</Typography>
              <Box sx={{ width: 145 }}>
                <DateInput
                  label="From Date"
                  value={fromDate}
                  onChange={(val) => {
                    setFromDate(val);
                    setDatePreset('custom');
                  }}
                  sx={{
                    '& .MuiInputBase-root': { height: 26, minHeight: 26, fontSize: '0.68rem', borderRadius: 1.2 },
                    '& .MuiInputBase-input': { py: '2px !important', pl: '6px !important', pr: '2px !important', fontSize: '0.68rem', letterSpacing: '-0.01em' },
                    '& .MuiInputLabel-root': { fontSize: '0.62rem', top: -3 },
                    '& .MuiIconButton-root': { p: '2px !important', mr: '1px !important' },
                    '& .MuiSvgIcon-root': { fontSize: 13 },
                  }}
                />
              </Box>

              <Typography sx={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 500 }}>To:</Typography>
              <Box sx={{ width: 145 }}>
                <DateInput
                  label="To Date"
                  value={toDate}
                  onChange={(val) => {
                    setToDate(val);
                    setDatePreset('custom');
                  }}
                  sx={{
                    '& .MuiInputBase-root': { height: 26, minHeight: 26, fontSize: '0.68rem', borderRadius: 1.2 },
                    '& .MuiInputBase-input': { py: '2px !important', pl: '6px !important', pr: '2px !important', fontSize: '0.68rem', letterSpacing: '-0.01em' },
                    '& .MuiInputLabel-root': { fontSize: '0.62rem', top: -3 },
                    '& .MuiIconButton-root': { p: '2px !important', mr: '1px !important' },
                    '& .MuiSvgIcon-root': { fontSize: 13 },
                  }}
                />
              </Box>

              {/* Purchase Type Combobox */}
              <Box sx={{ width: 145 }}>
                <TextField
                  select
                  size="small"
                  label="Purchase Type"
                  value={purchaseType}
                  onChange={(e) => {
                    setPurchaseType(e.target.value as PurchaseTypeOption);
                  }}
                  sx={{
                    bgcolor: '#ffffff',
                    '& .MuiOutlinedInput-root': {
                      height: 26,
                      minHeight: 26,
                      fontSize: '0.68rem',
                      borderRadius: 1.2,
                    },
                    '& .MuiSelect-select': {
                      py: '2px !important',
                      pl: '8px !important',
                      pr: '22px !important',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: purchaseType === 'Purchase' ? '#334155' : '#0f766e',
                      display: 'flex',
                      alignItems: 'center',
                    },
                    '& .MuiInputLabel-root': { fontSize: '0.62rem', top: -3 },
                    '& .MuiSvgIcon-root': { fontSize: 16 },
                  }}
                >
                  <MenuItem value="Purchase" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>Purchase Entry</MenuItem>
                  <MenuItem value="PurchaseOrder" sx={{ fontSize: '0.72rem' }}>Purchase Order</MenuItem>
                  <MenuItem value="PurchaseReturn" sx={{ fontSize: '0.72rem' }}>Purchase Return</MenuItem>
                  <MenuItem value="OpeningStock" sx={{ fontSize: '0.72rem' }}>Opening Purchase Entry</MenuItem>
                </TextField>
              </Box>
            </Box>
          </Box>

          {/* Right: Quick Filter Dialog & Live Table Search */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            {/* Quick Filter Modal Button */}
            {filterType === 'default' && (
              <Button
                variant={activeInvoiceFilterCount > 0 ? 'contained' : 'outlined'}
                size="small"
                startIcon={<FilterAltIcon sx={{ fontSize: 13 }} />}
                onClick={handleOpenFilterModal}
                sx={{
                  height: 22,
                  px: 0.9,
                  py: 0,
                  fontSize: '0.64rem',
                  borderRadius: 1.2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: activeInvoiceFilterCount > 0 ? '#0f766e' : '#ffffff',
                  borderColor: activeInvoiceFilterCount > 0 ? '#0f766e' : '#cbd5e1',
                  color: activeInvoiceFilterCount > 0 ? '#ffffff' : '#334155',
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: activeInvoiceFilterCount > 0 ? '#115e59' : '#f1f5f9',
                    borderColor: activeInvoiceFilterCount > 0 ? '#115e59' : '#94a3b8',
                  },
                }}
              >
                Filters {activeInvoiceFilterCount > 0 ? `(${activeInvoiceFilterCount})` : ''}
              </Button>
            )}

            {(filterType === 'product' || filterType === 'product_total' || filterType === 'month') && (
              <Button
                variant={activeProductFilterCount > 0 ? 'contained' : 'outlined'}
                size="small"
                startIcon={<FilterAltIcon sx={{ fontSize: 13 }} />}
                onClick={handleOpenProductFilterModal}
                sx={{
                  height: 22,
                  px: 0.9,
                  py: 0,
                  fontSize: '0.64rem',
                  borderRadius: 1.2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: activeProductFilterCount > 0 ? '#0f766e' : '#ffffff',
                  borderColor: activeProductFilterCount > 0 ? '#0f766e' : '#cbd5e1',
                  color: activeProductFilterCount > 0 ? '#ffffff' : '#334155',
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: activeProductFilterCount > 0 ? '#115e59' : '#f1f5f9',
                    borderColor: activeProductFilterCount > 0 ? '#115e59' : '#94a3b8',
                  },
                }}
              >
                Filters {activeProductFilterCount > 0 ? `(${activeProductFilterCount})` : ''}
              </Button>
            )}

            {/* Quick Live Search Bar */}
            <TextField
              size="small"
              placeholder="Search in table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.2 }}>
                      <ClearIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{
                width: { xs: 150, md: 190 },
                '& .MuiInputBase-root': {
                  height: 22,
                  fontSize: '0.66rem',
                  borderRadius: 1.2,
                  bgcolor: '#f8fafc',
                },
              }}
            />
          </Box>
        </Box>
      </Card>

      {/* SUMMARY KPI CARDS (SLIM STAT BAR MATCHING SALES REPORT) */}
      <Box
        className="no-print"
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: filterType === 'month' ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
          },
          gap: 0.8,
          mb: 0.6,
          flexShrink: 0,
        }}
      >
        {filterType === 'month' ? (
          <>
            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <Inventory2Icon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Products</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{filteredRows.length.toLocaleString()}</Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                <ShoppingCartIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Quantity Purchased</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#047857' }}>
                  {((totals as any).grandQty || 0).toLocaleString()}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e' }}>
                <AttachMoneyIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Purchase Amount</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e' }}>
                  AED {formatAED((totals as any).grandAmount || 0)}
                </Typography>
              </Box>
            </Card>
          </>
        ) : filterType === 'product' || filterType === 'product_total' ? (
          <>
            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <ReceiptLongIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Records</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{filteredRows.length.toLocaleString()}</Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                <Inventory2Icon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Quantity</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d' }}>
                  {((totals as any).qty || 0).toLocaleString()}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
                <AttachMoneyIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Gross</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#7e22ce' }}>
                  AED {formatAED((totals as any).grossAmount || 0)}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                <AttachMoneyIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total VAT</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#b45309' }}>
                  AED {formatAED((totals as any).vat || 0)}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e' }}>
                <AccountBalanceWalletIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Grand Total Amount</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e' }}>
                  AED {formatAED((totals as any).totalAmount || 0)}
                </Typography>
              </Box>
            </Card>
          </>
        ) : (
          <>
            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <ReceiptLongIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Invoices</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{filteredRows.length.toLocaleString()}</Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
                <AttachMoneyIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Gross</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#7e22ce' }}>
                  AED {formatAED((totals as any).grossAmount || 0)}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                <AttachMoneyIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total Discounts</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626' }}>
                  AED {formatAED((totals as any).totalDiscount || 0)}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                <AttachMoneyIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Total VAT</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#b45309' }}>
                  AED {formatAED((totals as any).vatAmount || 0)}
                </Typography>
              </Box>
            </Card>

            <Card elevation={0} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.2, bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e' }}>
                <AccountBalanceWalletIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>Grand Total Payable</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e' }}>
                  AED {formatAED((totals as any).grandTotal || 0)}
                </Typography>
              </Box>
            </Card>
          </>
        )}
      </Box>

      {/* TABLE DATA CONTAINER WITH PROGRESSIVE SCROLL & STICKY FOOTER */}
      <Card
        elevation={0}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1.5,
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <TableContainer
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          sx={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'auto',
            bgcolor: '#ffffff',
          }}
        >
          <Table stickyHeader size="small" sx={{ minWidth: tableMinWidth }}>
            <TableHead>
              {/* For Month Wise: 2-tier header */}
              {filterType === 'month' ? (
                <>
                  <TableRow sx={{ '& th': { bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.72rem', color: '#1e293b', borderBottom: '1px solid #cbd5e1', py: 0.5 } }}>
                    <TableCell colSpan={visibleColumns.length} align="left">
                      Product Information
                    </TableCell>
                    {monthsMeta.map((m) => (
                      <TableCell key={m.key} colSpan={2} align="center" sx={{ borderLeft: '1px solid #cbd5e1' }}>
                        {m.label}
                      </TableCell>
                    ))}
                    <TableCell colSpan={2} align="center" sx={{ borderLeft: '1px solid #cbd5e1', bgcolor: '#e2e8f0' }}>
                      Overall Total
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ '& th': { bgcolor: '#f8fafc', fontWeight: 600, fontSize: '0.70rem', color: '#475569', borderBottom: '2px solid #cbd5e1', py: 0.4 } }}>
                    {visibleColumns.map((col) => (
                      <TableCell
                        key={col.id}
                        align={col.align || 'left'}
                        sx={{
                          width: col.width,
                          minWidth: col.width,
                          maxWidth: col.width,
                        }}
                      >
                        {col.label}
                      </TableCell>
                    ))}
                    {monthsMeta.map((m) => (
                      <React.Fragment key={m.key}>
                        <TableCell align="right" sx={{ width: 80, minWidth: 80, borderLeft: '1px solid #f1f5f9' }}>
                          Qty
                        </TableCell>
                        <TableCell align="right" sx={{ width: 90, minWidth: 90 }}>
                          Amount
                        </TableCell>
                      </React.Fragment>
                    ))}
                    <TableCell align="right" sx={{ width: 80, minWidth: 80, borderLeft: '1px solid #cbd5e1', bgcolor: '#f1f5f9', fontWeight: 700 }}>
                      Total Qty
                    </TableCell>
                    <TableCell align="right" sx={{ width: 95, minWidth: 95, bgcolor: '#f1f5f9', fontWeight: 700 }}>
                      Total Amount
                    </TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow
                  sx={{
                    '& th': {
                      bgcolor: '#f1f5f9',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      color: '#1e293b',
                      borderBottom: '2px solid #cbd5e1',
                      py: 0.6,
                      whiteSpace: 'nowrap',
                    },
                  }}
                >
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align || 'left'}
                      sx={{
                        width: col.width,
                        minWidth: col.width,
                        maxWidth: col.width,
                      }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={filterType === 'month' ? visibleColumns.length + monthsMeta.length * 2 + 2 : visibleColumns.length}
                    align="center"
                    sx={{ py: 6 }}
                  >
                    <CircularProgress size={28} sx={{ color: '#0f766e', mb: 1 }} />
                    <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>Loading purchase report data...</Typography>
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={filterType === 'month' ? visibleColumns.length + monthsMeta.length * 2 + 2 : visibleColumns.length}
                    align="center"
                    sx={{ py: 6 }}
                  >
                    <ShoppingCartIcon sx={{ fontSize: 36, color: '#cbd5e1', mb: 1 }} />
                    <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#475569' }}>
                      No purchase records found
                    </Typography>
                    <Typography sx={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                      Try adjusting the date range or removing filters
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row, index) => {
                  const isSelected = selectedRowIndex === index;

                  if (filterType === 'month') {
                    return (
                      <TableRow
                        key={row.productId || index}
                        ref={(el) => (rowRefs.current[index] = el)}
                        onClick={() => setSelectedRowIndex(index)}
                        onDoubleClick={() => handleRowDoubleClick(row)}
                        title="Double-click to view itemized transactions in Product Wise"
                        sx={{
                          cursor: 'pointer',
                          bgcolor: isSelected ? '#ccfbf1' : index % 2 === 0 ? '#ffffff' : '#f8fafc',
                          '&:hover': { bgcolor: isSelected ? '#99f6e4' : '#f1f5f9' },
                          '& td': { py: 0.35, px: 1, borderBottom: '1px solid #f1f5f9' },
                        }}
                      >
                        {visibleColumns.map((col) => (
                          <TableCell key={col.id} align={col.align || 'left'}>
                            {renderCellContent(col.id, row)}
                          </TableCell>
                        ))}
                        {monthsMeta.map((m) => {
                          const md = row.monthlyData?.[m.key] || { qty: 0, amount: 0 };
                          return (
                            <React.Fragment key={m.key}>
                              <TableCell align="right" sx={{ borderLeft: '1px solid #f1f5f9', color: md.qty > 0 ? '#0f766e' : '#94a3b8' }}>
                                <Typography sx={{ fontSize: '0.80rem' }}>{md.qty > 0 ? md.qty : '—'}</Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ color: md.amount > 0 ? '#0f172a' : '#94a3b8' }}>
                                <Typography sx={{ fontSize: '0.80rem' }}>{md.amount > 0 ? formatAED(md.amount) : '—'}</Typography>
                              </TableCell>
                            </React.Fragment>
                          );
                        })}
                        <TableCell align="right" sx={{ borderLeft: '1px solid #cbd5e1', bgcolor: isSelected ? 'inherit' : '#f8fafc', fontWeight: 700 }}>
                          <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f766e' }}>{row.totalQty}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ bgcolor: isSelected ? 'inherit' : '#f8fafc', fontWeight: 700 }}>
                          <Typography sx={{ fontSize: '0.80rem', fontWeight: 700 }}>{formatAED(row.totalAmount)}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow
                      key={row._id || index}
                      ref={(el) => (rowRefs.current[index] = el)}
                      onClick={() => setSelectedRowIndex(index)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                      title={
                        filterType === 'product_total'
                          ? 'Double-click to view itemized transactions in Product Wise'
                          : filterType === 'monthly'
                          ? 'Double-click to view Daily breakdown for this month'
                          : filterType === 'daily'
                          ? 'Double-click to view Invoices for this date'
                          : 'Double-click to open purchase invoice'
                      }
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isSelected ? '#ccfbf1' : index % 2 === 0 ? '#ffffff' : '#f8fafc',
                        '&:hover': { bgcolor: isSelected ? '#99f6e4' : '#f1f5f9' },
                        '& td': { py: 0.35, px: 1, borderBottom: '1px solid #f1f5f9' },
                      }}
                    >
                      {visibleColumns.map((col) => (
                        <TableCell key={col.id} align={col.align || 'left'}>
                          {renderCellContent(col.id, row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>

            <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2, bgcolor: '#f1f5f9' }}>
              <TableRow sx={{ '& td': { fontWeight: 700, fontSize: '0.76rem', bgcolor: '#f1f5f9', borderTop: '2px solid #cbd5e1', py: 0.5, px: 1 } }}>
                {filterType === 'month' ? (
                  <>
                    <TableCell colSpan={visibleColumns.length} align="left">
                      Total
                    </TableCell>
                    {monthsMeta.map((m) => {
                      const mt = (totals as any).monthTotals?.[m.key] || { qty: 0, amount: 0 };
                      return (
                        <React.Fragment key={m.key}>
                          <TableCell align="right" sx={{ borderLeft: '1px solid #cbd5e1', color: '#0f766e' }}>
                            {mt.qty > 0 ? mt.qty : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ color: '#0f172a' }}>
                            {mt.amount > 0 ? formatAED(mt.amount) : '—'}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}
                    <TableCell align="right" sx={{ borderLeft: '1px solid #cbd5e1', color: '#0f766e' }}>
                      {((totals as any).grandQty || 0).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      {formatAED((totals as any).grandAmount || 0)}
                    </TableCell>
                  </>
                ) : (
                  visibleColumns.map((col, idx) => (
                    <TableCell key={col.id} align={col.align || 'left'}>
                      {idx === 0 ? 'Total' : renderFooterTotal(col.id)}
                    </TableCell>
                  ))
                )}
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>

        {/* STICKY BOTTOM TOTALS BAR (PERMANENT ROW AT BOTTOM OF TABLE) */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 0.6,
            bgcolor: '#f1f5f9',
            borderTop: '2px solid #cbd5e1',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e293b' }}>
              Showing {Math.min(displayedCount, filteredRows.length)} of {filteredRows.length} records
            </Typography>
            {displayedCount < filteredRows.length && (
              <Chip
                label="Scroll down for more"
                size="small"
                sx={{ height: 16, fontSize: '0.58rem', bgcolor: '#e2e8f0', color: '#475569' }}
              />
            )}
          </Box>

          {/* Quick Grand Total in status bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {filterType === 'month' ? (
              <>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Total Qty: <strong style={{ color: '#0f766e' }}>{((totals as any).grandQty || 0).toLocaleString()}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Grand Total: <strong style={{ color: '#0f172a' }}>AED {formatAED((totals as any).grandAmount || 0)}</strong>
                </Typography>
              </>
            ) : filterType === 'product' || filterType === 'product_total' ? (
              <>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Total Qty: <strong style={{ color: '#0f766e' }}>{((totals as any).qty || 0).toLocaleString()}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Total VAT: <strong style={{ color: '#b45309' }}>AED {formatAED((totals as any).vat || 0)}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Grand Total: <strong style={{ color: '#0f172a' }}>AED {formatAED((totals as any).totalAmount || 0)}</strong>
                </Typography>
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Total Gross: <strong style={{ color: '#7e22ce' }}>AED {formatAED((totals as any).grossAmount || 0)}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Discounts: <strong style={{ color: '#dc2626' }}>AED {formatAED((totals as any).totalDiscount || 0)}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  VAT: <strong style={{ color: '#b45309' }}>AED {formatAED((totals as any).vatAmount || 0)}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>
                  Grand Total: <strong style={{ color: '#0f766e' }}>AED {formatAED((totals as any).grandTotal || 0)}</strong>
                </Typography>
              </>
            )}
          </Box>
        </Box>
      </Card>

      {/* QUICK FILTER MODAL FOR INVOICE-WISE (SUPPLIER, USER, PAYMENT TYPE, CASH ACCOUNT) */}
      <Dialog
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, fontSize: '0.90rem', fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterAltIcon sx={{ color: '#0f766e', fontSize: 18 }} />
            Filter {purchaseType === 'PurchaseOrder' ? 'Purchase Orders' : purchaseType === 'PurchaseReturn' ? 'Purchase Returns' : (purchaseType === 'OpeningStock' || purchaseType === 'OpeningPurchase') ? 'Opening Purchase Entries' : 'Purchase Entries'}
          </Box>
          <IconButton size="small" onClick={() => setFilterModalOpen(false)}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1.5 }}>
          {purchaseType !== 'OpeningStock' && (
            <Autocomplete
              size="small"
              options={supplierOptions}
              value={tempSupplier || null}
              onChange={(_, val) => setTempSupplier(val || '')}
              renderInput={(params) => <TextField {...params} label="Supplier Name" placeholder="All Suppliers" />}
            />
          )}

          <Autocomplete
            size="small"
            options={userOptions}
            value={tempUser || null}
            onChange={(_, val) => setTempUser(val || '')}
            renderInput={(params) => <TextField {...params} label="Created By / User" placeholder="All Users" />}
          />

          {purchaseType !== 'PurchaseOrder' && purchaseType !== 'OpeningStock' && (
            <TextField
              select
              size="small"
              label="Payment Type"
              value={tempPaymentType}
              onChange={(e) => setTempPaymentType(e.target.value)}
            >
              <MenuItem value="ALL">All Payment Types</MenuItem>
              <MenuItem value="Cash">Cash</MenuItem>
              <MenuItem value="Credit">Credit</MenuItem>
            </TextField>
          )}

          <Autocomplete
            size="small"
            options={locationOptions}
            value={tempLocation || null}
            onChange={(_, val) => setTempLocation(val || '')}
            renderInput={(params) => <TextField {...params} label="Location" placeholder="All Locations" />}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" onClick={handleClearFilters} color="inherit" sx={{ textTransform: 'none' }}>
            Reset
          </Button>
          <Button size="small" variant="contained" onClick={handleApplyFilters} sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, textTransform: 'none' }}>
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>

      {/* QUICK FILTER MODAL FOR PRODUCT-WISE (SUPPLIER, BARCODE, OFFICIAL NAME, CATEGORY, BRAND) */}
      <Dialog
        open={productFilterModalOpen}
        onClose={() => setProductFilterModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, p: 0.5 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, fontSize: '0.90rem', fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterAltIcon sx={{ color: '#0f766e', fontSize: 18 }} />
            Filter Product Transactions
          </Box>
          <IconButton size="small" onClick={() => setProductFilterModalOpen(false)}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1.5 }}>
          <Autocomplete
            size="small"
            options={prodSupplierOptions}
            value={tempProdSupplier || null}
            onChange={(_, val) => setTempProdSupplier(val || '')}
            renderInput={(params) => <TextField {...params} label="Supplier Name" placeholder="All Suppliers" />}
          />

          <Autocomplete
            size="small"
            options={prodBarcodeOptions}
            value={tempProdBarcode || null}
            onChange={(_, val) => setTempProdBarcode(val || '')}
            renderInput={(params) => <TextField {...params} label="Barcode" placeholder="All Barcodes" />}
          />

          <Autocomplete
            size="small"
            options={prodOfficialNameOptions}
            value={tempProdOfficialName || null}
            onChange={(_, val) => setTempProdOfficialName(val || '')}
            renderInput={(params) => <TextField {...params} label="Official Name" placeholder="All Official Names" />}
          />

          <Autocomplete
            size="small"
            options={prodCategoryOptions}
            value={tempProdCategory || null}
            onChange={(_, val) => setTempProdCategory(val || '')}
            renderInput={(params) => <TextField {...params} label="Category" placeholder="All Categories" />}
          />

          <Autocomplete
            size="small"
            options={prodBrandOptions}
            value={tempProdBrand || null}
            onChange={(_, val) => setTempProdBrand(val || '')}
            renderInput={(params) => <TextField {...params} label="Brand" placeholder="All Brands" />}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button size="small" onClick={handleClearProductFilters} color="inherit" sx={{ textTransform: 'none' }}>
            Reset
          </Button>
          <Button size="small" variant="contained" onClick={handleApplyProductFilters} sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, textTransform: 'none' }}>
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>

      {/* COLUMN MANAGER DRAWER (F5 SHORTCUT) */}
      <ColumnManagerDrawer
        open={columnManagerOpen}
        onClose={() => setColumnManagerOpen(false)}
        columns={activeColumns}
        onColumnsChange={handleColumnsChange}
        onResetDefaults={handleResetColumns}
        storageKey={activeStorageKey}
      />
    </Box>
  );
}
