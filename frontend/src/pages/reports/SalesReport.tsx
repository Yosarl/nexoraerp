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
  TrendingUp as TrendingUpIcon,
  AttachMoney as AttachMoneyIcon,
  ReceiptLong as ReceiptLongIcon,
  Clear as ClearIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  FilterAlt as FilterAltIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { salesApi, productApi } from '../../services/api';
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
  retailPrice?: number;
}

type FilterType = 'default' | 'daily' | 'monthly' | 'product' | 'product_total' | 'month';
type SalesTypeOption = 'ALL' | 'B2C' | 'B2B' | 'POS' | 'Return' | 'Quotation';

const formatAED = (val?: number | null) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Storage Keys for F5 Column Customization
const STORAGE_KEY_INVOICE = 'sales_report_invoice_cols_v1';
const STORAGE_KEY_DAILY = 'sales_report_daily_cols_v1';
const STORAGE_KEY_MONTHLY = 'sales_report_monthly_cols_v1';
const STORAGE_KEY_PROD_SUM = 'sales_report_prod_sum_cols_v1';
const STORAGE_KEY_PROD_DET = 'sales_report_prod_det_cols_v1';
const STORAGE_KEY_MONTH_BASE = 'sales_report_month_base_cols_v1';

// Default Column Definitions
const DEFAULT_INVOICE_COLUMNS: ColumnDefinition[] = [
  { id: 'entryNumber', label: 'Entry Number', defaultLabel: 'Entry Number', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'date', label: 'Date', defaultLabel: 'Date', width: 95, defaultWidth: 95, visible: true, align: 'left' },
  { id: 'customerName', label: 'Customer Name', defaultLabel: 'Customer Name', width: 180, defaultWidth: 180, visible: true, align: 'left' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'otherDiscount', label: 'Other Discount', defaultLabel: 'Other Discount', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'freightCharge', label: 'Freight Charge', defaultLabel: 'Freight Charge', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'otherCharge', label: 'Other Charge', defaultLabel: 'Other Charge', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'travelcharge', label: 'Travel Charge', defaultLabel: 'Travel Charge', width: 100, defaultWidth: 100, visible: true, align: 'right' },
  { id: 'vatAmount', label: 'VAT Amount', defaultLabel: 'VAT Amount', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'roundoff', label: 'Round Off', defaultLabel: 'Round Off', width: 85, defaultWidth: 85, visible: true, align: 'right' },
  { id: 'grandTotal', label: 'Grand Total', defaultLabel: 'Grand Total', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'totalPurchaseAmount', label: 'Gross Purchase Amount', defaultLabel: 'Gross Purchase Amount', width: 130, defaultWidth: 130, visible: true, align: 'right' },
  { id: 'totalProfit', label: 'Total Profit', defaultLabel: 'Total Profit', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'user', label: 'User', defaultLabel: 'User', width: 100, defaultWidth: 100, visible: true, align: 'left' },
  { id: 'location', label: 'Location', defaultLabel: 'Location', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'cashReceived', label: 'Cash Received', defaultLabel: 'Cash Received', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'cardReceived', label: 'Card Received', defaultLabel: 'Card Received', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'cashPaid', label: 'Cash Paid', defaultLabel: 'Cash Paid', width: 105, defaultWidth: 105, visible: true, align: 'right' },
];

const DEFAULT_DAILY_COLUMNS: ColumnDefinition[] = [
  { id: 'date', label: 'Date', defaultLabel: 'Date', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'otherDiscount', label: 'Other Discount', defaultLabel: 'Other Discount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'freightCharge', label: 'Freight Charge', defaultLabel: 'Freight Charge', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'otherCharge', label: 'Other Charge', defaultLabel: 'Other Charge', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'travelcharge', label: 'Travel Charge', defaultLabel: 'Travel Charge', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'vatAmount', label: 'VAT Amount', defaultLabel: 'VAT Amount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'roundoff', label: 'Round Off', defaultLabel: 'Round Off', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'grandTotal', label: 'Grand Total', defaultLabel: 'Grand Total', width: 120, defaultWidth: 120, visible: true, align: 'right' },
  { id: 'totalPurchaseAmount', label: 'Gross Purchase Amount', defaultLabel: 'Gross Purchase Amount', width: 140, defaultWidth: 140, visible: true, align: 'right' },
  { id: 'totalProfit', label: 'Total Profit', defaultLabel: 'Total Profit', width: 120, defaultWidth: 120, visible: true, align: 'right' },
  { id: 'cashReceived', label: 'Cash Received', defaultLabel: 'Cash Received', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'cardReceived', label: 'Card Received', defaultLabel: 'Card Received', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'cashPaid', label: 'Cash Paid', defaultLabel: 'Cash Paid', width: 115, defaultWidth: 115, visible: true, align: 'right' },
];

const DEFAULT_MONTHLY_COLUMNS: ColumnDefinition[] = [
  { id: 'month', label: 'Month', defaultLabel: 'Month', width: 140, defaultWidth: 140, visible: true, align: 'left' },
  { id: 'grossAmount', label: 'Gross Amount', defaultLabel: 'Gross Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'otherDiscount', label: 'Other Discount', defaultLabel: 'Other Discount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'freightCharge', label: 'Freight Charge', defaultLabel: 'Freight Charge', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'otherCharge', label: 'Other Charge', defaultLabel: 'Other Charge', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'travelcharge', label: 'Travel Charge', defaultLabel: 'Travel Charge', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'vatAmount', label: 'VAT Amount', defaultLabel: 'VAT Amount', width: 105, defaultWidth: 105, visible: true, align: 'right' },
  { id: 'roundoff', label: 'Round Off', defaultLabel: 'Round Off', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'grandTotal', label: 'Grand Total', defaultLabel: 'Grand Total', width: 120, defaultWidth: 120, visible: true, align: 'right' },
  { id: 'totalPurchaseAmount', label: 'Gross Purchase Amount', defaultLabel: 'Gross Purchase Amount', width: 140, defaultWidth: 140, visible: true, align: 'right' },
  { id: 'totalProfit', label: 'Total Profit', defaultLabel: 'Total Profit', width: 120, defaultWidth: 120, visible: true, align: 'right' },
  { id: 'cashReceived', label: 'Cash Received', defaultLabel: 'Cash Received', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'cardReceived', label: 'Card Received', defaultLabel: 'Card Received', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'cashPaid', label: 'Cash Paid', defaultLabel: 'Cash Paid', width: 115, defaultWidth: 115, visible: true, align: 'right' },
];

const DEFAULT_PROD_SUM_COLUMNS: ColumnDefinition[] = [
  { id: 'productCode', label: 'Product Code', defaultLabel: 'Product Code', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'productName', label: 'Product Name', defaultLabel: 'Product Name', width: 220, defaultWidth: 220, visible: true, align: 'left' },
  { id: 'productBarcode', label: 'Product Barcode', defaultLabel: 'Product Barcode', width: 130, defaultWidth: 130, visible: true, align: 'left' },
  { id: 'productOfficialName', label: 'Product Official Name', defaultLabel: 'Product Official Name', width: 150, defaultWidth: 150, visible: true, align: 'left' },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'unit', label: 'Unit', defaultLabel: 'Unit', width: 75, defaultWidth: 75, visible: true, align: 'left' },
  { id: 'qty', label: 'Qty', defaultLabel: 'Qty', width: 80, defaultWidth: 80, visible: true, align: 'right' },
  { id: 'totalAmount', label: 'Total Amount', defaultLabel: 'Total Amount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'purchaseAmount', label: 'Gross Purchase Amount', defaultLabel: 'Gross Purchase Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'vat', label: 'VAT', defaultLabel: 'VAT', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'profit', label: 'Profit', defaultLabel: 'Profit', width: 110, defaultWidth: 110, visible: true, align: 'right' },
];

