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
  FormControlLabel,
  Radio,
  RadioGroup,
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
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Print as PrintIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
  PauseCircleOutline as HoldIcon,
  PlaylistAdd as HoldListIcon,
  RestorePage as RestoreIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import type { RootState } from '../store';
import { productApi, ledgerAccountApi, purchaseApi, stockApi, ledgerApi } from '../services/api';
import type { PurchaseListItem } from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';

// Modern Color theme for Purchase Entry (Dark Slate/Teal)
const THEME = {
  primary: '#1e293b',        // Dark slate
  primaryDark: '#0f172a',    // Darker slate
  primaryLight: '#f8fafc',   // Very light gray
  accent: '#334155',         // Slate accent
  headerBg: '#1e293b',       // Dark header
  headerBgSolid: '#1e293b',  // Dark header fallback
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
  narration: string;
}

const HOLD_STORAGE_KEY = 'purchaseEntry_heldInvoices';

function loadHeldPurchases(): HeldPurchase[] {
  try {
    const data = localStorage.getItem(HOLD_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHeldPurchases(invoices: HeldPurchase[]): void {
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(invoices));
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

  // Header state
  const [invoiceNo, setInvoiceNo] = useState('PUR-0001');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [date, setDate] = useState(getCurrentDate);
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>('Vat');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Cash');


  // Navigation for supplier creation flow
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [pendingSupplierName, setPendingSupplierName] = useState<string | null>(null);
  const supplierAcRef = useRef<HTMLInputElement>(null);
  const supplierNameRef = useRef<HTMLInputElement>(null);

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
  const itemNameInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameSnapshotRef = useRef<{ lineId: string, data: LineItem } | null>(null);
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

  // Row edit commit/revert: snapshot stores old row data before editing
  const rowSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);
  const rowCommittedRef = useRef(false);
  const itemNameListboxOpenRef = useRef(false);

  // Summary
  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [freightCharge, setFreightCharge] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [narration, setNarration] = useState('');

  // Dialogs
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [savedBatches, setSavedBatches] = useState<{ batchNumber: string; productName: string; quantity: number; purchasePrice: number; expiryDate: string }[]>([]);

  // Extras Dialog (Expiry Date, Special Prices)
  const [extrasDialogOpen, setExtrasDialogOpen] = useState(false);
  const [extrasLineId, setExtrasLineId] = useState<string | null>(null);
  const [tempExpiryDate, setTempExpiryDate] = useState('');
  const [tempSpecialPrice1, setTempSpecialPrice1] = useState(0);
  const [tempSpecialPrice2, setTempSpecialPrice2] = useState(0);
  const [tempBatchNumber, setTempBatchNumber] = useState('');

  // Hold invoices
  const [heldPurchases, setHeldPurchases] = useState<HeldPurchase[]>(loadHeldPurchases);
  const [holdListDialogOpen, setHoldListDialogOpen] = useState(false);

  // Ledger details for current invoice (when viewing a saved purchase)
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [voucherNo, setVoucherNo] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<Array<{ ledgerAccountCode: string; ledgerAccountName: string; debitAmount: number; creditAmount: number; narration?: string }>>([]);
  const [ledgerEntriesLoading, setLedgerEntriesLoading] = useState(false);

  // Numeric field editing: allow ".02" and trailing zeros while typing
  const [editingNumericCell, setEditingNumericCell] = useState<{ lineId?: string; field: string; value: string } | null>(null);
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
  const [invoiceList, setInvoiceList] = useState<PurchaseListItem[]>([]);
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


  // Focus Cash/Supplier AC when navigating back to this page
  useEffect(() => {
    if (routeLocation.pathname === '/entry/purchase') {
      setTimeout(() => supplierAcRef.current?.focus(), 300);
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
    const init = async () => {
      loadSuppliers();
      const accounts = await loadCashAccounts();
      loadProducts();
      loadInvoiceList();
      loadNextInvoiceNo();
      if (accounts.length > 0 && !invoiceId) {
        setCashAccountId(accounts[0]._id);
      }
    };
    init();
    setTimeout(() => supplierAcRef.current?.focus(), 800);
  }, [companyId, financialYearId]);

  const loadSuppliers = async () => {
    try {
      const res = await ledgerAccountApi.list(companyId!, 'Supplier');
      setSuppliers(res.data.data as Supplier[]);
    } catch {
      setSuppliers([]);
    }
  };

  // Detect return from Supplier Create page — read created ledger from state, set pending and reload suppliers
  const handledReturnFromCreateRef = useRef(false);
  const handledProductReturnRef = useRef(false);
  useEffect(() => {
    const state = routeLocation.state as { createdLedgerName?: string } | null;
    if (routeLocation.pathname !== '/entry/purchase' || !state?.createdLedgerName) {
      handledReturnFromCreateRef.current = false;
      return;
    }
    if (handledReturnFromCreateRef.current) return;
    handledReturnFromCreateRef.current = true;
    const createdName = state.createdLedgerName;
    setPendingSupplierName(createdName);
    loadSuppliers();
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, loadSuppliers, navigate]);

  const loadCashAccounts = async () => {
    try {
      const res = await ledgerAccountApi.list(companyId!, 'Cash');
      const accounts = res.data.data as CashAccount[];
      setCashAccounts(accounts);
      return accounts;
    } catch {
      return [];
    }
  };

  const loadProducts = async () => {
    try {
      const res = await productApi.list(companyId!, { limit: 1000 });
      setProducts((res.data.data.products || []) as Product[]);
    } catch {
      // ignore
    }
  };

  // Detect return from Product Create page — read created product name and line id, reload products, then auto-fill line
  useEffect(() => {
    const state = routeLocation.state as { createdProductName?: string; lineIdForProduct?: string } | null;
    if (routeLocation.pathname !== '/entry/purchase' || !state?.createdProductName) {
      handledProductReturnRef.current = false;
      return;
    }
    if (handledProductReturnRef.current) return;
    handledProductReturnRef.current = true;
    setPendingProductName(state.createdProductName);
    setPendingProductLineId(state.lineIdForProduct ?? null);
    loadProducts();
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, loadProducts, navigate]);

  const loadInvoiceList = async () => {
    try {
      const res = await purchaseApi.list(companyId!, financialYearId!);
      if (res.data.success) {
        setInvoiceList(res.data.data);
      }
    } catch {
      // ignore
    }
  };

  const loadNextInvoiceNo = async () => {
    try {
      const res = await purchaseApi.getNextInvoiceNo(companyId!);
      if (res.data.success && !invoiceId) {
        setInvoiceNo(res.data.data.invoiceNo);
      }
    } catch {
      // ignore
    }
  };

  // Load a saved purchase invoice into the form
  const loadInvoiceIntoForm = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await purchaseApi.getById(id);
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
          if (product.allowBatches === false && product.multiUnits && product.multiUnits.length > 0) {
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
      showErrorDialog(err.response?.data?.message || 'Failed to load purchase invoice');
    } finally {
      setLoading(false);
    }
  }, [invoiceList, products]);

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

      // Add multi-units (only if allowBatches is disabled)
      if (product.allowBatches === false && product.multiUnits && product.multiUnits.length > 0) {
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
      const useImei = selectedUnit?.imei || product.imei || '';
      const useQuantity = 1;

      // For multi-units: use multi-unit's own retail/wholesale/special prices
      // For normal units: use product's retail/wholesale prices
      const useRetail = isMultiUnit && selectedUnit!.retail ? selectedUnit!.retail : retailPrice;
      const useWholesale = isMultiUnit && selectedUnit!.wholesale ? selectedUnit!.wholesale : wholesalePrice;
      const useSpecialPrice1 = isMultiUnit && selectedUnit!.specialPrice1 ? selectedUnit!.specialPrice1 : 0;
      const useSpecialPrice2 = isMultiUnit && selectedUnit!.specialPrice2 ? selectedUnit!.specialPrice2 : 0;

      // Calculate profit percentage
      const profitPercent = usePrice > 0 && useRetail > 0 ? ((useRetail - usePrice) / usePrice) * 100 : 0;

      // Get next batch number from server (00001, 00002, ...) or leave empty for backend to assign
      let batchNum = '';
      try {
        if (companyId) {
          const res = await purchaseApi.getNextBatchNo(companyId);
          batchNum = res.data?.data?.batchNumber ?? '';
        }
      } catch {
        // leave empty; backend will assign on save
      }

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

      // Focus on qty field after product selection
      if (!searchedImei) {
        setTimeout(() => {
          qtyInputRefs.current[lineId]?.focus();
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
          setTimeout(() => otherDiscPercentRef.current?.focus(), 50);
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
            qtyInputRefs.current[line.id]?.focus();
            qtyInputRefs.current[line.id]?.select();
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
                qtyInputRefs.current[lineId]?.focus();
                qtyInputRefs.current[lineId]?.select();
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
              qtyInputRefs.current[line.id]?.focus();
              qtyInputRefs.current[line.id]?.select();
            }, 100);
            return;
          }

          // No match — revert to original name and keep cursor in Item Name
          e.preventDefault();
          e.stopPropagation();
          updateLine(line.id, 'name', product.name);
          return;
        }

        // Name unchanged or same product — move focus to next field (Qty)
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          qtyInputRefs.current[line.id]?.focus();
          qtyInputRefs.current[line.id]?.select();
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

      if (!imei.trim()) {
        // IMEI is blank, go to Item Name
        itemNameInputRefs.current[lineId]?.focus();
      } else {
        // IMEI has value, search for it
        const found = await handleImeiSearch(lineId, imei);
        if (!found) {
          // If not found, still go to Item Name
          itemNameInputRefs.current[lineId]?.focus();
        }
        // If found, handleImeiSearch auto-adds a new row and focuses its IMEI field
      }
    },
    [handleImeiSearch]
  );

  // Revert uncommitted row edits back to snapshot
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
      setEditingNumericCell((prev) =>
        prev && prev.lineId === snapshot.lineId ? null : prev
      );
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  const handleItemNameFocus = useCallback((line: LineItem) => {
    itemNameSnapshotRef.current = { lineId: line.id, data: { ...line } };
  }, []);

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
      priceInputRefs.current[lineId]?.focus();
    },
    []
  );

  // P Rate + Enter → DISC%
  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      discPercentInputRefs.current[lineId]?.focus();
    },
    []
  );

  // DISC% + Enter → Disc Amount
  const handleDiscPercentKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      discAmountInputRefs.current[lineId]?.focus();
    },
    []
  );

  // Disc Amount + Enter → Profit%
  const handleDiscAmountKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      profitPercentInputRefs.current[lineId]?.focus();
    },
    []
  );

  // Profit% + Enter → Retail
  const handleProfitPercentKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      retailInputRefs.current[lineId]?.focus();
    },
    []
  );

  // Retail + Enter → Wholesale
  const handleRetailKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      wholesaleInputRefs.current[lineId]?.focus();
    },
    []
  );

  // Wholesale + Enter → THE commit point: validate (Item Code, Name, Qty, P.Rate, Retail, Wholesale), then commit and move to next row
  const handleWholesaleKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const rawWholesale = (e.target as HTMLInputElement)?.value ?? '';
      const wholesaleVal = parseNumericInput(rawWholesale);
      updateLine(lineId, 'wholesale', wholesaleVal);

      setTimeout(() => {
        setLines((current) => {
          const currentIndex = current.findIndex((l) => l.id === lineId);
          const line = current[currentIndex];
          if (!line) return current;

          // ── Mandatory validation before commit (Purchase Entry: Item Code, Name, Qty, P.Rate, Retail, Wholesale) ──
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
          if (wholesaleVal <= 0) {
            setTimeout(() => wholesaleInputRefs.current[lineId]?.focus(), 30);
            return current;
          }

          // ── Valid → commit row (only Enter in Wholesale finalizes) ──
          rowCommittedRef.current = true;
          rowSnapshotRef.current = null;
          updateLine(lineId, 'isCommitted', true);

          // Move to next row's Item Name, or add new row
          if (currentIndex >= 0 && currentIndex < current.length - 1) {
            const nextLine = current[currentIndex + 1];
            enterRow(nextLine);
            setTimeout(() => itemNameInputRefs.current[nextLine.id]?.focus(), 30);
            return current;
          }

          const newLineId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          const newLine: LineItem = { ...emptyLine(), id: newLineId };
          setTimeout(() => itemNameInputRefs.current[newLineId]?.focus(), 50);
          return [...current, newLine];
        });
      }, 50);
    },
    [updateLine, enterRow]
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
      setTimeout(() => supplierAcRef.current?.focus(), 200);
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
      setTempExpiryDate(line.expiryDate || '');
      setTempSpecialPrice1(line.specialPrice1 || 0);
      setTempSpecialPrice2(line.specialPrice2 || 0);
      setTempBatchNumber(line.batchNumber || '');
      setExtrasDialogOpen(true);
    }
  };

  // Save extras and close dialog
  const saveExtras = () => {
    if (extrasLineId) {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== extrasLineId) return line;
          return {
            ...line,
            expiryDate: tempExpiryDate,
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
      narration,
    };
    const updated = [...heldPurchases, held];
    setHeldPurchases(updated);
    saveHeldPurchases(updated);
    showSuccessDialog(`Purchase held (${filledLines.length} items)`);
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
    setNarration(held.narration);
    setError(null);
    // Remove from held list
    const updated = heldPurchases.filter((h) => h.id !== held.id);
    setHeldPurchases(updated);
    saveHeldPurchases(updated);
    setHoldListDialogOpen(false);
  };

  const handleDeleteHeldPurchase = (heldId: string) => {
    const updated = heldPurchases.filter((h) => h.id !== heldId);
    setHeldPurchases(updated);
    saveHeldPurchases(updated);
  };

  const handleClear = async () => {
    setInvoiceId(null);
    setVoucherId(null);
    setVoucherNo(null);
    setLedgerEntries([]);
    setEditingNumericCell(null);
    setDate(getCurrentDate());
    setSupplierInvNo('');
    setVatType('Vat');
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
    setNarration('');
    setIsSaved(false);
    setError(null);
    setSuccessMessage('');
    setSavedBatches([]);
    setCurrentNavIndex(-1);
    setActiveLineId(null);
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    // Fetch next invoice number
    try {
      if (companyId) {
        const res = await purchaseApi.getNextInvoiceNo(companyId);
        if (res.data.success) {
          setInvoiceNo(res.data.data.invoiceNo);
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
      // Check if product has allowBatches disabled
      const prod = products.find((p) => p._id === item.productId);
      const noBatches = prod?.allowBatches === false;
      // If allowBatches is disabled, group by productId only (single batch per product)
      const batchKey = noBatches
        ? `${item.productId}-NO-BATCH`
        : `${item.productId}-${item.pRate}-${item.expiryDate || 'no-expiry'}`;

      if (batchMap.has(batchKey)) {
        // Add to existing batch
        const existingBatch = batchMap.get(batchKey)!;
        existingBatch.totalQuantity += item.quantity;
        existingBatch.discAmount += item.discAmount;
        existingBatch.items.push(item);
        existingBatch.vatAmount += item.vatAmount;
        existingBatch.gross += item.gross;
        existingBatch.total += item.total;
        // For no-batch products, recalculate average purchase price
        if (noBatches) {
          const totalQty = existingBatch.items.reduce((s, i) => s + i.quantity, 0);
          const weightedSum = existingBatch.items.reduce((s, i) => s + i.pRate * i.quantity, 0);
          existingBatch.purchasePrice = totalQty > 0 ? weightedSum / totalQty : item.pRate;
        }
      } else {
        // Create new batch (use line's batch number from API or '' for backend to assign)
        batchMap.set(batchKey, {
          batchNumber: item.batchNumber?.trim() || '',
          productId: item.productId,
          productCode: item.productCode,
          productName: item.name,
          purchasePrice: item.pRate,
          expiryDate: noBatches ? '' : item.expiryDate,
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
    // Clear previous errors
    setError(null);

    if (!companyId || !financialYearId) {
      showErrorDialog('Please select a company and financial year');
      return;
    }

    if (!supplierId) {
      showErrorDialog('Please select a Cash/Supplier Account before saving');
      return;
    }

    // Filter out rows without product (check both productCode and productId)
    const rowsWithItemCode = lines.filter((l) => l.productCode || l.productId);
    const rowsWithoutItemCode = lines.filter((l) => !l.productCode && !l.productId);

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

    try {
      let res;
      if (invoiceId) {
        // Editing existing purchase — call update API
        res = await purchaseApi.update(invoiceId, apiData);
      } else {
        // New purchase — call create API
        res = await purchaseApi.create(apiData);
      }

      // Store batch info for display
      setSavedBatches(batches.map((b) => ({
        batchNumber: b.batchNumber,
        productName: b.productName,
        quantity: b.totalQuantity,
        purchasePrice: b.purchasePrice,
        expiryDate: b.expiryDate,
      })));

      setInvoiceId(res.data.data.purchaseId);
      setSuccessMessage(
        invoiceId
          ? `Purchase Entry updated successfully! ${res.data.data.batchCount} batch(es) updated.`
          : `Purchase Entry saved successfully! ${res.data.data.batchCount} batch(es) created.`
      );
      setIsSaved(true);
      setSavedDialogOpen(true);

      // Refresh invoice list for navigation
      loadInvoiceList();
      // Reload this invoice so voucherId/voucherNo and ledger details are available
      if (res.data.data?.purchaseId) {
        const invRes = await purchaseApi.getById(res.data.data.purchaseId);
        if (invRes.data.success && invRes.data.data) {
          const inv = invRes.data.data;
          setVoucherId(inv.voucherId ?? null);
          setVoucherNo(inv.voucherNo ?? null);
          if (inv.voucherId) setLedgerEntries([]);
        }
      }

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Error saving purchase entry:', err);
      const msg = err.response?.data?.message || 'Failed to save purchase entry. Please try again.';
      showErrorDialog(msg);
    }
  };

  const handleSearchInvoice = async () => {
    if (!searchInvoiceNo.trim() || !companyId) return;
    try {
      const res = await purchaseApi.search(companyId, searchInvoiceNo.trim());
      if (res.data.success) {
        setSearchDialogOpen(false);
        await loadInvoiceIntoForm(res.data.data._id);
        setSearchInvoiceNo('');
      }
    } catch (err: any) {
      showErrorDialog(err.response?.data?.message || 'Invoice not found');
      setSearchDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!invoiceId) return;
    setDeleteDialogOpen(false);
    handleNewEntry();
    showSuccessDialog('Purchase Entry deleted successfully!');
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
    <Box onClick={handlePageClick} sx={{ p: 0.5, bgcolor: '#ffffff', minHeight: '100vh', height: '100%', width: '100%', maxWidth: 1600, mx: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', '& .MuiInputLabel-root': { fontWeight: 600, color: '#1e293b' }, ...numberInputStyle }}>

      <Typography component="h1" variant="h6" sx={{ fontWeight: 700, color: '#0f766e', mb: 1, fontSize: '1.1rem' }}>
        Purchase Entry
      </Typography>

      {/* Purchase Entry Card - B2C style header */}
      <Paper elevation={0} sx={{ px: 2, py: 1.5, mb: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={1.5} alignItems="center">
          {/* Entry No - badge style (like B2C) */}
          <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
            <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.5, px: 1.5, py: 0.6, textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>ENTRY NO</Typography>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.3 }}>{invoiceNo}</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.7}>
            <DateInput label="Date" value={date} onChange={setDate} size="small" />
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.8}>
            <TextField
              label="Supplier Inv No"
              size="small"
              value={supplierInvNo}
              onChange={(e) => setSupplierInvNo(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />
          </Grid>
          <Grid item xs={7.5} sm={7.5} md={3.125} lg={2.75}>
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
                  autoFocus
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
                    '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
                    '& .MuiInputBase-input': { fontSize: '0.75rem' },
                    '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={6} sm={3.75} md={3.125} lg={3.125}>
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
                '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
                '& .MuiInputBase-input': { fontSize: '0.75rem' },
                '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                ...(supplierId ? { '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1.5 } } : {}),
              }}
            />
          </Grid>
          {/* Second row: VAT Type + Payment Type */}
          <Grid item xs={12}>
            <Divider sx={{ my: 1.2 }} />
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2.5}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', alignItems: 'stretch' }}>
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1.2, py: 0.5, bgcolor: '#f8fafc', height: '100%' }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>VAT TYPE</Typography>
                <RadioGroup row value={vatType} onChange={(e) => setVatType(e.target.value as 'Vat' | 'NonVat')}>
                  <FormControlLabel value="Vat" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Vat" sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                  <FormControlLabel value="NonVat" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Non Vat" sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                </RadioGroup>
              </Box>
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1.2, py: 0.5, bgcolor: '#f8fafc', height: '100%' }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>PAYMENT TYPE</Typography>
                <RadioGroup row value={paymentType} onChange={(e) => setPaymentType(e.target.value as 'Cash' | 'Credit')}>
                  <FormControlLabel value="Cash" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Cash" sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                  <FormControlLabel value="Credit" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Credit" sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                </RadioGroup>
              </Box>
            </Box>
          </Grid>
          {/* Navigation - B2C style buttons */}
          <Grid item xs="auto">
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              {[
                { icon: <FirstIcon />, handler: navFirst, tip: 'First', disabled: invoiceList.length === 0 },
                { icon: <PrevIcon />, handler: navPrev, tip: 'Previous', disabled: invoiceList.length === 0 || currentNavIndex === 0 },
                { icon: <NextIcon />, handler: navNext, tip: 'Next', disabled: invoiceList.length === 0 || currentNavIndex >= invoiceList.length - 1 },
                { icon: <LastIcon />, handler: navLast, tip: 'Last', disabled: invoiceList.length === 0 },
              ].map((nav, i) => (
                <Tooltip key={i} title={`${nav.tip} Invoice`}>
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={nav.handler}
                      disabled={nav.disabled}
                      sx={{ flex: 1, py: 0.4, minWidth: 36, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none', '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}
                    >
                      {nav.icon}
                    </Button>
                  </span>
                </Tooltip>
              ))}
              {invoiceList.length > 0 && (
                <Typography sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.7rem', ml: 0.3 }}>
                  {currentNavIndex >= 0 ? `${currentNavIndex + 1}/${invoiceList.length}` : `${invoiceList.length}`}
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs />
          {/* Product Info - B2C style */}
          <Grid item xs={12} md={12} lg={6}>
            <Box sx={{
              borderRadius: 1.5, px: 1.5, py: 0.8, minHeight: 40, display: 'flex', alignItems: 'center', gap: 1.5,
              background: selectedProductInfo ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)' : '#f8fafc',
              border: selectedProductInfo ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
              transition: 'all 0.2s',
            }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>Info</Typography>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#dc2626', fontSize: '0.65rem', lineHeight: 1, fontWeight: 600 }}>Stock</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#dc2626', fontSize: '0.8rem', lineHeight: 1.2 }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.stock / activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.stock}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>P.Rate</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.2 }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.purchaseRate * activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  {!activeMultiUnitInfo && (
                    <>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>Retail</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.2 }}>{selectedProductInfo.retailPrice.toFixed(2)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>WSale</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.2 }}>{selectedProductInfo.wholesalePrice.toFixed(2)}</Typography>
                      </Box>
                    </>
                  )}
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>Vendor</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.2 }}>{selectedProductInfo.lastVendor}</Typography>
                  </Box>
                  {activeMultiUnitInfo && (
                    <>
                      <Box sx={{ width: '1px', height: 24, bgcolor: '#cbd5e1', flexShrink: 0 }} />
                      {activeMultiUnitInfo.pcsInside != null && (
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>Pcs</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.78rem', lineHeight: 1.2 }}>{activeMultiUnitInfo.pcsInside}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.wholesale != null && activeMultiUnitInfo.wholesale > 0 && (
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>M.WS</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1565c0', fontSize: '0.78rem', lineHeight: 1.2 }}>{activeMultiUnitInfo.wholesale.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.retail != null && activeMultiUnitInfo.retail > 0 && (
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>M.Ret</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.78rem', lineHeight: 1.2 }}>{activeMultiUnitInfo.retail.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.specialPrice1 != null && activeMultiUnitInfo.specialPrice1 > 0 && (
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>Sp1</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#e65100', fontSize: '0.78rem', lineHeight: 1.2 }}>{activeMultiUnitInfo.specialPrice1.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.specialPrice2 != null && activeMultiUnitInfo.specialPrice2 > 0 && (
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}>Sp2</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#ad1457', fontSize: '0.78rem', lineHeight: 1.2 }}>{activeMultiUnitInfo.specialPrice2.toFixed(2)}</Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}>Select a product</Typography>
              )}
            </Box>
          </Grid>
          {/* Tax - B2C style */}
          <Grid item xs="auto">
            <TextField
              size="small"
              select
              label="Tax"
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 130, height: 38, '& .MuiOutlinedInput-root': { borderRadius: 1.5, height: 38 } }}
            >
              <MenuItem value="inclusive">Include Tax</MenuItem>
              <MenuItem value="exclusive">Exclude Tax</MenuItem>
            </TextField>
          </Grid>
          {/* Hold & Held - B2C style */}
          <Grid item xs="auto">
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title="Hold this purchase for later">
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleHoldPurchase}
                    disabled={isSaved}
                    sx={{ height: 36, minWidth: 0, px: 1.5, textTransform: 'none', borderRadius: 1.5, bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, boxShadow: 'none', '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
                    startIcon={<HoldIcon sx={{ fontSize: 16 }} />}
                  >
                    Hold
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={heldPurchases.length > 0 ? `${heldPurchases.length} held purchase(s)` : 'No held purchases'}>
                <Badge badgeContent={heldPurchases.length} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16 } }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setHoldListDialogOpen(true)}
                    sx={{ height: 36, minWidth: 36, px: 0.8, borderRadius: 1.5, borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}
                  >
                    <HoldListIcon fontSize="small" />
                  </Button>
                </Badge>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Purchase Items Card */}
      <Paper elevation={0} sx={{ mb: 0.5, bgcolor: 'white', borderRadius: 2, border: '2px solid #000000', overflow: 'hidden' }}>
        <TableContainer
          sx={{ minHeight: 400, maxHeight: 400, width: '100%', bgcolor: '#f4f6f8' }}
          onBlurCapture={(e) => {
            const container = e.currentTarget;
            setTimeout(() => {
              const active = document.activeElement;
              if (!active) return;
              const inPopper = active.closest('.MuiAutocomplete-popper, .MuiAutocomplete-listbox, .MuiPopper-root');
              if (inPopper) return;
              if (!container.contains(active)) {
                revertUncommittedRow();
              }
            }, 100);
          }}
        >
          <Table stickyHeader size="small" sx={{ minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, '& .MuiTableCell-root': { fontSize: '0.875rem' }, '& .MuiInputBase-input': { fontSize: '0.875rem' }, '& .MuiAutocomplete-input': { fontSize: '0.875rem' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '2.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Sl</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '11.7%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Int Barcode</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '21.875%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Item Name</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '7.2%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Unit</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Qty</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '7.8%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>P Rate</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Gross</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>DISC%</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Disc</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>VAT</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Total</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Profit %</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Retail</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>WholeSale</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>BRANCH</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '3%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>+</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '3%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>×</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow
                  key={line.id}
                  sx={{ bgcolor: idx % 2 === 0 ? '#f8fafc' : 'white', cursor: 'pointer', '&:hover': { bgcolor: '#e0f2fe' } }}
                  onClick={() => handleRowClick(line)}
                  onFocusCapture={() => { enterRow(line); setActiveLineId(line.id); }}
                >
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>{idx + 1}</TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      value={line.imei}
                      onChange={(e) => updateLine(line.id, 'imei', e.target.value)}
                      onKeyDown={(e) => handleImeiKeyDown(e, line.id, line.imei)}
                      fullWidth
                      inputRef={(el) => { imeiInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.74375rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }} onClick={(e) => e.stopPropagation()}>
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
                      renderInput={(params) => <TextField {...params} size="small" variant="outlined" inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }} onFocus={() => handleItemNameFocus(line)} onBlur={() => handleItemNameBlur(line)} onKeyDownCapture={(e) => { if (e.key === 'Enter') handleItemNameKeyDown(e, line); }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.875rem' } }} />}
                      renderOption={(props, opt) => (
                        <li {...props} key={opt._id} style={{
                          fontSize: '1.09375rem',
                          fontWeight: 400,
                          padding: '6px 16px',
                          cursor: 'pointer'
                        }}>
                          {opt.name}
                        </li>
                      )}
                      ListboxProps={{
                        sx: {
                          p: 0,
                          maxHeight: 250,
                          overflowX: 'hidden',
                          overflowY: 'auto',
                          '&::-webkit-scrollbar': {
                            display: 'none'
                          },
                          msOverflowStyle: 'none',
                          scrollbarWidth: 'none',
                          '& .MuiAutocomplete-option': {
                            minHeight: 'auto',
                            py: 0.75,
                            px: 2,
                            fontSize: '1.09375rem',
                            bgcolor: 'transparent',
                            '&:hover': {
                              bgcolor: 'rgba(79, 195, 197, 0.25) !important',
                              color: '#1e293b'
                            },
                            '&[data-focus="true"]': {
                              bgcolor: '#4fc3c5 !important',
                              color: '#ffffff !important'
                            },
                            '&[aria-selected="true"]': {
                              bgcolor: '#4fc3c5 !important',
                              color: '#ffffff !important'
                            },
                            '&.Mui-focused': {
                              bgcolor: '#4fc3c5 !important',
                              color: '#ffffff !important'
                            }
                          }
                        }
                      }}
                      componentsProps={{
                        popper: {
                          placement: 'bottom-start',
                          modifiers: [
                            {
                              name: 'flip',
                              enabled: false
                            },
                            {
                              name: 'preventOverflow',
                              enabled: false
                            }
                          ]
                        },
                        paper: {
                          sx: {
                            width: '450px',
                            minWidth: '450px',
                            boxShadow: '0 4px 15px rgba(79,195,197,0.3)',
                            borderRadius: '10px',
                            border: '2px solid #4fc3c5',
                            bgcolor: '#ffffff',
                            overflow: 'hidden',
                            mt: 0.5
                          }
                        }
                      }}
                      sx={{ width: '100%' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      select
                      variant="outlined"
                      value={line.unitId}
                      onChange={(e) => handleUnitChange(line.id, e.target.value)}
                      onKeyDown={(e) => handleUnitKeyDown(e, line.id)}
                      fullWidth
                      disabled={line.availableUnits.length === 0}
                      inputRef={(el) => { unitInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.546875rem' } }}
                    >
                      {line.availableUnits.length === 0 ? (
                        <MenuItem value="" sx={{ fontSize: '0.546875rem' }}>-</MenuItem>
                      ) : (
                        line.availableUnits.map((u) => (
                          <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.546875rem' }}>{u.name}</MenuItem>
                        ))
                      )}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : ''; updateLine(line.id, 'quantity', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleQtyKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'center', fontSize: '0.7875rem' } }}
                      fullWidth
                      inputRef={(el) => { qtyInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.7875rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : (line.pRate === 0 ? '' : String(line.pRate))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'pRate', value: line.pRate === 0 ? '' : String(line.pRate) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : ''; updateLine(line.id, 'pRate', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handlePriceKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.7875rem' } }}
                      fullWidth
                      inputRef={(el) => { priceInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.7875rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 500, color: '#475569', fontSize: '0.875rem' }}>{line.gross.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'discPercent', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleDiscPercentKeyDown(e, line.id); }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => { discPercentInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : ''; updateLine(line.id, 'discAmount', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleDiscAmountKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => { discAmountInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 500, color: '#475569', fontSize: '0.875rem' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: THEME.primary, fontSize: '0.875rem' }}>{line.total.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'profitPercent' ? editingNumericCell.value : (line.profitPercent === 0 ? '' : String(line.profitPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'profitPercent', value: line.profitPercent === 0 ? '' : String(line.profitPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'profitPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'profitPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'profitPercent', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'profitPercent' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleProfitPercentKeyDown(e, line.id); }}
                      inputProps={{ style: { textAlign: 'center', fontSize: '0.875rem', color: line.profitPercent >= 0 ? '#059669' : '#dc2626', fontWeight: 500 } }}
                      fullWidth
                      inputRef={(el) => { profitPercentInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f8fafc', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'retail' ? editingNumericCell.value : (line.retail === 0 ? '' : String(line.retail))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'retail', value: line.retail === 0 ? '' : String(line.retail) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'retail' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'retail' ? editingNumericCell.value : ''; updateLine(line.id, 'retail', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'retail' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleRetailKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => { retailInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'wholesale' ? editingNumericCell.value : (line.wholesale === 0 ? '' : String(line.wholesale))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'wholesale', value: line.wholesale === 0 ? '' : String(line.wholesale) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'wholesale' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'wholesale' ? editingNumericCell.value : ''; updateLine(line.id, 'wholesale', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'wholesale' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleWholesaleKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => { wholesaleInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75 } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      select
                      variant="outlined"
                      value={line.branch}
                      onChange={(e) => updateLine(line.id, 'branch', e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.875rem' } }}
                    >
                      <MenuItem value="MAIN BRANCH" sx={{ fontSize: '0.8rem' }}>MAIN BRANCH</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      size="small"
                      onClick={() => openExtrasDialog(line.id)}
                      sx={{
                        p: 0.3,
                        bgcolor: line.expiryDate || line.specialPrice1 || line.specialPrice2 ? THEME.primary : '#f1f5f9',
                        color: line.expiryDate || line.specialPrice1 || line.specialPrice2 ? 'white' : '#64748b',
                        borderRadius: 1.5,
                        '&:hover': { bgcolor: THEME.primary, color: 'white' }
                      }}
                    >
                      <AddIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => removeLine(line.id)} sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' } }}>
                      <DeleteIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Summary Section */}
      <Grid container spacing={1}>
        {/* Left - Narration */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 1.5, height: '100%', bgcolor: 'white', borderRadius: 1, border: '2px solid #000000' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1e293b', mb: 0.5 }}>Narration</Typography>
            <TextField
              multiline
              rows={4}
              fullWidth
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Enter any notes or comments..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Paper>
        </Grid>

        {/* Right - Totals */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'white', borderRadius: 1, border: '2px solid #000000' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1e293b', mb: 0.5 }}>Summary</Typography>
            <Grid container spacing={1} sx={{ alignItems: 'stretch' }}>
              {/* Left half: stacked adjustment fields (30% smaller width/height) */}
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, width: '70%' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.4, fontSize: '0.7rem' }}>Other Disc %</Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.field === 'otherDiscPercent' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscPercent === 0 ? '' : String(otherDiscPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscPercent', value: otherDiscPercent === 0 ? '' : String(otherDiscPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscPercent' ? editingNumericCell.value : ''; handleOtherDiscPercentChange(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? null : prev); }}
                      inputRef={otherDiscPercentRef}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => otherDiscountRef.current?.focus(), 50); } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, minHeight: 28 }, '& .MuiOutlinedInput-input': { py: 0.4, fontSize: '0.75rem' } }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.4, fontSize: '0.7rem' }}>Other Discount</Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.field === 'otherDiscount' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscount === 0 ? '' : String(otherDiscount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscount', value: otherDiscount === 0 ? '' : String(otherDiscount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscount' ? editingNumericCell.value : ''; setOtherDiscount(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? null : prev); }}
                      inputRef={otherDiscountRef}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => otherChargesRef.current?.focus(), 50); } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, minHeight: 28 }, '& .MuiOutlinedInput-input': { py: 0.4, fontSize: '0.75rem' } }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.4, fontSize: '0.7rem' }}>Other Charges</Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.field === 'otherCharges' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherCharges === 0 ? '' : String(otherCharges))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherCharges', value: otherCharges === 0 ? '' : String(otherCharges) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'otherCharges' ? editingNumericCell.value : ''; setOtherCharges(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? null : prev); }}
                      inputRef={otherChargesRef}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => freightRef.current?.focus(), 50); } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, minHeight: 28 }, '& .MuiOutlinedInput-input': { py: 0.4, fontSize: '0.75rem' } }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.4, fontSize: '0.7rem' }}>Freight</Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.field === 'freightCharge' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (freightCharge === 0 ? '' : String(freightCharge))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'freightCharge', value: freightCharge === 0 ? '' : String(freightCharge) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'freightCharge' ? editingNumericCell.value : ''; setFreightCharge(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? null : prev); }}
                      inputRef={freightRef}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => roundOffRef.current?.focus(), 50); } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, minHeight: 28 }, '& .MuiOutlinedInput-input': { py: 0.4, fontSize: '0.75rem' } }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.4, fontSize: '0.7rem' }}>Round Off</Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.field === 'roundOff' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (roundOff === 0 ? '' : String(roundOff))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'roundOff', value: roundOff === 0 ? '' : String(roundOff) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'roundOff' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'roundOff' ? editingNumericCell.value : ''; setRoundOff(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'roundOff' ? null : prev); }}
                      inputRef={roundOffRef}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, minHeight: 28 }, '& .MuiOutlinedInput-input': { py: 0.4, fontSize: '0.75rem' } }}
                    />
                  </Box>
                </Box>
              </Grid>
              {/* Right half: totals */}
              <Grid item xs={6}>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.5, fontSize: '0.75rem' }}>Gross Total</Typography>
                    <TextField size="small" value={calculations.itemsGross.toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }} />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.5, fontSize: '0.75rem' }}>Total VAT</Typography>
                    <TextField size="small" value={calculations.totalVat.toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }} />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.5, fontSize: '0.7rem' }}>Before tax (incl. adj.)</Typography>
                    <TextField size="small" value={(calculations.grandTotal - calculations.totalVat).toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }} />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.5, fontSize: '0.75rem' }}>Total Items</Typography>
                    <TextField size="small" value={calculations.totalItems} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.5, fontSize: '0.75rem' }}>Grand Total</Typography>
                    <TextField
                      size="small"
                      value={calculations.grandTotal.toFixed(2)}
                      InputProps={{ readOnly: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: THEME.primary }, '& .MuiInputBase-input': { fontWeight: 700, fontSize: '1.1rem', color: 'white' } }}
                    />
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Action Buttons & Navigation */}
      <Paper elevation={0} sx={{ p: 1, mt: 0.5, bgcolor: 'white', borderRadius: 1, border: '2px solid #000000', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" size="small" startIcon={<ClearIcon />} onClick={handleClear} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
          Clear
        </Button>
        <Button ref={saveButtonRef} variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} disabled={!!invoiceId || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          {isSaved ? 'Saved ✓' : 'Save'}
        </Button>
        <Button variant="contained" size="small" startIcon={<EditIcon />} onClick={() => setEditConfirmOpen(true)} disabled={!invoiceId || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Edit
        </Button>
        <Button variant="contained" size="small" startIcon={<DeleteIcon />} onClick={() => setDeleteDialogOpen(true)} disabled={!invoiceId || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Delete
        </Button>
        <Button variant="contained" size="small" startIcon={<PrintIcon />} disabled={!isSaved} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Print
        </Button>
        <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={() => setSearchDialogOpen(true)} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
          Search
        </Button>
      </Paper>

      {/* Ledger details for current invoice */}
      {invoiceId && (
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
          <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>Invoice No: {invoiceNo}</Typography>
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
          <Typography sx={{ color: '#475569' }}>Are you sure you want to delete this purchase entry?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" autoFocus sx={{ bgcolor: '#ef4444', borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: '#dc2626' } }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b' }}>Confirm Edit</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>Are you sure you want to update this purchase entry?</Typography>
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
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f766e' }}>Create account?</DialogTitle>
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
                navigate('/master/supplier-create', { state: { prefillName: name, returnTo: '/entry/purchase' } });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d6561' }, boxShadow: 'none' }}
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
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f766e' }}>Create product?</DialogTitle>
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
                navigate('/master/products/create', { state: { prefillName: name, returnTo: '/entry/purchase', lineIdForProduct: lineId ?? undefined } });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d6561' }, boxShadow: 'none' }}
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
        <DialogTitle sx={{ fontWeight: 600, color: '#1e293b' }}>Search Invoice</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>Enter invoice number to search.</Typography>
          <TextField
            placeholder="Enter invoice number (e.g. PUR-0001)"
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
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1 }}>Expiry Date</Typography>
              <TextField
                type="date"
                value={tempExpiryDate}
                onChange={(e) => setTempExpiryDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
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
            Held Purchases
            {heldPurchases.length > 0 && (
              <Chip label={heldPurchases.length} size="small" color="warning" />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {heldPurchases.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No held purchases</Typography>
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
    </Box>
  );
}
