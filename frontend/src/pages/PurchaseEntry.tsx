import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  IconButton,
  Autocomplete,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Badge,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Checkbox,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Print as PrintIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  LocalPrintshop as LocalPrintshopIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
  PauseCircleOutline as HoldIcon,
  PlaylistAdd as HoldListIcon,
  RestorePage as RestoreIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import type { RootState } from '../store';
import { productApi, ledgerAccountApi, purchaseApi, purchaseOrderApi, stockApi, ledgerApi, openingStockApi } from '../services/api';
import type { PurchaseListItem, PurchaseOrderListItem, OpeningStockListItem } from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';
import PurchaseBarcodePrintDialog from '../components/PurchaseBarcodePrintDialog';

// Modern Color theme for Purchase Entry (Dark Slate/Teal)
const PURCHASE_THEME = {
  primary: '#1e293b',        // Dark slate
  primaryDark: '#0f172a',    // Darker slate
  primaryLight: '#f8fafc',   // Very light gray
  accent: '#334155',         // Slate accent
  headerBg: '#d53e4f',       // Reddish grid header
  headerBgSolid: '#d53e4f',  // Reddish header fallback
  rowAlt: '#f8fafc',         // Light gray for alternating rows
  rowHover: '#f1f5f9',       // Gray hover
  border: '#e2e8f0',         // Light gray border
  success: '#1e293b',        // Dark for positive values
  danger: '#1e293b',         // Dark for delete
  warning: '#1e293b',        // Dark for edit/warning
  buttonSave: '#1e293b',     // Dark save button
  buttonEdit: '#475569',     // Slate edit button
  buttonDelete: '#64748b',   // Gray delete button
  buttonPrint: '#475569',    // Slate print button
  pageBg: '#ffffff',         // White page background
};

// Modern Color theme for Purchase Order Entry (Yellow/Amber)
const ORDER_THEME = {
  primary: '#92400e',        // Amber-800
  primaryDark: '#78350f',    // Amber-900
  primaryLight: '#fffbeb',   // Amber-50
  accent: '#b45309',         // Amber-700
  headerBg: '#C0B87A',       // Custom yellow – grid heading background
  headerBgSolid: '#C0B87A',  // Custom yellow fallback
  rowAlt: '#fefce8',         // Yellow-50 for alternating rows
  rowHover: '#fef9c3',       // Yellow-100 hover
  border: '#fde68a',         // Amber-200 border
  success: '#92400e',        // Amber for positive values
  danger: '#92400e',         // Amber for delete
  warning: '#92400e',        // Amber for edit/warning
  buttonSave: '#ca8a04',     // Yellow save button
  buttonEdit: '#b45309',     // Amber edit button
  buttonDelete: '#d97706',   // Amber delete button
  buttonPrint: '#b45309',    // Amber print button
  pageBg: '#ffffff',         // White page background
};

// Modern Color theme for Opening Stock Entry (Blue/Indigo)
const OPENING_STOCK_THEME = {
  primary: '#1d4ed8',        // Blue-700
  primaryDark: '#1e40af',    // Blue-800
  primaryLight: '#eff6ff',   // Blue-50
  accent: '#2563eb',         // Blue-600
  headerBg: '#2563eb',       // Blue header
  headerBgSolid: '#2563eb',  // Blue fallback
  rowAlt: '#f8fafc',
  rowHover: '#eff6ff',
  border: '#bfdbfe',         // Blue-200 border
  success: '#1d4ed8',
  danger: '#1d4ed8',
  warning: '#1d4ed8',
  buttonSave: '#2563eb',     // Blue save button
  buttonEdit: '#3b82f6',     // Blue edit button
  buttonDelete: '#60a5fa',   // Blue delete button
  buttonPrint: '#3b82f6',
  pageBg: '#ffffff',
};

interface UnitOption {
  id: string;
  name: string;
  isMultiUnit: boolean;
  multiUnitId?: string;
  imei?: string;
  price?: number;
  conversion?: number;
  wholesale?: number;
  retail?: number;
  specialPrice1?: number;
  specialPrice2?: number;
}

interface LineItem {
  id: string;
  productId: string;
  productCode: string;
  imei: string;
  name: string;
  unitId: string;
  unitName: string;
  multiUnitId?: string;
  availableUnits: UnitOption[];
  quantity: number;
  pRate: number; // Purchase Rate
  gross: number;
  discPercent: number;
  discAmount: number;
  vatAmount: number;
  profitPercent: number;
  mrp: number;
  retail: number;
  wholesale: number;
  branch: string;
  total: number;
  expiryDate: string;
  specialPrice1: number;
  specialPrice2: number;
  batchNumber: string;
  isCommitted: boolean;
}

interface MultiUnit {
  multiUnitId: string;
  imei?: string;
  conversion?: number;
  price?: number;
  totalPrice?: number;
  retail?: number;
  wholesale?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  unitId?: { _id: string; name?: string; shortCode?: string } | string;
}

interface Product {
  _id: string;
  code?: string;
  name: string;
  imei?: string;
  retailPrice?: number;
  wholesalePrice?: number;
  purchasePrice?: number;
  mrp?: number;
  allowBatches?: boolean;
  unitOfMeasureId?: { _id: string; name?: string; shortCode?: string } | string;
  multiUnits?: MultiUnit[];
}

interface Supplier {
  _id: string;
  code?: string;
  name: string;
  address?: string;
  phone?: string;
}

interface CashAccount {
  _id: string;
  code?: string;
  name: string;
}

interface SupplierCashOption {
  _id: string;
  code?: string;
  name: string;
  address?: string;
  phone?: string;
  type: 'cash' | 'supplier';
}

interface HeldPurchase {
  id: string;
  heldAt: string;
  supplierName: string;
  itemCount: number;
  total: number;
  invoiceNo: string;
  date: string;
  supplierInvNo: string;
  vatType: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  paymentType: 'Cash' | 'Credit';
  supplierId: string | null;
  supplierAddress: string;
  cashAccountId: string | null;
  lines: LineItem[];
  otherDiscPercent: number;
  otherDiscount: number;
  otherCharges: number;
  freightCharge: number;
  roundOff: number;
  autoRoundOff?: boolean;
  narration: string;
}