const DEFAULT_PROD_DET_COLUMNS: ColumnDefinition[] = [
  { id: 'date', label: 'Date', defaultLabel: 'Date', width: 95, defaultWidth: 95, visible: true, align: 'left' },
  { id: 'invNumber', label: 'Inv Number', defaultLabel: 'Inv Number', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'customerName', label: 'Customer Name', defaultLabel: 'Customer Name', width: 160, defaultWidth: 160, visible: true, align: 'left' },
  { id: 'productCode', label: 'Product Code', defaultLabel: 'Product Code', width: 105, defaultWidth: 105, visible: true, align: 'left' },
  { id: 'productName', label: 'Product Name', defaultLabel: 'Product Name', width: 180, defaultWidth: 180, visible: true, align: 'left' },
  { id: 'productBarcode', label: 'Product Barcode', defaultLabel: 'Product Barcode', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'productOfficialName', label: 'Product Official Name', defaultLabel: 'Product Official Name', width: 140, defaultWidth: 140, visible: true, align: 'left' },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 110, defaultWidth: 110, visible: true, align: 'left' },
  { id: 'unit', label: 'Unit', defaultLabel: 'Unit', width: 75, defaultWidth: 75, visible: true, align: 'left' },
  { id: 'qty', label: 'Qty', defaultLabel: 'Qty', width: 80, defaultWidth: 80, visible: true, align: 'right' },
  { id: 'totalAmount', label: 'Total Amount', defaultLabel: 'Total Amount', width: 110, defaultWidth: 110, visible: true, align: 'right' },
  { id: 'purchaseAmount', label: 'Gross Purchase Amount', defaultLabel: 'Gross Purchase Amount', width: 115, defaultWidth: 115, visible: true, align: 'right' },
  { id: 'vat', label: 'VAT', defaultLabel: 'VAT', width: 95, defaultWidth: 95, visible: true, align: 'right' },
  { id: 'profit', label: 'Profit', defaultLabel: 'Profit', width: 110, defaultWidth: 110, visible: true, align: 'right' },
];

const DEFAULT_MONTH_BASE_COLUMNS: ColumnDefinition[] = [
  { id: 'itemName', label: 'Item Name', defaultLabel: 'Item Name', width: 220, defaultWidth: 220, visible: true, align: 'left' },
  { id: 'barcode', label: 'Barcode', defaultLabel: 'Barcode', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'officialName', label: 'Official Name', defaultLabel: 'Official Name', width: 150, defaultWidth: 150, visible: true, align: 'left' },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 120, defaultWidth: 120, visible: true, align: 'left' },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 110, defaultWidth: 110, visible: true, align: 'left' },
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

export default function SalesReport() {
  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Filter States
  const [filterType, setFilterType] = useState<FilterType>('default');
  const [salesType, setSalesType] = useState<SalesTypeOption>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);

  // Invoice-Wise Specific Filter States (Customer Name, User, Location)
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterLocation, setFilterLocation] = useState<string>('');
  // Temp states for invoice filter dialog
  const [tempCustomer, setTempCustomer] = useState<string>('');
  const [tempUser, setTempUser] = useState<string>('');
  const [tempLocation, setTempLocation] = useState<string>('');

  // Product-Wise Specific Filter States (Customer Name, Barcode, Official Name, Category, Brand)
  const [productFilterModalOpen, setProductFilterModalOpen] = useState<boolean>(false);
  const [filterProdCustomer, setFilterProdCustomer] = useState<string>('');
  const [filterProdBarcode, setFilterProdBarcode] = useState<string>('');
  const [filterProdOfficialName, setFilterProdOfficialName] = useState<string>('');
  const [filterProdCategory, setFilterProdCategory] = useState<string>('');
  const [filterProdBrand, setFilterProdBrand] = useState<string>('');
  // Temp states for product filter dialog
  const [tempProdCustomer, setTempProdCustomer] = useState<string>('');
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
    salesApi
      .getSalesReport({
        companyId,
        financialYearId: financialYearId || undefined,
        filterType,
        salesType,
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
        console.error('Failed to fetch sales report:', err);
        setRows([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [companyId, financialYearId, filterType, salesType, selectedProduct, fromDate, toDate, searchQuery, scrollToTop]);

  // Automatically trigger fetch when key filters change
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/sales-report') {
        fetchReport();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/sales-report') || window.location.pathname.includes('/report/sales-report')) {
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

  // Visible columns calculated from activeColumns and current salesType filter
  const visibleColumns = useMemo(() => {
    let cols = activeColumns.filter((c) => c.visible);

    if (salesType === 'Return') {
      // In sales return: no need total purchase amount, cash received, card received, profit column; add cash paid column
      cols = cols.filter(
        (c) =>
          c.id !== 'totalPurchaseAmount' &&
          c.id !== 'purchaseAmount' &&
          c.id !== 'cashReceived' &&
          c.id !== 'cardReceived' &&
          c.id !== 'totalProfit' &&
          c.id !== 'profit'
      );
      // Ensure cashPaid column is included
      const hasCashPaid = cols.some((c) => c.id === 'cashPaid');
      if (!hasCashPaid) {
        const cashPaidDef: ColumnDefinition = {
          id: 'cashPaid',
          label: 'Cash Paid',
          defaultLabel: 'Cash Paid',
          width: 105,
          defaultWidth: 105,
          visible: true,
          align: 'right',
        };
        const locIdx = cols.findIndex((c) => c.id === 'location');
        if (locIdx !== -1) {
          cols.splice(locIdx + 1, 0, cashPaidDef);
        } else {
          cols.push(cashPaidDef);
        }
      }
    } else if (salesType === 'Quotation') {
      // In sales order: no need cash received, card received, cash paid
      cols = cols.filter((c) => c.id !== 'cashReceived' && c.id !== 'cardReceived' && c.id !== 'cashPaid');
    } else {
      // Default & regular sales: cashPaid not needed
      cols = cols.filter((c) => c.id !== 'cashPaid');
    }

    return cols;
  }, [activeColumns, salesType]);

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
        headers.push(`${m.label} Profit`);
      });
      headers.push('Total Qty');
      headers.push('Total Profit');

      csvRows = rows.map((r) => {
        const line = visibleColumns.map((c) => `"${(r[c.id] || '').toString().replace(/"/g, '""')}"`);
        monthsMeta.forEach((m) => {
          const md = r.monthlyData?.[m.key] || { qty: 0, profit: 0 };
          line.push(String(md.qty ?? 0));
          line.push(String(md.profit ?? 0));
        });
        line.push(String(r.totalQty ?? 0));
        line.push(String(r.totalProfit ?? 0));
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
    link.setAttribute('download', `SalesReport_${filterType}_${salesType}_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Count active invoice filters
  const activeInvoiceFilterCount = useMemo(() => {
    let count = 0;
    if (filterCustomer.trim()) count++;
    if (filterUser.trim()) count++;
    if (filterLocation.trim()) count++;
    return count;
  }, [filterCustomer, filterUser, filterLocation]);

  // Distinct options for customer, user, location from rows
  const customerOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.customerName && typeof r.customerName === 'string') set.add(r.customerName);
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
    setTempCustomer(filterCustomer);
    setTempUser(filterUser);
    setTempLocation(filterLocation);
    setFilterModalOpen(true);
  };

  const handleApplyFilters = () => {
    setFilterCustomer(tempCustomer);
    setFilterUser(tempUser);
    setFilterLocation(tempLocation);
    setFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  const handleClearFilters = () => {
    setTempCustomer('');
    setTempUser('');
    setTempLocation('');
    setFilterCustomer('');
    setFilterUser('');
    setFilterLocation('');
    setFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  // Count active product filters
  const activeProductFilterCount = useMemo(() => {
    let count = 0;
    if (filterProdCustomer.trim()) count++;
    if (filterProdBarcode.trim()) count++;
    if (filterProdOfficialName.trim()) count++;
    if (filterProdCategory.trim()) count++;
    if (filterProdBrand.trim()) count++;
    return count;
  }, [filterProdCustomer, filterProdBarcode, filterProdOfficialName, filterProdCategory, filterProdBrand]);

  // Distinct options for customer, barcode, official name, category, brand from product rows
  const prodCustomerOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (Array.isArray(r.customerNames)) {
        r.customerNames.forEach((cn: string) => cn && set.add(cn));
      } else if (r.customerName && typeof r.customerName === 'string') {
        set.add(r.customerName);
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
    setTempProdCustomer(filterProdCustomer);
    setTempProdBarcode(filterProdBarcode);
    setTempProdOfficialName(filterProdOfficialName);
    setTempProdCategory(filterProdCategory);
    setTempProdBrand(filterProdBrand);
    setProductFilterModalOpen(true);
  };

  const handleApplyProductFilters = () => {
    setFilterProdCustomer(tempProdCustomer);
    setFilterProdBarcode(tempProdBarcode);
    setFilterProdOfficialName(tempProdOfficialName);
    setFilterProdCategory(tempProdCategory);
    setFilterProdBrand(tempProdBrand);
    setProductFilterModalOpen(false);
    setDisplayedCount(INITIAL_ROW_COUNT);
    scrollToTop();
  };

  const handleClearProductFilters = () => {
    setTempProdCustomer('');
    setTempProdBarcode('');
    setTempProdOfficialName('');
    setTempProdCategory('');
    setTempProdBrand('');
    setFilterProdCustomer('');
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
      if (filterCustomer.trim()) {
        const cTarget = filterCustomer.trim().toLowerCase();
        result = result.filter((r) => r.customerName && r.customerName.toLowerCase() === cTarget);
      }
      if (filterUser.trim()) {
        const uTarget = filterUser.trim().toLowerCase();
        result = result.filter((r) => r.user && r.user.toLowerCase() === uTarget);
      }
      if (filterLocation.trim()) {
        const lTarget = filterLocation.trim().toLowerCase();
        result = result.filter((r) => r.location && r.location.toLowerCase() === lTarget);
      }
    }

    if (filterType === 'product' || filterType === 'product_total' || filterType === 'month') {
      if (filterProdCustomer.trim()) {
        const cTarget = filterProdCustomer.trim().toLowerCase();
        result = result.filter((r) => {
          if (Array.isArray(r.customerNames)) {
            return r.customerNames.some((cn: string) => cn && cn.toLowerCase().includes(cTarget));
          }
          return r.customerName && r.customerName.toLowerCase().includes(cTarget);
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
          (r.customerName && String(r.customerName).toLowerCase().includes(q)) ||
          (r.user && String(r.user).toLowerCase().includes(q)) ||
          (r.location && String(r.location).toLowerCase().includes(q))
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
          (r.customerName && String(r.customerName).toLowerCase().includes(q))
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
          (r.customerName && String(r.customerName).toLowerCase().includes(q))
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
          (r.customerName && String(r.customerName).toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [
    rows,
    searchQuery,
    filterType,
    filterCustomer,
    filterUser,
    filterLocation,
    filterProdCustomer,
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
    salesType,
    fromDate,
    toDate,
    filterCustomer,
    filterUser,
    filterLocation,
    filterProdCustomer,
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

  // Double-click navigation to Invoice
  const handleRowDoubleClick = useCallback(
    (row: any) => {
      const invNo = row.entryNumber || row.invNumber || row.invoiceNo || '';
      const invId = row.invoiceId || row._id || '';
      const invType = (row.type || '').toUpperCase();

      if (!invNo && !invId) return;

      if (invType === 'POS' || invNo.toUpperCase().startsWith('POS')) {
        navigate('/entry/pos', { state: { invoiceId: invId, invoiceNo: invNo } });
        return;
      }
      if (invType === 'B2B' || invNo.toUpperCase().startsWith('B2B')) {
        navigate('/entry/sales-b2b', { state: { invoiceId: invId, invoiceNo: invNo } });
        return;
      }
      if (invType === 'RETURN' || invNo.toUpperCase().startsWith('SR') || invNo.toUpperCase().startsWith('RET')) {
        navigate('/entry/sales-return', { state: { returnId: invId, invoiceNo: invNo } });
        return;
      }
      if (invType === 'QUOTATION' || invNo.toUpperCase().startsWith('QTN') || invNo.toUpperCase().startsWith('SO')) {
        navigate('/entry/quotation-sales', { state: { invoiceId: invId, invoiceNo: invNo } });
        return;
      }
      // Default to B2C sales entry
      navigate('/entry/sales-b2c', { state: { invoiceId: invId, invoiceNo: invNo } });
    },
    [navigate]
  );

  // Up and Down Arrow Keyboard Navigation (Auto-expands displayed rows when scrolling down)
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
      } else if (e.key === 'Enter') {
        if (selectedRowIndex >= 0 && selectedRowIndex < filteredRows.length) {
          handleRowDoubleClick(filteredRows[selectedRowIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredRows, displayedCount, selectedRowIndex, handleRowDoubleClick]);

  // Keep selected row in view when moving with Arrow keys (handles both moving down & moving up from bottom)
  useEffect(() => {
    if (selectedRowIndex < 0) return;
    const container = tableContainerRef.current;
    const rowEl = rowRefs.current[selectedRowIndex];
    if (!container || !rowEl) return;

    const containerRect = container.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();

    // Clearance for sticky header (~36px) and sticky footer totals (~40px)
    const topMargin = 38;
    const bottomMargin = 42;

    if (rowRect.bottom > containerRect.bottom - bottomMargin) {
      container.scrollTop += (rowRect.bottom - containerRect.bottom + bottomMargin + 4);
    } else if (rowRect.top < containerRect.top + topMargin) {
      container.scrollTop -= (containerRect.top + topMargin - rowRect.top + 4);
    }
  }, [selectedRowIndex]);

  // Totals Calculation
  const totals = useMemo(() => {
    if (filterType === 'default' || filterType === 'daily' || filterType === 'monthly') {
      return filteredRows.reduce(
        (acc, r) => ({
          grossAmount: acc.grossAmount + (r.grossAmount || 0),
          otherDiscount: acc.otherDiscount + (r.otherDiscount || 0),
          freightCharge: acc.freightCharge + (r.freightCharge || 0),
          otherCharge: acc.otherCharge + (r.otherCharge || 0),
          travelcharge: acc.travelcharge + (r.travelcharge || 0),
          vatAmount: acc.vatAmount + (r.vatAmount || 0),
          roundoff: acc.roundoff + (r.roundoff || 0),
          grandTotal: acc.grandTotal + (r.grandTotal || 0),
          totalPurchaseAmount: acc.totalPurchaseAmount + (r.totalPurchaseAmount || 0),
          totalProfit: acc.totalProfit + (r.totalProfit || 0),
          cashReceived: acc.cashReceived + (r.cashReceived || 0),
          cardReceived: acc.cardReceived + (r.cardReceived || 0),
          cashPaid: acc.cashPaid + (r.cashPaid || 0),
        }),
        {
          grossAmount: 0,
          otherDiscount: 0,
          freightCharge: 0,
          otherCharge: 0,
          travelcharge: 0,
          vatAmount: 0,
          roundoff: 0,
          grandTotal: 0,
          totalPurchaseAmount: 0,
          totalProfit: 0,
          cashReceived: 0,
          cardReceived: 0,
          cashPaid: 0,
        }
      );
    }
    if (filterType === 'product' || filterType === 'product_total') {
      return filteredRows.reduce(
        (acc, r) => ({
          qty: acc.qty + (r.qty || 0),
          totalAmount: acc.totalAmount + (r.totalAmount || 0),
          purchaseAmount: acc.purchaseAmount + (r.purchaseAmount || 0),
          vat: acc.vat + (r.vat || 0),
          profit: acc.profit + (r.profit || 0),
        }),
        { qty: 0, totalAmount: 0, purchaseAmount: 0, vat: 0, profit: 0 }
      );
    }
    if (filterType === 'month') {
      const monthTotals: Record<string, { qty: number; profit: number }> = {};
      monthsMeta.forEach((m) => {
        monthTotals[m.key] = { qty: 0, profit: 0 };
      });
      let grandQty = 0;
      let grandProfit = 0;

      filteredRows.forEach((r) => {
        monthsMeta.forEach((m) => {
          const md = r.monthlyData?.[m.key] || { qty: 0, profit: 0 };
          monthTotals[m.key].qty += md.qty || 0;
          monthTotals[m.key].profit += md.profit || 0;
        });
        grandQty += r.totalQty || 0;
        grandProfit += r.totalProfit || 0;
      });

      return {
        monthTotals,
        grandQty,
        grandProfit,
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
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#2563eb' }}>{row[colId]}</Typography>
            {row.type && (
              <Chip
                label={row.type === 'Quotation' ? 'Order' : row.type}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  px: 0.2,
                  bgcolor:
                    row.type === 'Return' ? '#fee2e2' :
                    row.type === 'Quotation' ? '#fef3c7' :
                    row.type === 'POS' ? '#e0e7ff' :
                    row.type === 'B2B' ? '#ede9fe' : '#ccfbf1',
                  color:
                    row.type === 'Return' ? '#991b1b' :
                    row.type === 'Quotation' ? '#92400e' :
                    row.type === 'POS' ? '#3730a3' :
                    row.type === 'B2B' ? '#5b21b6' : '#0f766e',
                }}
              />
            )}
          </Box>
        );
      case 'customerName':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500 }}>{row.customerName}</Typography>;
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
      case 'category':
      case 'brand':
        return <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>{row[colId] || '—'}</Typography>;
      case 'unit':
        return <Typography sx={{ fontSize: '0.80rem' }}>{row.unit || 'Pcs'}</Typography>;
      case 'qty':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#0284c7', textAlign: 'right' }}>{row.qty}</Typography>;
      case 'otherDiscount':
        return (
          <Typography sx={{ fontSize: '0.80rem', textAlign: 'right', color: row.otherDiscount > 0 ? '#dc2626' : 'inherit' }}>
            {formatAED(row.otherDiscount)}
          </Typography>
        );
      case 'vatAmount':
      case 'vat':
        return <Typography sx={{ fontSize: '0.80rem', textAlign: 'right', color: '#b45309' }}>{formatAED(row[colId])}</Typography>;
      case 'grandTotal':
        return (
          <Typography sx={{ fontSize: '0.80rem', textAlign: 'right' }}>
            {formatAED(row.grandTotal)}
          </Typography>
        );
      case 'totalProfit':
      case 'profit':
        return (
          <Typography sx={{ fontSize: '0.80rem', textAlign: 'right' }}>
            {formatAED(row[colId])}
          </Typography>
        );
      case 'user':
      case 'location':
        return <Typography sx={{ fontSize: '0.80rem' }}>{row[colId]}</Typography>;
      case 'cashReceived':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500, color: '#0f766e', textAlign: 'right' }}>{formatAED(row.cashReceived)}</Typography>;
      case 'cardReceived':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500, color: '#4338ca', textAlign: 'right' }}>{formatAED(row.cardReceived)}</Typography>;
      case 'cashPaid':
        return <Typography sx={{ fontSize: '0.80rem', fontWeight: 500, color: '#dc2626', textAlign: 'right' }}>{formatAED(row.cashPaid)}</Typography>;
      case 'grossAmount':
      case 'freightCharge':
      case 'otherCharge':
      case 'travelcharge':
      case 'roundoff':
      case 'totalPurchaseAmount':
      case 'purchaseAmount':
      case 'totalAmount':
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
      case 'otherDiscount':
        return formatAED(t.otherDiscount);
      case 'freightCharge':
        return formatAED(t.freightCharge);
      case 'otherCharge':
        return formatAED(t.otherCharge);
      case 'travelcharge':
        return formatAED(t.travelcharge);
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
      case 'totalPurchaseAmount':
        return formatAED(t.totalPurchaseAmount);
      case 'purchaseAmount':
        return formatAED(t.purchaseAmount);
      case 'totalProfit':
        return formatAED(t.totalProfit);
      case 'profit':
        return formatAED(t.profit);
      case 'qty':
        return t.qty ?? 0;
      case 'cashReceived':
        return formatAED(t.cashReceived);
      case 'cardReceived':
        return formatAED(t.cardReceived);
      case 'cashPaid':
        return formatAED(t.cashPaid);
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
              <ReceiptLongIcon sx={{ fontSize: 14 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', fontSize: '0.90rem', lineHeight: 1.15 }}>
                Sales Report
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500, fontSize: '0.62rem', lineHeight: 1, display: 'block' }}>
                {filterType === 'default' && 'Comprehensive Invoice-Wise Sales Ledger with Profit Breakdown'}
                {filterType === 'daily' && 'Consolidated Daily Sales Performance & Margin Summary'}
                {filterType === 'monthly' && 'Consolidated Month-Wise Sales Performance & Margin Summary'}
                {filterType === 'product' && !selectedProduct && 'Detailed Product Sales History (All Products)'}
                {filterType === 'product' && selectedProduct && `Detailed Sales History for: ${selectedProduct.name}`}
                {filterType === 'product_total' && !selectedProduct && 'Aggregated Product-Wise Sales & Margin Performance (All Products)'}
                {filterType === 'product_total' && selectedProduct && `Aggregated Performance for: ${selectedProduct.name}`}
                {filterType === 'month' && 'Monthly Item Performance & Gross Profit Matrix'}
                {salesType !== 'ALL' && ` • Type: ${salesType === 'Quotation' ? 'Sales Order' : salesType === 'Return' ? 'Sales Return' : salesType === 'POS' ? 'POS Sales' : `Sales ${salesType}`}`}
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

              {/* 3. Product Wise */}
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

              {/* 3. Product Wise Total */}
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

              {/* 4. Month Wise Items */}
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

          {/* Extensible Future Filters Slot Badge */}
          <Tooltip title="Press F5 anytime or click 'Columns (F5)' to customize order, width, and names of columns!">
            <Chip
              icon={<AddCircleOutlineIcon sx={{ fontSize: '12px !important', color: '#0f766e !important' }} />}
              label="F5: Column Manager Enabled"
              size="small"
              variant="outlined"
              sx={{
                height: 20,
                borderColor: '#99f6e4',
                bgcolor: '#f0fdfa',
                color: '#0f766e',
                fontWeight: 600,
                fontSize: '0.62rem',
              }}
            />
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
                getOptionLabel={(option) =>
                  `${option.name} ${option.code ? `(${option.code})` : ''} ${option.systemBarcode ? `[${option.systemBarcode}]` : ''}`
                }
                isOptionEqualToValue={(option, value) => option._id === value._id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={
                      filterType === 'product_total'
                        ? 'All Products (Aggregated Totals)'
                        : filterType === 'month'
                        ? 'All Products (Monthly Breakdown)'
                        : 'All Products (Detailed Transactions)'
                    }
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingProducts ? <CircularProgress color="inherit" size={14} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                    sx={{
                      bgcolor: '#ffffff',
                      '& .MuiOutlinedInput-root': {
                        height: 26,
                        minHeight: 26,
                        fontSize: '0.70rem',
                        py: 0,
                        px: 0.6,
                        borderRadius: 1.2,
                      },
                      '& .MuiInputBase-input': {
                        fontSize: '0.70rem',
                        py: '2px !important',
                      },
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option._id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '4px 8px' }}>
                    <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: '#0f172a' }}>
                      {option.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.8, mt: 0.2 }}>
                      {option.code && <Chip label={`Code: ${option.code}`} size="small" sx={{ height: 16, fontSize: '0.60rem', bgcolor: '#e2e8f0' }} />}
                      {option.systemBarcode && <Chip label={`Barcode: ${option.systemBarcode}`} size="small" sx={{ height: 16, fontSize: '0.60rem', bgcolor: '#fef3c7', color: '#92400e' }} />}
                    </Box>
                  </li>
                )}
              />
            </Box>

            {selectedProduct && (
              <Button
                size="small"
                variant="text"
                color="secondary"
                startIcon={<ClearIcon sx={{ fontSize: 12 }} />}
                onClick={() => setSelectedProduct(null)}
                sx={{ height: 22, textTransform: 'none', fontWeight: 600, fontSize: '0.64rem', color: '#64748b' }}
              >
                Clear to "All"
              </Button>
            )}

            <Button
              variant={activeProductFilterCount > 0 ? 'contained' : 'outlined'}
              size="small"
              startIcon={<FilterAltIcon sx={{ fontSize: 13 }} />}
              onClick={handleOpenProductFilterModal}
              sx={{
                height: 24,
                px: 1,
                fontSize: '0.66rem',
                borderRadius: 1.2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#0f766e',
                bgcolor: activeProductFilterCount > 0 ? '#0f766e' : '#ffffff',
                color: activeProductFilterCount > 0 ? '#ffffff' : '#0f766e',
                boxShadow: activeProductFilterCount > 0 ? '0 1px 3px rgba(15,118,110,0.3)' : 'none',
                whiteSpace: 'nowrap',
                '&:hover': {
                  bgcolor: activeProductFilterCount > 0 ? '#115e59' : '#f0fdfa',
                  borderColor: '#0d9488',
                },
              }}
            >
              Filter Options {activeProductFilterCount > 0 ? `(${activeProductFilterCount})` : ''}
            </Button>
          </Box>
        )}

        {/* ROW 3: DATE RANGE & PRESETS & SEARCH INPUT */}
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
          {/* Date Range Inputs */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
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

            {/* Date Preset Buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, bgcolor: '#f8fafc', p: 0.2, borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
              {[
                { key: 'today', label: 'Today' },
                { key: 'thisMonth', label: 'This Month' },
                { key: 'lastMonth', label: 'Last Month' },
                { key: 'thisYear', label: 'This Year' },
              ].map((p) => (
                <Button
                  key={p.key}
                  size="small"
                  onClick={() => handleApplyPreset(p.key as any)}
                  sx={{
                    px: 0.8,
                    py: 0.15,
                    minWidth: 'auto',
                    height: 22,
                    fontSize: '0.60rem',
                    fontWeight: datePreset === p.key ? 700 : 500,
                    color: datePreset === p.key ? '#0f766e' : '#64748b',
                    bgcolor: datePreset === p.key ? '#ffffff' : 'transparent',
                    boxShadow: datePreset === p.key ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    borderRadius: 1.2,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#f1f5f9' },
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </Box>

            {/* Sales Type Combobox */}
            <Box sx={{ width: 140 }}>
              <TextField
                select
                size="small"
                label="Sales Type"
                value={salesType}
                onChange={(e) => {
                  setSalesType(e.target.value as SalesTypeOption);
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
                    color: salesType === 'ALL' ? '#334155' : '#0f766e',
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '& .MuiInputLabel-root': { fontSize: '0.62rem', top: -3 },
                  '& .MuiSvgIcon-root': { fontSize: 16 },
                }}
              >
                <MenuItem value="ALL" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>All</MenuItem>
                <MenuItem value="B2C" sx={{ fontSize: '0.72rem' }}>Sales B2C</MenuItem>
                <MenuItem value="B2B" sx={{ fontSize: '0.72rem' }}>Sales B2B</MenuItem>
                <MenuItem value="POS" sx={{ fontSize: '0.72rem' }}>POS Sales</MenuItem>
                <MenuItem value="Return" sx={{ fontSize: '0.72rem' }}>Sales Return</MenuItem>
                <MenuItem value="Quotation" sx={{ fontSize: '0.72rem' }}>Sales Order</MenuItem>
              </TextField>
            </Box>
          </Box>

          {/* Right Action: Filter Button & Search Box */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 260, flex: { xs: 1, sm: 'none' } }}>
            {/* Filter Button for Invoice Wise Mode */}
            {filterType === 'default' && (
              <Button
                variant={activeInvoiceFilterCount > 0 ? 'contained' : 'outlined'}
                size="small"
                startIcon={<FilterAltIcon sx={{ fontSize: 13 }} />}
                onClick={handleOpenFilterModal}
                sx={{
                  height: 26,
                  px: 1,
                  fontSize: '0.66rem',
                  borderRadius: 1.2,
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#0f766e',
                  bgcolor: activeInvoiceFilterCount > 0 ? '#0f766e' : '#ffffff',
                  color: activeInvoiceFilterCount > 0 ? '#ffffff' : '#0f766e',
                  boxShadow: activeInvoiceFilterCount > 0 ? '0 1px 3px rgba(15,118,110,0.3)' : 'none',
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    bgcolor: activeInvoiceFilterCount > 0 ? '#115e59' : '#f0fdfa',
                    borderColor: '#0d9488',
                  },
                }}
              >
                Filter {activeInvoiceFilterCount > 0 ? `(${activeInvoiceFilterCount})` : ''}
              </Button>
            )}

            {/* Filter Button for Product Wise & Month Wise Items Mode */}
            {(filterType === 'product' || filterType === 'product_total' || filterType === 'month') && (
              <Button
                variant={activeProductFilterCount > 0 ? 'contained' : 'outlined'}
                size="small"
                startIcon={<FilterAltIcon sx={{ fontSize: 13 }} />}
                onClick={handleOpenProductFilterModal}
                sx={{
                  height: 26,
                  px: 1,
                  fontSize: '0.66rem',
                  borderRadius: 1.2,
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#0f766e',
                  bgcolor: activeProductFilterCount > 0 ? '#0f766e' : '#ffffff',
                  color: activeProductFilterCount > 0 ? '#ffffff' : '#0f766e',
                  boxShadow: activeProductFilterCount > 0 ? '0 1px 3px rgba(15,118,110,0.3)' : 'none',
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    bgcolor: activeProductFilterCount > 0 ? '#115e59' : '#f0fdfa',
                    borderColor: '#0d9488',
                  },
                }}
              >
                Filter {activeProductFilterCount > 0 ? `(${activeProductFilterCount})` : ''}
              </Button>
            )}

            {/* Search Box */}
            <Box sx={{ flex: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search in table..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setDisplayedCount(INITIAL_ROW_COUNT);
                  scrollToTop();
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8', fontSize: 14 }} />
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
                  bgcolor: '#ffffff',
                  '& .MuiOutlinedInput-root': {
                    height: 26,
                    minHeight: 26,
                    fontSize: '0.70rem',
                    borderRadius: 1.2,
                  },
                  '& .MuiInputBase-input': {
                    py: '2px !important',
                    px: '4px !important',
                    fontSize: '0.70rem',
                  },
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* ACTIVE INVOICE FILTERS BAR */}
        {((filterType === 'default' && activeInvoiceFilterCount > 0) || salesType !== 'ALL') && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.8, mt: 0.8, pt: 0.8, borderTop: '1px dashed #e2e8f0' }}>
            <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, color: '#64748b' }}>Active Filters:</Typography>
            {salesType !== 'ALL' && (
              <Chip
                label={`Type: ${
                  salesType === 'B2C' ? 'Sales B2C' :
                  salesType === 'B2B' ? 'Sales B2B' :
                  salesType === 'POS' ? 'POS Sales' :
                  salesType === 'Return' ? 'Sales Return' :
                  salesType === 'Quotation' ? 'Sales Order' : salesType
                }`}
                size="small"
                onDelete={() => setSalesType('ALL')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterCustomer && (
              <Chip
                label={`Customer: ${filterCustomer}`}
                size="small"
                onDelete={() => setFilterCustomer('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterUser && (
              <Chip
                label={`User: ${filterUser}`}
                size="small"
                onDelete={() => setFilterUser('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterLocation && (
              <Chip
                label={`Location: ${filterLocation}`}
                size="small"
                onDelete={() => setFilterLocation('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            <Button
              size="small"
              onClick={() => {
                setSalesType('ALL');
                handleClearFilters();
              }}
              sx={{ height: 20, fontSize: '0.60rem', textTransform: 'none', color: '#dc2626', p: 0, minWidth: 'auto', fontWeight: 600 }}
            >
              Clear All
            </Button>
          </Box>
        )}

        {/* ACTIVE PRODUCT & MONTH FILTERS BAR */}
        {(filterType === 'product' || filterType === 'product_total' || filterType === 'month') && activeProductFilterCount > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.8, mt: 0.8, pt: 0.8, borderTop: '1px dashed #e2e8f0' }}>
            <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, color: '#64748b' }}>Active Filters:</Typography>
            {filterProdCustomer && (
              <Chip
                label={`Customer: ${filterProdCustomer}`}
                size="small"
                onDelete={() => setFilterProdCustomer('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterProdBarcode && (
              <Chip
                label={`Barcode: ${filterProdBarcode}`}
                size="small"
                onDelete={() => setFilterProdBarcode('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterProdOfficialName && (
              <Chip
                label={`Official Name: ${filterProdOfficialName}`}
                size="small"
                onDelete={() => setFilterProdOfficialName('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterProdCategory && (
              <Chip
                label={`Category: ${filterProdCategory}`}
                size="small"
                onDelete={() => setFilterProdCategory('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            {filterProdBrand && (
              <Chip
                label={`Brand: ${filterProdBrand}`}
                size="small"
                onDelete={() => setFilterProdBrand('')}
                sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
                variant="outlined"
              />
            )}
            <Button
              size="small"
              onClick={handleClearProductFilters}
              sx={{ height: 20, fontSize: '0.60rem', textTransform: 'none', color: '#dc2626', p: 0, minWidth: 'auto', fontWeight: 600 }}
            >
              Clear All
            </Button>
          </Box>
        )}
      </Card>

      {/* SUMMARY KPI CARDS (FITS IN DEFAULT SCREEN) */}
      <Box
        className="no-print"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1,
          mb: 0.8,
          flexShrink: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Card 1: Records Count */}
        <Card
          elevation={0}
          sx={{
            py: 0.5,
            px: 1,
            borderRadius: 1.5,
            bgcolor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
          }}
        >
          <Box sx={{ width: 24, height: 24, borderRadius: 1.2, bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', flexShrink: 0 }}>
            <ReceiptLongIcon sx={{ fontSize: 15 }} />
          </Box>
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.58rem', display: 'block', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {filterType === 'default'
                ? 'Total Invoices'
                : filterType === 'daily'
                ? 'Total Days'
                : filterType === 'monthly'
                ? 'Total Months'
                : filterType === 'product_total'
                ? 'Total Products'
                : filterType === 'product'
                ? 'Sales Transactions'
                : 'Total Items'}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.84rem', lineHeight: 1.2 }}>
              {filteredRows.length.toLocaleString()}
            </Typography>
          </Box>
        </Card>

        {/* Card 2: Total Revenue / Grand Total */}
        <Card
          elevation={0}
          sx={{
            py: 0.5,
            px: 1,
            borderRadius: 1.5,
            bgcolor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
          }}
        >
          <Box sx={{ width: 24, height: 24, borderRadius: 1.2, bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e', flexShrink: 0 }}>
            <AttachMoneyIcon sx={{ fontSize: 15 }} />
          </Box>
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.58rem', display: 'block', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {filterType === 'month' ? 'Total Sold Qty' : 'Total Sales (Grand Total)'}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.84rem', lineHeight: 1.2 }}>
              {filterType === 'month'
                ? ((totals as any)?.grandQty ?? 0).toLocaleString()
                : (filterType === 'default' || filterType === 'daily' || filterType === 'monthly')
                ? `AED ${formatAED((totals as any)?.grandTotal)}`
                : `AED ${formatAED((totals as any)?.totalAmount)}`}
            </Typography>
          </Box>
        </Card>

        {/* Card 3: Total Purchase / Cost */}
        <Card
          elevation={0}
          sx={{
            py: 0.5,
            px: 1,
            borderRadius: 1.5,
            bgcolor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
          }}
        >
          <Box sx={{ width: 24, height: 24, borderRadius: 1.2, bgcolor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c', flexShrink: 0 }}>
            <CalendarMonthIcon sx={{ fontSize: 15 }} />
          </Box>
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.58rem', display: 'block', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {filterType === 'month' ? 'Active Months Tracked' : 'Total Purchase (Gross)'}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.84rem', lineHeight: 1.2 }}>
              {filterType === 'month'
                ? monthsMeta.length
                : `AED ${formatAED((totals as any)?.totalPurchaseAmount ?? (totals as any)?.purchaseAmount)}`}
            </Typography>
          </Box>
        </Card>

        {/* Card 4: Total Gross Profit */}
        <Card
          elevation={0}
          sx={{
            py: 0.5,
            px: 1,
            borderRadius: 1.5,
            bgcolor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
          }}
        >
          <Box sx={{ width: 24, height: 24, borderRadius: 1.2, bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', flexShrink: 0 }}>
            <TrendingUpIcon sx={{ fontSize: 15 }} />
          </Box>
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.58rem', display: 'block', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Total Gross Profit
            </Typography>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: '0.84rem',
                lineHeight: 1.2,
                color:
                  ((totals as any)?.totalProfit ?? (totals as any)?.profit ?? (totals as any)?.grandProfit ?? 0) >= 0
                    ? '#16a34a'
                    : '#dc2626',
              }}
            >
              AED{' '}
              {formatAED(
                (totals as any)?.totalProfit ?? (totals as any)?.profit ?? (totals as any)?.grandProfit ?? 0
              )}
            </Typography>
          </Box>
        </Card>
      </Box>

      {/* REPORT DATA TABLE (Fills remaining screen height, fits in default screen) */}
      <Box
        className="print-full-width"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1.5,
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
          bgcolor: '#ffffff',
          boxShadow: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <TableContainer
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          sx={{
            flex: 1,
            overflow: 'auto',
            width: '100%',
          }}
        >
          <Table stickyHeader size="small" sx={{ minWidth: tableMinWidth }}>
            {/* ========================================================
                TABLE HEAD - REDUCED FONT SIZE 50% & CHANGED COLOR TO TEAL (#0f766e)
                ======================================================== */}
            {filterType !== 'month' ? (
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#0f766e', color: '#ffffff', py: 0.6, px: 0.8 } }}>
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align || 'left'}
                      sx={{
                        width: col.width,
                        minWidth: col.width,
                        maxWidth: col.width,
                        color: '#ffffff !important',
                        fontWeight: 700,
                        fontSize: '0.58rem', // Reduced font size by 50%
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        borderRight: '1px solid #115e59',
                        bgcolor: '#0f766e',
                      }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
            ) : (
              /* MONTH WISE ITEMS TABLE HEAD */
              <TableHead>
                {/* Top Header Group */}
                <TableRow sx={{ '& th': { bgcolor: '#0f766e', color: '#ffffff', py: 0.5, px: 0.8 } }}>
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      rowSpan={2}
                      align={col.align || 'left'}
                      sx={{
                        width: col.width,
                        minWidth: col.width,
                        color: '#ffffff !important',
                        fontWeight: 700,
                        fontSize: '0.58rem',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        borderRight: '1px solid #115e59',
                      }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                  {monthsMeta.map((m) => (
                    <TableCell
                      key={m.key}
                      colSpan={2}
                      align="center"
                      sx={{
                        color: '#ffffff !important',
                        borderLeft: '1px solid #115e59',
                        borderRight: '1px solid #115e59',
                        bgcolor: '#0d5e58',
                        fontWeight: 700,
                        fontSize: '0.58rem',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {m.label}
                    </TableCell>
                  ))}
                  <TableCell
                    colSpan={2}
                    align="center"
                    sx={{
                      color: '#ffffff !important',
                      bgcolor: '#042f2e',
                      borderLeft: '1px solid #115e59',
                      fontWeight: 700,
                      fontSize: '0.58rem',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Overall Total
                  </TableCell>
                </TableRow>
                {/* Sub Header for Qty & Profit */}
                <TableRow sx={{ '& th': { bgcolor: '#115e59', color: '#e6fffa', py: 0.4, px: 0.6 } }}>
                  {monthsMeta.map((m) => (
                    <React.Fragment key={m.key}>
                      <TableCell align="right" sx={{ color: '#e6fffa !important', borderLeft: '1px solid #0f766e', fontSize: '0.56rem', fontWeight: 700 }}>
                        QTY
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#e6fffa !important', fontSize: '0.56rem', fontWeight: 700 }}>
                        PROFIT
                      </TableCell>
                    </React.Fragment>
                  ))}
                  <TableCell align="right" sx={{ color: '#5eead4 !important', bgcolor: '#042f2e', borderLeft: '1px solid #115e59', fontSize: '0.56rem', fontWeight: 700 }}>
                    QTY
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4ade80 !important', bgcolor: '#042f2e', fontSize: '0.56rem', fontWeight: 700 }}>
                    PROFIT
                  </TableCell>
                </TableRow>
              </TableHead>
            )}

            {/* TABLE BODY */}
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={filterType === 'month' ? visibleColumns.length + monthsMeta.length * 2 + 2 : visibleColumns.length} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} sx={{ color: '#0f766e', mb: 1 }} />
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                      Loading report data...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={filterType === 'month' ? visibleColumns.length + monthsMeta.length * 2 + 2 : visibleColumns.length} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                      No sales records found for the selected period and filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filterType !== 'month'
                    ? visibleRows.map((row, idx) => (
                        <TableRow
                          key={row._id || row.productId || idx}
                          hover
                          ref={(el) => {
                            rowRefs.current[idx] = el;
                          }}
                          onClick={() => setSelectedRowIndex(idx)}
                          onDoubleClick={() => {
                            if (filterType === 'product_total') {
                              if (row.productId) {
                                const prod = products.find((p) => p._id === row.productId);
                                if (prod) {
                                  setFilterType('product');
                                  setSelectedProduct(prod);
                                }
                              }
                            } else if (filterType === 'monthly') {
                              if (row.monthKey && row.monthKey !== 'Unknown') {
                                const [y, m] = row.monthKey.split('-');
                                const lastDay = new Date(Number(y), Number(m), 0).getDate();
                                setFromDate(`${y}-${m}-01`);
                                setToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
                                setDatePreset('custom');
                                setFilterType('daily');
                              }
                            } else if (filterType === 'daily') {
                              if (row.date) {
                                const dStr = typeof row.date === 'string' ? row.date.substring(0, 10) : '';
                                if (dStr) {
                                  setFromDate(dStr);
                                  setToDate(dStr);
                                  setDatePreset('custom');
                                  setFilterType('default');
                                }
                              }
                            } else {
                              handleRowDoubleClick(row);
                            }
                          }}
                          title={
                            filterType === 'product_total'
                              ? 'Double-click to view itemized transactions in Product Wise'
                              : filterType === 'monthly'
                              ? 'Double-click to view Daily breakdown for this month'
                              : filterType === 'daily'
                              ? 'Double-click to view Invoices for this date'
                              : 'Double-click to open invoice'
                          }
                          sx={{
                            cursor: 'pointer',
                            bgcolor: idx === selectedRowIndex ? '#ccfbf1 !important' : idx % 2 === 1 ? '#f8fafc' : '#ffffff',
                            outline: idx === selectedRowIndex ? '2px solid #0f766e' : 'none',
                            outlineOffset: '-2px',
                            transition: 'background-color 0.1s ease',
                            '& td': { py: 0.8, px: 0.8, borderColor: '#f1f5f9' },
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
                                bgcolor: 'inherit',
                              }}
                            >
                              {renderCellContent(col.id, row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : visibleRows.map((row, idx) => (
                        <TableRow
                          key={row.productId || idx}
                          hover
                          ref={(el) => {
                            rowRefs.current[idx] = el;
                          }}
                          onClick={() => setSelectedRowIndex(idx)}
                          onDoubleClick={() => {
                            if (row.productId) {
                              const prod = products.find((p) => p._id === row.productId);
                              if (prod) {
                                setFilterType('product');
                                setSelectedProduct(prod);
                              }
                            }
                          }}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: idx === selectedRowIndex ? '#ccfbf1 !important' : idx % 2 === 1 ? '#f8fafc' : '#ffffff',
                            outline: idx === selectedRowIndex ? '2px solid #0f766e' : 'none',
                            outlineOffset: '-2px',
                            transition: 'background-color 0.1s ease',
                            '& td': { py: 0.8, px: 0.8, borderColor: '#f1f5f9' },
                          }}
                        >
                          {visibleColumns.map((col) => (
                            <TableCell key={col.id} align={col.align || 'left'} sx={{ width: col.width, minWidth: col.width }}>
                              {renderCellContent(col.id, row)}
                            </TableCell>
                          ))}

                          {monthsMeta.map((m) => {
                            const md = row.monthlyData?.[m.key] || { qty: 0, profit: 0 };
                            return (
                              <React.Fragment key={m.key}>
                                <TableCell align="right" sx={{ borderLeft: '1px solid #f1f5f9', fontWeight: md.qty > 0 ? 600 : 400, fontSize: '0.80rem' }}>
                                  {md.qty ? md.qty : '—'}
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{
                                    fontSize: '0.80rem',
                                    fontWeight: md.profit !== 0 ? 700 : 400,
                                    color: md.profit > 0 ? '#16a34a' : md.profit < 0 ? '#dc2626' : '#94a3b8',
                                  }}
                                >
                                  {md.profit ? formatAED(md.profit) : '—'}
                                </TableCell>
                              </React.Fragment>
                            );
                          })}

                          <TableCell align="right" sx={{ borderLeft: '1px solid #cbd5e1', bgcolor: '#f8fafc', fontWeight: 700, color: '#0369a1', fontSize: '0.80rem' }}>
                            {row.totalQty}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              bgcolor: '#f8fafc',
                              fontWeight: 700,
                              fontSize: '0.80rem',
                              color: row.totalProfit >= 0 ? '#16a34a' : '#dc2626',
                            }}
                          >
                            {formatAED(row.totalProfit)}
                          </TableCell>
                        </TableRow>
                      ))}
                </>
              )}
            </TableBody>

            {/* ========================================================
                STICKY HIGHLIGHTED FOOTER TOTALS ROW
                ======================================================== */}
            {filteredRows.length > 0 && (
              <TableHead>
                {filterType !== 'month' ? (
                  <TableRow sx={{ '& th': { bgcolor: '#0f766e', color: '#ffffff', fontWeight: 700, fontSize: '0.64rem', py: 1, px: 0.8 } }}>
                    {visibleColumns.map((col, idx) => {
                      if (idx === 0) {
                        return (
                          <TableCell key={col.id} align={col.align} sx={{ color: '#ffffff !important', letterSpacing: '0.04em' }}>
                            TOTALS ({filteredRows.length} {filterType === 'monthly' ? 'MONTHS' : filterType === 'daily' ? 'DAYS' : ''})
                          </TableCell>
                        );
                      }
                      const totVal = renderFooterTotal(col.id);
                      return (
                        <TableCell
                          key={col.id}
                          align={col.align}
                          sx={{
                            color: '#ffffff !important',
                            bgcolor: '#0f766e',
                            fontWeight: 700,
                          }}
                        >
                          {totVal}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ) : (
                  <TableRow sx={{ '& th': { bgcolor: '#0f766e', color: '#ffffff', fontWeight: 700, fontSize: '0.64rem', py: 1, px: 0.8 } }}>
                    {visibleColumns.map((col, idx) => {
                      if (idx === 0) {
                        return (
                          <TableCell key={col.id} align={col.align} sx={{ color: '#ffffff !important' }}>
                            TOTALS ({filteredRows.length} ITEMS)
                          </TableCell>
                        );
                      }
                      return <TableCell key={col.id} align={col.align} sx={{ color: '#ffffff !important' }} />;
                    })}

                    {monthsMeta.map((m) => {
                      const mt = (totals as any).monthTotals?.[m.key] || { qty: 0, profit: 0 };
                      return (
                        <React.Fragment key={m.key}>
                          <TableCell align="right" sx={{ color: '#5eead4 !important', borderLeft: '1px solid #115e59' }}>
                            {mt.qty}
                          </TableCell>
                          <TableCell align="right" sx={{ color: mt.profit >= 0 ? '#4ade80 !important' : '#fca5a5 !important' }}>
                            {formatAED(mt.profit)}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}

                    <TableCell align="right" sx={{ color: '#5eead4 !important', bgcolor: '#042f2e', borderLeft: '1px solid #115e59' }}>
                      {(totals as any).grandQty}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        bgcolor: '#042f2e',
                        color: (totals as any).grandProfit >= 0 ? '#4ade80 !important' : '#fca5a5 !important',
                      }}
                    >
                      {formatAED((totals as any).grandProfit)}
                    </TableCell>
                  </TableRow>
                )}
              </TableHead>
            )}
          </Table>
        </TableContainer>

        {/* TABLE PROGRESS / SCROLL STATUS FOOTER */}
        <Box
          className="no-print"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 0.8,
            bgcolor: '#fafafa',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Typography sx={{ fontSize: '0.72rem', color: '#334155', fontWeight: 600 }}>
              Showing{' '}
              <Box component="span" sx={{ color: '#0f766e', fontWeight: 700 }}>
                {Math.min(displayedCount, filteredRows.length).toLocaleString()}
              </Box>{' '}
              of{' '}
              <Box component="span" sx={{ color: '#0f766e', fontWeight: 700 }}>
                {filteredRows.length.toLocaleString()}
              </Box>{' '}
              {filterType === 'default' ? 'invoices' : filterType === 'daily' ? 'days' : filterType === 'product' ? 'products' : 'records'}
            </Typography>

            {displayedCount < filteredRows.length ? (
              <Chip
                label="Scroll down to load more rows"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.62rem',
                  bgcolor: '#f0fdfa',
                  color: '#0f766e',
                  borderColor: '#99f6e4',
                  fontWeight: 600,
                }}
                variant="outlined"
              />
            ) : (
              <Chip
                label="All records displayed"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.62rem',
                  bgcolor: '#f1f5f9',
                  color: '#64748b',
                  fontWeight: 600,
                }}
              />
            )}
          </Box>

          {displayedCount < filteredRows.length && (
            <Button
              size="small"
              variant="text"
              onClick={() => setDisplayedCount(filteredRows.length)}
              sx={{
                fontSize: '0.68rem',
                textTransform: 'none',
                fontWeight: 600,
                color: '#0f766e',
                py: 0.2,
                px: 1,
                borderRadius: 1,
                '&:hover': { bgcolor: '#f0fdfa' },
              }}
            >
              Show All ({filteredRows.length.toLocaleString()})
            </Button>
          )}
        </Box>
      </Box>

      {/* INVOICE-WISE FILTER DIALOG */}
      <Dialog
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2, p: 0.5 },
        }}
      >
        <DialogTitle sx={{ py: 1.2, px: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <FilterAltIcon sx={{ color: '#0f766e', fontSize: 18 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
              Invoice Filter Options
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setFilterModalOpen(false)} sx={{ p: 0.3, color: '#94a3b8' }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ py: 2, px: 2, display: 'flex', flexDirection: 'column', gap: 1.8 }}>
          {/* Customer Name Filter */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Customer Name
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={customerOptions}
              value={tempCustomer}
              onChange={(_, newVal) => setTempCustomer(newVal || '')}
              onInputChange={(_, newVal) => setTempCustomer(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type customer name..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>

          {/* User Filter */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              User
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={userOptions}
              value={tempUser}
              onChange={(_, newVal) => setTempUser(newVal || '')}
              onInputChange={(_, newVal) => setTempUser(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type user name..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>

          {/* Location Filter */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Location
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={locationOptions}
              value={tempLocation}
              onChange={(_, newVal) => setTempLocation(newVal || '')}
              onInputChange={(_, newVal) => setTempLocation(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type location..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ py: 1.2, px: 2, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
          <Button
            size="small"
            color="inherit"
            onClick={handleClearFilters}
            sx={{ fontSize: '0.70rem', textTransform: 'none', color: '#dc2626' }}
          >
            Reset Filters
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setFilterModalOpen(false)}
              sx={{ fontSize: '0.70rem', textTransform: 'none', borderColor: '#cbd5e1', color: '#475569' }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleApplyFilters}
              sx={{ fontSize: '0.70rem', textTransform: 'none', bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
            >
              Apply Filter
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* PRODUCT WISE FILTER DIALOG */}
      <Dialog
        open={productFilterModalOpen}
        onClose={() => setProductFilterModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2, p: 0.5 },
        }}
      >
        <DialogTitle sx={{ py: 1.2, px: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <FilterAltIcon sx={{ color: '#0f766e', fontSize: 18 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
              {filterType === 'month' ? 'Month Wise Item Filter Options' : 'Product Filter Options'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setProductFilterModalOpen(false)} sx={{ p: 0.3, color: '#94a3b8' }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ py: 2, px: 2, display: 'flex', flexDirection: 'column', gap: 1.6 }}>
          {/* 1. Customer Name */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Customer Name
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={prodCustomerOptions}
              value={tempProdCustomer}
              onChange={(_, newVal) => setTempProdCustomer(newVal || '')}
              onInputChange={(_, newVal) => setTempProdCustomer(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type customer name..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>

          {/* 2. Product Barcode */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Product Barcode
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={prodBarcodeOptions}
              value={tempProdBarcode}
              onChange={(_, newVal) => setTempProdBarcode(newVal || '')}
              onInputChange={(_, newVal) => setTempProdBarcode(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type barcode..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>

          {/* 3. Product Official Name */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Product Official Name
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={prodOfficialNameOptions}
              value={tempProdOfficialName}
              onChange={(_, newVal) => setTempProdOfficialName(newVal || '')}
              onInputChange={(_, newVal) => setTempProdOfficialName(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type official / generic name..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>

          {/* 4. Category */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Category
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={prodCategoryOptions}
              value={tempProdCategory}
              onChange={(_, newVal) => setTempProdCategory(newVal || '')}
              onInputChange={(_, newVal) => setTempProdCategory(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type category..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>

          {/* 5. Brand */}
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', mb: 0.5 }}>
              Brand
            </Typography>
            <Autocomplete
              freeSolo
              size="small"
              options={prodBrandOptions}
              value={tempProdBrand}
              onChange={(_, newVal) => setTempProdBrand(newVal || '')}
              onInputChange={(_, newVal) => setTempProdBrand(newVal || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type brand..."
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 },
                  }}
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ py: 1.2, px: 2, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
          <Button
            size="small"
            color="inherit"
            onClick={handleClearProductFilters}
            sx={{ fontSize: '0.70rem', textTransform: 'none', color: '#dc2626' }}
          >
            Reset Filters
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setProductFilterModalOpen(false)}
              sx={{ fontSize: '0.70rem', textTransform: 'none', borderColor: '#cbd5e1', color: '#475569' }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleApplyProductFilters}
              sx={{ fontSize: '0.70rem', textTransform: 'none', bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
            >
              Apply Filter
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* COLUMN MANAGER DRAWER (F5 WINDOW) */}
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