function loadHeldPurchases(storageKey: string): HeldPurchase[] {
  try {
    const data = localStorage.getItem(storageKey);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHeldPurchases(storageKey: string, invoices: HeldPurchase[]): void {
  localStorage.setItem(storageKey, JSON.stringify(invoices));
}

export function parseExpiryInputToIso(val: string): string {
  if (!val || !val.trim()) return '';
  const trimmed = val.trim();

  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // 1. Single or two digit month only (e.g. "5", "05", "12")
  if (/^\d{1,2}$/.test(trimmed)) {
    const month = parseInt(trimmed, 10);
    if (month >= 1 && month <= 12) {
      // If month is before current month, assume next year; otherwise current year
      const year = month < currentMonth ? currentYear + 1 : currentYear;
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // 2. MM/YY or M/YY or MM-YY or MM.YY or MM/YYYY (e.g. "5/27", "05/27", "05/2027", "5-27", "05.27")
  const sepMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{2,4})$/);
  if (sepMatch) {
    const month = parseInt(sepMatch[1], 10);
    let year = parseInt(sepMatch[2], 10);
    if (year < 100) {
      year = 2000 + year;
    }
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // 3. 3 or 4 digits without separator (e.g. "527" -> 05/27, "0527" -> 05/27, "1227" -> 12/27)
  if (/^\d{3,4}$/.test(trimmed)) {
    let month = 0;
    let year = 0;
    if (trimmed.length === 3) {
      month = parseInt(trimmed.substring(0, 1), 10);
      year = 2000 + parseInt(trimmed.substring(1), 10);
    } else {
      month = parseInt(trimmed.substring(0, 2), 10);
      year = 2000 + parseInt(trimmed.substring(2), 10);
    }
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // 4. DD/MM/YYYY or DD-MM-YYYY
  const fullDateMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (fullDateMatch) {
    const day = parseInt(fullDateMatch[1], 10);
    const month = parseInt(fullDateMatch[2], 10);
    let year = parseInt(fullDateMatch[3], 10);
    if (year < 100) year = 2000 + year;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Fallback: try Date.parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return trimmed;
}

export function formatExpiryDisplay(isoOrVal: string): string {
  if (!isoOrVal) return '';
  const match = isoOrVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    // Show MM/YY e.g. "05/27"
    return `${match[2]}/${match[1].substring(2)}`;
  }
  return isoOrVal;
}

const emptyLine = (): LineItem => ({
  id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
  productId: '',
  productCode: '',
  imei: '',
  name: '',
  unitId: '',
  unitName: '',
  availableUnits: [],
  quantity: 0,
  pRate: 0,
  gross: 0,
  discPercent: 0,
  discAmount: 0,
  vatAmount: 0,
  profitPercent: 0,
  mrp: 0,
  retail: 0,
  wholesale: 0,
  branch: 'MAIN BRANCH',
  total: 0,
  expiryDate: '',
  specialPrice1: 0,
  specialPrice2: 0,
  batchNumber: '',
  isCommitted: false,
});

export default function PurchaseEntry() {
  // Filter for product Autocomplete — sort like supplier A/C: starts with first, then contains, each sorted by name
  const productFilterOptions = useMemo(
    () => (options: Product[], state: { inputValue: string }) => {
      const q = (state.inputValue || '').trim().toLowerCase();
      const name = (p: Product) => (p.name || '').toLowerCase();
      const sortByName = (arr: Product[]) =>
        arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      if (!q) return options;
      const startsWith = options.filter((p) => name(p).startsWith(q));
      const containsOnly = options.filter((p) => name(p).includes(q) && !name(p).startsWith(q));
      return [...sortByName(startsWith), ...sortByName(containsOnly)];
    },
    []
  );

  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);
  const financialYearId = useSelector((s: RootState) => s.app.selectedFinancialYearId);
  const dispatch = useDispatch();

  // Hide menu when clicking on any field
  const handlePageClick = useCallback(() => {
    dispatch(setDrawerOpen(false));
  }, [dispatch]);

  // Navigation and Route Mode (Purchase Entry vs Purchase Order vs Opening Stock)
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const isOpeningStockMode = routeLocation.pathname === '/entry/opening-stock' || routeLocation.pathname === '/entry/opening-purchase';
  const isOrderMode = routeLocation.pathname.includes('/purchase-order');
  const THEME = isOpeningStockMode ? OPENING_STOCK_THEME : (isOrderMode ? ORDER_THEME : PURCHASE_THEME);
  const documentTitle = isOpeningStockMode ? 'Opening Purchase Entry' : (isOrderMode ? 'Purchase Order Entry' : 'Purchase Entry');
  const entryNoLabel = isOpeningStockMode ? 'OP NO' : (isOrderMode ? 'PO NO' : 'ENTRY NO');
  const holdStorageKey = isOpeningStockMode ? 'openingStock_heldInvoices' : (isOrderMode ? 'purchaseOrderEntry_heldInvoices' : 'purchaseEntry_heldInvoices');

  // Header state
  const [invoiceNo, setInvoiceNo] = useState(isOpeningStockMode ? 'OP-0001' : (isOrderMode ? 'PO-0001' : 'PUR-0001'));
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [date, setDate] = useState(getCurrentDate);
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>(isOpeningStockMode ? 'NonVat' : 'Vat');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Cash');

  const [pendingSupplierName, setPendingSupplierName] = useState<string | null>(null);
  const supplierAcRef = useRef<HTMLInputElement>(null);
  const supplierNameRef = useRef<HTMLInputElement>(null);

  // Collapse duplicate mount/activation loads and skip refetches of just-loaded data
  type LoadKey = 'products' | 'suppliers' | 'cash' | 'invoiceList' | 'nextInvoiceNo';
  const loadGuardsRef = useRef<Record<LoadKey, { promise: Promise<void> | null; loadedAt: number }>>({
    products: { promise: null, loadedAt: 0 },
    suppliers: { promise: null, loadedAt: 0 },
    cash: { promise: null, loadedAt: 0 },
    invoiceList: { promise: null, loadedAt: 0 },
    nextInvoiceNo: { promise: null, loadedAt: 0 },
  });
  const cashAccountsCacheRef = useRef<CashAccount[]>([]);
  const runGuardedLoad = useCallback((key: LoadKey, task: () => Promise<void>, force = false): Promise<void> => {
    const guard = loadGuardsRef.current[key];
    if (guard.promise) return guard.promise;
    if (!force && Date.now() - guard.loadedAt < 5000) return Promise.resolve();
    const promise = task()
      .catch(() => {})
      .finally(() => {
        guard.promise = null;
        guard.loadedAt = Date.now();
      });
    guard.promise = promise;
    return promise;
  }, []);

  // Supplier
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierAcListboxOpen, setSupplierAcListboxOpen] = useState(false);
  const [createSupplierConfirmOpen, setCreateSupplierConfirmOpen] = useState(false);
  const [createSupplierConfirmName, setCreateSupplierConfirmName] = useState<string | null>(null);
  const [createProductConfirmOpen, setCreateProductConfirmOpen] = useState(false);
  const [createProductConfirmName, setCreateProductConfirmName] = useState<string | null>(null);
  const [pendingProductName, setPendingProductName] = useState<string | null>(null);
  const [pendingProductLineId, setPendingProductLineId] = useState<string | null>(null);
  const pendingProductLineIdRef = useRef<string | null>(null);

  // Cash Account
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);

  // Combined Cash + Supplier list
  const [supplierCashOptions, setSupplierCashOptions] = useState<SupplierCashOption[]>([]);

  // Products
  const [products, setProducts] = useState<Product[]>([]);

  // Line items
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // Refs for input fields to enable focus navigation
  const imeiInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  // Track last processed IMEI per line to avoid duplicate lookups on Enter + Blur
  const processedImeiRef = useRef<{ [key: string]: string }>({});
  const isProcessingImeiRef = useRef<boolean>(false);
  const itemNameInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameSnapshotRef = useRef<{ lineId: string, data: LineItem } | null>(null);
  const batchInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const expiryInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const unitInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const priceInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const discPercentInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const discAmountInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const profitPercentInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const retailInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const wholesaleInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Adjustment field refs for Enter key navigation
  const otherDiscPercentRef = useRef<HTMLInputElement>(null);
  const otherDiscountRef = useRef<HTMLInputElement>(null);
  const otherChargesRef = useRef<HTMLInputElement>(null);
  const freightRef = useRef<HTMLInputElement>(null);
  const roundOffRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);

  // Row edit commit/revert: snapshot stores old row data before editing
  const rowSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);
  const rowCommittedRef = useRef(false);
  const revertingLineIdRef = useRef<string | null>(null);
  const itemNameListboxOpenRef = useRef(false);

  // Summary
  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [freightCharge, setFreightCharge] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [autoRoundOff, setAutoRoundOff] = useState(false);
  const [narration, setNarration] = useState('');

  // Dialogs
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [savedBatches, setSavedBatches] = useState<{ batchNumber: string; productName: string; quantity: number; purchasePrice: number; expiryDate: string }[]>([]);

  // Extras Dialog (Expiry Date, Special Prices)
  const [extrasDialogOpen, setExtrasDialogOpen] = useState(false);
  const [extrasLineId, setExtrasLineId] = useState<string | null>(null);
  const [tempExpiryDate, setTempExpiryDate] = useState('');
  const [tempSpecialPrice1, setTempSpecialPrice1] = useState(0);
  const [tempSpecialPrice2, setTempSpecialPrice2] = useState(0);
  const [tempBatchNumber, setTempBatchNumber] = useState('');

  // Hold invoices
  const [heldPurchases, setHeldPurchases] = useState<HeldPurchase[]>(() => loadHeldPurchases(holdStorageKey));
  const [holdListDialogOpen, setHoldListDialogOpen] = useState(false);

  // Ledger details for current invoice (when viewing a saved purchase)
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [voucherNo, setVoucherNo] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<Array<{ ledgerAccountCode: string; ledgerAccountName: string; debitAmount: number; creditAmount: number; narration?: string }>>([]);
  const [ledgerEntriesLoading, setLedgerEntriesLoading] = useState(false);

  // Numeric and Expiry field editing: allow natural typing and formatting
  const [editingNumericCell, setEditingNumericCell] = useState<{ lineId?: string; field: string; value: string } | null>(null);
  const [editingExpiryCell, setEditingExpiryCell] = useState<{ lineId: string; value: string } | null>(null);
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === '-') return 0;
    const normalized = raw === '.' || (/^\.\d*$/.test(raw)) ? '0' + raw : raw;
    return parseFloat(normalized) || 0;
  };

  // State
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState('');

  // Selected Product Info
  const [selectedProductInfo, setSelectedProductInfo] = useState<{
    stock: number;
    lastVendor: string;
    purchaseRate: number;
    retailPrice: number;
    wholesalePrice: number;
  } | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Invoice Navigation
  const [invoiceList, setInvoiceList] = useState<Array<PurchaseListItem | PurchaseOrderListItem | OpeningStockListItem>>([]);
  const [currentNavIndex, setCurrentNavIndex] = useState<number>(-1);

  // Derive multi-unit info from current lines state (always up-to-date)
  const activeMultiUnitInfo = useMemo(() => {
    if (!activeLineId) return null;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line || !line.unitId) return null;
    const unit = line.availableUnits.find((u) => u.id === line.unitId);
    if (!unit?.isMultiUnit) return null;
    return {
      pcsInside: unit.conversion,
      multiUnitPrice: unit.conversion ? (unit.price ?? 0) * unit.conversion : undefined,
      wholesale: unit.wholesale,
      retail: unit.retail,
      specialPrice1: unit.specialPrice1,
      specialPrice2: unit.specialPrice2,
    };
  }, [activeLineId, lines]);

  // Calculations
  const VAT_RATE = 5;

  // Helper: compute vatAmount & total based on taxMode
  const calcVatAndTotal = useCallback(
    (net: number, isVat: boolean) => {
      if (!isVat) return { vatAmount: 0, total: net };
      if (taxMode === 'inclusive') {
        const vatAmount = parseFloat((net * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
        return { vatAmount, total: parseFloat(net.toFixed(2)) };
      }
      const vatAmount = parseFloat((net * VAT_RATE / 100).toFixed(2));
      return { vatAmount, total: parseFloat((net + vatAmount).toFixed(2)) };
    },
    [taxMode]
  );

  // Recalculate all lines when taxMode or vatType changes
  useEffect(() => {
    setLines((prev) =>
      prev.map((line) => {
        if (!line.productId) return line;
        const updated = { ...line };
        const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
        const vt = calcVatAndTotal(net, vatType === 'Vat');
        updated.vatAmount = vt.vatAmount;
        updated.total = vt.total;
        return updated;
      })
    );
  }, [taxMode, vatType, calcVatAndTotal]);

  const calculations = useMemo(() => {
    const itemsGross = lines.reduce((sum, l) => sum + l.gross, 0);
    const itemsDiscount = lines.reduce((sum, l) => sum + l.discAmount, 0);
    const itemsVat = lines.reduce((sum, l) => sum + l.vatAmount, 0);
    // When Vat: adjustments are inclusive — total VAT includes VAT in adjustments
    const netAdjustments = otherCharges + freightCharge + roundOff - otherDiscount;
    const vatFromAdjustments = vatType === 'Vat' && netAdjustments !== 0
      ? parseFloat((netAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2))
      : 0;
    const totalVat = itemsVat + vatFromAdjustments;
    // Inclusive: line total = net; Exclusive: line total = net + vat
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + roundOff;
    const totalItems = lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
    return { itemsGross, itemsDiscount, itemsVat, vatFromAdjustments, totalVat, subTotal, grandTotal, totalItems };
  }, [lines, otherDiscount, otherCharges, freightCharge, roundOff, vatType]);

  // Handle other discount percentage change
  const handleOtherDiscPercentChange = (percent: number) => {
    setOtherDiscPercent(percent);
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const discountAmount = (subTotal * percent) / 100;
    setOtherDiscount(parseFloat(discountAmount.toFixed(2)));
  };

  // Auto round-off toggle handler
  const handleAutoRoundOffToggle = useCallback((checked: boolean) => {
    setAutoRoundOff(checked);
    if (checked) {
      const baseTotal = calculations.subTotal - otherDiscount + otherCharges + freightCharge;
      const rounded = Math.round(baseTotal);
      const diff = parseFloat((rounded - baseTotal).toFixed(2));
      setRoundOff(diff);
    } else {
      setRoundOff(0);
    }
  }, [calculations.subTotal, otherDiscount, otherCharges, freightCharge]);

  // Keep roundOff in sync when autoRoundOff is active and totals change
  useEffect(() => {
    if (!autoRoundOff) return;
    const baseTotal = calculations.subTotal - otherDiscount + otherCharges + freightCharge;
    const rounded = Math.round(baseTotal);
    const diff = parseFloat((rounded - baseTotal).toFixed(2));
    if (diff !== roundOff) {
      setRoundOff(diff);
    }
  }, [autoRoundOff, calculations.subTotal, otherDiscount, otherCharges, freightCharge, roundOff]);


  // Sync heldPurchases whenever switching between purchase and order modes
  useEffect(() => {
    setHeldPurchases(loadHeldPurchases(holdStorageKey));
  }, [holdStorageKey]);

  const prevPathnameRef = useRef(routeLocation.pathname);

  // Reset page state when switching between /entry/purchase and /entry/purchase-order
  useEffect(() => {
    const pathChanged = prevPathnameRef.current !== routeLocation.pathname;
    prevPathnameRef.current = routeLocation.pathname;
    if (!pathChanged) return;

    const state = routeLocation.state as { fromPurchaseOrder?: boolean; invoiceId?: string; id?: string; purchaseId?: string } | null;
    if (state?.fromPurchaseOrder || state?.invoiceId || state?.id || state?.purchaseId) return;

    handleClear();
  }, [routeLocation.pathname, routeLocation.state]);

  // Focus Cash/Supplier AC when navigating back to purchase/order, or first line IMEI for opening stock
  useEffect(() => {
    if (routeLocation.pathname === '/entry/purchase' || routeLocation.pathname === '/entry/purchase-order') {
      setTimeout(() => supplierAcRef.current?.focus({ preventScroll: true }), 300);
    } else if (routeLocation.pathname === '/entry/opening-stock' || routeLocation.pathname === '/entry/opening-purchase') {
      const firstLine = lines[0];
      if (firstLine) setTimeout(() => imeiInputRefs.current[firstLine.id]?.focus({ preventScroll: true }), 300);
    }
  }, [routeLocation.pathname]);

  // Pre-fill from Purchase Order when navigated via "Post to Purchase"
  useEffect(() => {
    type POState = {
      fromPurchaseOrder?: boolean;
      supplierId?: string | null;
      supplierName?: string;
      date?: string;
      supplierInvoiceNo?: string;
      vatType?: 'Vat' | 'NonVat';
      taxMode?: 'inclusive' | 'exclusive';
      paymentType?: string;
      cashAccountId?: string | null;
      otherDiscount?: number;
      otherCharges?: number;
      freightCharge?: number;
      roundOff?: number;
      narration?: string;
      lines?: Array<{
        id: string;
        productId: string;
        productCode: string;
        imei?: string;
        name: string;
        unitId: string;
        unitName: string;
        multiUnitId?: string;
        availableUnits?: Array<{ id: string; name: string; isMultiUnit?: boolean; multiUnitId?: string }>;
        quantity: number;
        pRate: number;
        gross: number;
        discPercent: number;
        discAmount: number;
        vatAmount: number;
        profitPercent?: number;
        mrp: number;
        retail: number;
        wholesale: number;
        branch?: string;
        total: number;
        expiryDate?: string;
        specialPrice1: number;
        specialPrice2: number;
        batchNumber?: string;
      }>;
      batches?: Array<{ productId: string; productCode: string; productName: string; purchasePrice: number; discAmount: number; expiryDate?: string; quantity: number; retail?: number; wholesale?: number; specialPrice1?: number; specialPrice2?: number; batchNumber?: string; multiUnitId?: string }>;
    };
    const state = routeLocation.state as POState | null;
    const hasLines = (state?.lines?.length ?? 0) > 0;
    const hasBatches = (state?.batches?.length ?? 0) > 0;
    if (!state?.fromPurchaseOrder || (!hasLines && !hasBatches) || !companyId) return;
    setSupplierId(state.supplierId ?? null);
    setSupplierName(state.supplierName ?? '');
    setDate(state.date ?? getCurrentDate());
    setSupplierInvNo(state.supplierInvoiceNo ?? '');
    setVatType(state.vatType ?? 'Vat');
    setTaxMode(state.taxMode ?? 'inclusive');
    setPaymentType((state.paymentType ?? 'Credit') as 'Cash' | 'Credit');
    setCashAccountId(state.cashAccountId ?? null);
    setOtherDiscount(state.otherDiscount ?? 0);
    setOtherCharges(state.otherCharges ?? 0);
    setFreightCharge(state.freightCharge ?? 0);
    setRoundOff(state.roundOff ?? 0);
    setAutoRoundOff(false);
    setNarration(state.narration ?? '');
    let newLines: LineItem[];
    if (hasLines && state.lines) {
      newLines = state.lines.map((l) => {
        const au = (l.availableUnits && l.availableUnits.length > 0)
          ? l.availableUnits.map((u) => ({ id: u.id, name: u.name, isMultiUnit: u.isMultiUnit ?? false, multiUnitId: u.multiUnitId }))
          : (l.unitId && l.unitName ? [{ id: l.unitId, name: l.unitName, isMultiUnit: false }] : []);
        return {
          id: l.id,
          productId: l.productId,
          productCode: l.productCode,
          imei: l.imei ?? '',
          name: l.name,
          unitId: l.unitId ?? '',
          unitName: l.unitName ?? '',
          availableUnits: au,
          quantity: l.quantity,
          pRate: l.pRate,
          gross: l.gross,
          discPercent: l.discPercent,
          discAmount: l.discAmount,
          vatAmount: l.vatAmount,
          profitPercent: l.profitPercent ?? 0,
          mrp: l.mrp,
          retail: l.retail,
          wholesale: l.wholesale,
          branch: l.branch ?? 'MAIN BRANCH',
          total: l.total,
          expiryDate: l.expiryDate ?? '',
          specialPrice1: l.specialPrice1,
          specialPrice2: l.specialPrice2,
          batchNumber: l.batchNumber ?? '',
          multiUnitId: l.multiUnitId,
          isCommitted: true,
        };
      });
    } else if (state.batches) {
      newLines = state.batches.map((b, idx) => {
        const gross = b.quantity * b.purchasePrice;
        const discPercent = gross > 0 ? parseFloat(((b.discAmount / gross) * 100).toFixed(2)) : 0;
        const net = gross - b.discAmount;
        const vatAmount = state.vatType === 'Vat' ? parseFloat((net * 5 / (state.taxMode === 'inclusive' ? 105 : 100)).toFixed(2)) : 0;
        const total = state.vatType === 'Vat' && state.taxMode === 'exclusive' ? net + vatAmount : net;
        return {
          id: `po-${idx}-${Date.now()}`,
          productId: b.productId,
          productCode: b.productCode,
          imei: '',
          name: b.productName,
          unitId: '',
          unitName: '',
          availableUnits: [],
          quantity: b.quantity,
          pRate: b.purchasePrice,
          gross,
          discPercent,
          discAmount: b.discAmount,
          vatAmount,
          profitPercent: 0,
          mrp: b.retail ?? 0,
          retail: b.retail ?? 0,
          wholesale: b.wholesale ?? 0,
          branch: 'MAIN BRANCH',
          total: parseFloat(total.toFixed(2)),
          expiryDate: b.expiryDate ?? '',
          specialPrice1: b.specialPrice1 ?? 0,
          specialPrice2: b.specialPrice2 ?? 0,
          batchNumber: b.batchNumber ?? '',
          multiUnitId: b.multiUnitId,
          isCommitted: true,
        };
      });
    } else {
      newLines = [emptyLine()];
    }
    setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    setInvoiceId(null);
    setIsSaved(false);
    window.history.replaceState({}, '', routeLocation.pathname);
  }, [companyId, routeLocation.pathname, routeLocation.state]);

  // Load initial data
  useEffect(() => {
    if (!companyId || !financialYearId) return;
    if (!isOpeningStockMode) {
      loadSuppliers();
      loadCashAccounts().then(() => {
        const accounts = cashAccountsCacheRef.current;
        if (accounts.length > 0 && !invoiceId) {
          setCashAccountId(accounts[0]._id);
        }
      });
    }
    loadProducts();
    loadInvoiceList();
    loadNextInvoiceNo();
    if (!isOpeningStockMode) {
      setTimeout(() => supplierAcRef.current?.focus({ preventScroll: true }), 800);
    } else {
      setTimeout(() => {
        const firstLine = lines[0];
        if (firstLine) imeiInputRefs.current[firstLine.id]?.focus({ preventScroll: true });
      }, 800);
    }
  }, [companyId, financialYearId, isOrderMode, isOpeningStockMode]);

  const loadSuppliers = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('suppliers', async () => {
      try {
        const res = await ledgerAccountApi.list(companyId, 'Supplier', undefined, undefined, true);
        setSuppliers(res.data.data as Supplier[]);
      } catch {
        setSuppliers([]);
      }
    }, force);
  }, [companyId, runGuardedLoad]);

  const loadCashAccounts = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('cash', async () => {
      try {
        const res = await ledgerAccountApi.list(companyId, 'Cash', undefined, undefined, true);
        const accounts = res.data.data as CashAccount[];
        cashAccountsCacheRef.current = accounts;
        setCashAccounts(accounts);
      } catch {
        // ignore
      }
    }, force);
  }, [companyId, runGuardedLoad]);

  const loadProducts = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('products', async () => {
      try {
        const res = await productApi.list(companyId, { limit: 1000 });
        setProducts((res.data.data.products || []) as Product[]);
      } catch {
        // ignore
      }
    }, force);
  }, [companyId, runGuardedLoad]);

  useEffect(() => {
    const onProductsUpdated = () => {
      loadProducts(true);
    };
    const onLedgersUpdated = () => {
      if (!isOpeningStockMode) {
        loadSuppliers(true);
        loadCashAccounts(true);
      }
    };
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/entry/purchase' || p === '/entry/purchase-order' || p === '/entry/opening-stock' || p === '/entry/opening-purchase') {
        loadProducts();
        if (!isOpeningStockMode) {
          loadSuppliers();
          loadCashAccounts();
        }
      }
    };
    window.addEventListener('app:products-updated', onProductsUpdated);
    window.addEventListener('app:ledgers-updated', onLedgersUpdated);
    window.addEventListener('app:window-activated', onWindowActivated);
    return () => {
      window.removeEventListener('app:products-updated', onProductsUpdated);
      window.removeEventListener('app:ledgers-updated', onLedgersUpdated);
      window.removeEventListener('app:window-activated', onWindowActivated);
    };
  }, [loadProducts, loadSuppliers, loadCashAccounts, isOpeningStockMode]);

  // Detect return from Supplier Create page — read created ledger from state, set pending and reload suppliers
  const handledReturnFromCreateRef = useRef(false);
  const handledProductReturnRef = useRef(false);
  useEffect(() => {
    const state = routeLocation.state as { createdLedgerName?: string } | null;
    if ((routeLocation.pathname !== '/entry/purchase' && routeLocation.pathname !== '/entry/purchase-order' && routeLocation.pathname !== '/entry/opening-stock' && routeLocation.pathname !== '/entry/opening-purchase') || !state?.createdLedgerName) {
      handledReturnFromCreateRef.current = false;
      return;
    }
    if (handledReturnFromCreateRef.current) return;
    handledReturnFromCreateRef.current = true;
    const createdName = state.createdLedgerName;
    setPendingSupplierName(createdName);
    loadSuppliers(true);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, loadSuppliers, navigate]);

  // Detect return from Product Create page — read created product name and line id, reload products, then auto-fill line
  useEffect(() => {
    const state = routeLocation.state as { createdProductName?: string; lineIdForProduct?: string } | null;
    if ((routeLocation.pathname !== '/entry/purchase' && routeLocation.pathname !== '/entry/purchase-order' && routeLocation.pathname !== '/entry/opening-stock' && routeLocation.pathname !== '/entry/opening-purchase') || !state?.createdProductName) {
      handledProductReturnRef.current = false;
      return;
    }
    if (handledProductReturnRef.current) return;
    handledProductReturnRef.current = true;
    setPendingProductName(state.createdProductName);
    setPendingProductLineId(state.lineIdForProduct ?? null);
    loadProducts(true);
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, loadProducts, navigate]);

  const loadInvoiceList = (force = false) => {
    if (!companyId || !financialYearId) return Promise.resolve();
    return runGuardedLoad('invoiceList', async () => {
      try {
        if (isOpeningStockMode) {
          const res = await openingStockApi.entries.list(companyId, financialYearId);
          if (res.data.success) {
            setInvoiceList(res.data.data);
          }
        } else {
          const res = await (isOrderMode ? purchaseOrderApi.list(companyId, financialYearId) : purchaseApi.list(companyId, financialYearId));
          if (res.data.success) {
            setInvoiceList(res.data.data);
          }
        }
      } catch {
        // ignore
      }
    }, force);
  };

  const loadNextInvoiceNo = (force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('nextInvoiceNo', async () => {
      try {
        if (isOpeningStockMode) {
          if (!financialYearId) return;
          const res = await openingStockApi.entries.getNextEntryNo(companyId, financialYearId);
          if (res.data.success && !invoiceId) {
            setInvoiceNo(res.data.data.entryNo);
          }
        } else {
          const res = await (isOrderMode ? purchaseOrderApi.getNextInvoiceNo(companyId) : purchaseApi.getNextInvoiceNo(companyId));
          if (res.data.success && !invoiceId) {
            setInvoiceNo(res.data.data.invoiceNo);
          }
        }
      } catch {
        // ignore
      }
    }, force);
  };

  // Load a saved purchase invoice into the form
  const loadInvoiceIntoForm = useCallback(async (id: string) => {
    try {
      setLoading(true);
      if (isOpeningStockMode) {
        if (!companyId) return;
        const res = await openingStockApi.entries.getById(id, companyId);
        if (!res.data.success) return;
        const inv = res.data.data;

        setInvoiceId(inv._id);
        setInvoiceNo(inv.entryNo);
        setDate(inv.date);
        setSupplierInvNo('');
        setVatType((inv.vatType as 'Vat' | 'NonVat') || 'NonVat');
        setTaxMode((inv.taxMode as 'inclusive' | 'exclusive') ?? 'inclusive');
        setSupplierId(null);
        setSupplierName('');
        setPaymentType('Cash');
        setCashAccountId(null);
        setNarration(inv.narration || '');
        setVoucherId(null);
        setVoucherNo(null);
        setLedgerEntries([]);
        setIsSaved(true);
        setError(null);
        setSuccessMessage('');

        setOtherDiscount(0);
        setOtherCharges(0);
        setFreightCharge(0);
        setRoundOff(0);
        setAutoRoundOff(false);
        setOtherDiscPercent(0);

        const newLines: LineItem[] = (inv.batches || []).map((b: any, idx: number) => {
          const gross = b.quantity * b.purchasePrice;
          const batchDisc = b.discAmount ?? 0;
          const discPercent = gross > 0 ? parseFloat(((batchDisc / gross) * 100).toFixed(2)) : 0;
          const profitPercent = b.purchasePrice > 0 && b.retail > 0
            ? ((b.retail - b.purchasePrice) / b.purchasePrice) * 100
            : 0;

          const product = products.find((p) => p._id === b.productId);
          const availableUnits: UnitOption[] = [];
          let selectedUnit: UnitOption | null = null;

          if (product) {
            const mainUnit = product.unitOfMeasureId;
            if (mainUnit) {
              const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
              const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
              availableUnits.push({
                id: mainUnitId,
                name: mainUnitName,
                isMultiUnit: false,
                imei: product.imei,
                price: product.purchasePrice ?? 0,
              });
            }
            if (product.multiUnits && product.multiUnits.length > 0) {
              product.multiUnits.forEach((mu) => {
                const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
                const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
                if (muUnitId) {
                  const conv = mu.conversion || 1;
                  const perPiecePrice = mu.wholesale ? mu.wholesale / conv : (mu.totalPrice ? mu.totalPrice / conv : (mu.price ?? 0));
                  availableUnits.push({
                    id: muUnitId,
                    name: muUnitName,
                    isMultiUnit: true,
                    multiUnitId: mu.multiUnitId,
                    imei: mu.imei,
                    price: perPiecePrice,
                    conversion: mu.conversion,
                    wholesale: mu.wholesale,
                    retail: mu.retail,
                    specialPrice1: mu.specialPrice1,
                    specialPrice2: mu.specialPrice2,
                  });
                }
              });
            }
            if (b.multiUnitId) {
              selectedUnit = availableUnits.find((u) => u.multiUnitId === b.multiUnitId) || null;
            }
            if (!selectedUnit) {
              selectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
            }
          }

          return {
            id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
            productId: b.productId,
            productCode: product?.code ?? b.productCode ?? '',
            imei: selectedUnit?.imei || product?.imei || '',
            name: product?.name ?? b.productName ?? '',
            unitId: selectedUnit?.id || '',
            unitName: selectedUnit?.name || '',
            multiUnitId: b.multiUnitId || (selectedUnit?.isMultiUnit ? selectedUnit?.multiUnitId : undefined),
            availableUnits,
            quantity: b.quantity,
            pRate: b.purchasePrice,
            gross,
            discPercent,
            discAmount: batchDisc,
            vatAmount: 0,
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            mrp: b.retail,
            retail: b.retail,
            wholesale: b.wholesale,
            branch: 'MAIN BRANCH',
            total: gross - batchDisc,
            expiryDate: b.expiryDate || '',
            specialPrice1: b.specialPrice1,
            specialPrice2: b.specialPrice2,
            batchNumber: b.batchNumber,
            isCommitted: true,
          };
        });

        setLines(newLines.length > 0 ? newLines : [emptyLine()]);
        const idx = invoiceList.findIndex((i) => i._id === id);
        if (idx >= 0) setCurrentNavIndex(idx);
        return;
      }

      const res = await (isOrderMode ? purchaseOrderApi.getById(id) : purchaseApi.getById(id));
      if (!res.data.success) return;
      const inv = res.data.data;

      setInvoiceId(inv._id);
      setInvoiceNo(inv.invoiceNo);
      setDate(inv.date);
      setSupplierInvNo(inv.supplierInvoiceNo || '');
      setVatType(inv.vatType || 'Vat');
      setTaxMode((inv.taxMode as 'inclusive' | 'exclusive') ?? 'inclusive');
      setSupplierId(inv.supplierId || null);
      setSupplierName(inv.supplierName || '');
      setPaymentType((inv.paymentType ?? 'Credit') as 'Cash' | 'Credit');
      setCashAccountId(inv.cashAccountId || null);
      setNarration(inv.narration || '');
      setVoucherId(inv.voucherId || null);
      setVoucherNo(inv.voucherNo || null);
      setLedgerEntries([]);
      setIsSaved(true);
      setError(null);
      setSuccessMessage('');

      // Load adjustment fields
      setOtherDiscount(inv.otherDiscount ?? 0);
      setOtherCharges(inv.otherCharges ?? 0);
      setFreightCharge(inv.freightCharge ?? 0);
      setRoundOff(inv.roundOff ?? 0);
      setAutoRoundOff(false);
      // Recalculate other disc percent from loaded values
      const loadedSubTotal = inv.batches.reduce((sum: number, b: any) => sum + (b.quantity * b.purchasePrice - (b.discAmount ?? 0)), 0);
      if (loadedSubTotal > 0 && (inv.otherDiscount ?? 0) > 0) {
        setOtherDiscPercent(parseFloat((((inv.otherDiscount ?? 0) / loadedSubTotal) * 100).toFixed(2)));
      } else {
        setOtherDiscPercent(0);
      }

      // Build line items from batches — look up product for imei/unit info
      const newLines: LineItem[] = inv.batches.map((b: any, idx: number) => {
        const gross = b.quantity * b.purchasePrice;
        const batchDisc = b.discAmount ?? 0;
        const discPercent = gross > 0 ? parseFloat(((batchDisc / gross) * 100).toFixed(2)) : 0;
        const profitPercent = b.purchasePrice > 0 && b.retail > 0
          ? ((b.retail - b.purchasePrice) / b.purchasePrice) * 100
          : 0;

        const product = products.find((p) => p._id === b.productId);
        const availableUnits: UnitOption[] = [];
        let selectedUnit: UnitOption | null = null;

        if (product) {
          const mainUnit = product.unitOfMeasureId;
          if (mainUnit) {
            const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
            const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
            availableUnits.push({
              id: mainUnitId,
              name: mainUnitName,
              isMultiUnit: false,
              imei: product.imei,
              price: product.purchasePrice ?? 0,
            });
          }
          if (product.multiUnits && product.multiUnits.length > 0) {
            product.multiUnits.forEach((mu) => {
              const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
              const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
              if (muUnitId) {
                const conv = mu.conversion || 1;
                const perPiecePrice = mu.wholesale ? mu.wholesale / conv : (mu.totalPrice ? mu.totalPrice / conv : (mu.price ?? 0));
                availableUnits.push({
                  id: muUnitId,
                  name: muUnitName,
                  isMultiUnit: true,
                  multiUnitId: mu.multiUnitId,
                  imei: mu.imei,
                  price: perPiecePrice,
                  conversion: mu.conversion,
                  wholesale: mu.wholesale,
                  retail: mu.retail,
                  specialPrice1: mu.specialPrice1,
                  specialPrice2: mu.specialPrice2,
                });
              }
            });
          }
          if (b.multiUnitId) {
            selectedUnit = availableUnits.find((u) => u.multiUnitId === b.multiUnitId) || null;
          }
          if (!selectedUnit) {
            selectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
          }
        }

        return {
          id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
          productId: b.productId,
          productCode: product?.code ?? b.productCode ?? '',
          imei: selectedUnit?.imei || product?.imei || '',
          name: product?.name ?? b.productName ?? '',
          unitId: selectedUnit?.id || '',
          unitName: selectedUnit?.name || '',
          multiUnitId: b.multiUnitId || (selectedUnit?.isMultiUnit ? selectedUnit?.multiUnitId : undefined),
          availableUnits,
          quantity: b.quantity,
          pRate: b.purchasePrice,
          gross,
          discPercent,
          discAmount: batchDisc,
          vatAmount: 0,
          profitPercent: parseFloat(profitPercent.toFixed(2)),
          mrp: b.retail,
          retail: b.retail,
          wholesale: b.wholesale,
          branch: 'MAIN BRANCH',
          total: gross - batchDisc,
          expiryDate: b.expiryDate || '',
          specialPrice1: b.specialPrice1,
          specialPrice2: b.specialPrice2,
          batchNumber: b.batchNumber,
          isCommitted: true,
        };
      });

      setLines(newLines.length > 0 ? newLines : [emptyLine()]);

      // Update nav index
      const idx = invoiceList.findIndex((i) => i._id === id);
      if (idx >= 0) setCurrentNavIndex(idx);
    } catch (err: any) {
      showErrorDialog(err.response?.data?.message || `Failed to load ${documentTitle.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [companyId, invoiceList, products, isOrderMode, isOpeningStockMode, documentTitle]);

  // Auto-load purchase invoice if navigated with invoiceId in location state
  useEffect(() => {
    const state = routeLocation.state as { invoiceId?: string; id?: string; purchaseId?: string } | null;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = state?.invoiceId || state?.id || state?.purchaseId || urlParams.get('id');
    if (targetId && companyId) {
      loadInvoiceIntoForm(targetId);
      navigate(routeLocation.pathname, { replace: true, state: {} });
    }
  }, [companyId, routeLocation.pathname, routeLocation.state, loadInvoiceIntoForm, navigate]);

  // Fetch ledger entries when viewing an invoice that has a voucher
  useEffect(() => {
    if (!voucherId) {
      setLedgerEntries([]);
      return;
    }
    let cancelled = false;
    setLedgerEntriesLoading(true);
    ledgerApi.entriesByVoucher(voucherId).then((res) => {
      if (!cancelled && res.data.success && Array.isArray(res.data.data)) setLedgerEntries(res.data.data);
    }).catch(() => {
      if (!cancelled) setLedgerEntries([]);
    }).finally(() => {
      if (!cancelled) setLedgerEntriesLoading(false);
    });
    return () => { cancelled = true; };
  }, [voucherId]);

  // Navigation handlers
  const navFirst = useCallback(() => {
    if (invoiceList.length === 0) return;
    loadInvoiceIntoForm(invoiceList[0]._id);
  }, [invoiceList, loadInvoiceIntoForm]);

  const navPrev = useCallback(() => {
    if (invoiceList.length === 0) return;
    // If no invoice is loaded yet, go to the last invoice
    if (currentNavIndex < 0) {
      loadInvoiceIntoForm(invoiceList[invoiceList.length - 1]._id);
      return;
    }
    const idx = currentNavIndex > 0 ? currentNavIndex - 1 : 0;
    loadInvoiceIntoForm(invoiceList[idx]._id);
  }, [invoiceList, currentNavIndex, loadInvoiceIntoForm]);

  const navNext = useCallback(() => {
    if (invoiceList.length === 0) return;
    const idx = currentNavIndex < invoiceList.length - 1 ? currentNavIndex + 1 : invoiceList.length - 1;
    loadInvoiceIntoForm(invoiceList[idx]._id);
  }, [invoiceList, currentNavIndex, loadInvoiceIntoForm]);

  const navLast = useCallback(() => {
    if (invoiceList.length === 0) return;
    loadInvoiceIntoForm(invoiceList[invoiceList.length - 1]._id);
  }, [invoiceList, loadInvoiceIntoForm]);

  // Combine cash accounts and suppliers into a single list, sorted by name (same as Sales B2C)
  useEffect(() => {
    const cashOptions: SupplierCashOption[] = cashAccounts.map((c) => ({
      _id: c._id,
      code: c.code,
      name: c.name,
      type: 'cash' as const,
    }));
    const supplierOptions: SupplierCashOption[] = suppliers.map((s) => ({
      _id: s._id,
      code: s.code,
      name: s.name,
      address: s.address,
      phone: s.phone,
      type: 'supplier' as const,
    }));
    const combined = [...cashOptions, ...supplierOptions].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    setSupplierCashOptions(combined);
  }, [cashAccounts, suppliers]);

  // Line item handlers
  const updateLine = useCallback(
    (id: string, field: keyof LineItem, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };

          // Recalculate when quantity, price, or discount changes
          if (['quantity', 'pRate', 'discPercent', 'discAmount', 'retail', 'wholesale', 'profitPercent'].includes(field)) {
            updated.gross = parseFloat((updated.quantity * updated.pRate).toFixed(2));
            if (field === 'discPercent') {
              updated.discAmount = parseFloat(((updated.gross * updated.discPercent) / 100).toFixed(2));
            } else if (field === 'discAmount') {
              updated.discPercent = updated.gross > 0 ? parseFloat(((updated.discAmount / updated.gross) * 100).toFixed(2)) : 0;
            }
            const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
            const vt = calcVatAndTotal(net, vatType === 'Vat');
            updated.vatAmount = vt.vatAmount;
            updated.total = vt.total;

            // When profit percentage is changed, calculate retail and wholesale prices (both same profit %)
            if (field === 'profitPercent' && updated.pRate > 0) {
              const priceWithProfit = parseFloat((updated.pRate * (1 + updated.profitPercent / 100)).toFixed(2));
              updated.retail = priceWithProfit;
              updated.wholesale = priceWithProfit;
            }
            // When retail price is changed, calculate profit percentage
            else if (field === 'retail' && updated.pRate > 0) {
              updated.profitPercent = parseFloat((((updated.retail - updated.pRate) / updated.pRate) * 100).toFixed(2));
            }
            // When pRate changes, recalculate profit percentage based on existing retail
            else if (field === 'pRate' && updated.pRate > 0 && updated.retail > 0) {
              updated.profitPercent = parseFloat((((updated.retail - updated.pRate) / updated.pRate) * 100).toFixed(2));
            }
          }
          return updated;
        })
      );
    },
    [vatType, calcVatAndTotal]
  );

  const handleProductSelect = useCallback(
    async (lineId: string, product: Product | null, searchedImei?: string) => {
      if (!product) {
        updateLine(lineId, 'productId', '');
        updateLine(lineId, 'productCode', '');
        updateLine(lineId, 'name', '');
        updateLine(lineId, 'imei', '');
        updateLine(lineId, 'pRate', 0);
        return;
      }

      const purchasePrice = product.purchasePrice ?? 0;
      const retailPrice = product.retailPrice ?? 0;
      const wholesalePrice = product.wholesalePrice ?? 0;
      const mrp = (product as any).mrp ?? retailPrice;

      // Build available units list
      const availableUnits: UnitOption[] = [];

      // Add main unit
      const mainUnit = product.unitOfMeasureId;
      if (mainUnit) {
        const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
        const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
        availableUnits.push({
          id: mainUnitId,
          name: mainUnitName,
          isMultiUnit: false,
          imei: product.imei,
          price: purchasePrice,
        });
      }

      // Add multi-units
      if (product.multiUnits && product.multiUnits.length > 0) {
        product.multiUnits.forEach((mu) => {
          const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
          const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
          if (muUnitId) {
            // Per-piece price = wholesale / conversion (fallback to totalPrice for legacy data)
            const conv = mu.conversion || 1;
            const perPiecePrice = mu.wholesale ? mu.wholesale / conv : (mu.totalPrice ? mu.totalPrice / conv : (mu.price ?? 0));
            availableUnits.push({
              id: muUnitId,
              name: muUnitName,
              isMultiUnit: true,
              multiUnitId: mu.multiUnitId,
              imei: mu.imei,
              price: perPiecePrice,
              conversion: mu.conversion,
              wholesale: mu.wholesale,
              retail: mu.retail,
              specialPrice1: mu.specialPrice1,
              specialPrice2: mu.specialPrice2,
            });
          }
        });
      }

      // Determine which unit to use
      let selectedUnit: UnitOption | null = null;

      if (searchedImei) {
        const searchImeiStr = String(searchedImei).trim();
        const mainImeiStr = product.imei ? String(product.imei).trim() : '';
        if (mainImeiStr && mainImeiStr === searchImeiStr) {
          selectedUnit = availableUnits.find((u) => !u.isMultiUnit) || null;
        }
        if (!selectedUnit) {
          selectedUnit = availableUnits.find((u) => {
            if (!u.isMultiUnit) return false;
            const unitImeiStr = u.imei ? String(u.imei).trim() : '';
            return unitImeiStr === searchImeiStr;
          }) || null;
        }
      }

      if (!selectedUnit) {
        selectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
      }

      // For multi-units: P.Rate = base purchase rate * pcs inside (the multi-unit total price)
      // For normal units: P.Rate = product purchase price
      const isMultiUnit = selectedUnit?.isMultiUnit && selectedUnit?.conversion;
      const usePrice = parseFloat((isMultiUnit
        ? purchasePrice * (selectedUnit!.conversion!)
        : (selectedUnit?.price ?? purchasePrice)).toFixed(2));
      const useImei = selectedUnit?.imei || product.imei || (searchedImei ? String(searchedImei).trim() : '');
      if (useImei) {
        processedImeiRef.current[lineId] = useImei.trim();
      }
      const useQuantity = 1;

      // For multi-units: use multi-unit's own retail/wholesale/special prices
      // For normal units: use product's retail/wholesale prices
      const useRetail = isMultiUnit && selectedUnit!.retail ? selectedUnit!.retail : retailPrice;
      const useWholesale = isMultiUnit && selectedUnit!.wholesale ? selectedUnit!.wholesale : wholesalePrice;
      const useSpecialPrice1 = isMultiUnit && selectedUnit!.specialPrice1 ? selectedUnit!.specialPrice1 : 0;
      const useSpecialPrice2 = isMultiUnit && selectedUnit!.specialPrice2 ? selectedUnit!.specialPrice2 : 0;

      // Calculate profit percentage
      const profitPercent = usePrice > 0 && useRetail > 0 ? ((useRetail - usePrice) / usePrice) * 100 : 0;

      // Do not auto-generate batch number on selection; user must enter batch number or expiry date to create a batch
      const batchNum = '';

      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = {
            ...line,
            productId: product._id,
            productCode: product.code || '',
            name: product.name,
            imei: useImei,
            unitId: selectedUnit?.id || '',
            unitName: selectedUnit?.name || '',
            multiUnitId: selectedUnit?.isMultiUnit ? selectedUnit?.multiUnitId : undefined,
            availableUnits,
            pRate: usePrice,
            quantity: useQuantity,
            gross: parseFloat((useQuantity * usePrice).toFixed(2)),
            mrp,
            retail: useRetail,
            wholesale: useWholesale,
            specialPrice1: useSpecialPrice1,
            specialPrice2: useSpecialPrice2,
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            batchNumber: batchNum,
          };
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        })
      );

      // Update selected product info with actual stock from backend
      let actualStock = 0;
      try {
        if (companyId && product._id) {
          const stockRes = await stockApi.getProductStock(companyId, product._id);
          actualStock = stockRes.data.data?.stock ?? 0;
        }
      } catch {
        actualStock = (product as any).stock ?? (product as any).quantity ?? 0;
      }
      setSelectedProductInfo({
        stock: actualStock,
        lastVendor: (product as any).lastVendor ?? (product as any).lastSupplier ?? 'N/A',
        purchaseRate: usePrice,
        retailPrice: retailPrice,
        wholesalePrice: wholesalePrice,
      });
      setActiveLineId(lineId);

      if (!rowSnapshotRef.current) {
        rowCommittedRef.current = true;
      }

      // Focus on batch field after product selection
      if (!searchedImei) {
        setTimeout(() => {
          batchInputRefs.current[lineId]?.focus();
          batchInputRefs.current[lineId]?.select();
        }, 100);
      }
    },
    [vatType, updateLine, companyId, calcVatAndTotal]
  );

  const handleImeiSearch = useCallback(
    async (lineId: string, searchValue: string): Promise<boolean> => {
      if (!searchValue.trim() || !companyId) return false;
      const searchTerm = searchValue.trim();

      try {
        // Try searching by IMEI first
        let product: Product | null = null;

        try {
          const res = await productApi.getByImei(companyId, searchTerm);
          if (res.data.data) {
            const responseData = res.data.data as { product?: Product } | Product;
            product = 'product' in responseData ? responseData.product || null : responseData as Product;
          }
        } catch {
          // IMEI search failed, try barcode
        }

        // If not found by IMEI, try barcode
        if (!product) {
          try {
            const res = await productApi.getByBarcode(companyId, searchTerm);
            if (res.data.data) {
              const responseData = res.data.data as { product?: Product } | Product;
              product = 'product' in responseData ? responseData.product || null : responseData as Product;
            }
          } catch {
            // Barcode search failed, try product code in local list
          }
        }

        // If still not found, search in local products list by code
        if (!product) {
          product = products.find((p) => p.code === searchTerm || p.code?.toLowerCase() === searchTerm.toLowerCase()) || null;
        }

        if (product) {
          handleProductSelect(lineId, product, searchTerm);

          // Check if any other row (excluding current) is missing Item Code
          const otherRowsMissingItemCode = lines.some((l) => l.id !== lineId && !l.productCode);
          if (!otherRowsMissingItemCode) {
            // Add a new row and focus on its IMEI field
            const newLineId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            const newLine: LineItem = {
              ...emptyLine(),
              id: newLineId,
            };
            setLines((prev) => [...prev, newLine]);

            // Focus on the new row's IMEI field after a short delay
            setTimeout(() => {
              imeiInputRefs.current[newLineId]?.focus();
            }, 100);
          } else {
            // Focus on QTY in current row
            setTimeout(() => {
              qtyInputRefs.current[lineId]?.focus();
            }, 100);
          }
          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [companyId, handleProductSelect, products, lines]
  );

  // Handle Enter key on Item Name field - auto-select matching product by typed name
  const handleItemNameKeyDown = useCallback(
    (e: React.KeyboardEvent, line: LineItem) => {
      if (e.key !== 'Enter') return;
      // When list is open and typed value is a prefix of some product, let Autocomplete handle Enter (arrow+Enter to select)
      if (itemNameListboxOpenRef.current && line.name.trim()) {
        const prefixCheck = line.name.trim().toLowerCase();
        const isPrefixOfAny = products.some((p: Product) => (p.name && String(p.name).trim().toLowerCase().startsWith(prefixCheck)));
        if (isPrefixOfAny) return;
      }

      // If item name is blank and no product selected — check if last row, jump to save
      if (!line.productId && !line.name.trim()) {
        const currentIndex = lines.findIndex((l) => l.id === line.id);
        if (currentIndex === lines.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          if (isOpeningStockMode) {
            setTimeout(() => saveButtonRef.current?.focus(), 50);
          } else {
            setTimeout(() => otherDiscPercentRef.current?.focus(), 50);
          }
          return;
        }
      }

      // Helper: exact name match (case-insensitive)
      const exactNameMatch = (list: Product[], name: string) =>
        list.find((p: Product) => (p.name && String(p.name).trim().toLowerCase()) === name.trim().toLowerCase()) ?? null;

      // If no product selected yet, try to match typed name to a product (local then API)
      if (!line.productId && line.name.trim()) {
        const typed = line.name.trim();
        const typedLower = typed.toLowerCase();
        let match = products.find((p: Product) => p.name && String(p.name).trim().toLowerCase() === typedLower) ?? null;

        if (match) {
          e.preventDefault();
          e.stopPropagation();
          handleProductSelect(line.id, match);
          setTimeout(() => {
            batchInputRefs.current[line.id]?.focus();
            batchInputRefs.current[line.id]?.select();
          }, 100);
          return;
        }

        // Typed value is a prefix of some product? Don't intercept Enter — let Autocomplete handle it (arrow+Enter to select)
        const isPrefixOfAny = products.some((p: Product) => (p.name && String(p.name).trim().toLowerCase().startsWith(typedLower)));
        if (isPrefixOfAny) return;

        // No local match and not a prefix of any — fetch by search, then exact match or single-result or create dialog
        e.preventDefault();
        e.stopPropagation();
        const lineId = line.id;
        (async () => {
          if (!companyId) return;
          try {
            const res = await productApi.list(companyId, { search: typed, limit: 50 });
            const data = res?.data?.data;
            const list = (data?.products ?? []) as Product[];
            let found = exactNameMatch(list, typed);
            // If no exact match but search returned exactly one product, use it (e.g. "lenova" -> "Lenova"/"Lenovo")
            if (!found && list.length === 1) found = list[0];
            if (found) {
              handleProductSelect(lineId, found);
              setTimeout(() => {
                batchInputRefs.current[lineId]?.focus();
                batchInputRefs.current[lineId]?.select();
              }, 100);
            } else {
              // Only show create dialog when typed isn't a prefix of any API result (so arrow+Enter can still select)
              const isPrefixInList = list.some((p: Product) => (p.name && String(p.name).trim().toLowerCase().startsWith(typedLower)));
              if (!isPrefixInList) {
                pendingProductLineIdRef.current = lineId;
                setCreateProductConfirmName(typed);
                setCreateProductConfirmOpen(true);
              }
            }
          } catch {
            // Keep focus in Item Name on error
          }
        })();
        return;
      }

      // If the row already has a product but name was changed, try to match the new name
      if (line.productId && line.name.trim()) {
        const product = products.find((p: Product) => p._id === line.productId);
        if (product && line.name.trim().toLowerCase() !== product.name.trim().toLowerCase()) {
          const typedLower = line.name.trim().toLowerCase();
          let newMatch = products.find((p: Product) => p.name.trim().toLowerCase() === typedLower) ?? null;

          if (newMatch) {
            e.preventDefault();
            e.stopPropagation();
            handleProductSelect(line.id, newMatch);
            setTimeout(() => {
              batchInputRefs.current[line.id]?.focus();
              batchInputRefs.current[line.id]?.select();
            }, 100);
            return;
          }

          // No match — revert to original name and keep cursor in Item Name
          e.preventDefault();
          e.stopPropagation();
          updateLine(line.id, 'name', product.name);
          return;
        }

        // Name unchanged or same product — move focus to next field (Batch No)
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          batchInputRefs.current[line.id]?.focus();
          batchInputRefs.current[line.id]?.select();
        }, 50);
      }
    },
    [companyId, products, updateLine, handleProductSelect, lines]
  );

  // IMEI + Enter: If blank → Item Name, If has value → search, auto-add new row & focus IMEI
  const handleImeiKeyDown = useCallback(
    async (e: React.KeyboardEvent, lineId: string, imei: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const trimmed = (imei || '').trim();
      if (!trimmed) {
        // IMEI is blank, go to Item Name
        itemNameInputRefs.current[lineId]?.focus();
      } else {
        if (isProcessingImeiRef.current) return;
        isProcessingImeiRef.current = true;
        try {
          const found = await handleImeiSearch(lineId, trimmed);
          if (found) {
            processedImeiRef.current[lineId] = trimmed;
          } else {
            // If not found, still go to Item Name
            itemNameInputRefs.current[lineId]?.focus();
          }
        } finally {
          setTimeout(() => {
            isProcessingImeiRef.current = false;
          }, 150);
        }
      }
    },
    [handleImeiSearch]
  );

  // IMEI blur: if user entered a value in int barcode and leaves the field, search & populate like Enter
  const handleImeiBlur = useCallback(
    async (lineId: string, imei: string) => {
      const trimmed = (imei || '').trim();
      if (!trimmed) return;
      if (isProcessingImeiRef.current) return;
      if (processedImeiRef.current[lineId] === trimmed) return;

      const currentLine = lines.find((l) => l.id === lineId);
      if (
        currentLine &&
        currentLine.productId &&
        (currentLine.imei?.trim() === trimmed || currentLine.productCode?.trim().toLowerCase() === trimmed.toLowerCase())
      ) {
        processedImeiRef.current[lineId] = trimmed;
        return;
      }

      isProcessingImeiRef.current = true;
      try {
        const found = await handleImeiSearch(lineId, trimmed);
        if (found) {
          processedImeiRef.current[lineId] = trimmed;
        }
      } finally {
        setTimeout(() => {
          isProcessingImeiRef.current = false;
        }, 150);
      }
    },
    [handleImeiSearch, lines]
  );

  // Batch No + Enter → Expiry Date
  const handleBatchKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      expiryInputRefs.current[lineId]?.focus();
    },
    []
  );

  // Expiry Date + Enter → Qty
  const handleExpiryKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      qtyInputRefs.current[lineId]?.focus();
      qtyInputRefs.current[lineId]?.select();
    },
    []
  );

  // Revert uncommitted row edits back to snapshot
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      revertingLineIdRef.current = snapshot.lineId;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
      setEditingNumericCell((prev) =>
        prev && prev.lineId === snapshot.lineId ? null : prev
      );
      setEditingExpiryCell((prev) =>
        prev && prev.lineId === snapshot.lineId ? null : prev
      );
      setTimeout(() => {
        revertingLineIdRef.current = null;
      }, 150);
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  const handleItemNameFocus = useCallback((line: LineItem) => {
    itemNameSnapshotRef.current = { lineId: line.id, data: { ...line } };
    loadProducts();
  }, [loadProducts]);

  // Item name blur: if user cleared and did not select a product, restore from snapshot
  const handleItemNameBlur = useCallback((line: LineItem) => {
    const snap = itemNameSnapshotRef.current;
    if (snap && snap.lineId === line.id && snap.data.productId && !line.productId && snap.data.isCommitted) {
      setLines((prev) =>
        prev.map((l) => (l.id === line.id ? { ...l, ...snap.data } : l))
      );
    }
    itemNameSnapshotRef.current = null;
  }, []);

  // Called when user enters a row (click or focus from keyboard navigation)
  const enterRow = useCallback((line: LineItem) => {
    // If we're entering the same row we're already on, do nothing
    if (rowSnapshotRef.current && rowSnapshotRef.current.lineId === line.id) return;

    // If switching from another filled row that wasn't committed, revert it
    revertUncommittedRow();

    // Take a snapshot of this row if it was previously committed
    if (line.isCommitted) {
      rowSnapshotRef.current = {
        lineId: line.id,
        data: { ...line, availableUnits: [...line.availableUnits] },
      };
      rowCommittedRef.current = false;
    }
  }, [revertUncommittedRow]);

  // QTY + Enter → P Rate
  const handleQtyKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = (e.target as HTMLInputElement)?.value ?? '';
      updateLine(lineId, 'quantity', parseNumericInput(raw));
      setEditingNumericCell(null);
      setTimeout(() => {
        const el = priceInputRefs.current[lineId];
        if (el) {
          el.focus();
          el.select?.();
        }
      }, 30);
    },
    [updateLine]
  );

  // P Rate + Enter → DISC%
  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = (e.target as HTMLInputElement)?.value ?? '';
      updateLine(lineId, 'pRate', parseNumericInput(raw));
      setEditingNumericCell(null);
      setTimeout(() => {
        const el = discPercentInputRefs.current[lineId];
        if (el) {
          el.focus();
          el.select?.();
        }
      }, 30);
    },
    [updateLine]
  );

  // DISC% + Enter → Disc Amount
  const handleDiscPercentKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = (e.target as HTMLInputElement)?.value ?? '';
      updateLine(lineId, 'discPercent', parseNumericInput(raw));
      setEditingNumericCell(null);
      setTimeout(() => {
        const el = discAmountInputRefs.current[lineId];
        if (el) {
          el.focus();
          el.select?.();
        }
      }, 30);
    },
    [updateLine]
  );

  // Disc Amount + Enter → Profit%
  const handleDiscAmountKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = (e.target as HTMLInputElement)?.value ?? '';
      updateLine(lineId, 'discAmount', parseNumericInput(raw));
      setEditingNumericCell(null);
      setTimeout(() => {
        const el = profitPercentInputRefs.current[lineId];
        if (el) {
          el.focus();
          el.select?.();
        }
      }, 30);
    },
    [updateLine]
  );

  // Profit% + Enter → Retail
  const handleProfitPercentKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = (e.target as HTMLInputElement)?.value ?? '';
      updateLine(lineId, 'profitPercent', parseNumericInput(raw));
      setEditingNumericCell(null);
      setTimeout(() => {
        const el = retailInputRefs.current[lineId];
        if (el) {
          el.focus();
          el.select?.();
        }
      }, 30);
    },
    [updateLine]
  );

  // Retail + Enter → Wholesale
  const handleRetailKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = (e.target as HTMLInputElement)?.value ?? '';
      updateLine(lineId, 'retail', parseNumericInput(raw));
      setEditingNumericCell(null);
      setTimeout(() => {
        const el = wholesaleInputRefs.current[lineId];
        if (el) {
          el.focus();
          el.select?.();
        }
      }, 30);
    },
    [updateLine]
  );

  // Wholesale + Enter → THE commit point: validate (Item Code, Name, Qty, P.Rate, Retail, Wholesale), then commit and move to next row
  const handleWholesaleKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const rawWholesale = (e.target as HTMLInputElement)?.value ?? '';
      const wholesaleVal = parseNumericInput(rawWholesale);

      setLines((current) => {
        const currentIndex = current.findIndex((l) => l.id === lineId);
        const line = current[currentIndex];
        if (!line) return current;

        // Mandatory validation before commit
        if (!line.productCode || !line.name) {
          setTimeout(() => itemNameInputRefs.current[lineId]?.focus(), 30);
          return current;
        }
        if (line.quantity <= 0) {
          setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 30);
          return current;
        }
        if (line.pRate <= 0) {
          setTimeout(() => priceInputRefs.current[lineId]?.focus(), 30);
          return current;
        }
        if (line.retail <= 0) {
          setTimeout(() => retailInputRefs.current[lineId]?.focus(), 30);
          return current;
        }
        const effectiveWholesale = wholesaleVal > 0 ? wholesaleVal : line.wholesale;
        if (effectiveWholesale <= 0) {
          setTimeout(() => wholesaleInputRefs.current[lineId]?.focus(), 30);
          return current;
        }

        // Valid -> commit row (edits accepted permanently)
        rowCommittedRef.current = true;
        rowSnapshotRef.current = null;

        const updatedLines = current.map((l) =>
          l.id === lineId ? { ...l, wholesale: effectiveWholesale, isCommitted: true } : l
        );

        // Move to next row's Item Name, or add new row
        if (currentIndex >= 0 && currentIndex < updatedLines.length - 1) {
          const nextLine = updatedLines[currentIndex + 1];
          enterRow(nextLine);
          setTimeout(() => itemNameInputRefs.current[nextLine.id]?.focus(), 30);
          return updatedLines;
        }

        const newLineId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const newLine: LineItem = { ...emptyLine(), id: newLineId };
        setTimeout(() => itemNameInputRefs.current[newLineId]?.focus(), 50);
        return [...updatedLines, newLine];
      });
    },
    [enterRow]
  );

  // Shortcut to commit current row from any field (Ctrl+Enter or Shift+Enter)
  const handleCommitShortcut = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if ((e.ctrlKey && e.key === 'Enter') || (e.shiftKey && e.key === 'Enter')) {
        e.preventDefault();
        setLines((current) => {
          const line = current.find((l) => l.id === lineId);
          if (!line) return current;
          if (!line.productCode || !line.name || line.quantity <= 0 || line.pRate <= 0) {
            return current;
          }
          rowCommittedRef.current = true;
          rowSnapshotRef.current = null;
          return current.map((l) => (l.id === lineId ? { ...l, isCommitted: true } : l));
        });
      }
    },
    []
  );

  // Arrow up/down navigation between rows
  const handleGridArrowNavigation = useCallback(
    (
      e: React.KeyboardEvent,
      lineId: string,
      fieldRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>
    ) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = lines.findIndex((l) => l.id === lineId);
        if (currentIndex === -1) return;

        let targetIndex: number;
        if (e.key === 'ArrowUp') {
          targetIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        } else {
          targetIndex = currentIndex < lines.length - 1 ? currentIndex + 1 : currentIndex;
        }

        if (targetIndex !== currentIndex) {
          const targetLine = lines[targetIndex];
          enterRow(targetLine);
          setActiveLineId(targetLine.id);
          const targetInput = fieldRefs.current[targetLine.id];
          if (targetInput) {
            targetInput.focus();
            targetInput.select();
          }
        }
      }
    },
    [lines, enterRow]
  );



  const handleUnitChange = useCallback(
    (lineId: string, unitId: string) => {
      // Find the unit info from current lines first
      const currentLine = lines.find((l) => l.id === lineId);
      const selectedUnit = currentLine?.availableUnits.find((u) => u.id === unitId);
      if (!currentLine || !selectedUnit) return;

      // Get the product's base purchase price for multi-unit calculation
      const product = products.find((p) => p._id === currentLine.productId);
      const basePurchasePrice = product?.purchasePrice ?? 0;
      const baseRetailPrice = product?.retailPrice ?? 0;
      const baseWholesalePrice = product?.wholesalePrice ?? 0;

      // For multi-units: P.Rate = base purchase rate * pcs inside
      // For normal units: P.Rate = product purchase price
      const isMultiUnit = selectedUnit.isMultiUnit && selectedUnit.conversion;
      const newPrice = parseFloat((isMultiUnit
        ? basePurchasePrice * (selectedUnit.conversion!)
        : (selectedUnit.price ?? basePurchasePrice)).toFixed(2));
      const newRetail = isMultiUnit && selectedUnit.retail ? selectedUnit.retail : baseRetailPrice;
      const newWholesale = isMultiUnit && selectedUnit.wholesale ? selectedUnit.wholesale : baseWholesalePrice;
      const newSpecialPrice1 = isMultiUnit && selectedUnit.specialPrice1 ? selectedUnit.specialPrice1 : 0;
      const newSpecialPrice2 = isMultiUnit && selectedUnit.specialPrice2 ? selectedUnit.specialPrice2 : 0;
      const newQuantity = 1;
      const newProfitPercent = newPrice > 0 && newRetail > 0 ? ((newRetail - newPrice) / newPrice) * 100 : 0;

      // Update line items
      setLines((prev) => {
        return prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = {
            ...line,
            unitId: selectedUnit.id,
            unitName: selectedUnit.name,
            multiUnitId: selectedUnit.isMultiUnit ? selectedUnit.multiUnitId : undefined,
            imei: selectedUnit.imei || '',
            pRate: newPrice,
            quantity: newQuantity,
            retail: newRetail,
            wholesale: newWholesale,
            specialPrice1: newSpecialPrice1,
            specialPrice2: newSpecialPrice2,
            profitPercent: parseFloat(newProfitPercent.toFixed(2)),
            discPercent: 0,
            discAmount: 0,
          };
          updated.gross = parseFloat((updated.quantity * updated.pRate).toFixed(2));
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        });
      });

      // Update product info separately (not inside setLines)
      setSelectedProductInfo((prev) => prev ? {
        ...prev,
        purchaseRate: basePurchasePrice,
        retailPrice: baseRetailPrice,
        wholesalePrice: baseWholesalePrice,
      } : null);
    },
    [vatType, lines, products, calcVatAndTotal]
  );

  // Handle Enter key on Unit field - focus on Qty
  const handleUnitKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const qtyInput = qtyInputRefs.current[lineId];
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }
  }, []);

  // Select all text when focusing on a text field (matches SalesB2C behavior)
  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>) => {
    e.target.select();
  };

  const handleSupplierSelect = useCallback((option: SupplierCashOption | null) => {
    if (!option) {
      setSupplierId(null);
      setSupplierName('');
      setSupplierAddress('');
      return;
    }
    if (option.type === 'cash') {
      setSupplierId(option._id);
      setSupplierName(option.name);
      setSupplierAddress('');
    } else {
      setSupplierId(option._id);
      setSupplierName(option.name);
      setSupplierAddress(option.address || '');
    }
  }, []);

  // Once suppliers list is reloaded after creating a new supplier, auto-select it and focus the field
  useEffect(() => {
    if (!pendingSupplierName || !Array.isArray(supplierCashOptions)) return;
    const match = supplierCashOptions.find((s) => (s.name || '').toLowerCase() === pendingSupplierName.toLowerCase());
    if (match) {
      handleSupplierSelect(match);
      setPendingSupplierName(null);
      setTimeout(() => supplierAcRef.current?.focus({ preventScroll: true }), 200);
    }
  }, [supplierCashOptions, pendingSupplierName, handleSupplierSelect]);

  // Once products list is reloaded after creating a new product, set it on the pending line and focus item name
  useEffect(() => {
    if (!pendingProductName || pendingProductLineId == null) return;
    const lineId = pendingProductLineId;
    const match = Array.isArray(products) && products.length > 0
      ? products.find((p) => (p.name || '').toLowerCase() === pendingProductName.toLowerCase())
      : null;
    if (match) {
      handleProductSelect(lineId, match);
      setPendingProductName(null);
      setPendingProductLineId(null);
      setTimeout(() => itemNameInputRefs.current[lineId]?.focus(), 200);
    } else if (Array.isArray(products) && products.length > 0) {
      // List loaded but new product not in it yet — still place the created name on the field
      updateLine(lineId, 'name', pendingProductName);
      setPendingProductName(null);
      setPendingProductLineId(null);
      setTimeout(() => itemNameInputRefs.current[lineId]?.focus(), 200);
    }
  }, [products, pendingProductName, pendingProductLineId, handleProductSelect, updateLine]);

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    if (['+', '-', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const removeLine = (id: string) => {
    if (rowSnapshotRef.current?.lineId === id) {
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.length === 0 ? [emptyLine()] : filtered;
    });
    setSelectedProductInfo(null);
    setActiveLineId(null);
  };

  // Handle row click — update Product Info for the clicked row
  const handleRowClick = useCallback(async (line: LineItem) => {
    enterRow(line);
    setActiveLineId(line.id);
    if (!line.productId) {
      setSelectedProductInfo(null);
      return;
    }
    const product = products.find((p) => p._id === line.productId);
    let actualStock = 0;
    try {
      if (companyId && line.productId) {
        const stockRes = await stockApi.getProductStock(companyId, line.productId);
        actualStock = stockRes.data.data?.stock ?? 0;
      }
    } catch {
      actualStock = (product as any)?.stock ?? (product as any)?.quantity ?? 0;
    }
    setSelectedProductInfo({
      stock: actualStock,
      lastVendor: (product as any)?.lastVendor ?? (product as any)?.lastSupplier ?? 'N/A',
      purchaseRate: product?.purchasePrice ?? line.pRate,
      retailPrice: product?.retailPrice ?? line.retail,
      wholesalePrice: product?.wholesalePrice ?? line.wholesale,
    });
  }, [companyId, products, enterRow]);

  // Update Product Info when scrolling through product dropdown
  const handleProductHighlight = useCallback(async (_e: React.SyntheticEvent, option: unknown) => {
    if (!option || typeof option === 'string') return;
    const product = option as Product;
    let actualStock = 0;
    try {
      if (companyId && product._id) {
        const stockRes = await stockApi.getProductStock(companyId, product._id);
        actualStock = stockRes.data.data?.stock ?? 0;
      }
    } catch {
      actualStock = (product as any).stock ?? (product as any).quantity ?? 0;
    }
    setSelectedProductInfo({
      stock: actualStock,
      lastVendor: (product as any).lastVendor ?? (product as any).lastSupplier ?? 'N/A',
      purchaseRate: product.purchasePrice ?? 0,
      retailPrice: product.retailPrice ?? 0,
      wholesalePrice: product.wholesalePrice ?? 0,
    });
  }, [companyId]);

  // Open extras dialog for a specific line
  const openExtrasDialog = (lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (line) {
      setExtrasLineId(lineId);
      setTempExpiryDate(formatExpiryDisplay(line.expiryDate || ''));
      setTempSpecialPrice1(line.specialPrice1 || 0);
      setTempSpecialPrice2(line.specialPrice2 || 0);
      setTempBatchNumber(line.batchNumber || '');
      setExtrasDialogOpen(true);
    }
  };

  // Save extras and close dialog
  const saveExtras = () => {
    if (extrasLineId) {
      const parsedExpiry = parseExpiryInputToIso(tempExpiryDate);
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== extrasLineId) return line;
          return {
            ...line,
            expiryDate: parsedExpiry,
            specialPrice1: tempSpecialPrice1,
            specialPrice2: tempSpecialPrice2,
          };
        })
      );
    }
    setExtrasDialogOpen(false);
    setExtrasLineId(null);
  };

  // ── Hold / Restore purchase ─────────────────────────────────────────
  const handleHoldPurchase = async () => {
    if (isSaved) {
      showErrorDialog('Cannot hold a saved purchase');
      return;
    }
    const filledLines = lines.filter((l) => l.productId);
    if (filledLines.length === 0) {
      showErrorDialog('Nothing to hold — add at least one product first');
      return;
    }
    const held: HeldPurchase = {
      id: Date.now().toString(),
      heldAt: new Date().toLocaleString(),
      supplierName: supplierName || 'No Supplier',
      itemCount: filledLines.length,
      total: calculations.grandTotal,
      invoiceNo,
      date,
      supplierInvNo,
      vatType,
      taxMode,
      paymentType,
      supplierId,
      supplierAddress,
      cashAccountId,
      lines,
      otherDiscPercent,
      otherDiscount,
      otherCharges,
      freightCharge,
      roundOff,
      autoRoundOff,
      narration,
    };
    const updated = [...heldPurchases, held];
    setHeldPurchases(updated);
    saveHeldPurchases(holdStorageKey, updated);
    showSuccessDialog(`${isOrderMode ? 'Purchase Order' : 'Purchase'} held (${filledLines.length} items)`);
    await handleNewEntry();
  };

  const handleRestoreHeldPurchase = (held: HeldPurchase) => {
    setInvoiceId(null);
    setVoucherId(null);
    setVoucherNo(null);
    setLedgerEntries([]);
    setIsSaved(false);
    setInvoiceNo(held.invoiceNo);
    setDate(held.date);
    setSupplierInvNo(held.supplierInvNo);
    setVatType(held.vatType);
    setTaxMode(held.taxMode || 'inclusive');
    setPaymentType(held.paymentType);
    setSupplierId(held.supplierId);
    setSupplierName(held.supplierName);
    setSupplierAddress(held.supplierAddress);
    setCashAccountId(held.cashAccountId);
    setLines(held.lines.length > 0 ? held.lines.map(l => ({ ...l, isCommitted: true })) : [emptyLine()]);
    setOtherDiscPercent(held.otherDiscPercent);
    setOtherDiscount(held.otherDiscount);
    setOtherCharges(held.otherCharges);
    setFreightCharge(held.freightCharge);
    setRoundOff(held.roundOff);
    setAutoRoundOff(held.autoRoundOff ?? false);
    setNarration(held.narration);
    setError(null);
    // Remove from held list
    const updated = heldPurchases.filter((h) => h.id !== held.id);
    setHeldPurchases(updated);
    saveHeldPurchases(holdStorageKey, updated);
    setHoldListDialogOpen(false);
  };

  const handleDeleteHeldPurchase = (heldId: string) => {
    const updated = heldPurchases.filter((h) => h.id !== heldId);
    setHeldPurchases(updated);
    saveHeldPurchases(holdStorageKey, updated);
  };

  const handleClear = async () => {
    setInvoiceId(null);
    setVoucherId(null);
    setVoucherNo(null);
    setLedgerEntries([]);
    setEditingNumericCell(null);
    setDate(getCurrentDate());
    setSupplierInvNo('');
    setVatType(isOpeningStockMode ? 'NonVat' : 'Vat');
    setTaxMode('inclusive');
    setSupplierId(null);
    setSupplierName('');
    setSupplierAddress('');
    setLines([emptyLine()]);
    setOtherDiscPercent(0);
    setOtherDiscount(0);
    setOtherCharges(0);
    setFreightCharge(0);
    setRoundOff(0);
    setAutoRoundOff(false);
    setNarration('');
    setIsSaved(false);
    setError(null);
    setSuccessMessage('');
    setSavedBatches([]);
    setCurrentNavIndex(-1);
    setActiveLineId(null);
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    // Fetch next invoice/entry number
    try {
      if (companyId) {
        if (isOpeningStockMode) {
          if (financialYearId) {
            const res = await openingStockApi.entries.getNextEntryNo(companyId, financialYearId);
            if (res.data.success) {
              setInvoiceNo(res.data.data.entryNo);
            }
          }
        } else {
          const res = await (isOrderMode ? purchaseOrderApi.getNextInvoiceNo(companyId) : purchaseApi.getNextInvoiceNo(companyId));
          if (res.data.success) {
            setInvoiceNo(res.data.data.invoiceNo);
          }
        }
      }
    } catch { /* keep current invoice number if fetch fails */ }
  };

  const handleNewEntry = async () => {
    await handleClear();
  };

  // Group items into batches (use first item's batch number or '' for backend to assign 00001, 00002, ...) based on product, purchase price, and expiry date
  // For products with allowBatches=false, merge all into a single batch per product
  const groupIntoBatches = (items: LineItem[]) => {
    const batchMap = new Map<string, {
      batchNumber: string;
      productId: string;
      productCode: string;
      productName: string;
      purchasePrice: number;
      expiryDate: string;
      totalQuantity: number;
      discAmount: number;
      items: LineItem[];
      retail: number;
      wholesale: number;
      specialPrice1: number;
      specialPrice2: number;
      vatAmount: number;
      gross: number;
      total: number;
      multiUnitId?: string;
    }>();

    items.forEach((item) => {
      // Check if product has allowBatches disabled or user didn't specify batch info
      const prod = products.find((p) => p._id === item.productId);
      const noBatches = prod?.allowBatches === false;
      const userBatch = item.batchNumber?.trim() || '';
      const userExpiry = item.expiryDate?.trim() || '';
      const hasBatchInfo = !noBatches && !!(userBatch || userExpiry);

      // If user provided a batch number or expiry date, create a separate batch; otherwise merge into single non-batch entry
      const batchKey = hasBatchInfo
        ? `${item.productId}-BATCH-${userBatch}-${userExpiry}-${item.pRate}`
        : `${item.productId}-NO-BATCH-${item.pRate}`;

      if (batchMap.has(batchKey)) {
        // Add to existing batch
        const existingBatch = batchMap.get(batchKey)!;
        existingBatch.totalQuantity += item.quantity;
        existingBatch.discAmount += item.discAmount;
        existingBatch.items.push(item);
        existingBatch.vatAmount += item.vatAmount;
        existingBatch.gross += item.gross;
        existingBatch.total += item.total;
        if (!hasBatchInfo) {
          const totalQty = existingBatch.items.reduce((s, i) => s + i.quantity, 0);
          const weightedSum = existingBatch.items.reduce((s, i) => s + i.pRate * i.quantity, 0);
          existingBatch.purchasePrice = totalQty > 0 ? weightedSum / totalQty : item.pRate;
        }
      } else {
        // Create new batch (if hasBatchInfo, use userBatch or '' for backend to generate if expiry entered)
        batchMap.set(batchKey, {
          batchNumber: hasBatchInfo ? userBatch : '',
          productId: item.productId,
          productCode: item.productCode,
          productName: item.name,
          purchasePrice: item.pRate,
          expiryDate: hasBatchInfo ? userExpiry : '',
          totalQuantity: item.quantity,
          discAmount: item.discAmount,
          items: [item],
          retail: item.retail,
          wholesale: item.wholesale,
          specialPrice1: item.specialPrice1,
          specialPrice2: item.specialPrice2,
          vatAmount: item.vatAmount,
          gross: item.gross,
          total: item.total,
          multiUnitId: item.multiUnitId,
        });
      }
    });

    return Array.from(batchMap.values());
  };

  const showErrorDialog = (msg: string) => {
    setErrorDialogMessage(msg);
    setErrorDialogOpen(true);
  };

  const showSuccessDialog = (msg: string) => {
    setSuccessDialogMessage(msg);
    setSuccessDialogOpen(true);
  };

  const handleSave = async () => {
    if (loading || savingRef.current) return;
    savingRef.current = true;
    try {

    // Clear previous errors
    setError(null);

    // If an uncommitted row was being edited, revert it back before saving
    let currentLines = lines;
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      currentLines = lines.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l));
      setLines(currentLines);
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
      setEditingNumericCell(null);
      setEditingExpiryCell(null);
    }

    if (!companyId || !financialYearId) {
      showErrorDialog('Please select a company and financial year');
      return;
    }

    if (!isOpeningStockMode && !supplierId) {
      showErrorDialog('Please select a Cash/Supplier Account before saving');
      return;
    }

    // Filter out rows without product (check both productCode and productId)
    const rowsWithItemCode = currentLines.filter((l) => l.productCode || l.productId);
    const rowsWithoutItemCode = currentLines.filter((l) => !l.productCode && !l.productId);

    // Validation: Don't save if more than one row lacks product code
    if (rowsWithoutItemCode.length > 1) {
      showErrorDialog('Enter data correctly. Multiple rows without product code found.');
      return;
    }

    if (rowsWithItemCode.length === 0) {
      showErrorDialog('At least one product with Item Code is required');
      return;
    }

    // Group items into batches
    const batches = groupIntoBatches(rowsWithItemCode);

    // Handle Opening Stock Mode Save
    if (isOpeningStockMode) {
      const payload = {
        companyId: companyId!,
        financialYearId: financialYearId!,
        date,
        vatType,
        taxMode,
        narration,
        batches: batches.map((b) => ({
          productId: b.productId,
          productCode: b.productCode,
          productName: b.productName,
          purchasePrice: b.purchasePrice,
          discAmount: b.discAmount,
          expiryDate: b.expiryDate || undefined,
          quantity: b.totalQuantity,
          retail: b.retail,
          wholesale: b.wholesale,
          specialPrice1: b.specialPrice1,
          specialPrice2: b.specialPrice2,
          batchNumber: b.batchNumber,
          multiUnitId: b.multiUnitId,
        })),
      };

      setLoading(true);
      try {
        let res;
        if (invoiceId) {
          res = await openingStockApi.entries.update(invoiceId, payload);
        } else {
          res = await openingStockApi.entries.create(payload);
        }

        if (res.data?.data?.entryNo) {
          setInvoiceNo(res.data.data.entryNo);
        }

        setSavedBatches(batches.map((b) => ({
          batchNumber: b.batchNumber,
          productName: b.productName,
          quantity: b.totalQuantity,
          purchasePrice: b.purchasePrice,
          expiryDate: b.expiryDate,
        })));

        const createdId = res.data?.data?.entryId || invoiceId;
        setInvoiceId(createdId);
        setSuccessMessage(
          invoiceId
            ? `${documentTitle} updated successfully! ${batches.length} batch(es) updated.`
            : `${documentTitle} saved successfully! ${batches.length} batch(es) created.`
        );
        setIsSaved(true);
        setSavedDialogOpen(true);

        loadInvoiceList(true);
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (err: any) {
        console.error(`Error saving ${documentTitle}:`, err);
        const msg = err.response?.data?.message || `Failed to save ${documentTitle}. Please try again.`;
        showErrorDialog(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Prepare purchase entry data with batches
    const purchaseEntryData = {
      invoiceNo,
      supplierInvoiceNo: supplierInvNo,
      date,
      supplierId,
      supplierName,
      vatType,
      narration,
      companyId,
      financialYearId,
      batches: batches.map((batch) => ({
        batchNumber: batch.batchNumber,
        productId: batch.productId,
        productCode: batch.productCode,
        productName: batch.productName,
        purchasePrice: batch.purchasePrice,
        expiryDate: batch.expiryDate,
        quantity: batch.totalQuantity,
        retail: batch.retail,
        wholesale: batch.wholesale,
        specialPrice1: batch.specialPrice1,
        specialPrice2: batch.specialPrice2,
        vatAmount: batch.vatAmount,
        gross: batch.gross,
        total: batch.total,
      })),
      summary: {
        totalGross: calculations.itemsGross,
        totalVat: calculations.totalVat,
        grandTotal: calculations.grandTotal,
      },
    };

    // Log for debugging
    console.log('Purchase Entry Data with Batches:', purchaseEntryData);

    const selectedOption = supplierCashOptions.find((s) => s._id === supplierId);
    const isSupplierSelected = selectedOption?.type === 'supplier';
    const apiData = {
      companyId: companyId!,
      financialYearId: financialYearId!,
      invoiceNo,
      supplierInvoiceNo: supplierInvNo,
      date,
      supplierId: supplierId || undefined,
      supplierName: supplierName || undefined,
      paymentType,
      ...(paymentType === 'Cash' && isSupplierSelected && cashAccountId ? { cashAccountId } : {}),
      vatType,
      taxMode,
      narration,
      itemsDiscount: calculations.itemsDiscount,
      otherDiscount,
      otherCharges,
      freightCharge,
      roundOff,
      batches: batches.map((b) => ({
        productId: b.productId,
        productCode: b.productCode,
        productName: b.productName,
        purchasePrice: b.purchasePrice,
        discAmount: b.discAmount,
        expiryDate: b.expiryDate || undefined,
        quantity: b.totalQuantity,
        retail: b.retail,
        wholesale: b.wholesale,
        specialPrice1: b.specialPrice1,
        specialPrice2: b.specialPrice2,
        batchNumber: b.batchNumber,
        multiUnitId: b.multiUnitId,
      })),
    };

    setLoading(true);
    try {
      let res;
      if (isOrderMode) {
        if (invoiceId) {
          res = await purchaseOrderApi.update(invoiceId, apiData);
        } else {
          res = await purchaseOrderApi.create(apiData);
        }
      } else {
        if (invoiceId) {
          res = await purchaseApi.update(invoiceId, apiData);
        } else {
          res = await purchaseApi.create(apiData);
        }
      }

      if (res.data?.data?.invoiceNo) {
        setInvoiceNo(res.data.data.invoiceNo);
      }

      // Store batch info for display
      setSavedBatches(batches.map((b) => ({
        batchNumber: b.batchNumber,
        productName: b.productName,
        quantity: b.totalQuantity,
        purchasePrice: b.purchasePrice,
        expiryDate: b.expiryDate,
      })));

      const createdId = (res.data.data as any)?.purchaseId || (res.data.data as any)?.purchaseOrderId;
      setInvoiceId(createdId);
      setSuccessMessage(
        invoiceId
          ? `${documentTitle} updated successfully! ${res.data.data.batchCount} batch(es) updated.`
          : `${documentTitle} saved successfully! ${res.data.data.batchCount} batch(es) created.`
      );
      setIsSaved(true);
      setSavedDialogOpen(true);

      // Refresh invoice list for navigation
      loadInvoiceList(true);
      // Reload this invoice so voucherId/voucherNo and ledger details are available
      if (createdId && !isOrderMode) {
        const invRes = await purchaseApi.getById(createdId);
        if (invRes.data.success && invRes.data.data) {
          const inv = invRes.data.data;
          setVoucherId(inv.voucherId ?? null);
          setVoucherNo(inv.voucherNo ?? null);
          if (inv.voucherId) setLedgerEntries([]);
        }
      }

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error(`Error saving ${documentTitle}:`, err);
      const msg = err.response?.data?.message || `Failed to save ${documentTitle}. Please try again.`;
      showErrorDialog(msg);
    } finally {
      setLoading(false);
    }
    } finally {
      savingRef.current = false;
    }
  };

  const handleSearchInvoice = async () => {
    if (!searchInvoiceNo.trim() || !companyId) return;
    try {
      if (isOpeningStockMode) {
        const query = searchInvoiceNo.trim().toLowerCase();
        const found = invoiceList.find((i: any) => ((i as any).entryNo || (i as any).invoiceNo || '').toLowerCase() === query);
        if (found) {
          setSearchDialogOpen(false);
          await loadInvoiceIntoForm(found._id);
          setSearchInvoiceNo('');
        } else {
          showErrorDialog('Opening purchase entry not found');
          setSearchDialogOpen(false);
        }
        return;
      }
      const res = await (isOrderMode ? purchaseOrderApi.search(companyId, searchInvoiceNo.trim()) : purchaseApi.search(companyId, searchInvoiceNo.trim()));
      if (res.data.success) {
        setSearchDialogOpen(false);
        await loadInvoiceIntoForm(res.data.data._id);
        setSearchInvoiceNo('');
      }
    } catch (err: any) {
      showErrorDialog(err.response?.data?.message || (isOrderMode ? 'Purchase Order not found' : 'Invoice not found'));
      setSearchDialogOpen(false);
    }
  };

  const handlePostToPurchase = useCallback(() => {
    const validLines = lines.filter((l) => l.productId && l.productCode);
    if (validLines.length === 0) return;
    navigate('/entry/purchase', {
      state: {
        fromPurchaseOrder: true,
        supplierId: supplierId || null,
        supplierName: supplierName || '',
        date,
        supplierInvoiceNo: supplierInvNo || invoiceNo,
        vatType,
        taxMode,
        paymentType,
        cashAccountId: cashAccountId || null,
        otherDiscount,
        otherCharges,
        freightCharge,
        roundOff,
        narration: narration || '',
        lines: validLines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productCode: l.productCode,
          imei: l.imei || '',
          name: l.name,
          unitId: l.unitId,
          unitName: l.unitName,
          multiUnitId: l.multiUnitId,
          availableUnits: (l.availableUnits || []).map((u) => ({ id: u.id, name: u.name, isMultiUnit: u.isMultiUnit, multiUnitId: u.multiUnitId })),
          quantity: l.quantity,
          pRate: l.pRate,
          gross: l.gross,
          discPercent: l.discPercent,
          discAmount: l.discAmount,
          vatAmount: l.vatAmount,
          profitPercent: l.profitPercent ?? 0,
          mrp: l.mrp,
          retail: l.retail,
          wholesale: l.wholesale,
          branch: l.branch || 'MAIN BRANCH',
          total: l.total,
          expiryDate: l.expiryDate || '',
          specialPrice1: l.specialPrice1,
          specialPrice2: l.specialPrice2,
          batchNumber: l.batchNumber || '',
        })),
        purchaseOrderInvoiceNo: invoiceNo,
      },
    });
  }, [lines, supplierId, supplierName, date, supplierInvNo, invoiceNo, vatType, taxMode, paymentType, cashAccountId, otherDiscount, otherCharges, freightCharge, roundOff, narration, navigate]);

  const handleDelete = async () => {
    if (!invoiceId || !companyId) return;
    try {
      if (isOpeningStockMode) {
        await openingStockApi.entries.delete(invoiceId, companyId);
      } else if (isOrderMode) {
        await purchaseOrderApi.delete(invoiceId, companyId);
      }
      setDeleteDialogOpen(false);
      handleNewEntry();
      showSuccessDialog(`${documentTitle} deleted successfully!`);
    } catch (err: any) {
      showErrorDialog(err.response?.data?.message || `Failed to delete ${documentTitle}`);
      setDeleteDialogOpen(false);
    }
  };

  if (!companyId || !financialYearId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select a company and financial year to continue.</Alert>
      </Box>
    );
  }

  // Number input style to hide spinners
  const numberInputStyle = {
    '& input[type=number]': {
      MozAppearance: 'textfield',
    },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
      WebkitAppearance: 'none',
      margin: 0,
    },
  };

  return (
    <Box onClick={handlePageClick} sx={{ p: 0.5, bgcolor: '#ffffff', minHeight: '100vh', height: '100%', width: '100%', maxWidth: '100%', mx: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', '& .MuiInputLabel-root': { fontWeight: 600, color: '#1e293b' }, ...numberInputStyle }}>

      <Typography component="h1" variant="h6" sx={{ fontWeight: 700, color: THEME.accent || (isOpeningStockMode ? '#2563eb' : (isOrderMode ? '#b45309' : '#0f766e')), mb: 0.5, fontSize: '1rem' }}>
        {documentTitle}
      </Typography>

      {/* Header Card - Compact Sales window style header */}
      <Paper elevation={0} sx={{ px: 1, py: 0.8, mb: 0.5, borderRadius: 1.2, bgcolor: 'white', border: '1px solid #cbd5e1' }}>
        <Grid container spacing={0.75} alignItems="center">
          {/* Entry No - badge style */}
          <Grid item xs={6} sm={2.5} md={1.4} lg={1.1}>
            <Box sx={{ bgcolor: isOpeningStockMode ? '#2563eb' : (isOrderMode ? '#b45309' : '#0f766e'), borderRadius: 1.2, px: 1, py: 0.2, height: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.55rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>{entryNoLabel}</Typography>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.8rem', lineHeight: 1.1 }}>{invoiceNo}</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={2.5} md={1.6} lg={1.4}>
            <DateInput label="Date" value={date} onChange={setDate} size="small" />
          </Grid>
          {!isOpeningStockMode && (
            <>
              <Grid item xs={6} sm={3} md={1.8} lg={1.5}>
                <TextField
                  label="Supplier Inv No"
                  size="small"
                  value={supplierInvNo}
                  onChange={(e) => setSupplierInvNo(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                    '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' },
                    '& .MuiInputLabel-root': { fontSize: '0.70rem' },
                  }}
                />
              </Grid>
              <Grid item xs={6} sm={4} md={2.8} lg={2.4}>
                <Autocomplete<SupplierCashOption>
                  size="small"
                  options={supplierCashOptions}
                  getOptionLabel={(opt) => opt.name || ''}
                  filterOptions={(options, state) => {
                    const q = (state.inputValue || '').trim().toLowerCase();
                    const name = (o: SupplierCashOption) => (o.name || '').toLowerCase();
                    const sortByName = (arr: SupplierCashOption[]) => arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
                    if (!q) return options;
                    const startsWith = options.filter((o) => name(o).startsWith(q));
                    const containsOnly = options.filter((o) => name(o).includes(q) && !name(o).startsWith(q));
                    return [...sortByName(startsWith), ...sortByName(containsOnly)];
                  }}
                  value={supplierCashOptions.find((s) => s.name === supplierName) || null}
                  onChange={(_, v) => handleSupplierSelect(v)}
                  onOpen={() => setSupplierAcListboxOpen(true)}
                  onClose={() => setSupplierAcListboxOpen(false)}
                  autoHighlight
                  isOptionEqualToValue={(opt, val) => opt._id === val._id}
                  slotProps={{
                    paper: {
                      sx: { minWidth: '150%', width: '150%', maxWidth: '90vw' },
                    },
                  }}
                  ListboxProps={{
                    sx: {
                      '& .MuiAutocomplete-option': {
                        '&[data-focus="true"]': { bgcolor: '#4fc3c5 !important', color: '#ffffff !important' },
                        '&[aria-selected="true"]': { bgcolor: '#4fc3c5 !important', color: '#ffffff !important' },
                        '&:hover': { bgcolor: 'rgba(79, 195, 197, 0.25)' },
                      },
                    },
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Cash / Supplier A/C"
                      InputLabelProps={{ shrink: true }}
                      inputRef={supplierAcRef}
                      onFocus={() => {
                        loadSuppliers();
                        loadCashAccounts();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const typed = (e.target as HTMLInputElement).value.trim();
                          if (!typed) {
                            e.preventDefault();
                            setTimeout(() => supplierNameRef.current?.focus(), 50);
                            return;
                          }
                          const exists = supplierCashOptions.find((s) => (s.name || '').toLowerCase() === typed.toLowerCase());
                          if (exists) {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSupplierSelect(exists);
                            setTimeout(() => supplierNameRef.current?.focus(), 50);
                            return;
                          }
                          if (supplierAcListboxOpen) {
                            const isPrefixOfSome = supplierCashOptions.some((s) => (s.name || '').toLowerCase().startsWith(typed.toLowerCase()));
                            if (isPrefixOfSome) return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          setCreateSupplierConfirmName(typed);
                          setCreateSupplierConfirmOpen(true);
                        }
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                        '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' },
                        '& .MuiInputLabel-root': { fontSize: '0.70rem' },
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6} sm={4} md={2.8} lg={2.4}>
                <TextField
                  size="small"
                  label="Supplier Name"
                  fullWidth
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  onFocus={handleTextFieldFocus}
                  inputRef={supplierNameRef}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const firstLine = lines[0];
                      if (firstLine) setTimeout(() => imeiInputRefs.current[firstLine.id]?.focus(), 50);
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ readOnly: !!supplierId }}
                  sx={{
                    '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                    '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' },
                    '& .MuiInputLabel-root': { fontSize: '0.70rem' },
                    ...(supplierId ? { '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1.2, height: 28, minHeight: 28 } } : {}),
                  }}
                />
              </Grid>
            </>
          )}
          {/* Tax Mode */}
          <Grid item xs={6} sm={2} md={1.6} lg={1.3}>
            <TextField
              size="small"
              select
              label="Tax"
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              InputLabelProps={{ shrink: true }}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                '& .MuiSelect-select': { fontSize: '0.72rem', py: '2px !important' },
                '& .MuiInputLabel-root': { fontSize: '0.70rem' },
              }}
            >
              <MenuItem value="inclusive" sx={{ fontSize: '0.72rem' }}>Include Tax</MenuItem>
              <MenuItem value="exclusive" sx={{ fontSize: '0.72rem' }}>Exclude Tax</MenuItem>
            </TextField>
          </Grid>
          {/* Hold & Held */}
          <Grid item xs="auto">
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title={`Hold this ${isOpeningStockMode ? 'entry' : (isOrderMode ? 'purchase order' : 'purchase')} for later`}>
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleHoldPurchase}
                    disabled={isSaved}
                    sx={{ height: 26, minWidth: 0, px: 1, fontSize: '0.72rem', textTransform: 'none', borderRadius: 1.2, bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, boxShadow: 'none', '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
                    startIcon={<HoldIcon sx={{ fontSize: 14 }} />}
                  >
                    Hold
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={heldPurchases.length > 0 ? `${heldPurchases.length} held entry(s)` : 'No held entries'}>
                <Badge badgeContent={heldPurchases.length} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 14, minWidth: 14 } }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setHoldListDialogOpen(true)}
                    sx={{ height: 26, minWidth: 26, px: 0.5, borderRadius: 1.2, borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}
                  >
                    <HoldListIcon sx={{ fontSize: 15 }} />
                  </Button>
                </Badge>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 0.6 }} />

        {/* Row 2: VAT Type + Payment Type + Navigation + Product Info */}
        <Grid container spacing={0.75} alignItems="center">
          {/* VAT Type */}
          <Grid item xs={6} sm={2.5} md={1.8} lg={1.5}>
            <Box sx={{
              border: '1px solid #cbd5e1',
              borderRadius: 1.2,
              px: 0.8,
              py: 0.25,
              bgcolor: 'white',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: 28,
            }}>
              <Box role="radiogroup" aria-label="VAT Type" sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 1, p: '1px', gap: '2px' }}>
                <Box
                  role="radio"
                  aria-checked={vatType === 'Vat'}
                  tabIndex={0}
                  onClick={() => setVatType('Vat')}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.2,
                    borderRadius: 0.8,
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: vatType === 'Vat' ? 700 : 600,
                    color: vatType === 'Vat' ? '#ffffff' : '#64748b',
                    bgcolor: vatType === 'Vat' ? (isOpeningStockMode ? '#2563eb' : '#0f766e') : 'transparent',
                    boxShadow: vatType === 'Vat' ? '0 1px 2px rgba(15,118,110,0.3)' : 'none',
                    userSelect: 'none',
                  }}
                >
                  VAT
                </Box>
                <Box
                  role="radio"
                  aria-checked={vatType === 'NonVat'}
                  tabIndex={0}
                  onClick={() => setVatType('NonVat')}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.2,
                    borderRadius: 0.8,
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: vatType === 'NonVat' ? 700 : 600,
                    color: vatType === 'NonVat' ? '#ffffff' : '#64748b',
                    bgcolor: vatType === 'NonVat' ? '#475569' : 'transparent',
                    boxShadow: vatType === 'NonVat' ? '0 1px 2px rgba(71,85,105,0.3)' : 'none',
                    userSelect: 'none',
                  }}
                >
                  Non-VAT
                </Box>
              </Box>
            </Box>
          </Grid>

          {/* Payment Type (hidden in opening stock mode) */}
          {!isOpeningStockMode && (
            <Grid item xs={6} sm={2.5} md={1.8} lg={1.5}>
              <Box sx={{
                border: '1px solid #cbd5e1',
                borderRadius: 1.2,
                px: 0.8,
                py: 0.25,
                bgcolor: 'white',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                height: 28,
              }}>
                <Box role="radiogroup" aria-label="Payment Type" sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 1, p: '1px', gap: '2px' }}>
                  <Box
                    role="radio"
                    aria-checked={paymentType === 'Cash'}
                    tabIndex={0}
                    onClick={() => setPaymentType('Cash')}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      py: 0.2,
                      borderRadius: 0.8,
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontWeight: paymentType === 'Cash' ? 700 : 600,
                      color: paymentType === 'Cash' ? '#ffffff' : '#64748b',
                      bgcolor: paymentType === 'Cash' ? '#16a34a' : 'transparent',
                      boxShadow: paymentType === 'Cash' ? '0 1px 2px rgba(22,163,74,0.3)' : 'none',
                      userSelect: 'none',
                    }}
                  >
                    Cash
                  </Box>
                  <Box
                    role="radio"
                    aria-checked={paymentType === 'Credit'}
                    tabIndex={0}
                    onClick={() => setPaymentType('Credit')}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      py: 0.2,
                      borderRadius: 0.8,
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontWeight: paymentType === 'Credit' ? 700 : 600,
                      color: paymentType === 'Credit' ? '#ffffff' : '#64748b',
                      bgcolor: paymentType === 'Credit' ? '#0284c7' : 'transparent',
                      boxShadow: paymentType === 'Credit' ? '0 1px 2px rgba(2,132,199,0.3)' : 'none',
                      userSelect: 'none',
                    }}
                  >
                    Credit
                  </Box>
                </Box>
              </Box>
            </Grid>
          )}

          {/* Navigation - B2C style buttons */}
          <Grid item xs="auto">
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              {[
                { icon: <FirstIcon sx={{ fontSize: 15 }} />, handler: navFirst, tip: 'First', disabled: invoiceList.length === 0 },
                { icon: <PrevIcon sx={{ fontSize: 15 }} />, handler: navPrev, tip: 'Previous', disabled: invoiceList.length === 0 || currentNavIndex === 0 },
                { icon: <NextIcon sx={{ fontSize: 15 }} />, handler: navNext, tip: 'Next', disabled: invoiceList.length === 0 || currentNavIndex >= invoiceList.length - 1 },
                { icon: <LastIcon sx={{ fontSize: 15 }} />, handler: navLast, tip: 'Last', disabled: invoiceList.length === 0 },
              ].map((nav, i) => (
                <Tooltip key={i} title={`${nav.tip} Invoice`}>
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={nav.handler}
                      disabled={nav.disabled}
                      sx={{ py: 0.2, minWidth: 26, height: 24, borderRadius: 1.2, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none', '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}
                    >
                      {nav.icon}
                    </Button>
                  </span>
                </Tooltip>
              ))}
              {invoiceList.length > 0 && (
                <Typography sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', ml: 0.3 }}>
                  {currentNavIndex >= 0 ? `${currentNavIndex + 1}/${invoiceList.length}` : `${invoiceList.length}`}
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Product Info - compact panel */}
          <Grid item xs={12} sm={12} md>
            <Box sx={{
              borderRadius: 1.2, px: 1, py: 0.2, minHeight: 28, display: 'flex', alignItems: 'center', gap: 1,
              background: selectedProductInfo ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)' : '#f8fafc',
              border: selectedProductInfo ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
              overflow: 'hidden',
            }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#0f766e', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>INFO</Typography>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                    <Typography variant="caption" sx={{ color: '#dc2626', fontSize: '0.62rem', fontWeight: 600 }}>Stock:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#dc2626', fontSize: '0.72rem' }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.stock / activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.stock}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>P.Rate:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.72rem' }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.purchaseRate * activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  {!activeMultiUnitInfo && (
                    <>
                      <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>Retail:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.72rem' }}>{selectedProductInfo.retailPrice.toFixed(2)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>WSale:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.72rem' }}>{selectedProductInfo.wholesalePrice.toFixed(2)}</Typography>
                      </Box>
                    </>
                  )}
                  <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>Vendor:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.72rem' }}>{selectedProductInfo.lastVendor}</Typography>
                  </Box>
                  {activeMultiUnitInfo && (
                    <>
                      {activeMultiUnitInfo.pcsInside != null && (
                        <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>Pcs:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.72rem' }}>{activeMultiUnitInfo.pcsInside}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.wholesale != null && activeMultiUnitInfo.wholesale > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>M.WS:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1565c0', fontSize: '0.72rem' }}>{activeMultiUnitInfo.wholesale.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.retail != null && activeMultiUnitInfo.retail > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'baseline' }}>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>M.Ret:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.72rem' }}>{activeMultiUnitInfo.retail.toFixed(2)}</Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.70rem', color: '#94a3b8', fontStyle: 'italic' }}>Select a product</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Purchase Items Card */}
      <Paper elevation={0} sx={{ mb: 0.5, bgcolor: 'white', borderRadius: 1.2, border: '1px solid #cbd5e1', overflow: 'hidden' }}>
        <TableContainer
          sx={{ minHeight: 410, maxHeight: 'calc(100vh - 270px)', width: '100%', bgcolor: '#fafbfc' }}
          onBlurCapture={(e) => {
            const container = e.currentTarget;
            setTimeout(() => {
              const active = document.activeElement;
              if (!active) return;
              const inPopper = active.closest('.MuiAutocomplete-popper, .MuiAutocomplete-listbox, .MuiPopper-root, .MuiDialog-root');
              if (inPopper) return;
              if (!container.contains(active)) {
                revertUncommittedRow();
              }
            }, 100);
          }}
        >
          <Table stickyHeader size="small" sx={{
            minWidth: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
            '& .MuiTableCell-root': { fontSize: '0.82rem', py: '2px', px: '3px', fontWeight: 600, borderBottom: '1px solid #cbd5e1' },
            '& .MuiInputBase-input': { fontSize: '0.82rem' },
            '& .MuiAutocomplete-input': { fontSize: '0.82rem' },
            '& .MuiSelect-select': { fontSize: '0.82rem' },
          }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '2.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Sl</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '9%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Int Barcode</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '18%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Item Name</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '7.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Batch No</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '7.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Expiry</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '5.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Unit</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Qty</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '6%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>P Rate</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '5.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Gross</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '4.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>DISC%</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '4.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Disc</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '4.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>VAT</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '6%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Total</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '4.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Profit %</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>Retail</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>WholeSale</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>BRANCH</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '2.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>+</TableCell>
                <TableCell sx={{ background: THEME.headerBg, color: isOrderMode ? '#1e293b' : 'white', fontWeight: 700, width: '2.5%', py: '4px', px: '3px', textAlign: 'center', fontSize: '0.80rem' }}>×</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow
                  key={line.id}
                  sx={{
                    bgcolor: activeLineId === line.id ? '#e0f2fe' : (idx % 2 === 0 ? '#f8fafc' : 'white'),
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#e0f2fe' },
                    transition: 'background-color 0.1s',
                  }}
                  onClick={() => handleRowClick(line)}
                  onFocusCapture={() => { enterRow(line); setActiveLineId(line.id); }}
                  onKeyDownCapture={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      revertUncommittedRow();
                    } else if ((e.ctrlKey || e.shiftKey) && e.key === 'Enter') {
                      handleCommitShortcut(e, line.id);
                    }
                  }}
                >
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '0.82rem', lineHeight: '24px' }}>{idx + 1}</TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      value={line.imei}
                      onChange={(e) => {
                        updateLine(line.id, 'imei', e.target.value);
                        if (processedImeiRef.current[line.id] && processedImeiRef.current[line.id] !== e.target.value.trim()) {
                          delete processedImeiRef.current[line.id];
                        }
                      }}
                      onBlur={() => handleImeiBlur(line.id, line.imei)}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, imeiInputRefs); handleImeiKeyDown(e, line.id, line.imei); }}
                      fullWidth
                      inputRef={(el) => { imeiInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '3px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }} onClick={(e) => e.stopPropagation()}>
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={products}
                      filterOptions={productFilterOptions}
                      isOptionEqualToValue={(opt, val) => opt._id === val._id}
                      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name || '')}
                      value={products.find((p) => p._id === line.productId) || null}
                      inputValue={line.name}
                      onInputChange={(_, v) => {
                        updateLine(line.id, 'name', v);
                        if (!(v && v.trim())) {
                          updateLine(line.id, 'productId', '');
                          updateLine(line.id, 'productCode', '');
                          updateLine(line.id, 'imei', '');
                        }
                      }}
                      onChange={(_, v) => {
                        if (v && typeof v !== 'string') {
                          handleProductSelect(line.id, v);
                        }
                      }}
                      onOpen={() => { itemNameListboxOpenRef.current = true; }}
                      onClose={() => { itemNameListboxOpenRef.current = false; }}
                      onHighlightChange={handleProductHighlight}
                      autoHighlight
                      renderInput={(params) => <TextField {...params} size="small" variant="outlined" inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }} onFocus={() => handleItemNameFocus(line)} onBlur={() => handleItemNameBlur(line)} onKeyDownCapture={(e) => { if (e.key === 'Enter') handleItemNameKeyDown(e, line); }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '4px', fontSize: '0.82rem' } }} />}
                      renderOption={(props, opt) => (
                        <li {...props} key={opt._id} style={{
                          fontSize: '0.84rem',
                          fontWeight: 500,
                          padding: '4px 8px',
                          cursor: 'pointer'
                        }}>
                          {opt.name}
                        </li>
                      )}
                      ListboxProps={{
                        sx: {
                          p: 0,
                          maxHeight: 260,
                          overflowX: 'hidden',
                          overflowY: 'auto',
                          '&::-webkit-scrollbar': { display: 'none' },
                          msOverflowStyle: 'none',
                          scrollbarWidth: 'none',
                          '& .MuiAutocomplete-option': {
                            minHeight: 'auto',
                            py: 0.4,
                            px: 1.2,
                            fontSize: '0.84rem',
                            bgcolor: 'transparent',
                            '&:hover': { bgcolor: 'rgba(79, 195, 197, 0.25) !important', color: '#1e293b' },
                            '&[data-focus="true"]': { bgcolor: '#4fc3c5 !important', color: '#ffffff !important' },
                            '&[aria-selected="true"]': { bgcolor: '#4fc3c5 !important', color: '#ffffff !important' },
                            '&.Mui-focused': { bgcolor: '#4fc3c5 !important', color: '#ffffff !important' }
                          }
                        }
                      }}
                      componentsProps={{
                        popper: {
                          placement: 'bottom-start',
                          modifiers: [{ name: 'flip', enabled: false }, { name: 'preventOverflow', enabled: false }]
                        },
                        paper: {
                          sx: { width: '400px', minWidth: '400px', boxShadow: '0 4px 15px rgba(79,195,197,0.3)', borderRadius: '8px', border: '2px solid #4fc3c5', bgcolor: '#ffffff', overflow: 'hidden', mt: 0.5 }
                        }
                      }}
                      sx={{ width: '100%' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      placeholder="Batch No"
                      value={line.batchNumber || ''}
                      onChange={(e) => updateLine(line.id, 'batchNumber', e.target.value)}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, batchInputRefs); handleBatchKeyDown(e, line.id); }}
                      fullWidth
                      inputRef={(el) => { batchInputRefs.current[line.id] = el; }}
                      sx={{
                        '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } },
                        '& .MuiOutlinedInput-input': { py: '2px !important', px: '3px', fontSize: '0.82rem' },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="text"
                      placeholder="MM/YY"
                      value={editingExpiryCell?.lineId === line.id ? editingExpiryCell.value : formatExpiryDisplay(line.expiryDate || '')}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingExpiryCell({ lineId: line.id, value: formatExpiryDisplay(line.expiryDate || '') }); }}
                      onChange={(e) => setEditingExpiryCell((prev) => prev && prev.lineId === line.id ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        if (revertingLineIdRef.current === line.id) return;
                        const raw = editingExpiryCell?.lineId === line.id ? editingExpiryCell.value : '';
                        if (raw !== '') {
                          const iso = parseExpiryInputToIso(raw);
                          updateLine(line.id, 'expiryDate', iso);
                        }
                        setEditingExpiryCell((prev) => prev && prev.lineId === line.id ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleGridArrowNavigation(e, line.id, expiryInputRefs);
                        if (e.key === 'Enter') {
                          const raw = editingExpiryCell?.lineId === line.id ? editingExpiryCell.value : '';
                          if (raw !== '') {
                            const iso = parseExpiryInputToIso(raw);
                            updateLine(line.id, 'expiryDate', iso);
                          }
                          setEditingExpiryCell(null);
                          handleExpiryKeyDown(e, line.id);
                        }
                      }}
                      fullWidth
                      inputRef={(el) => { expiryInputRefs.current[line.id] = el; }}
                      sx={{
                        '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } },
                        '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem', textAlign: 'center' },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      select
                      variant="outlined"
                      value={line.unitId}
                      onChange={(e) => handleUnitChange(line.id, e.target.value)}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, unitInputRefs); handleUnitKeyDown(e, line.id); }}
                      fullWidth
                      disabled={line.availableUnits.length === 0}
                      inputRef={(el) => { unitInputRefs.current[line.id] = el; }}
                      sx={{
                        '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } },
                        '& .MuiSelect-select': { py: '2px !important', px: '3px', fontSize: '0.82rem' },
                      }}
                    >
                      {line.availableUnits.length === 0 ? (
                        <MenuItem value="" sx={{ fontSize: '0.82rem' }}>-</MenuItem>
                      ) : (
                        line.availableUnits.map((u) => (
                          <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.82rem' }}>{u.name}</MenuItem>
                        ))
                      )}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'quantity', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, qtyInputRefs); handleNumberKeyDown(e); handleQtyKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'center', fontSize: '0.82rem' } }}
                      fullWidth
                      inputRef={(el) => { qtyInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : (line.pRate === 0 ? '' : String(line.pRate))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'pRate', value: line.pRate === 0 ? '' : String(line.pRate) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'pRate', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, priceInputRefs); handleNumberKeyDown(e); handlePriceKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' } }}
                      fullWidth
                      inputRef={(el) => { priceInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1', fontWeight: 600, color: '#475569', fontSize: '0.82rem', lineHeight: '24px' }}>{line.gross.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'discPercent', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, discPercentInputRefs); handleNumberKeyDown(e); handleDiscPercentKeyDown(e, line.id); }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center', fontSize: '0.82rem' } }}
                      fullWidth
                      inputRef={(el) => { discPercentInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'discAmount', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, discAmountInputRefs); handleNumberKeyDown(e); handleDiscAmountKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' } }}
                      fullWidth
                      inputRef={(el) => { discAmountInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1', fontWeight: 600, color: '#475569', fontSize: '0.82rem', lineHeight: '24px' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1', fontWeight: 700, color: THEME.primary, fontSize: '0.82rem', lineHeight: '24px' }}>{line.total.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'profitPercent' ? editingNumericCell.value : (line.profitPercent === 0 ? '' : String(line.profitPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'profitPercent', value: line.profitPercent === 0 ? '' : String(line.profitPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'profitPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'profitPercent';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'profitPercent', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'profitPercent' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, profitPercentInputRefs); handleNumberKeyDown(e); handleProfitPercentKeyDown(e, line.id); }}
                      inputProps={{ style: { textAlign: 'center', fontSize: '0.82rem', color: line.profitPercent >= 0 ? '#059669' : '#dc2626', fontWeight: 600 } }}
                      fullWidth
                      inputRef={(el) => { profitPercentInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f8fafc', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'retail' ? editingNumericCell.value : (line.retail === 0 ? '' : String(line.retail))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'retail', value: line.retail === 0 ? '' : String(line.retail) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'retail' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'retail';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'retail', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'retail' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, retailInputRefs); handleNumberKeyDown(e); handleRetailKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' } }}
                      fullWidth
                      inputRef={(el) => { retailInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'wholesale' ? editingNumericCell.value : (line.wholesale === 0 ? '' : String(line.wholesale))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'wholesale', value: line.wholesale === 0 ? '' : String(line.wholesale) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'wholesale' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={(e) => {
                        if (revertingLineIdRef.current === line.id) return;
                        const isEditingThis = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'wholesale';
                        const raw = isEditingThis ? editingNumericCell.value : (e.target as HTMLInputElement).value;
                        if (isEditingThis || raw !== '') {
                          updateLine(line.id, 'wholesale', parseNumericInput(raw));
                        }
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'wholesale' ? null : prev);
                      }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, wholesaleInputRefs); handleNumberKeyDown(e); handleWholesaleKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' } }}
                      fullWidth
                      inputRef={(el) => { wholesaleInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '2px !important', px: '2px', fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      select
                      variant="outlined"
                      value={line.branch}
                      onChange={(e) => updateLine(line.id, 'branch', e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, height: 24, minHeight: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiSelect-select': { py: '2px !important', px: '3px', fontSize: '0.82rem' } }}
                    >
                      <MenuItem value="MAIN BRANCH" sx={{ fontSize: '0.82rem' }}>MAIN BRANCH</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      size="small"
                      onClick={() => openExtrasDialog(line.id)}
                      sx={{
                        p: 0.2,
                        height: 24,
                        width: 24,
                        bgcolor: line.expiryDate || line.specialPrice1 || line.specialPrice2 ? THEME.primary : '#f1f5f9',
                        color: line.expiryDate || line.specialPrice1 || line.specialPrice2 ? 'white' : '#64748b',
                        borderRadius: 1,
                        '&:hover': { bgcolor: THEME.primary, color: 'white' }
                      }}
                    >
                      <AddIcon sx={{ fontSize: '0.95rem' }} />
                    </IconButton>
                  </TableCell>
                  <TableCell sx={{ p: '2px 3px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => removeLine(line.id)} sx={{ p: 0.2, height: 24, width: 24, color: '#94a3b8', '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' } }}>
                      <DeleteIcon sx={{ fontSize: '0.95rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Summary Section */}
      <Grid container spacing={0.75}>
        {/* Left - Narration */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 1, height: '100%', bgcolor: 'white', borderRadius: 1.2, border: '1px solid #cbd5e1' }}>
            <Typography sx={{ fontWeight: 700, color: '#475569', mb: 0.4, fontSize: '0.70rem', textTransform: 'uppercase' }}>Narration</Typography>
            <TextField
              multiline
              rows={2}
              fullWidth
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Enter any notes or comments..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2 }, '& .MuiOutlinedInput-input': { fontSize: '0.72rem', py: 0.5 } }}
            />
          </Paper>
        </Grid>

        {/* Right - Totals */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 1, bgcolor: 'white', borderRadius: 1.2, border: '1px solid #cbd5e1' }}>
            <Typography sx={{ fontWeight: 700, color: '#475569', mb: 0.4, fontSize: '0.70rem', textTransform: 'uppercase' }}>Summary</Typography>
            <Grid container spacing={0.75} sx={{ alignItems: 'stretch' }}>
              {/* Left half: stacked adjustment fields (purchase and order only) */}
              {!isOpeningStockMode && (
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 500, color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>Other Disc %</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editingNumericCell?.field === 'otherDiscPercent' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscPercent === 0 ? '' : String(otherDiscPercent))}
                        onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscPercent', value: otherDiscPercent === 0 ? '' : String(otherDiscPercent) }); }}
                        onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? { ...prev, value: e.target.value } : prev)}
                        onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscPercent' ? editingNumericCell.value : ''; handleOtherDiscPercentChange(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? null : prev); }}
                        inputRef={otherDiscPercentRef}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => otherDiscountRef.current?.focus(), 50); } }}
                        sx={{ width: 110, '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24 }, '& .MuiOutlinedInput-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 500, color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>Other Disc</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editingNumericCell?.field === 'otherDiscount' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscount === 0 ? '' : String(otherDiscount))}
                        onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscount', value: otherDiscount === 0 ? '' : String(otherDiscount) }); }}
                        onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? { ...prev, value: e.target.value } : prev)}
                        onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscount' ? editingNumericCell.value : ''; setOtherDiscount(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? null : prev); }}
                        inputRef={otherDiscountRef}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => otherChargesRef.current?.focus(), 50); } }}
                        sx={{ width: 110, '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24 }, '& .MuiOutlinedInput-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 500, color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>Other Charges</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editingNumericCell?.field === 'otherCharges' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherCharges === 0 ? '' : String(otherCharges))}
                        onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherCharges', value: otherCharges === 0 ? '' : String(otherCharges) }); }}
                        onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? { ...prev, value: e.target.value } : prev)}
                        onBlur={() => { const raw = editingNumericCell?.field === 'otherCharges' ? editingNumericCell.value : ''; setOtherCharges(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? null : prev); }}
                        inputRef={otherChargesRef}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => freightRef.current?.focus(), 50); } }}
                        sx={{ width: 110, '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24 }, '& .MuiOutlinedInput-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 500, color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>Freight</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editingNumericCell?.field === 'freightCharge' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (freightCharge === 0 ? '' : String(freightCharge))}
                        onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'freightCharge', value: freightCharge === 0 ? '' : String(freightCharge) }); }}
                        onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? { ...prev, value: e.target.value } : prev)}
                        onBlur={() => { const raw = editingNumericCell?.field === 'freightCharge' ? editingNumericCell.value : ''; setFreightCharge(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? null : prev); }}
                        inputRef={freightRef}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => roundOffRef.current?.focus(), 50); } }}
                        sx={{ width: 110, '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24 }, '& .MuiOutlinedInput-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                        <Typography sx={{ fontWeight: 500, color: '#475569', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>Round Off</Typography>
                        <Tooltip title="Round Off Total (Auto Round)" arrow placement="top">
                          <Checkbox
                            size="small"
                            checked={autoRoundOff}
                            onChange={(e) => handleAutoRoundOffToggle(e.target.checked)}
                            sx={{
                              p: 0,
                              color: '#94a3b8',
                              '&.Mui-checked': { color: THEME.primary },
                              '& .MuiSvgIcon-root': { fontSize: '1rem' },
                            }}
                          />
                        </Tooltip>
                      </Box>
                      <TextField
                        size="small"
                        type="number"
                        value={editingNumericCell?.field === 'roundOff' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (roundOff === 0 ? '' : String(roundOff))}
                        onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'roundOff', value: roundOff === 0 ? '' : String(roundOff) }); }}
                        onChange={(e) => {
                          setAutoRoundOff(false);
                          setEditingNumericCell((prev) => prev?.field === 'roundOff' ? { ...prev, value: e.target.value } : prev);
                        }}
                        onBlur={() => { const raw = editingNumericCell?.field === 'roundOff' ? editingNumericCell.value : ''; setRoundOff(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'roundOff' ? null : prev); }}
                        inputRef={roundOffRef}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }}
                        sx={{ width: 110, '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24 }, '& .MuiOutlinedInput-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }}
                      />
                    </Box>
                  </Box>
                </Grid>
              )}
              {/* Totals */}
              <Grid item xs={isOpeningStockMode ? 12 : 6}>
                <Grid container spacing={0.5}>
                  <Grid item xs={isOpeningStockMode ? 3 : 6}>
                    <Typography sx={{ fontWeight: 500, color: '#475569', mb: 0.2, fontSize: '0.68rem' }}>Gross Total</Typography>
                    <TextField size="small" value={calculations.itemsGross.toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right', fontWeight: 600 } }} />
                  </Grid>
                  <Grid item xs={isOpeningStockMode ? 3 : 6}>
                    <Typography sx={{ fontWeight: 500, color: '#475569', mb: 0.2, fontSize: '0.68rem' }}>Total VAT</Typography>
                    <TextField size="small" value={calculations.totalVat.toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right', fontWeight: 600 } }} />
                  </Grid>
                  <Grid item xs={isOpeningStockMode ? 3 : 6}>
                    <Typography sx={{ fontWeight: 500, color: '#475569', mb: 0.2, fontSize: '0.68rem' }}>Before Tax</Typography>
                    <TextField size="small" value={(calculations.grandTotal - calculations.totalVat).toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }} />
                  </Grid>
                  <Grid item xs={isOpeningStockMode ? 3 : 6}>
                    <Typography sx={{ fontWeight: 500, color: '#475569', mb: 0.2, fontSize: '0.68rem' }}>Total Items</Typography>
                    <TextField size="small" value={calculations.totalItems} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1, height: 24, minHeight: 24, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { py: 0.2, px: 0.5, fontSize: '0.70rem', textAlign: 'right' } }} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography sx={{ fontWeight: 700, color: isOpeningStockMode ? '#2563eb' : (isOrderMode ? '#b45309' : '#0f766e'), mb: 0.2, fontSize: '0.72rem', textTransform: 'uppercase' }}>Grand Total</Typography>
                    <TextField
                      size="small"
                      value={calculations.grandTotal.toFixed(2)}
                      InputProps={{ readOnly: true }}
                      fullWidth
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 30, minHeight: 30, bgcolor: THEME.primary },
                        '& .MuiInputBase-input': { fontWeight: 800, fontSize: '1rem', color: 'white', py: 0.2, textAlign: 'right' }
                      }}
                    />
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Action Buttons & Navigation */}
      <Paper elevation={0} sx={{ p: 0.6, mt: 0.5, bgcolor: 'white', borderRadius: 1.2, border: '1px solid #cbd5e1', display: 'flex', gap: 0.8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" size="small" startIcon={<ClearIcon sx={{ fontSize: 15 }} />} onClick={handleClear} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#15803d' } }}>
          Clear
        </Button>
        <Button ref={saveButtonRef} variant="contained" size="small" startIcon={<SaveIcon sx={{ fontSize: 15 }} />} onClick={handleSave} disabled={!!invoiceId || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          {isSaved ? 'Saved ✓' : 'Save'}
        </Button>
        <Button variant="contained" size="small" startIcon={<EditIcon sx={{ fontSize: 15 }} />} onClick={() => setEditConfirmOpen(true)} disabled={!invoiceId || loading} sx={{ bgcolor: '#0f766e', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#115e59' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Edit
        </Button>
        <Button variant="contained" size="small" startIcon={<DeleteIcon sx={{ fontSize: 15 }} />} onClick={() => setDeleteDialogOpen(true)} disabled={!invoiceId || loading} sx={{ bgcolor: '#dc2626', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#b91c1c' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Delete
        </Button>
        <Button variant="contained" size="small" startIcon={<PrintIcon sx={{ fontSize: 15 }} />} disabled={!isSaved} sx={{ bgcolor: '#0284c7', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#0369a1' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Print
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<LocalPrintshopIcon sx={{ fontSize: 15 }} />}
          onClick={() => setBarcodeModalOpen(true)}
          disabled={!isSaved || !invoiceId || lines.filter((l) => (l.productId || l.name?.trim()) && Number(l.quantity) > 0).length === 0}
          sx={{
            bgcolor: '#7c3aed',
            color: '#fff',
            borderRadius: 1,
            textTransform: 'none',
            fontWeight: 600,
            px: 1.5,
            height: 28,
            fontSize: '0.75rem',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#6d28d9' },
            '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
          }}
        >
          Print Barcode
        </Button>
        <Button variant="contained" size="small" startIcon={<SearchIcon sx={{ fontSize: 15 }} />} onClick={() => setSearchDialogOpen(true)} sx={{ bgcolor: '#475569', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#334155' } }}>
          Search
        </Button>
        {isOrderMode && (
          <Button
            variant="contained"
            size="small"
            startIcon={<SendIcon sx={{ fontSize: 15 }} />}
            onClick={handlePostToPurchase}
            disabled={!invoiceId}
            sx={{
              bgcolor: '#16a34a',
              color: '#fff',
              borderRadius: 1,
              textTransform: 'none',
              fontWeight: 600,
              px: 1.5,
              height: 28,
              fontSize: '0.75rem',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#15803d' },
              '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
            }}
          >
            Post to Purchase
          </Button>
        )}
      </Paper>

      {/* Ledger details for current invoice (purchase only) */}
      {!isOrderMode && !isOpeningStockMode && invoiceId && (
        <Paper elevation={0} sx={{ p: 1.5, mt: 0.5, bgcolor: 'white', borderRadius: 1, border: '2px solid #000000' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1e293b', mb: 1 }}>Ledger details</Typography>
          {voucherNo ? (
            <>
              <Typography variant="body2" sx={{ color: '#475569', mb: 1 }}>Voucher: {voucherNo}</Typography>
              {ledgerEntriesLoading ? (
                <Typography variant="body2" color="text.secondary">Loading…</Typography>
              ) : ledgerEntries.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Account (Code)</TableCell>
                        <TableCell>Particulars</TableCell>
                        <TableCell align="right">Debit</TableCell>
                        <TableCell align="right">Credit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ledgerEntries.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.ledgerAccountCode} – {row.ledgerAccountName}</TableCell>
                          <TableCell sx={{ maxWidth: 240 }}>{row.narration || '–'}</TableCell>
                          <TableCell align="right">{row.debitAmount > 0 ? row.debitAmount.toFixed(2) : ''}</TableCell>
                          <TableCell align="right">{row.creditAmount > 0 ? row.creditAmount.toFixed(2) : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">No ledger entries found for this voucher.</Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">Not posted to ledger. Use Edit then Update to post this invoice to the ledger.</Typography>
          )}
        </Paper>
      )}

      {/* Dialogs with Modern Styling */}
      <Dialog open={savedDialogOpen} onClose={() => setSavedDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 400 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b' }}>
          {successMessage.includes('updated') ? 'Edited Successfully' : 'Saved Successfully'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>{successMessage}</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>{entryNoLabel}: {invoiceNo}</Typography>
          <Typography variant="body2" sx={{ color: '#1e293b', mt: 2, fontWeight: 600 }}>Batches Created: {savedBatches.length}</Typography>
          {savedBatches.length > 0 && (
            <Box sx={{ mt: 1, maxHeight: 200, overflowY: 'auto' }}>
              {savedBatches.map((batch, index) => (
                <Box key={batch.batchNumber} sx={{ p: 1, mb: 1, bgcolor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Batch {index + 1}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>{batch.productName}</Typography>
                  <Typography variant="caption" sx={{ color: '#475569' }}>
                    Qty: {batch.quantity} | Price: {batch.purchasePrice.toFixed(2)} | Expiry: {batch.expiryDate || 'N/A'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem' }}>{batch.batchNumber}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setSavedDialogOpen(false)} autoFocus sx={{ borderRadius: 2, textTransform: 'none' }}>OK</Button>
          <Button onClick={() => { setSavedDialogOpen(false); handleNewEntry(); }} variant="contained" sx={{ bgcolor: THEME.primary, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: THEME.primaryDark } }}>New Entry</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b' }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>Are you sure you want to delete this {documentTitle.toLowerCase()}?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" autoFocus sx={{ bgcolor: '#ef4444', borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: '#dc2626' } }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b' }}>Confirm Edit</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>Are you sure you want to update this {documentTitle.toLowerCase()}?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setEditConfirmOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button onClick={() => { setEditConfirmOpen(false); handleSave(); }} variant="contained" autoFocus sx={{ bgcolor: THEME.primary, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: THEME.primaryDark } }}>Update</Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 1 }}>
          Error
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setErrorDialogOpen(false)} variant="contained" autoFocus sx={{ bgcolor: '#dc2626', borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: '#b91c1c' } }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Create supplier confirm: account doesn't exist, do you want to create? (same as Sales B2C) */}
      <Dialog
        open={createSupplierConfirmOpen}
        onClose={() => { setCreateSupplierConfirmOpen(false); setCreateSupplierConfirmName(null); }}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{
          onEntered: (node) => {
            const yesBtn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-create-supplier-yes]');
            yesBtn?.focus();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: isOrderMode ? '#b45309' : '#0f766e' }}>Create account?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            This account doesn&apos;t exist. Do you want to create it{createSupplierConfirmName ? ` for "${createSupplierConfirmName}"` : ''}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => { setCreateSupplierConfirmOpen(false); setCreateSupplierConfirmName(null); }} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            No
          </Button>
          <Button
            variant="contained"
            data-create-supplier-yes
            autoFocus
            onClick={() => {
              const name = createSupplierConfirmName;
              setCreateSupplierConfirmOpen(false);
              setCreateSupplierConfirmName(null);
              if (name) {
                setPendingSupplierName(name);
                navigate('/master/supplier-create', { state: { prefillName: name, returnTo: routeLocation.pathname } });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isOrderMode ? '#b45309' : '#0f766e', '&:hover': { bgcolor: isOrderMode ? '#92400e' : '#0d6561' }, boxShadow: 'none' }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create product confirm: product doesn't exist, do you want to create? (same pattern as supplier A/C) */}
      <Dialog
        open={createProductConfirmOpen}
        onClose={() => { setCreateProductConfirmOpen(false); setCreateProductConfirmName(null); pendingProductLineIdRef.current = null; }}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{
          onEntered: (node) => {
            const yesBtn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-create-product-yes]');
            yesBtn?.focus();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: isOrderMode ? '#b45309' : '#0f766e' }}>Create product?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            This product doesn&apos;t exist. Do you want to create it{createProductConfirmName ? ` for "${createProductConfirmName}"` : ''}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => { setCreateProductConfirmOpen(false); setCreateProductConfirmName(null); pendingProductLineIdRef.current = null; }} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            No
          </Button>
          <Button
            variant="contained"
            data-create-product-yes
            autoFocus
            onClick={() => {
              const name = createProductConfirmName;
              const lineId = pendingProductLineIdRef.current;
              setCreateProductConfirmOpen(false);
              setCreateProductConfirmName(null);
              pendingProductLineIdRef.current = null;
              if (name) {
                navigate('/master/products/create', { state: { prefillName: name, returnTo: routeLocation.pathname, lineIdForProduct: lineId ?? undefined } });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isOrderMode ? '#b45309' : '#0f766e', '&:hover': { bgcolor: isOrderMode ? '#92400e' : '#0d6561' }, boxShadow: 'none' }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onClose={() => setSuccessDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 1 }}>
          Success
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>{successDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setSuccessDialogOpen(false)} variant="contained" autoFocus sx={{ bgcolor: '#16a34a', borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: '#15803d' } }}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b' }}>{isOpeningStockMode ? 'Search Opening Purchase' : (isOrderMode ? 'Search Purchase Order' : 'Search Invoice')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>Enter {isOpeningStockMode ? 'opening purchase entry' : (isOrderMode ? 'purchase order' : 'invoice')} number to search.</Typography>
          <TextField
            placeholder={isOpeningStockMode ? 'Enter entry number (e.g. OP-0001)' : (isOrderMode ? 'Enter PO number (e.g. PO-0001)' : 'Enter invoice number (e.g. PUR-0001)')}
            value={searchInvoiceNo}
            onChange={(e) => setSearchInvoiceNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearchInvoice();
              }
            }}
            fullWidth
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setSearchDialogOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleSearchInvoice} variant="contained" autoFocus sx={{ bgcolor: THEME.primary, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: THEME.primaryDark } }}>Search</Button>
        </DialogActions>
      </Dialog>

      {/* Extras Dialog - Expiry Date, Special Prices */}
      <Dialog open={extrasDialogOpen} onClose={() => setExtrasDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #e2e8f0' }}>
          Additional Details
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1 }}>Batch Number</Typography>
              <TextField
                value={tempBatchNumber}
                fullWidth
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f1f5f9' }, '& .MuiOutlinedInput-input': { color: '#64748b', fontSize: '0.875rem' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1 }}>Expiry Date (MM/YY or Month)</Typography>
              <TextField
                type="text"
                placeholder="MM/YY or Month (e.g. 5, 05/27)"
                value={editingExpiryCell?.lineId === 'dialog' ? editingExpiryCell.value : formatExpiryDisplay(tempExpiryDate)}
                onFocus={() => setEditingExpiryCell({ lineId: 'dialog', value: tempExpiryDate })}
                onChange={(e) => {
                  setTempExpiryDate(e.target.value);
                  setEditingExpiryCell({ lineId: 'dialog', value: e.target.value });
                }}
                onBlur={() => {
                  setEditingExpiryCell(null);
                  if (tempExpiryDate) {
                    setTempExpiryDate(parseExpiryInputToIso(tempExpiryDate));
                  }
                }}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1 }}>Special Price 1</Typography>
              <TextField
                type="number"
                value={tempSpecialPrice1}
                onChange={(e) => setTempSpecialPrice1(parseFloat(e.target.value) || 0)}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1 }}>Special Price 2</Typography>
              <TextField
                type="number"
                value={tempSpecialPrice2}
                onChange={(e) => setTempSpecialPrice2(parseFloat(e.target.value) || 0)}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          <Button
            onClick={() => { setTempExpiryDate(''); setTempSpecialPrice1(0); setTempSpecialPrice2(0); }}
            sx={{ color: '#f59e0b', borderRadius: 2, textTransform: 'none' }}
          >
            Clear
          </Button>
          <Box>
            <Button onClick={() => setExtrasDialogOpen(false)} sx={{ borderRadius: 2, mr: 1, textTransform: 'none' }}>Cancel</Button>
            <Button onClick={saveExtras} variant="contained" autoFocus sx={{ bgcolor: THEME.primary, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: THEME.primaryDark } }}>
              Save
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Held Purchases Dialog */}
      <Dialog open={holdListDialogOpen} onClose={() => setHoldListDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HoldListIcon color="info" />
            {isOrderMode ? 'Held Purchase Orders' : 'Held Purchases'}
            {heldPurchases.length > 0 && (
              <Chip label={heldPurchases.length} size="small" color="warning" />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {heldPurchases.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No held {isOrderMode ? 'purchase orders' : 'purchases'}</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {heldPurchases.map((held, idx) => (
                <ListItem
                  key={held.id}
                  divider={idx < heldPurchases.length - 1}
                  sx={{
                    py: 1.5,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip label={held.invoiceNo || 'Draft'} size="small" variant="outlined" color="primary" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {held.supplierName}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                        <span>{held.itemCount} item{held.itemCount !== 1 ? 's' : ''}</span>
                        <span style={{ fontWeight: 600 }}>AED {held.total.toFixed(2)}</span>
                        <span style={{ color: '#888' }}>{held.heldAt}</span>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Restore this purchase">
                      <IconButton
                        edge="end"
                        color="primary"
                        onClick={() => handleRestoreHeldPurchase(held)}
                        sx={{ mr: 0.5 }}
                      >
                        <RestoreIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        edge="end"
                        color="error"
                        onClick={() => handleDeleteHeldPurchase(held.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldListDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Print Barcode Modal */}
      <PurchaseBarcodePrintDialog
        open={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        documentTitle={documentTitle}
        invoiceNo={invoiceNo}
        lines={lines}
        products={products}
      />
    </Box>
  );
}
