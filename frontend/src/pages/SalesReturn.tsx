import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, Button, Grid, IconButton,
  Autocomplete, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Checkbox, FormControlLabel as MuiFormControlLabel, Divider, Tooltip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Clear as ClearIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
  PauseCircleOutline as HoldIcon,
  PlaylistAdd as HoldListIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { salesApi, ledgerAccountApi, productApi, stockApi, purchaseApi } from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';

function parseNumericInput(raw: string | number): number {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  const s = String(raw ?? '').trim();
  if (s === '') return 0;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

interface ProductOption {
  _id: string;
  name: string;
  code?: string;
  purchasePrice?: number;
  unitId?: string;
  unitName?: string;
  allowBatches?: boolean;
  retailPrice?: number;
  wholesalePrice?: number;
  imei?: string;
  unitOfMeasureId?: { _id: string; name?: string; shortCode?: string } | string;
  multiUnits?: Array<{
    multiUnitId: string;
    imei?: string;
    conversion?: number;
    price?: number;
    wholesale?: number;
    retail?: number;
    specialPrice1?: number;
    specialPrice2?: number;
    unitId?: { _id: string; name?: string; shortCode?: string } | string;
  }>;
}

interface UnitOption {
  id: string;
  name: string;
  isMultiUnit?: boolean;
  conversion?: number;
  price?: number;
  wholesale?: number;
  retail?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  multiUnitId?: string;
}

interface LineItem {
  id: string;
  productId: string;
  productCode: string;
  imei: string;
  name: string;
  unitId: string;
  unitName: string;
  availableUnits: UnitOption[];
  quantity: number;
  price: number;
  purchasePrice: number;
  gross: number;
  discPercent: number;
  discAmount: number;
  vatAmount: number;
  total: number;
  batchNumber?: string;
  isCommitted: boolean;
  multiUnitId?: string;
}

interface Customer {
  _id: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  type?: string;
}

interface RefInvoiceItem {
  _id: string;
  productId: { _id: string; name?: string; code?: string };
  productCode?: string;
  imei?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  totalAmount: number;
  unitName?: string;
  unitId?: string;
  batchNumber?: string;
  multiUnitId?: string;
}

interface HeldSalesReturn {
  id: string;
  heldAt: string;
  customerName: string;
  itemCount: number;
  total: number;
  invoiceNo: string;
  date: string;
  taxMode: 'inclusive' | 'exclusive';
  vatType: 'Vat' | 'NonVat';
  returnType: 'OnAccount' | 'ByRef';
  customerId: string | null;
  customerAddress: string;
  billingAddress: string;
  billingPhone: string;
  cashAccountId: string | null;
  lines: LineItem[];
  otherDiscPercent: number;
  otherDiscount: number;
  otherCharges: number;
  roundOff: number;
  autoRoundOff?: boolean;
  narration: string;
  originalInvoiceIdForReturn: string | null;
  refInvoiceNoInput: string;
  refInvoiceData: any;
  paymentType: 'Cash' | 'Credit';
  rateType: 'Retail' | 'WSale' | 'Special1' | 'Special2';
}

const HOLD_STORAGE_KEY = 'salesReturn_heldInvoices';

function loadHeldReturns(): HeldSalesReturn[] {
  try {
    const data = localStorage.getItem(HOLD_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHeldReturns(returns: HeldSalesReturn[]): void {
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(returns));
}

const emptyLine = (): LineItem => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
  productId: '', productCode: '', imei: '', name: '',
  unitId: '', unitName: '', availableUnits: [],
  quantity: 0, price: 0, purchasePrice: 0, gross: 0,
  discPercent: 0, discAmount: 0, vatAmount: 0, total: 0,
  isCommitted: false,
});

export default function SalesReturn() {
  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);
  const financialYearId = useSelector((s: RootState) => s.app.selectedFinancialYearId);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const routeLocation = useLocation();

  const productFilterOptions = useMemo(
    () => (options: ProductOption[], state: { inputValue: string }) => {
      const q = (state.inputValue || '').trim().toLowerCase();
      const name = (p: ProductOption) => (p.name || '').toLowerCase();
      const sortByName = (arr: ProductOption[]) =>
        arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      if (!q) return options;
      const startsWith = options.filter((p) => name(p).startsWith(q));
      const containsOnly = options.filter((p) => name(p).includes(q) && !name(p).startsWith(q));
      return [...sortByName(startsWith), ...sortByName(containsOnly)];
    },
    []
  );

  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(getCurrentDate());
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('exclusive');
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>('Vat');
  const [rateType, setRateType] = useState<'Retail' | 'WSale' | 'Special1' | 'Special2'>('WSale');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Cash');
  const [returnType, setReturnType] = useState<'OnAccount' | 'ByRef'>('OnAccount');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('CASH IN HAND');
  const [customerAddress, setCustomerAddress] = useState('');
  // Billing Address
  const [billingAddress, setBillingAddress] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  // Address Details Dialog
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pendingCustomerName, setPendingCustomerName] = useState<string | null>(null);
  const [customerAcListboxOpen, setCustomerAcListboxOpen] = useState(false);
  const [createCustomerConfirmOpen, setCreateCustomerConfirmOpen] = useState(false);
  const [createCustomerConfirmName, setCreateCustomerConfirmName] = useState<string | null>(null);
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [autoRoundOff, setAutoRoundOff] = useState(false);
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnIds, setReturnIds] = useState<string[]>([]);
  const [heldReturns, setHeldReturns] = useState<HeldSalesReturn[]>(loadHeldReturns());
  const [holdListDialogOpen, setHoldListDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [savedDialogMessage, setSavedDialogMessage] = useState('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [editingNumericCell, setEditingNumericCell] = useState<{ lineId?: string; field: string; value: string } | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const actionButtonsContainerRef = useRef<HTMLDivElement>(null);

  const focusPrintButton = useCallback(() => {
    setTimeout(() => {
      printButtonRef.current?.focus();
    }, 50);
    setTimeout(() => {
      printButtonRef.current?.focus();
    }, 150);
  }, []);

  const handleActionButtonKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      return;
    }
    const container = actionButtonsContainerRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    ).filter((btn) => btn.offsetParent !== null);

    if (buttons.length === 0) return;

    const activeEl = document.activeElement as HTMLButtonElement | null;
    const currentIndex = activeEl ? buttons.indexOf(activeEl) : -1;

    e.preventDefault();
    e.stopPropagation();

    if (currentIndex === -1) {
      buttons[0]?.focus();
      return;
    }

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    }

    buttons[nextIndex]?.focus();
  };

  const customerAcRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const customerInitializedRef = useRef(false);
  const shouldFocusCustomerAcRef = useRef(false);
  const taxModeRef = useRef<HTMLInputElement>(null);
  const narrationRef = useRef<HTMLInputElement>(null);

  const focusCustomerAc = useCallback(() => {
    const el = customerAcRef.current || (document.getElementById('sales-return-customer-ac-input') as HTMLInputElement | null);
    if (el) {
      el.focus({ preventScroll: true });
      el.select?.();
    }
  }, []);

  useEffect(() => {
    if (shouldFocusCustomerAcRef.current) {
      shouldFocusCustomerAcRef.current = false;
      focusCustomerAc();
      const t = setTimeout(focusCustomerAc, 60);
      return () => clearTimeout(t);
    }
  });
  const [selectedProductInfo, setSelectedProductInfo] = useState<{
    profit?: number;
    purchaseRate: number;
    lastVendor?: string;
    totalStock?: number;
    previousPrice?: number;
    stock?: number;
    retailPrice?: number;
    wholesalePrice?: number;
    batchNumber?: string;
    expiryDate?: string;
  } | null>(null);
  const rowSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);
  const rowCommittedRef = useRef(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const rateTypeRef = useRef<HTMLInputElement>(null);
  const returnTypeRef = useRef<HTMLInputElement>(null);
  const refInvoiceNoRef = useRef<HTMLInputElement>(null);
  const imeiInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const stockCacheRef = useRef<Map<string, { stock: number; ts: number }>>(new Map());
  const STOCK_CACHE_TTL = 30_000; // 30 seconds
  const stockDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getStockCached = useCallback(async (productId: string): Promise<number> => {
    const cached = stockCacheRef.current.get(productId);
    if (cached && Date.now() - cached.ts < STOCK_CACHE_TTL) return cached.stock;
    try {
      if (companyId) {
        const stockRes = await stockApi.getProductStock(companyId, productId);
        const stock = stockRes.data.data?.stock ?? 0;
        stockCacheRef.current.set(productId, { stock, ts: Date.now() });
        return stock;
      }
    } catch { /* fallback */ }
    return cached?.stock ?? 0;
  }, [companyId]);

  const loadReturnIds = useCallback(async () => {
    try {
      if (!companyId || !financialYearId) return;
      const res = await salesApi.listSalesReturns(companyId, financialYearId);
      setReturnIds(res.data.data.map((r) => r._id));
    } catch {
      // ignore
    }
  }, [companyId, financialYearId]);

  useEffect(() => {
    loadReturnIds();
  }, [loadReturnIds]);

  const loadReturnForm = useCallback((data: any) => {
    setReturnId(data._id);
    setInvoiceNo(data.invoiceNo);
    setDate(data.date ? new Date(data.date).toISOString().slice(0, 10) : getCurrentDate());
    setReturnType((data.returnType || 'OnAccount') as 'OnAccount' | 'ByRef');
    setOriginalInvoiceIdForReturn(data.originalInvoiceId ?? null);
    setOriginalInvoiceNo(data.originalInvoiceNo ?? null);
    setCustomerId(data.customerId ?? null);
    setCustomerName(data.customerName ?? 'CASH');
    setCustomerAddress(data.customerAddress ?? '');
    setVatType((data.vatType as 'Vat' | 'NonVat') || 'Vat');
    setTaxMode((data.taxMode as 'inclusive' | 'exclusive') || 'exclusive');
    setOtherDiscount(data.otherDiscount ?? 0);
    setOtherCharges(data.otherCharges ?? 0);
    setRoundOff(data.roundOff ?? 0);
    setAutoRoundOff(false);
    setNarration(data.narration ?? '');
    if (data.cashAccountId) setCashAccountId(data.cashAccountId);

    const newLines: LineItem[] = (data.items || []).map((it: any, idx: number) => {
      const pid = typeof it.productId === 'object' && it.productId !== null ? it.productId._id : String(it.productId);
      const name = typeof it.productId === 'object' && it.productId.name ? it.productId.name : (it.description || '');
      const price = it.unitPrice ?? 0;
      const qty = it.quantity ?? 0;
      const disc = it.discount ?? 0;
      const gross = qty * price;
      const net = gross - disc;
      const vatRate = data.vatType === 'NonVat' ? 0 : 5;
      const vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
      const lineTotal = parseFloat((net + vatAmount).toFixed(2));
      const uname = it.unitName || 'Pcs';
      const uid = it.unitId || 'pcs';
      const product = products.find((p) => p._id === pid);
      const availableUnits: UnitOption[] = [];

      if (product && product.unitOfMeasureId) {
        const mainUnitId = typeof product.unitOfMeasureId === 'object' ? product.unitOfMeasureId._id : product.unitOfMeasureId;
        const mainUnitName = typeof product.unitOfMeasureId === 'object' ? (product.unitOfMeasureId.shortCode || product.unitOfMeasureId.name || 'Main') : 'Main';
        availableUnits.push({
          id: mainUnitId,
          name: mainUnitName,
          isMultiUnit: false,
          price: price,
        });
      } else {
        availableUnits.push({ id: uid, name: uname, isMultiUnit: false, price: price });
      }

      if (product && product.multiUnits && product.multiUnits.length > 0) {
        product.multiUnits.forEach((mu) => {
          const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
          const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
          if (muUnitId) {
            const muRetail = mu.retail ?? 0;
            const muWholesale = mu.wholesale ?? 0;
            const muSp1 = mu.specialPrice1 ?? 0;
            const muSp2 = mu.specialPrice2 ?? 0;
            let muPrice = 0;
            if (rateType === 'WSale') muPrice = muWholesale;
            else if (rateType === 'Special1') muPrice = muSp1;
            else if (rateType === 'Special2') muPrice = muSp2;
            else muPrice = muRetail;
            if (!muPrice) muPrice = muRetail || muWholesale || 0;
            availableUnits.push({
              id: muUnitId,
              name: muUnitName,
              isMultiUnit: true,
              conversion: mu.conversion,
              price: muPrice,
              wholesale: muWholesale,
              retail: muRetail,
              specialPrice1: muSp1,
              specialPrice2: muSp2,
            });
          }
        });
      }

      return {
        id: `loaded-${idx}-${Date.now()}`,
        productId: pid,
        productCode: it.productCode || '',
        imei: it.imei || '',
        name: name || '',
        unitId: uid,
        unitName: uname,
        availableUnits,
        quantity: qty,
        price,
        purchasePrice: it.costPriceAtSale ?? (it as any).purchasePrice ?? 0,
        gross,
        discPercent: gross > 0 ? (disc / gross) * 100 : 0,
        discAmount: disc,
        vatAmount,
        total: lineTotal,
        batchNumber: it.batchNumber || '',
        isCommitted: true,
      };
    });
    setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;

    if (data.originalInvoiceId && (data.returnType === 'ByRef' || data.originalInvoiceId) && companyId) {
      salesApi.getB2C(data.originalInvoiceId, companyId, undefined, data._id)
        .then((res) => {
          const resData = res.data?.data as any;
          if (resData?.items) {
            refInvoiceItemsRef.current = resData.items;
          }
        })
        .catch(() => {
          refInvoiceItemsRef.current = [];
        });
    } else {
      refInvoiceItemsRef.current = [];
    }
  }, [companyId]);

  const navigateToReturn = async (id: string) => {
    setLoading(true);
    try {
      const res = await salesApi.getSalesReturn(id, companyId!);
      if (res.data.data) {
        loadReturnForm(res.data.data);
      }
    } catch {
      setErrorDialogMessage('Failed to load sales return');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load sales return if navigated with returnId or invoiceId in location state
  useEffect(() => {
    const state = routeLocation.state as { returnId?: string; invoiceId?: string; id?: string } | null;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = state?.returnId || state?.invoiceId || state?.id || urlParams.get('id');
    if (targetId && companyId) {
      navigateToReturn(targetId);
      navigate(routeLocation.pathname, { replace: true, state: {} });
    }
  }, [companyId, routeLocation.pathname, routeLocation.state, navigate]);

  const handleFirstReturn = () => {
    if (returnIds.length > 0) navigateToReturn(returnIds[0]);
  };

  const handlePrevReturn = () => {
    if (!returnId || returnIds.length === 0) {
      if (returnIds.length > 0) navigateToReturn(returnIds[returnIds.length - 1]);
      return;
    }
    const currentIndex = returnIds.indexOf(returnId);
    if (currentIndex > 0) navigateToReturn(returnIds[currentIndex - 1]);
  };

  const handleNextReturn = () => {
    if (!returnId || returnIds.length === 0) {
      if (returnIds.length > 0) navigateToReturn(returnIds[0]);
      return;
    }
    const currentIndex = returnIds.indexOf(returnId);
    if (currentIndex < returnIds.length - 1) navigateToReturn(returnIds[currentIndex + 1]);
  };

  const handleLastReturn = () => {
    if (returnIds.length > 0) navigateToReturn(returnIds[returnIds.length - 1]);
  };

  const handleCustomerSelect = useCallback((customer: Customer | null) => {
    if (!customer) {
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setBillingAddress('');
      setBillingPhone('');
      setPaymentType('Cash');
      return;
    }
    const isCash = customer.type === 'Cash' || customer._id === 'cash';
    if (isCash) {
      setCustomerId(null);
      setCustomerName(customer.name);
      setCustomerAddress(customer.address || '');
      setBillingAddress(customer.address || '');
      setBillingPhone(customer.phone || '');
      setPaymentType('Cash');
      setCashAccountId(customer._id);
    } else {
      setCustomerId(customer._id);
      setCustomerName(customer.name);
      setCustomerAddress(customer.address || '');
      setBillingAddress(customer.address || '');
      setBillingPhone(customer.phone || '');
    }
  }, []);

  const handleHoldReturn = async () => {
    if (returnId) {
      setErrorDialogMessage('Cannot hold a saved return');
      setErrorDialogOpen(true);
      return;
    }
    const filledLines = lines.filter((l) => l.productId);
    if (filledLines.length === 0) {
      setErrorDialogMessage('Nothing to hold — add at least one product first');
      setErrorDialogOpen(true);
      return;
    }
    const held: HeldSalesReturn = {
      id: Date.now().toString(),
      heldAt: new Date().toLocaleString(),
      customerName,
      itemCount: filledLines.length,
      total: calculations.grandTotal,
      invoiceNo,
      date,
      taxMode,
      vatType,
      returnType,
      customerId,
      customerAddress,
      billingAddress,
      billingPhone,
      cashAccountId,
      lines,
      otherDiscPercent,
      otherDiscount,
      otherCharges,
      roundOff,
      autoRoundOff,
      narration,
      originalInvoiceIdForReturn,
      refInvoiceNoInput,
      refInvoiceData,
      paymentType,
      rateType,
    };
    const updated = [...heldReturns, held];
    setHeldReturns(updated);
    saveHeldReturns(updated);
    setSavedDialogMessage(`Return held (${filledLines.length} items)`);
    setSavedDialogOpen(true);
    handleClear();
  };

  const handleRestoreHeldReturn = (held: HeldSalesReturn) => {
    setReturnId(null);
    setInvoiceNo(held.invoiceNo);
    setDate(held.date);
    setTaxMode(held.taxMode);
    setVatType(held.vatType);
    setReturnType(held.returnType);
    setCustomerId(held.customerId);
    setCustomerName(held.customerName);
    setCustomerAddress(held.customerAddress);
    setBillingAddress(held.billingAddress);
    setBillingPhone(held.billingPhone);
    setCashAccountId(held.cashAccountId);
    setLines(held.lines.length > 0 ? held.lines : [emptyLine()]);
    setOtherDiscPercent(held.otherDiscPercent);
    setOtherDiscount(held.otherDiscount);
    setOtherCharges(held.otherCharges);
    setRoundOff(held.roundOff);
    setAutoRoundOff(held.autoRoundOff ?? false);
    setNarration(held.narration);
    setOriginalInvoiceIdForReturn(held.originalInvoiceIdForReturn);
    setRefInvoiceNoInput(held.refInvoiceNoInput);
    setRefInvoiceData(held.refInvoiceData);
    setPaymentType(held.paymentType);
    setRateType(held.rateType);

    if (held.refInvoiceData?.items) {
      refInvoiceItemsRef.current = held.refInvoiceData.items;
    } else if (held.originalInvoiceIdForReturn && companyId) {
      salesApi.getB2C(held.originalInvoiceIdForReturn, companyId)
        .then((res) => {
          const resData = res.data?.data as any;
          if (resData?.items) {
            refInvoiceItemsRef.current = resData.items;
          }
        })
        .catch(() => {
          refInvoiceItemsRef.current = [];
        });
    } else {
      refInvoiceItemsRef.current = [];
    }

    // Remove from held list
    const updated = heldReturns.filter((h) => h.id !== held.id);
    setHeldReturns(updated);
    saveHeldReturns(updated);
    setHoldListDialogOpen(false);
  };

  const handleDeleteHeldReturn = (heldId: string) => {
    const updated = heldReturns.filter((h) => h.id !== heldId);
    setHeldReturns(updated);
    saveHeldReturns(updated);
  };

  const itemNameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemNameSnapshotRef = useRef<{ lineId: string, data: LineItem } | null>(null);
  const itemNameListboxOpenRef = useRef(false);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discPercentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discAmountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Derive multi-unit info from current lines state
  const activeMultiUnitInfo = useMemo(() => {
    if (!activeLineId) return null;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line || !line.unitId) return null;
    const unit = line.availableUnits.find((u) => u.id === line.unitId);
    if (!unit?.isMultiUnit) return null;
    return {
      name: unit.name,
      pcsInside: unit.conversion,
      multiUnitPrice: unit.price,
      wholesale: unit.wholesale,
      retail: unit.retail,
      specialPrice1: unit.specialPrice1,
      specialPrice2: unit.specialPrice2,
    };
  }, [activeLineId, lines]);

  // Update product info when hovering over products
  const handleProductHighlight = useCallback((_e: React.SyntheticEvent, option: unknown) => {
    if (!option || typeof option === 'string') return;
    const product = option as ProductOption;

    const cachedEntry = stockCacheRef.current.get(product._id);
    const initialStock = cachedEntry?.stock ?? (product as any).stock ?? 0;

    setSelectedProductInfo({
      profit: 0,
      purchaseRate: product.purchasePrice ?? 0,
      lastVendor: (product as any).lastVendor ?? (product as any).lastSupplier ?? '-',
      totalStock: initialStock,
      previousPrice: (product as any).previousPrice ?? 0,
      retailPrice: product.retailPrice ?? 0,
      wholesalePrice: product.wholesalePrice ?? 0,
    });

    if (stockDebounceRef.current) clearTimeout(stockDebounceRef.current);
    stockDebounceRef.current = setTimeout(async () => {
      const actualStock = await getStockCached(product._id);
      setSelectedProductInfo((prev) => prev ? { ...prev, totalStock: actualStock } : null);
    }, 500);
  }, [getStockCached]);

  useEffect(() => {
    if (stockDebounceRef.current) clearTimeout(stockDebounceRef.current);
    if (!activeLineId) {
      setSelectedProductInfo(null);
      return;
    }
    if (itemNameListboxOpenRef.current) return;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line || !line.productId) {
      setSelectedProductInfo(null);
      return;
    }

    const product = products.find((p) => p._id === line.productId);

    // Calculate profit
    const unit = line.availableUnits.find((u) => u.id === line.unitId);
    const isMulti = unit?.isMultiUnit && unit?.conversion;
    const multiCost = isMulti ? line.purchasePrice * (unit!.conversion!) : line.purchasePrice;
    const profit = line.price - multiCost;

    // Show info immediately with cached stock, update async
    const cachedEntry = stockCacheRef.current.get(line.productId);
    const initialStock = cachedEntry?.stock ?? (product as any)?.stock ?? 0;

    setSelectedProductInfo({
      profit,
      purchaseRate: line.purchasePrice,
      lastVendor: product ? ((product as any).lastVendor ?? (product as any).lastSupplier ?? '-') : '-',
      totalStock: initialStock,
      previousPrice: product ? ((product as any).previousPrice ?? 0) : 0,
      retailPrice: product?.retailPrice ?? 0,
      wholesalePrice: product?.wholesalePrice ?? 0,
    });

    // Fetch actual stock in background
    stockDebounceRef.current = setTimeout(async () => {
      const actualStock = await getStockCached(line.productId);
      setSelectedProductInfo((prev) => prev ? { ...prev, totalStock: actualStock } : null);
    }, 500);

  }, [activeLineId, lines, products, getStockCached]);

  const numberInputStyle = {
    '& input[type=number]': { MozAppearance: 'textfield' as const },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
      WebkitAppearance: 'none' as const,
      margin: 0,
    },
  };

  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.select();
  };

  // By Ref: dialogs
  const [refInvoiceNoInput, setRefInvoiceNoInput] = useState('');
  const [refInvoiceLoading, setRefInvoiceLoading] = useState(false);
  const [refInvoiceError, setRefInvoiceError] = useState('');
  const [savedInvoices, setSavedInvoices] = useState<string[]>([]);
  const [_invoiceListOpen, _setInvoiceListOpen] = useState(false);
  const [refInvoiceData, setRefInvoiceData] = useState<{
    _id: string;
    invoiceNo: string;
    customerId?: string;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
    vatType?: string;
    items: RefInvoiceItem[];
    totalAmount: number;
  } | null>(null);
  const [originalInvoiceIdForReturn, setOriginalInvoiceIdForReturn] = useState<string | null>(null);
  const [selectItemsDialogOpen, setSelectItemsDialogOpen] = useState(false);
  const [selectedRefItemIds, setSelectedRefItemIds] = useState<Set<string>>(new Set());
  const refInvoiceItemsRef = useRef<RefInvoiceItem[]>([]);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [warningsList, setWarningsList] = useState<string[]>([]);
  // Batch dialog state (mirrors SalesB2C)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<{
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    purchasePrice: number;
    retail: number;
    wholesale: number;
    productId: string;
    productName: string;
  }[]>([]);
  const [pendingProductLineId, setPendingProductLineId] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<ProductOption | null>(null);
  const batchRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const [focusedBatchIndex, setFocusedBatchIndex] = useState(0);

  // Focus and scroll focused batch into view
  useEffect(() => {
    if (batchDialogOpen) {
      setFocusedBatchIndex(0);
      const focusFirst = () => {
        const row = batchRowRefs.current[0];
        if (row) {
          row.focus();
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
      focusFirst();
      const id1 = requestAnimationFrame(focusFirst);
      const t1 = setTimeout(focusFirst, 50);
      const t2 = setTimeout(focusFirst, 150);
      const t3 = setTimeout(focusFirst, 300);
      return () => {
        cancelAnimationFrame(id1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [batchDialogOpen]);

  useEffect(() => {
    if (batchDialogOpen && batchRowRefs.current[focusedBatchIndex]) {
      batchRowRefs.current[focusedBatchIndex]?.focus();
      batchRowRefs.current[focusedBatchIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [batchDialogOpen, focusedBatchIndex]);

  const loadNextInvoiceNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await salesApi.getNextReturnInvoiceNo(companyId, financialYearId);
      setInvoiceNo(res.data.data.invoiceNo);
    } catch {
      setInvoiceNo('SR-000001');
    }
  }, [companyId, financialYearId]);

  useEffect(() => {
    loadNextInvoiceNo();
  }, [loadNextInvoiceNo]);

  const loadCustomers = useCallback(() => {
    if (!companyId) return;
    const cashOption = { _id: 'cash', code: 'CASH', name: 'CASH IN HAND', address: '', type: 'Cash' };
    Promise.all([
      ledgerAccountApi.list(companyId, 'Customer'),
      ledgerAccountApi.list(companyId, 'Cash')
    ]).then(([custRes, cashRes]) => {
      const custList = (custRes.data.data ?? []) as Customer[];
      const cashList = (cashRes.data.data ?? []) as Customer[];
      let primaryCash = cashList.find((c) => /cash\s*in\s*hand/i.test(c.name || ''));
      if (!primaryCash) {
        primaryCash = cashList.find((c) => c.type === 'Cash') || cashList[0];
      }
      if (cashList.length === 0) {
        cashList.push(cashOption);
        primaryCash = cashOption;
      }
      const all = [...custList, ...cashList];
      const sorted = all.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
      setCustomers(sorted);

      if (!customerInitializedRef.current && !returnId) {
        customerInitializedRef.current = true;
        const defaultCash = primaryCash || cashList[0];
        if (defaultCash) {
          setCustomerId(null);
          setCustomerName(defaultCash.name);
          setCustomerAddress(defaultCash.address || '');
          setBillingAddress(defaultCash.address || '');
          setBillingPhone(defaultCash.phone || '');
          setPaymentType('Cash');
          setCashAccountId(defaultCash._id);
        }
      }
    }).catch(() => {
      setCustomers([cashOption]);
    });
  }, [companyId, returnId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Detect return from Customer Create page — read created ledger from state, set pending and reload customers
  const handledReturnFromCreateRef = useRef(false);
  useEffect(() => {
    const state = routeLocation.state as { createdLedgerName?: string } | null;
    if (routeLocation.pathname !== '/entry/sales-return' || !state?.createdLedgerName) {
      handledReturnFromCreateRef.current = false;
      return;
    }
    if (handledReturnFromCreateRef.current) return;
    handledReturnFromCreateRef.current = true;
    setPendingCustomerName(state.createdLedgerName);
    loadCustomers();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, loadCustomers, navigate]);

  // Once customers list is reloaded after creating a new customer, auto-select it by name
  useEffect(() => {
    if (!pendingCustomerName) return;
    const found = customers.find((c) => (c.name || '').toLowerCase() === pendingCustomerName.toLowerCase());
    if (found) {
      handleCustomerSelect(found);
      setPendingCustomerName(null);
      setTimeout(() => customerAcRef.current?.focus({ preventScroll: true }), 200);
    }
  }, [customers, pendingCustomerName, handleCustomerSelect]);

  useEffect(() => {
    if (!companyId) return;
    ledgerAccountApi.list(companyId, 'Cash').then((res) => {
      const list = (res.data.data ?? []) as { _id: string; name?: string }[];
      if (Array.isArray(list) && list.length > 0) {
        setCashAccountId(list[0]._id);
      }
    }).catch(() => { });
  }, [companyId]);

  // Load saved invoice numbers for ByRef selection
  useEffect(() => {
    if (!companyId || !financialYearId || returnType !== 'ByRef') return;
    (async () => {
      try {
        const res = await salesApi.listB2C(companyId, financialYearId, { limit: 500 });
        const invoices = (res.data.data?.invoices ?? []) as Array<{ invoiceNo?: string }>;
        const invoiceNos = invoices.map((inv) => inv.invoiceNo).filter(Boolean) as string[];
        setSavedInvoices(invoiceNos);
      } catch {
        setSavedInvoices([]);
      }
    })();
  }, [companyId, financialYearId, returnType]);

  const loadProducts = useCallback(() => {
    if (!companyId) return;
    productApi.list(companyId, { limit: 10000 }).then((res) => {
      const d = res.data?.data as { products?: ProductOption[] };
      const list = d?.products ?? [];
      setProducts(Array.isArray(list) ? list : []);
    }).catch(() => setProducts([]));
  }, [companyId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const onProductsUpdated = () => {
      loadProducts();
    };
    const onLedgersUpdated = () => {
      loadCustomers();
    };
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/entry/sales-return') {
        loadProducts();
        loadCustomers();
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
  }, [loadProducts, loadCustomers]);

  const fetchRefInvoice = useCallback(async () => {
    if (!companyId || !refInvoiceNoInput.trim()) {
      setRefInvoiceError('Enter sales invoice number');
      return;
    }
    setRefInvoiceError('');
    setRefInvoiceLoading(true);
    try {
      const res = await salesApi.searchB2CByInvoiceNo(companyId, refInvoiceNoInput.trim(), undefined, returnId || undefined);
      const data = res.data.data as typeof refInvoiceData;
      if (!data || !data.items?.length) {
        setRefInvoiceError('Invoice not found or has no items');
        return;
      }
      setRefInvoiceData(data);
      setRefInvoiceNoInput('');
      setSelectItemsDialogOpen(true);
      const eligibleItems = data.items.filter((i: any) => {
        const remaining = i.remainingReturnableQuantity !== undefined ? i.remainingReturnableQuantity : i.quantity;
        return remaining > 0;
      });
      setSelectedRefItemIds(new Set(eligibleItems.map((i: RefInvoiceItem) => i._id)));
    } catch (e: unknown) {
      setRefInvoiceError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Invoice not found');
    } finally {
      setRefInvoiceLoading(false);
    }
  }, [companyId, refInvoiceNoInput, returnId]);

  const confirmSelectRefItems = useCallback(() => {
    if (!refInvoiceData) return;
    const selected = refInvoiceData.items.filter((i) => selectedRefItemIds.has(i._id));
    if (selected.length === 0) {
      setErrorDialogMessage('Select at least one item');
      setErrorDialogOpen(true);
      return;
    }
    refInvoiceItemsRef.current = refInvoiceData.items;
    const newLines: LineItem[] = selected.map((it, idx) => {
      const pid = typeof it.productId === 'object' ? (it.productId as { _id: string })._id : String(it.productId);
      const name = typeof it.productId === 'object' && (it.productId as { name?: string }).name ? (it.productId as { name: string }).name : (it.description || '');
      const price = it.unitPrice ?? 0;
      const qty = (it as any).remainingReturnableQuantity !== undefined ? (it as any).remainingReturnableQuantity : (it.quantity ?? 0);
      const originalQty = it.quantity ?? 1;
      const disc = originalQty > 0 ? parseFloat((((it.discount ?? 0) * qty) / originalQty).toFixed(2)) : 0;
      const gross = qty * price;
      const net = gross - disc;
      const vatRate = refInvoiceData.vatType === 'NonVat' ? 0 : 5;
      const vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
      const lineTotal = parseFloat((net + vatAmount).toFixed(2));
      const uname = (it.unitName as string) || 'Pcs';
      const uid = (it as { unitId?: string }).unitId || 'pcs';

      const product = products.find((p) => p._id === pid);
      const availableUnits: UnitOption[] = [];

      if (product && product.unitOfMeasureId) {
        const mainUnitId = typeof product.unitOfMeasureId === 'object' ? product.unitOfMeasureId._id : product.unitOfMeasureId;
        const mainUnitName = typeof product.unitOfMeasureId === 'object' ? (product.unitOfMeasureId.shortCode || product.unitOfMeasureId.name || 'Main') : 'Main';
        availableUnits.push({
          id: mainUnitId,
          name: mainUnitName,
          isMultiUnit: false,
          price: price,
        });
      } else {
        availableUnits.push({ id: uid, name: uname, isMultiUnit: false, price: price });
      }

      if (product && product.multiUnits && product.multiUnits.length > 0) {
        product.multiUnits.forEach((mu) => {
          const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
          const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
          if (muUnitId) {
            const muRetail = mu.retail ?? 0;
            const muWholesale = mu.wholesale ?? 0;
            const muSp1 = mu.specialPrice1 ?? 0;
            const muSp2 = mu.specialPrice2 ?? 0;
            let muPrice = 0;
            if (rateType === 'WSale') muPrice = muWholesale;
            else if (rateType === 'Special1') muPrice = muSp1;
            else if (rateType === 'Special2') muPrice = muSp2;
            else muPrice = muRetail;
            if (!muPrice) muPrice = muRetail || muWholesale || 0;
            availableUnits.push({
              id: muUnitId,
              name: muUnitName,
              isMultiUnit: true,
              conversion: mu.conversion,
              price: muPrice,
              wholesale: muWholesale,
              retail: muRetail,
              specialPrice1: muSp1,
              specialPrice2: muSp2,
              multiUnitId: mu.multiUnitId,
            });
          }
        });
      }

      // Derive the effective unit from availableUnits so the dropdown matches
      const effectiveSelectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
      const effectiveUid = effectiveSelectedUnit?.id || uid;
      const effectiveUname = effectiveSelectedUnit?.name || uname;
      const effectiveMultiUnitId = effectiveSelectedUnit?.isMultiUnit ? effectiveSelectedUnit.multiUnitId : undefined;

      return {
        id: `ref-${idx}-${Date.now()}`,
        productId: pid,
        productCode: (it.productCode as string) || '',
        imei: (it.imei as string) || '',
        name: name || '',
        unitId: effectiveUid,
        unitName: effectiveUname,
        availableUnits,
        quantity: qty,
        price,
        purchasePrice: (it as any).costPriceAtSale ?? (it as any).purchasePrice ?? 0,
        gross,
        discPercent: 0,
        discAmount: disc,
        vatAmount,
        total: lineTotal,
        batchNumber: it.batchNumber || '',
        isCommitted: true,
        multiUnitId: (it as any).multiUnitId || effectiveMultiUnitId,
      };
    });
    setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    setCustomerId(refInvoiceData.customerId ?? null);
    setCustomerName(refInvoiceData.customerName ?? '');
    setCustomerAddress(refInvoiceData.customerAddress ?? '');
    setVatType((refInvoiceData.vatType as 'Vat' | 'NonVat') || 'Vat');
    setOriginalInvoiceIdForReturn(refInvoiceData._id);
    setOriginalInvoiceNo(refInvoiceData.invoiceNo);
    setSelectItemsDialogOpen(false);
    setRefInvoiceData(null);
  }, [refInvoiceData, selectedRefItemIds]);

  const updateLine = useCallback((id: string, field: keyof LineItem, value: unknown) => {
    let quantityCapped = false;
    let maxAllowed = 0;
    let orig = 0;
    let prevRet = 0;
    let prodName = '';

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        let updated = { ...line, [field]: value };

        if (returnType === 'ByRef' && field === 'quantity') {
          const matchingItems = refInvoiceItemsRef.current.filter(x => {
            const xPid = typeof x.productId === 'object' ? x.productId._id : String(x.productId);
            return xPid === line.productId && ((line.batchNumber && x.batchNumber) ? x.batchNumber === line.batchNumber : true);
          });
          
          if (matchingItems.length > 0) {
            const originalQty = matchingItems.reduce((sum, x) => sum + x.quantity, 0);
            const alreadyReturned = matchingItems.reduce((sum, x) => sum + ((x as any).returnedQuantity || 0), 0);
            const totalRemaining = Math.max(0, originalQty - alreadyReturned);

            const otherQtyInForm = prev
              .filter(x => x.id !== line.id && x.productId === line.productId && ((line.batchNumber && x.batchNumber) ? x.batchNumber === line.batchNumber : true))
              .reduce((sum, x) => sum + Number(x.quantity || 0), 0);

            const remainingForThisLine = Math.max(0, totalRemaining - otherQtyInForm);

            if (Number(value) > remainingForThisLine) {
              updated.quantity = remainingForThisLine;
              quantityCapped = true;
              maxAllowed = remainingForThisLine;
              orig = originalQty;
              prevRet = alreadyReturned;
              prodName = line.name;
            }
          }
        }

        if (['quantity', 'price', 'discPercent', 'discAmount'].includes(field)) {
          const gross = updated.quantity * updated.price;
          const disc = field === 'discPercent' ? (gross * (Number(updated.discPercent) / 100)) : Number(updated.discAmount);
          updated.discAmount = disc;
          updated.discPercent = gross > 0 ? (disc / gross) * 100 : 0;
          updated.gross = gross;
          const net = gross - disc;
          const vatRate = vatType === 'NonVat' ? 0 : 5;
          updated.vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
          updated.total = parseFloat((net + updated.vatAmount).toFixed(2));
        }
        return updated;
      })
    );

    if (quantityCapped) {
      const lineIndex = lines.findIndex((l) => l.id === id);
      const slNo = lineIndex >= 0 ? lineIndex + 1 : 1;
      setErrorDialogMessage(`Sl No ${slNo}: Quantity for "${prodName}" capped to maximum returnable quantity of ${maxAllowed} (purchased: ${orig}, already returned: ${prevRet}).`);
      setErrorDialogOpen(true);
    }
  }, [vatType, returnType, lines]);

  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
      if (snapshot.lineId) {
        setEditingNumericCell((prev) => prev && prev.lineId === snapshot.lineId ? null : prev);
      }
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  const handleItemNameFocus = useCallback((line: LineItem) => {
    itemNameSnapshotRef.current = { lineId: line.id, data: { ...line } };
  }, []);

  const handleItemNameBlur = useCallback((line: LineItem) => {
    const snap = itemNameSnapshotRef.current;
    if (snap && snap.lineId === line.id && snap.data.productId && !line.productId && snap.data.isCommitted) {
      setLines((prev) =>
        prev.map((l) => (l.id === line.id ? { ...l, ...snap.data } : l))
      );
    }
    itemNameSnapshotRef.current = null;
  }, []);

  const enterRow = useCallback((line: LineItem) => {
    if (rowSnapshotRef.current && rowSnapshotRef.current.lineId === line.id) return;
    revertUncommittedRow();
    if (line.isCommitted) {
      rowSnapshotRef.current = {
        lineId: line.id,
        data: { ...line, availableUnits: [...line.availableUnits] },
      };
      rowCommittedRef.current = false;
    }
  }, [revertUncommittedRow]);

  const removeLine = useCallback((id: string) => {
    if (rowSnapshotRef.current?.lineId === id) {
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.length > 0 ? filtered : [emptyLine()];
    });
  }, []);



  const getBatchesForProduct = useCallback(async (productId: string) => {
    try {
      if (!companyId) return [];
      const res = await purchaseApi.getProductBatches(companyId, productId);
      return res.data.data || [];
    } catch {
      return [];
    }
  }, [companyId]);

  const applyProductToLine = useCallback((lineId: string, product: ProductOption, selectedBatch?: { batchNumber: string; retail: number; wholesale: number; purchasePrice: number }) => {
    let price = 0;
    if (rateType === 'Retail') {
      price = selectedBatch?.retail ?? (product as any).retailPrice ?? (product as any).retail ?? product.purchasePrice ?? 0;
    } else if (rateType === 'WSale') {
      price = selectedBatch?.wholesale ?? (product as any).wholesalePrice ?? (product as any).wholesale ?? product.purchasePrice ?? 0;
    } else if (rateType === 'Special1') {
      price = (product as any).specialPrice1 ?? product.purchasePrice ?? 0;
    } else if (rateType === 'Special2') {
      price = (product as any).specialPrice2 ?? product.purchasePrice ?? 0;
    } else {
      price = selectedBatch?.wholesale ?? (product as any).wholesalePrice ?? (product as any).wholesale ?? product.purchasePrice ?? 0;
    }
    const uid = product.unitId ?? 'pcs';
    const uname = product.unitName ?? 'Pcs';

    const availableUnits: UnitOption[] = [];

    if (product.unitOfMeasureId) {
      const mainUnitId = typeof product.unitOfMeasureId === 'object' ? product.unitOfMeasureId._id : product.unitOfMeasureId;
      const mainUnitName = typeof product.unitOfMeasureId === 'object' ? (product.unitOfMeasureId.shortCode || product.unitOfMeasureId.name || 'Main') : 'Main';
      availableUnits.push({
        id: mainUnitId,
        name: mainUnitName,
        isMultiUnit: false,
        price: price,
      });
    } else {
      availableUnits.push({
        id: uid,
        name: uname,
        isMultiUnit: false,
        price: price,
      });
    }

    if (product.multiUnits && product.multiUnits.length > 0) {
      product.multiUnits.forEach((mu) => {
        const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
        const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
        if (muUnitId) {
          const muRetail = mu.retail ?? 0;
          const muWholesale = mu.wholesale ?? 0;
          const muSp1 = mu.specialPrice1 ?? 0;
          const muSp2 = mu.specialPrice2 ?? 0;
          let muPrice = 0;
          if (rateType === 'WSale') muPrice = muWholesale;
          else if (rateType === 'Special1') muPrice = muSp1;
          else if (rateType === 'Special2') muPrice = muSp2;
          else muPrice = muRetail;
          if (!muPrice) muPrice = muRetail || muWholesale || 0;
          availableUnits.push({
            id: muUnitId,
            name: muUnitName,
            isMultiUnit: true,
            conversion: mu.conversion,
            price: muPrice,
            wholesale: muWholesale,
            retail: muRetail,
            specialPrice1: muSp1,
            specialPrice2: muSp2,
            multiUnitId: mu.multiUnitId,
          });
        }
      });
    }

    if (!rowSnapshotRef.current) {
      rowCommittedRef.current = true;
    }

    const selectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
    const effectiveUid = selectedUnit?.id || uid;
    const effectiveUname = selectedUnit?.name || uname;
    const effectivePrice = parseFloat((selectedUnit?.price ?? price).toFixed(2));
    const purchaseRate = selectedBatch?.purchasePrice ?? (product.purchasePrice ?? 0);

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const qty = line.quantity || 1;
        const gross = qty * effectivePrice;
        const disc = line.discAmount;
        const net = gross - disc;
        const vatRate = vatType === 'NonVat' ? 0 : 5;
        const vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
        const total = parseFloat((net + vatAmount).toFixed(2));
        return {
          ...line,
          productId: product._id,
          productCode: product.code ?? '',
          name: product.name ?? '',
          imei: product.imei ?? '',
          unitId: effectiveUid,
          unitName: effectiveUname,
          availableUnits,
          batchNumber: selectedBatch?.batchNumber || '',
          quantity: qty,
          price: effectivePrice,
          purchasePrice: purchaseRate,
          gross,
          vatAmount,
          total,
          multiUnitId: selectedUnit?.isMultiUnit ? selectedUnit.multiUnitId : undefined,
        };
      })
    );
  }, [vatType, rateType]);

  const handleProductSelect = useCallback(async (lineId: string, product: ProductOption) => {
    const batches = await getBatchesForProduct(product._id);
    const batchEnabled = (product as any).allowBatches !== false;
    if (batchEnabled && batches.length > 1) {
      // Multiple batches — show batch picker
      setAvailableBatches(batches);
      setPendingProductLineId(lineId);
      setPendingProduct(product);
      setFocusedBatchIndex(0);
      setBatchDialogOpen(true);
    } else {
      // No batches or single batch — apply directly
      const singleBatch = batchEnabled && batches.length === 1 ? batches[0] : undefined;
      applyProductToLine(lineId, product, singleBatch);
    }
  }, [getBatchesForProduct, applyProductToLine]);

  const handleBatchSelect = useCallback((batch: typeof availableBatches[0]) => {
    if (pendingProductLineId && pendingProduct) {
      applyProductToLine(pendingProductLineId, pendingProduct, batch);
    }
    setBatchDialogOpen(false);
    setPendingProductLineId(null);
    setPendingProduct(null);
  }, [pendingProductLineId, pendingProduct, applyProductToLine]);

  const handleBatchDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!batchDialogOpen || availableBatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedBatchIndex((prev) => {
        const next = prev < availableBatches.length - 1 ? prev + 1 : prev;
        setTimeout(() => batchRowRefs.current[next]?.focus(), 10);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedBatchIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        setTimeout(() => batchRowRefs.current[next]?.focus(), 10);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (availableBatches[focusedBatchIndex]) handleBatchSelect(availableBatches[focusedBatchIndex]);
    } else if (e.key === 'Escape') {
      setBatchDialogOpen(false);
    }
  }, [batchDialogOpen, availableBatches, focusedBatchIndex, handleBatchSelect]);

  const handleUnitChange = useCallback((lineId: string, unitId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const selectedUnit = line.availableUnits.find((x) => x.id === unitId);
        if (!selectedUnit) return line;

        // Pick price based on selected unit
        let newPrice = selectedUnit.price ?? line.price;
        if (selectedUnit.isMultiUnit) {
          if (rateType === 'WSale' && selectedUnit.wholesale) newPrice = selectedUnit.wholesale;
          else if (rateType === 'Special1' && selectedUnit.specialPrice1) newPrice = selectedUnit.specialPrice1;
          else if (rateType === 'Special2' && selectedUnit.specialPrice2) newPrice = selectedUnit.specialPrice2;
          else if (rateType === 'Retail' && selectedUnit.retail) newPrice = selectedUnit.retail;
        }
        newPrice = parseFloat(newPrice.toFixed(2));

        const qty = line.quantity || 1;
        const gross = qty * newPrice;
        const disc = line.discAmount;
        const net = gross - disc;
        const vatRate = vatType === 'NonVat' ? 0 : 5;
        const vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
        const total = parseFloat((net + vatAmount).toFixed(2));

        return {
          ...line,
          unitId,
          unitName: selectedUnit.name,
          price: newPrice,
          gross,
          vatAmount,
          total,
          multiUnitId: selectedUnit.isMultiUnit ? selectedUnit.multiUnitId : undefined,
        };
      })
    );
  }, [vatType, rateType]);

  const handleUnitKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = lines.find((l) => l.id === lineId);
      if (line) setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
    }
  }, [lines]);

  const handleOtherDiscPercentChange = useCallback((pct: number) => {
    setOtherDiscPercent(pct);
    const itemsTotal = lines.reduce((s, l) => s + l.total, 0);
    setOtherDiscount(parseFloat((itemsTotal * (pct / 100)).toFixed(2)));
  }, [lines]);

  // Enter key flow: move focus to next field (same as Sales B2C)
  const handleImeiKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setTimeout(() => itemNameInputRefs.current[line.id]?.focus(), 50);
    }
  }, []);
  const handleItemNameKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      // When list is open and typed value is a prefix of some product, let Autocomplete handle Enter (arrow+Enter to select)
      if (itemNameListboxOpenRef.current && line.name.trim()) {
        const typed = line.name.trim().toLowerCase();
        const isPrefixOfAny = products.some((p) => (p.name && String(p.name).trim().toLowerCase().startsWith(typed)));
        if (isPrefixOfAny) return;
      }

      // If item has a valid product selected, move to Unit or Qty field
      if (line.productId) {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          qtyInputRefs.current[line.id]?.focus();
          qtyInputRefs.current[line.id]?.select();
        }, 50);
        return;
      }

      // No product selected - check if blank (move to next) or typed (try to match)
      if (!line.name.trim()) {
        const currentIndex = lines.findIndex((l) => l.id === line.id);
        if (currentIndex === lines.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => narrationRef.current?.focus(), 50);
          return;
        }
      }
    }
  }, [products, lines]);
  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentIndex = lines.findIndex((l) => l.id === line.id);
      const isLastRow = currentIndex === lines.length - 1;

      const inputVal = qtyInputRefs.current[line.id]?.value;
      const currentQty = (inputVal !== undefined && inputVal !== '') ? (parseFloat(inputVal) || 0) : line.quantity;

      const isBlank = !line.productId || currentQty <= 0 || line.price <= 0;
      if (isLastRow && isBlank) {
        setTimeout(() => narrationRef.current?.focus(), 50);
        return;
      }

      setTimeout(() => {
        priceInputRefs.current[line.id]?.focus();
        priceInputRefs.current[line.id]?.select();
      }, 50);
    }
  }, [lines]);
  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (!line.productCode || !line.name || line.quantity <= 0 || line.price <= 0) {
        const idx = lines.findIndex((l) => l.id === line.id);
        const isLastRow = idx === lines.length - 1;
        const isBlank = !line.productId || line.quantity <= 0 || line.price <= 0;

        if (isLastRow && isBlank) {
          setTimeout(() => narrationRef.current?.focus(), 50);
          return;
        }

        if (!line.productId || !line.name) {
          setTimeout(() => itemNameInputRefs.current[line.id]?.focus(), 50);
        } else if (line.quantity <= 0) {
          setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
        } else if (line.price <= 0) {
          setTimeout(() => priceInputRefs.current[line.id]?.focus(), 50);
        }
        return;
      }

      rowCommittedRef.current = true;
      rowSnapshotRef.current = null;
      updateLine(line.id, 'isCommitted', true);

      const currentIndex = lines.findIndex((l) => l.id === line.id);
      if (currentIndex >= 0 && currentIndex < lines.length - 1) {
        const nextLine = lines[currentIndex + 1];
        enterRow(nextLine);
        setActiveLineId(nextLine.id);
        setTimeout(() => {
          const nextInput = itemNameInputRefs.current[nextLine.id];
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
        return;
      }

      const newLine = emptyLine();
      setLines((prev) => [...prev, newLine]);
      setTimeout(() => {
        const itemNameInput = itemNameInputRefs.current[newLine.id];
        if (itemNameInput) {
          itemNameInput.focus();
        }
      }, 100);
    }
  }, [lines, enterRow]);
  const handleDiscPercentKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setTimeout(() => discAmountInputRefs.current[line.id]?.focus(), 50);
    }
  }, []);
  const handleDiscAmountKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentIndex = lines.findIndex((l) => l.id === line.id);
      if (currentIndex >= 0 && currentIndex < lines.length - 1) {
        const nextLine = lines[currentIndex + 1];
        enterRow(nextLine);
        setActiveLineId(nextLine.id);
        setTimeout(() => {
          const nextInput = itemNameInputRefs.current[nextLine.id];
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
      } else {
        setTimeout(() => narrationRef.current?.focus(), 50);
      }
    }
  }, [lines, enterRow]);

  const calculations = {
    subTotal: lines.reduce((s, l) => s + l.total, 0),
    totalVat: lines.reduce((s, l) => s + l.vatAmount, 0),
    otherDiscount: Number(otherDiscount) || 0,
    otherCharges: Number(otherCharges) || 0,
    roundOff: Number(roundOff) || 0,
    grandTotal: 0,
  };
  calculations.grandTotal = calculations.subTotal - calculations.otherDiscount + calculations.otherCharges + calculations.roundOff;

  // Auto round-off toggle handler
  const handleAutoRoundOffToggle = useCallback((checked: boolean) => {
    setAutoRoundOff(checked);
    if (checked) {
      const baseTotal = calculations.subTotal - (Number(otherDiscount) || 0) + (Number(otherCharges) || 0);
      const rounded = Math.round(baseTotal);
      const diff = parseFloat((rounded - baseTotal).toFixed(2));
      setRoundOff(diff);
    } else {
      setRoundOff(0);
    }
  }, [calculations.subTotal, otherDiscount, otherCharges]);

  // Keep roundOff in sync when autoRoundOff is active and totals change
  useEffect(() => {
    if (!autoRoundOff) return;
    const baseTotal = calculations.subTotal - (Number(otherDiscount) || 0) + (Number(otherCharges) || 0);
    const rounded = Math.round(baseTotal);
    const diff = parseFloat((rounded - baseTotal).toFixed(2));
    if (diff !== roundOff) {
      setRoundOff(diff);
    }
  }, [autoRoundOff, calculations.subTotal, otherDiscount, otherCharges, roundOff]);

  const handlePreSaveCheck = useCallback(async () => {
    const validLines = lines.filter((l) => l.productId && l.quantity > 0 && l.price >= 0);
    if (validLines.length === 0) {
      setErrorDialogMessage('Add at least one item with quantity and price');
      setErrorDialogOpen(true);
      return;
    }
    if (!companyId || !financialYearId) {
      setErrorDialogMessage('Company / Financial year not set');
      setErrorDialogOpen(true);
      return;
    }

    setLoading(true);
    const warnings: string[] = [];

    try {
      if (returnType === 'ByRef') {
        const checkedProducts = new Set<string>();
        const hardErrors: string[] = [];
        for (const l of validLines) {
          const key = `${l.productId}-${l.batchNumber || ''}`;
          if (checkedProducts.has(key)) continue;
          checkedProducts.add(key);

          const returnedQty = validLines
            .filter((x) => x.productId === l.productId && ((l.batchNumber && x.batchNumber) ? x.batchNumber === l.batchNumber : true))
            .reduce((sum, x) => sum + x.quantity, 0);

          const matchingItems = refInvoiceItemsRef.current.filter((x) => {
            const xPid = typeof x.productId === 'object' ? x.productId._id : String(x.productId);
            const matchPid = xPid === l.productId;
            const matchBatch = (l.batchNumber && x.batchNumber) ? (x.batchNumber === l.batchNumber) : true;
            return matchPid && matchBatch;
          });

          if (matchingItems.length === 0) {
            const lineIndex = lines.findIndex((line) => line.id === l.id);
            const slNo = lineIndex >= 0 ? lineIndex + 1 : '';
            const prefix = slNo ? `Sl No ${slNo}: ` : '';
            hardErrors.push(
              `${prefix}"${l.name}"${l.batchNumber ? ` (Batch: ${l.batchNumber})` : ''}: This item was not purchased in the original invoice.`
            );
            continue;
          }

          const originalQty = matchingItems.reduce((sum, x) => sum + x.quantity, 0);
          const alreadyReturned = matchingItems.reduce((sum, x) => sum + ((x as any).returnedQuantity || 0), 0);
          const remaining = Math.max(0, originalQty - alreadyReturned);

          if (returnedQty > remaining) {
            const lineIndex = lines.findIndex((line) => line.id === l.id);
            const slNo = lineIndex >= 0 ? lineIndex + 1 : '';
            const prefix = slNo ? `Sl No ${slNo}: ` : '';
            hardErrors.push(
              `${prefix}"${l.name}"${l.batchNumber ? ` (Batch: ${l.batchNumber})` : ''}: Returning ${returnedQty} units, but only ${remaining} units are returnable (purchased: ${originalQty}, already returned: ${alreadyReturned}).`
            );
          }
        }

        if (hardErrors.length > 0) {
          setErrorDialogMessage(hardErrors.join('\n'));
          setErrorDialogOpen(true);
          setLoading(false);
          return;
        }
      } else if (returnType === 'OnAccount' && customerId) {
        // Group return quantities by productId (aggregate across all batches)
        const returnQtyByProduct = new Map<string, number>();
        for (const l of validLines) {
          const prev = returnQtyByProduct.get(l.productId) || 0;
          returnQtyByProduct.set(l.productId, prev + l.quantity);
        }

        // Get unique product IDs to check
        const uniqueProductIds = Array.from(returnQtyByProduct.keys());
        // Map productId to a display name from the first matching line
        const productNameMap = new Map<string, string>();
        for (const l of validLines) {
          if (!productNameMap.has(l.productId)) {
            productNameMap.set(l.productId, l.name);
          }
        }

        await Promise.all(
          uniqueProductIds.map(async (productId) => {
            try {
              const res = await salesApi.getProductCustomerHistory(companyId, productId, customerId || cashAccountId || undefined);
              const { totalPurchased, totalReturned, netReturnable } = res.data.data;
              const returnedQty = returnQtyByProduct.get(productId) || 0;
              const productName = productNameMap.get(productId) || 'Unknown';

              const isCashTx = !customerId && cashAccountId;
              if (returnedQty > netReturnable) {
                if (totalPurchased === 0) {
                  warnings.push(
                    isCashTx
                      ? `"${productName}": Returning ${returnedQty} units, but there is no cash purchase history for this product.`
                      : `"${productName}": Returning ${returnedQty} units, but the customer has no purchase history for this product.`
                  );
                } else {
                  warnings.push(
                    isCashTx
                      ? `"${productName}": Returning ${returnedQty} units, but only ${netReturnable} units are returnable in cash transactions (purchased: ${totalPurchased}, already returned: ${totalReturned}).`
                      : `"${productName}": Returning ${returnedQty} units, but the customer can only return ${netReturnable} units (purchased: ${totalPurchased}, already returned: ${totalReturned}).`
                  );
                }
              }
            } catch {
              // ignore
            }
          })
        );
      }

      if (warnings.length > 0) {
        setWarningsList(warnings);
        setWarningDialogOpen(true);
      } else {
        if (returnId) {
          setEditConfirmOpen(true);
        } else {
          setSaveDialogOpen(true);
        }
      }
    } catch {
      if (returnId) {
        setEditConfirmOpen(true);
      } else {
        setSaveDialogOpen(true);
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, financialYearId, returnType, customerId, cashAccountId, lines, returnId]);

  const handleSave = useCallback(async () => {
    if (returnType === 'ByRef' && !originalInvoiceIdForReturn) {
      setErrorDialogMessage('By Ref: please select items from a sales invoice first (Enter Sales Invoice No).');
      setErrorDialogOpen(true);
      return;
    }
    const validLines = lines.filter((l) => l.productId && l.quantity > 0 && l.price >= 0);
    if (validLines.length === 0) {
      setErrorDialogMessage('Add at least one item with quantity and price');
      setErrorDialogOpen(true);
      return;
    }
    if (!companyId || !financialYearId) {
      setErrorDialogMessage('Company / Financial year not set');
      setErrorDialogOpen(true);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        companyId,
        financialYearId,
        date,
        returnType,
        originalInvoiceId: returnType === 'ByRef' ? originalInvoiceIdForReturn ?? undefined : undefined,
        customerId: customerId || undefined,
        customerName: customerName || 'Walk-in',
        customerAddress: customerAddress || undefined,
        cashAccountId: !customerId ? (cashAccountId || undefined) : undefined,
        vatType,
        taxMode,
        items: validLines.map((l) => ({
          productId: l.productId,
          productCode: l.productCode,
          imei: l.imei || undefined,
          description: l.name,
          quantity: l.quantity,
          unitPrice: l.price,
          discount: l.discAmount,
          discountPercent: l.discPercent,
          unitId: l.unitId || undefined,
          unitName: l.unitName || undefined,
          multiUnitId: l.multiUnitId || undefined,
          batchNumber: l.batchNumber || undefined,
        })),
        otherDiscount: calculations.otherDiscount,
        otherCharges: calculations.otherCharges,
        roundOff: calculations.roundOff,
        narration: narration || undefined,
      };
      const res = returnId
        ? await salesApi.updateSalesReturn(returnId, payload)
        : await salesApi.createSalesReturn(payload);
      setSaveDialogOpen(false);
      setEditConfirmOpen(false);
      setSavedDialogMessage(`Sales Return ${res.data.data.invoiceNo} ${returnId ? 'updated' : 'saved'} successfully.`);
      setSavedDialogOpen(true);
      loadReturnIds();
      setLines([emptyLine()]);
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setNarration('');
      setOtherDiscount(0);
      setOtherCharges(0);
      setRoundOff(0);
      setAutoRoundOff(false);
      setOriginalInvoiceIdForReturn(null);
      setOriginalInvoiceNo(null);
      loadNextInvoiceNo();
    } catch (e: unknown) {
      setErrorDialogMessage((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Save failed');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [companyId, financialYearId, date, returnType, originalInvoiceIdForReturn, customerId, customerName, customerAddress, cashAccountId, vatType, taxMode, lines, otherDiscount, otherCharges, roundOff, narration, calculations, loadNextInvoiceNo, returnId]);

  const handleClear = useCallback(() => {
    setLines([emptyLine()]);
    setCustomerId(null);
    customerInitializedRef.current = true;
    setCustomerName('CASH IN HAND');
    setCustomerAddress('');
    setBillingAddress('');
    setBillingPhone('');
    setReturnId(null);
    setNarration('');
    setOtherDiscPercent(0);
    setOtherDiscount(0);
    setOtherCharges(0);
    setRoundOff(0);
    setAutoRoundOff(false);
    setRefInvoiceData(null);
    setOriginalInvoiceIdForReturn(null);
    setOriginalInvoiceNo(null);
    loadNextInvoiceNo();
    shouldFocusCustomerAcRef.current = true;
    focusCustomerAc();
    setTimeout(focusCustomerAc, 50);
    setTimeout(focusCustomerAc, 150);
    setTimeout(focusCustomerAc, 300);
  }, [loadNextInvoiceNo, focusCustomerAc]);

  const handleSearch = useCallback(async () => {
    if (!companyId || !searchInvoiceNo.trim()) {
      setSearchError('Enter return invoice number');
      return;
    }
    setSearchError('');
    setSearchLoading(true);
    try {
      const res = await salesApi.searchSalesReturn(companyId, searchInvoiceNo.trim());
      loadReturnForm(res.data.data);
      setSearchDialogOpen(false);
      setSearchInvoiceNo('');
    } catch {
      setSearchError('Sales return not found');
    } finally {
      setSearchLoading(false);
    }
  }, [companyId, searchInvoiceNo]);

  const handleDelete = useCallback(async () => {
    if (!returnId || !companyId) return;
    setLoading(true);
    try {
      await salesApi.deleteSalesReturn(returnId, companyId);
      setDeleteDialogOpen(false);
      setSavedDialogMessage('Sales return deleted successfully.');
      setSavedDialogOpen(true);
      loadReturnIds();
      handleClear();
    } catch (e: unknown) {
      setErrorDialogMessage((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Delete failed');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [returnId, companyId, handleClear]);

  const toggleRefItem = (itemId: string) => {
    const item = refInvoiceData?.items.find((i) => i._id === itemId);
    const remainingQty = item ? ((item as any).remainingReturnableQuantity !== undefined ? (item as any).remainingReturnableQuantity : item.quantity) : 0;
    if (remainingQty <= 0) return;
    setSelectedRefItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };
  const selectAllRefItems = (checked: boolean) => {
    if (!refInvoiceData) return;
    if (checked) {
      const eligibleIds = refInvoiceData.items
        .filter((i) => {
          const remainingQty = (i as any).remainingReturnableQuantity !== undefined ? (i as any).remainingReturnableQuantity : i.quantity;
          return remainingQty > 0;
        })
        .map((i) => i._id);
      setSelectedRefItemIds(new Set(eligibleIds));
    } else {
      setSelectedRefItemIds(new Set());
    }
  };

  const selectedRefTotal = refInvoiceData
    ? refInvoiceData.items.filter((i) => selectedRefItemIds.has(i._id)).reduce((s, i) => s + (i.totalAmount ?? 0), 0)
    : 0;

  return (
    <Box sx={{ p: 1.25, minHeight: '100%', bgcolor: '#f1f5f9' }} onClick={() => dispatch(setDrawerOpen(false))}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f766e', mb: 1, fontSize: '0.95rem' }}>
        Sales Return
      </Typography>

      {/* Header - B2C style */}
      <Paper elevation={0} sx={{ px: 1.25, py: 0.8, mb: 0.7, borderRadius: 1.5, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
            <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.2, px: 1, py: 0.35, textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.58rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>RETURN NO</Typography>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.2 }}>{invoiceNo}</Typography>
            </Box>
          </Grid>
          {returnType === 'ByRef' && originalInvoiceNo && (
            <Grid item xs={6} sm={3} md={2.2} lg={1.8}>
              <Box sx={{ bgcolor: '#0284c7', borderRadius: 1.2, px: 1, py: 0.35, textAlign: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.58rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>AGAINST INVOICE</Typography>
                <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.2 }}>{originalInvoiceNo}</Typography>
              </Box>
            </Grid>
          )}
          <Grid item xs={6} sm={3} md={2} lg={1.7}>
            <DateInput
              label="Date"
              value={date}
              onChange={setDate}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': { height: 28, borderRadius: 1.2, fontSize: '0.72rem' },
                '& .MuiInputBase-input': { py: '2px !important', fontSize: '0.72rem' },
                '& .MuiInputLabel-root': { fontSize: '0.70rem' },
              }}
            />
          </Grid>
          <Grid item xs={7.5} sm={4.6875} md={3.90625} lg={3.4375}>
            <Autocomplete
              size="small"
              options={customers}
              disabled={returnType === 'ByRef' && !!originalInvoiceIdForReturn}
              getOptionLabel={(opt) => opt.name || ''}
              filterOptions={(options, state) => {
                const q = (state.inputValue || '').trim().toLowerCase();
                const name = (c: Customer) => (c.name || '').toLowerCase();
                const sortByName = (arr: Customer[]) => arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
                if (!q) return options;
                const startsWith = options.filter((c) => name(c).startsWith(q));
                const containsOnly = options.filter((c) => name(c).includes(q) && !name(c).startsWith(q));
                return [...sortByName(startsWith), ...sortByName(containsOnly)];
              }}
              value={customers.find((c) => (c.name || '').trim().toLowerCase() === (customerName || '').trim().toLowerCase()) || null}
              onChange={(_, v) => handleCustomerSelect(v)}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === 'clear' || (reason === 'input' && newInputValue.trim() === '')) {
                  handleCustomerSelect(null);
                }
              }}
              onOpen={() => setCustomerAcListboxOpen(true)}
              onClose={() => setCustomerAcListboxOpen(false)}
              autoHighlight
              isOptionEqualToValue={(opt, val) => opt._id === val._id}
              slotProps={{
                paper: {
                  sx: { minWidth: '150%', width: '150%', maxWidth: '90vw' },
                },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  id="sales-return-customer-ac-input"
                  label="Cash / Customer A/C"
                  InputLabelProps={{ shrink: true }}
                  inputRef={customerAcRef}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const typed = (e.target as HTMLInputElement).value.trim();
                      if (!typed) {
                        e.preventDefault();
                        setTimeout(() => customerNameRef.current?.focus(), 50);
                        return;
                      }
                      const exists = customers.find((c) => (c.name || '').toLowerCase() === typed.toLowerCase());
                      if (exists) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCustomerSelect(exists);
                        setTimeout(() => customerNameRef.current?.focus(), 50);
                        return;
                      }
                      if (customerAcListboxOpen) {
                        const isPrefixOfSome = customers.some((c) => (c.name || '').toLowerCase().startsWith(typed.toLowerCase()));
                        if (isPrefixOfSome) return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      setCreateCustomerConfirmName(typed);
                      setCreateCustomerConfirmOpen(true);
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
          <Grid item xs={6} sm={3.75} md={3.125} lg={3.125}>
            <TextField
              size="small"
              label="Customer Name"
              fullWidth
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onFocus={handleTextFieldFocus}
              inputRef={customerNameRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setTimeout(() => taxModeRef.current?.focus(), 50);
                }
              }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ readOnly: !!customerId || (returnType === 'ByRef' && !!originalInvoiceIdForReturn) }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' },
                '& .MuiInputLabel-root': { fontSize: '0.70rem' },
                ...((customerId || (returnType === 'ByRef' && !!originalInvoiceIdForReturn)) ? { '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1.2, height: 28, minHeight: 28 } } : {}),
              }}
            />
          </Grid>
          <Grid item xs="auto">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setAddressDialogOpen(true)}
              sx={{ height: 26, fontSize: '0.72rem', px: 1, textTransform: 'none', borderRadius: 1.2, borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}
            >
              Address
            </Button>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <TextField
              size="small"
              select
              label="Tax"
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              inputRef={taxModeRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => returnTypeRef.current?.focus(), 50);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setTaxMode((prev) => (prev === 'inclusive' ? 'exclusive' : 'inclusive'));
                }
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 95, height: 26, '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 26, fontSize: '0.72rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiSelect-select': { py: '2px !important' } }}
            >
              <MenuItem value="inclusive" sx={{ fontSize: '0.72rem' }}>Include</MenuItem>
              <MenuItem value="exclusive" sx={{ fontSize: '0.72rem' }}>Exclude</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <TextField
              size="small"
              select
              label="Return Type"
              value={returnType}
              onChange={(e) => setReturnType(e.target.value as 'OnAccount' | 'ByRef')}
              inputRef={returnTypeRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (returnType === 'ByRef' && refInvoiceNoRef.current) {
                    refInvoiceNoRef.current.focus();
                  } else if (lines[0]) {
                    setTimeout(() => imeiInputRefs.current[lines[0].id]?.focus(), 50);
                  }
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setReturnType((prev) => (prev === 'OnAccount' ? 'ByRef' : 'OnAccount'));
                }
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 95, height: 26, '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 26, fontSize: '0.72rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiSelect-select': { py: '2px !important' } }}
            >
              <MenuItem value="OnAccount" sx={{ fontSize: '0.72rem' }}>On Account</MenuItem>
              <MenuItem value="ByRef" sx={{ fontSize: '0.72rem' }}>By Ref</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={5} lg={3.5}>
            <Box sx={{ display: 'flex', gap: 0.5, height: 28, alignItems: 'center' }}>
              {/* Navigation Group */}
              <Box sx={{ display: 'flex', gap: 0.4, flex: 1.2 }}>
                {[
                  { icon: <FirstIcon />, handler: handleFirstReturn, tip: 'First' },
                  { icon: <PrevIcon />, handler: handlePrevReturn, tip: 'Previous' },
                  { icon: <NextIcon />, handler: handleNextReturn, tip: 'Next' },
                  { icon: <LastIcon />, handler: handleLastReturn, tip: 'Last' },
                ].map((nav, i) => (
                  <Tooltip key={i} title={`${nav.tip} Return`}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={nav.handler}
                      sx={{ flex: 1, py: 0.15, height: 22, minWidth: 0, borderRadius: 1.2, bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d9488' }, boxShadow: 'none', '& .MuiSvgIcon-root': { fontSize: 15 } }}
                    >
                      {nav.icon}
                    </Button>
                  </Tooltip>
                ))}
              </Box>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.4, my: 0.5 }} />

              {/* Hold Group */}
              <Box sx={{ display: 'flex', gap: 0.4, flex: 1 }}>
                <Tooltip title="Hold this return for later">
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleHoldReturn}
                    sx={{ flex: 1.2, py: 0.2, height: 24, minWidth: 0, borderRadius: 1.2, bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, boxShadow: 'none', fontSize: '0.70rem', fontWeight: 600, textTransform: 'none' }}
                    startIcon={<HoldIcon sx={{ fontSize: 14 }} />}
                  >
                    Hold
                  </Button>
                </Tooltip>
                <Tooltip title="View held returns">
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => setHoldListDialogOpen(true)}
                    sx={{ flex: 0.5, py: 0.2, height: 24, minWidth: 0, borderRadius: 1.2, bgcolor: '#64748b', '&:hover': { bgcolor: '#475569' }, boxShadow: 'none', '& .MuiSvgIcon-root': { fontSize: 15 } }}
                  >
                    <HoldListIcon fontSize="small" />
                  </Button>
                </Tooltip>
              </Box>
            </Box>
          </Grid>
          {returnType === 'ByRef' && (
            <>
              <Grid item xs={6} sm={3} md={2} lg={2}>
                <Autocomplete
                  size="small"
                  freeSolo
                  openOnFocus
                  options={savedInvoices}
                  filterOptions={(options, state) => {
                    const q = state.inputValue.trim().toLowerCase();
                    if (!q) return options;
                    return options.filter((opt) => opt.toLowerCase().includes(q));
                  }}
                  inputValue={refInvoiceNoInput}
                  onInputChange={(_, v, reason) => {
                    setRefInvoiceNoInput(v);
                    if (reason === 'input') setRefInvoiceError('');
                  }}
                  onChange={(_, v) => {
                    if (v && typeof v === 'string') {
                      setRefInvoiceNoInput(v);
                      setRefInvoiceError('');
                    }
                  }}
                  autoHighlight
                  getOptionLabel={(opt) => opt}
                  noOptionsText="No invoices found"
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Sales Invoice No"
                      inputRef={refInvoiceNoRef}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (refInvoiceNoInput.trim()) {
                            e.preventDefault();
                            e.stopPropagation();
                            fetchRefInvoice();
                          }
                        }
                      }}
                      error={!!refInvoiceError}
                      helperText={refInvoiceError}
                      placeholder="Enter or select invoice no"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 }, '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                  )}
                  slotProps={{
                    paper: {
                      sx: {
                        minWidth: '250px',
                        boxShadow: '0 8px 24px rgba(15,118,110,0.25)',
                        borderRadius: '8px',
                        border: '1px solid #99f6e4',
                        bgcolor: '#ffffff',
                        overflow: 'hidden',
                        mt: 0.5
                      }
                    },
                    popper: {
                      sx: { zIndex: 1400 }
                    }
                  }}
                  sx={{ width: '100%' }}
                />
              </Grid>
              <Grid item xs="auto">
                <Button
                  variant="contained"
                  size="small"
                  onClick={fetchRefInvoice}
                  disabled={refInvoiceLoading}
                  sx={{ height: 28, fontSize: '0.72rem', px: 1, textTransform: 'none', borderRadius: 1.2, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
                >
                  {refInvoiceLoading ? 'Loading...' : 'Load'}
                </Button>
              </Grid>
            </>
          )}
        </Grid>
        <Divider sx={{ my: 0.6 }} />
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={6} sm={3} md={2} lg={1.8}>
            <TextField
              size="small"
              select
              label="Rate Type"
              value={rateType}
              onChange={(e) => setRateType(e.target.value as 'Retail' | 'WSale' | 'Special1' | 'Special2')}
              InputLabelProps={{ shrink: true }}
              inputRef={rateTypeRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  const firstLine = lines[0];
                  if (firstLine && imeiInputRefs.current[firstLine.id]) {
                    imeiInputRefs.current[firstLine.id]?.focus();
                  }
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setRateType((prev) => {
                    const types = ['Retail', 'WSale', 'Special1', 'Special2'];
                    const idx = types.indexOf(prev);
                    const newIdx = e.key === 'ArrowDown' ? (idx + 1) % types.length : (idx - 1 + types.length) % types.length;
                    return types[newIdx] as typeof rateType;
                  });
                }
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 26, fontSize: '0.72rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiSelect-select': { py: '2px !important' } }}
            >
              <MenuItem value="Retail" sx={{ fontSize: '0.72rem' }}>Retail</MenuItem>
              <MenuItem value="WSale" sx={{ fontSize: '0.72rem' }}>WSale</MenuItem>
              <MenuItem value="Special1" sx={{ fontSize: '0.72rem' }}>Special Price 1</MenuItem>
              <MenuItem value="Special2" sx={{ fontSize: '0.72rem' }}>Special Price 2</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <Box sx={{
              border: '1px solid #cbd5e1',
              borderRadius: 1.5,
              px: 0.8,
              py: 0.4,
              bgcolor: 'white',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <Typography sx={{ fontSize: '0.60rem', fontWeight: 700, color: '#475569', letterSpacing: 0.5, mb: 0.25, textTransform: 'uppercase' }}>
                VAT Type
              </Typography>
              <Box role="radiogroup" aria-label="VAT Type" sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 1.2, p: '2px', gap: '2px', border: '1px solid #e2e8f0' }}>
                <Box
                  role="radio"
                  aria-checked={vatType === 'Vat'}
                  tabIndex={0}
                  onClick={() => setVatType('Vat')}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVatType('Vat'); } }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.35,
                    borderRadius: 1,
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: vatType === 'Vat' ? 700 : 600,
                    color: vatType === 'Vat' ? '#ffffff' : '#64748b',
                    bgcolor: vatType === 'Vat' ? '#0f766e' : 'transparent',
                    boxShadow: vatType === 'Vat' ? '0 1px 3px rgba(15,118,110,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': { bgcolor: vatType === 'Vat' ? '#0d655e' : 'rgba(0,0,0,0.04)' }
                  }}
                >
                  VAT
                </Box>
                <Box
                  role="radio"
                  aria-checked={vatType === 'NonVat'}
                  tabIndex={0}
                  onClick={() => setVatType('NonVat')}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVatType('NonVat'); } }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.35,
                    borderRadius: 1,
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: vatType === 'NonVat' ? 700 : 600,
                    color: vatType === 'NonVat' ? '#ffffff' : '#64748b',
                    bgcolor: vatType === 'NonVat' ? '#475569' : 'transparent',
                    boxShadow: vatType === 'NonVat' ? '0 1px 3px rgba(71,85,105,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': { bgcolor: vatType === 'NonVat' ? '#334155' : 'rgba(0,0,0,0.04)' }
                  }}
                >
                  Non-VAT
                </Box>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <Box sx={{
              border: '1px solid #cbd5e1',
              borderRadius: 1.5,
              px: 0.8,
              py: 0.4,
              bgcolor: 'white',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <Typography sx={{ fontSize: '0.60rem', fontWeight: 700, color: '#475569', letterSpacing: 0.5, mb: 0.25, textTransform: 'uppercase' }}>
                Payment
              </Typography>
              <Box role="radiogroup" aria-label="Payment Type" sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 1.2, p: '2px', gap: '2px', border: '1px solid #e2e8f0' }}>
                <Box
                  role="radio"
                  aria-checked={paymentType === 'Cash'}
                  tabIndex={0}
                  onClick={() => {
                    setPaymentType('Cash');
                    setCustomerId(null);
                    setCustomerName('CASH');
                    setCustomerAddress('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setPaymentType('Cash');
                      setCustomerId(null);
                      setCustomerName('CASH');
                      setCustomerAddress('');
                    }
                  }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.35,
                    borderRadius: 1,
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: paymentType === 'Cash' ? 700 : 600,
                    color: paymentType === 'Cash' ? '#ffffff' : '#64748b',
                    bgcolor: paymentType === 'Cash' ? '#16a34a' : 'transparent',
                    boxShadow: paymentType === 'Cash' ? '0 1px 3px rgba(22,163,74,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': { bgcolor: paymentType === 'Cash' ? '#15803d' : 'rgba(0,0,0,0.04)' }
                  }}
                >
                  Cash
                </Box>
                <Box
                  role="radio"
                  aria-checked={paymentType === 'Credit'}
                  tabIndex={!customerId ? -1 : 0}
                  onClick={() => {
                    if (customerId) setPaymentType('Credit');
                  }}
                  onKeyDown={(e) => {
                    if (customerId && (e.key === ' ' || e.key === 'Enter')) {
                      e.preventDefault();
                      setPaymentType('Credit');
                    }
                  }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.35,
                    borderRadius: 1,
                    cursor: !customerId ? 'not-allowed' : 'pointer',
                    opacity: !customerId ? 0.4 : 1,
                    fontSize: '0.68rem',
                    fontWeight: paymentType === 'Credit' ? 700 : 600,
                    color: paymentType === 'Credit' ? '#ffffff' : '#64748b',
                    bgcolor: paymentType === 'Credit' ? '#d97706' : 'transparent',
                    boxShadow: paymentType === 'Credit' ? '0 1px 3px rgba(217,119,6,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': { bgcolor: paymentType === 'Credit' ? '#b45309' : (!customerId ? 'transparent' : 'rgba(0,0,0,0.04)') }
                  }}
                >
                  Credit
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>

        {/* Product Info Section */}
        <Grid container spacing={1} alignItems="stretch" sx={{ mt: 0.3 }}>
          <Grid item xs={12} md={12} lg={12}>
            <Box sx={{
              borderRadius: 1.2, px: 1, py: 0.4, height: '100%', display: 'flex', alignItems: 'center', gap: 1,
              background: selectedProductInfo ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)' : '#f8fafc',
              border: selectedProductInfo ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
              transition: 'all 0.2s',
            }}>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>P.Rate</Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.purchaseRate * activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, px: 0.7, py: 0.15, bgcolor: '#fef2f2', borderRadius: 0.8 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#dc2626', fontWeight: 600 }}>Stock</Typography>
                    <Typography sx={{ fontSize: '0.80rem', fontWeight: 800, lineHeight: 1.2, color: '#dc2626' }}>
                      {(() => {
                        const basePieces = selectedProductInfo.totalStock ?? selectedProductInfo.stock;
                        const isNum = typeof basePieces === 'number';
                        const pcsInside = (activeMultiUnitInfo as any)?.conversion ?? activeMultiUnitInfo?.pcsInside;
                        if (isNum && pcsInside && pcsInside > 0) {
                          const inUnit = basePieces / pcsInside;
                          const unitName = activeMultiUnitInfo?.name ?? '';
                          return `${basePieces} pcs${unitName ? ` (${inUnit.toFixed(2)} ${unitName})` : ''}`;
                        }
                        return isNum ? `${basePieces} pcs` : (basePieces ?? '-');
                      })()}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Vendor</Typography>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, lineHeight: 1.2 }}>{selectedProductInfo.lastVendor ?? '-'}</Typography>
                  </Box>
                  {activeMultiUnitInfo && (
                    <>
                      <Box sx={{ width: '1px', height: 20, bgcolor: '#0f766e', opacity: 0.2, flexShrink: 0 }} />
                      {activeMultiUnitInfo.pcsInside != null && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Pcs Inside</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#7c3aed' }}>{activeMultiUnitInfo.pcsInside}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.wholesale != null && activeMultiUnitInfo.wholesale > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>WSale</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#1565c0' }}>{activeMultiUnitInfo.wholesale.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.retail != null && activeMultiUnitInfo.retail > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Retail</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#15803d' }}>{activeMultiUnitInfo.retail.toFixed(2)}</Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>Select a product to view details</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Product Grid - B2C style */}
      <Paper elevation={0} sx={{ mb: 0.7, width: '100%', overflow: 'hidden', border: '1px solid #e0e7ef', borderRadius: 1.5, bgcolor: 'white' }}>
        <TableContainer
          sx={{ minHeight: 256, maxHeight: 320, width: '100%', bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }}
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
          <Table stickyHeader size="small" sx={{
            minWidth: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
            '& .MuiTableCell-root': { fontSize: '0.68rem', py: '2px', px: '3px', fontWeight: 700, borderBottom: '1px solid #cbd5e1' },
            '& .MuiInputBase-input': { fontSize: '0.68rem', fontWeight: 700 },
            '& .MuiAutocomplete-input': { fontSize: '0.68rem', fontWeight: 700 },
            '& .MuiSelect-select': { fontSize: '0.68rem', fontWeight: 700 },
          }}>
            <TableHead>
              <TableRow sx={{ '& th': { borderBottom: '2px solid #0b534d' } }}>
                {[
                  { label: 'Sl', w: '2.5%' },
                  { label: 'Item Code', w: '6%' },
                  { label: 'IMEI', w: '8%' },
                  { label: 'Item Name', w: '16%' },
                  { label: 'Unit', w: '6%' },
                  { label: 'QTY', w: '5%' },
                  { label: 'Price', w: '6%' },
                  { label: 'Gross', w: '6%' },
                  { label: 'Disc%', w: '4%' },
                  { label: 'Disc', w: '5%' },
                  { label: 'VAT', w: '5%' },
                  { label: 'Total', w: '6%' },
                  { label: '', w: '2.5%' },
                ].map((col, ci) => (
                  <TableCell key={ci} sx={{
                    bgcolor: '#0f766e', color: 'white', fontWeight: 700, fontSize: '0.65rem', width: col.w,
                    p: '4px 3px', textAlign: ci >= 5 ? 'right' : 'center', letterSpacing: 0.2, textTransform: 'uppercase',
                    borderRight: ci < 12 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                    borderBottom: '2px solid #0b534d',
                  }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow
                  key={line.id}
                  sx={{
                    bgcolor: idx === 0 && !line.productId ? '#fffbeb' : (idx % 2 === 0 ? '#f8fafb' : 'white'),
                    '&:hover': { bgcolor: '#e0f7fa' },
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const el = e.target as HTMLElement;
                    if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.closest('button') || el.closest('.MuiAutocomplete-root')) return;
                    enterRow(line);
                    setActiveLineId(line.id);
                  }}
                  onFocusCapture={() => {
                    enterRow(line);
                    setActiveLineId(line.id);
                  }}
                >
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 800, color: '#64748b', fontSize: '0.68rem', bgcolor: '#f1f5f9' }}>{idx + 1}</TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField size="small" variant="outlined" value={line.productCode} fullWidth InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }} />
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField size="small" variant="outlined" value={line.imei} onChange={(e) => updateLine(line.id, 'imei', e.target.value)} onKeyDown={(e) => handleImeiKeyDown(e, line)} inputRef={(el) => { imeiInputRefs.current[line.id] = el; }} fullWidth placeholder="IMEI" InputProps={{ readOnly: returnType === 'ByRef' }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }} />
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    {returnType === 'OnAccount' ? (
                      <Autocomplete
                        size="small"
                        freeSolo
                        options={products}
                        filterOptions={productFilterOptions}
                        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name || '')}
                        isOptionEqualToValue={(opt, val) => (typeof opt === 'object' && typeof val === 'object' && opt._id === (val as ProductOption)._id)}
                        value={line.productId ? products.find((p) => p._id === line.productId) ?? null : null}
                        inputValue={line.name}
                        onInputChange={(_, v) => updateLine(line.id, 'name', v)}
                        onChange={(_, v) => { if (v && typeof v !== 'string') handleProductSelect(line.id, v); }}
                        onOpen={() => { itemNameListboxOpenRef.current = true; }}
                        onClose={() => { itemNameListboxOpenRef.current = false; }}
                        onHighlightChange={(e, opt) => {
                          handleProductHighlight(e, opt);
                          setActiveLineId(line.id);
                        }}
                        autoHighlight
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            variant="outlined"
                            placeholder="Item name"
                            inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }}
                            onFocus={() => handleItemNameFocus(line)}
                            onBlur={() => handleItemNameBlur(line)}
                            onKeyDown={(e) => handleItemNameKeyDown(e, line)}
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                          />
                        )}
                        ListboxProps={{
                          sx: {
                            p: 0,
                            maxHeight: 220,
                            overflowX: 'hidden',
                            overflowY: 'auto',
                            '&::-webkit-scrollbar': { display: 'none' },
                            msOverflowStyle: 'none',
                            scrollbarWidth: 'none',
                            '& .MuiAutocomplete-option': {
                              minHeight: 'auto', py: 0.5, px: 1.5, fontSize: '0.68rem', fontWeight: 700, bgcolor: 'transparent',
                              '&[data-focus="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                              '&[aria-selected="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                              '&.Mui-focused': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                              '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.15) !important', color: '#0f766e' }
                            }
                          }
                        }}
                        componentsProps={{
                          popper: { placement: 'bottom-start', modifiers: [{ name: 'flip', enabled: false }, { name: 'preventOverflow', enabled: false }] },
                          paper: { sx: { width: '300px', boxShadow: '0 8px 24px rgba(15,118,110,0.15)', borderRadius: '8px', border: '1px solid #99f6e4', bgcolor: '#ffffff', overflow: 'hidden', mt: 0.5 } }
                        }}
                        sx={{ width: '100%' }}
                      />
                    ) : (
                      <TextField
                        size="small"
                        variant="outlined"
                        value={line.name}
                        onChange={(e) => updateLine(line.id, 'name', e.target.value)}
                        inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }}
                        onFocus={() => handleItemNameFocus(line)}
                        onBlur={() => handleItemNameBlur(line)}
                        onKeyDown={(e) => handleItemNameKeyDown(e, line)}
                        fullWidth
                        placeholder="Item name"
                        InputProps={{ readOnly: returnType === 'ByRef' }}
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }} onClick={(e) => e.stopPropagation()}>
                    <TextField
                      size="small"
                      select
                      variant="outlined"
                      value={line.unitId}
                      onChange={(e) => handleUnitChange(line.id, e.target.value)}
                      onKeyDown={(e) => handleUnitKeyDown(e, line.id)}
                      fullWidth
                      disabled={returnType === 'ByRef' || line.availableUnits.length === 0}
                      inputRef={(el) => { unitInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                    >
                      {line.availableUnits.length === 0 ? (
                        <MenuItem value="" sx={{ fontSize: '0.68rem', fontWeight: 700, py: 0.5 }}>-</MenuItem>
                      ) : (
                        line.availableUnits.map((u) => (
                          <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.68rem', fontWeight: 700, py: 0.5 }}>{u.name}</MenuItem>
                        ))
                      )}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={() => { setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : ''; updateLine(line.id, 'quantity', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handleQtyKeyDown(e, line)}
                      inputRef={(el) => { qtyInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'center', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : (line.price === 0 ? '' : String(line.price))}
                      onFocus={() => { if (returnType !== 'ByRef') setEditingNumericCell({ lineId: line.id, field: 'price', value: line.price === 0 ? '' : String(line.price) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'price' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : ''; updateLine(line.id, 'price', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handlePriceKeyDown(e, line)}
                      inputRef={(el) => { priceInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal', readOnly: returnType === 'ByRef' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '3px 4px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}>{line.gross.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={() => { if (returnType !== 'ByRef') setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'discPercent', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handleDiscPercentKeyDown(e, line)}
                      inputRef={(el) => { discPercentInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal', readOnly: returnType === 'ByRef' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={() => { if (returnType !== 'ByRef') setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : ''; updateLine(line.id, 'discAmount', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handleDiscAmountKeyDown(e, line)}
                      inputRef={(el) => { discAmountInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal', readOnly: returnType === 'ByRef' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '3px 4px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '3px 4px', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', fontWeight: 800, fontSize: '0.72rem', color: '#0f766e' }}>{line.total.toFixed(2)}</TableCell>
                  <TableCell sx={{ p: '2px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}>
                    <IconButton size="small" onClick={() => removeLine(line.id)} disabled={returnType === 'ByRef'} sx={{ p: 0.2, color: '#ef4444', '&:hover': { bgcolor: '#fee2e2' }, '&.Mui-disabled': { color: '#cbd5e1' } }}>
                      <DeleteIcon sx={{ fontSize: '0.72rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Bottom - B2C style: Adjustments + Grand Total */}
      <Paper elevation={0} sx={{ p: 1.25, mb: 0.7, borderRadius: 1.5, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={1}>
          <Grid item xs={12} md={5} lg={3.5}>
            <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0', p: 1.25 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#475569', mb: 0.8, letterSpacing: 0.3, textTransform: 'uppercase' }}>Adjustments</Typography>
              <Grid container spacing={0.85}>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Disc %" type="number" value={editingNumericCell?.field === 'otherDiscPercent' && !editingNumericCell?.lineId ? editingNumericCell.value : (otherDiscPercent === 0 ? '' : String(otherDiscPercent))} onFocus={() => setEditingNumericCell({ field: 'otherDiscPercent', value: otherDiscPercent === 0 ? '' : String(otherDiscPercent) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscPercent' ? editingNumericCell.value : ''; handleOtherDiscPercentChange(parseNumericInput(raw)); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal', max: 100 }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, minHeight: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Discount" type="number" value={editingNumericCell?.field === 'otherDiscount' && !editingNumericCell?.lineId ? editingNumericCell.value : (otherDiscount === 0 ? '' : String(otherDiscount))} onFocus={() => setEditingNumericCell({ field: 'otherDiscount', value: otherDiscount === 0 ? '' : String(otherDiscount) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscount' ? editingNumericCell.value : ''; setOtherDiscount(parseNumericInput(raw)); setOtherDiscPercent(0); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, minHeight: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Charges" type="number" value={editingNumericCell?.field === 'otherCharges' && !editingNumericCell?.lineId ? editingNumericCell.value : (otherCharges === 0 ? '' : String(otherCharges))} onFocus={() => setEditingNumericCell({ field: 'otherCharges', value: otherCharges === 0 ? '' : String(otherCharges) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherCharges' ? editingNumericCell.value : ''; setOtherCharges(parseNumericInput(raw)); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, minHeight: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField
                      size="small"
                      label="Round Off"
                      type="number"
                      value={editingNumericCell?.field === 'roundOff' && !editingNumericCell?.lineId ? editingNumericCell.value : (roundOff === 0 ? '' : String(roundOff))}
                      onFocus={() => setEditingNumericCell({ field: 'roundOff', value: roundOff === 0 ? '' : String(roundOff) })}
                      onChange={(e) => {
                        setAutoRoundOff(false);
                        setEditingNumericCell((prev) => prev?.field === 'roundOff' ? { ...prev, value: e.target.value } : prev);
                      }}
                      onBlur={() => { const raw = editingNumericCell?.field === 'roundOff' ? editingNumericCell.value : ''; setRoundOff(parseNumericInput(raw)); setEditingNumericCell(null); }}
                      inputProps={{ inputMode: 'decimal' }}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, minHeight: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }}
                    />
                    <Tooltip title="Round Off Total (Auto Round)" arrow placement="top">
                      <Checkbox
                        size="small"
                        checked={autoRoundOff}
                        onChange={(e) => handleAutoRoundOffToggle(e.target.checked)}
                        sx={{
                          p: 0.25,
                          color: '#94a3b8',
                          '&.Mui-checked': { color: '#0f766e' },
                          '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                        }}
                      />
                    </Tooltip>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <TextField size="small" label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} inputRef={narrationRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, minHeight: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }} />
                </Grid>
              </Grid>
            </Box>
          </Grid>
          <Grid item xs={12} md={3.5} lg={5}>
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Box sx={{ background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)', borderRadius: 1.5, p: 1, mb: 0.8, textAlign: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.60rem', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 0.1 }}>Grand Total</Typography>
                <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '1.55rem', lineHeight: 1.1, letterSpacing: -0.5 }}>{calculations.grandTotal.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0', p: 1, flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>This Bill</Typography>
                  <Typography sx={{ fontSize: '0.80rem', fontWeight: 800, color: '#1e293b' }}>{calculations.subTotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>Total VAT</Typography>
                  <Typography sx={{ fontSize: '0.80rem', fontWeight: 800, color: '#1e293b' }}>{calculations.totalVat.toFixed(2)}</Typography>
                </Box>
                {[
                  { label: 'Round Off', value: roundOff },
                  { label: 'Other Discount', value: otherDiscount },
                  { label: 'Other Charges', value: otherCharges },
                ].map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
                    <Typography sx={{ fontSize: '0.64rem', color: '#94a3b8' }}>{item.label}</Typography>
                    <Typography sx={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 500 }}>{item.value.toFixed(2)}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Action buttons - B2C style */}
      <Paper elevation={0} sx={{ p: 0.8, width: '100%', borderRadius: 1.5, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Box
          ref={actionButtonsContainerRef}
          onKeyDown={handleActionButtonKeyDown}
          sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Button
            ref={saveButtonRef}
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handlePreSaveCheck}
            disabled={loading || !!returnId || (returnType === 'ByRef' && !originalInvoiceIdForReturn)}
            sx={{
              minWidth: 70, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.2, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 16 }, '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
              '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
            }}
          >
            Save
          </Button>
          <Button
            ref={printButtonRef}
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
            disabled={lines.filter((l) => l.productId && l.quantity > 0).length === 0}
            sx={{
              minWidth: 70, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.2, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 16 }, '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
              '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
            }}
          >
            Print
          </Button>
          <Button
            variant="contained"
            startIcon={<ClearIcon />}
            onClick={(e) => {
              (e.currentTarget as HTMLElement)?.blur();
              handleClear();
            }}
            sx={{
              minWidth: 70, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.2, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 16 }, '&:hover': { bgcolor: '#15803d' },
              '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
            }}
          >
            Clear
          </Button>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={handlePreSaveCheck}
            disabled={!returnId || loading}
            sx={{
              minWidth: 65, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.2, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 16 }, '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
              '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
            }}
          >
            Edit
          </Button>
          <Button
            variant="contained"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!returnId}
            sx={{
              minWidth: 70, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.2, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 16 }, '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
              '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
            }}
          >
            Delete
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={() => setSearchDialogOpen(true)}
            sx={{
              minWidth: 100, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.2, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 16 }, '&:hover': { bgcolor: '#15803d' },
              '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
            }}
          >
            Search Return
          </Button>
        </Box>
      </Paper>

      {/* Create customer confirm: account doesn't exist, do you want to create? */}
      <Dialog
        open={createCustomerConfirmOpen}
        onClose={() => { setCreateCustomerConfirmOpen(false); setCreateCustomerConfirmName(null); }}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{
          onEntered: (node) => {
            const yesBtn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-create-customer-yes]');
            yesBtn?.focus();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f766e' }}>Create account?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            This account doesn&apos;t exist. Do you want to create it{createCustomerConfirmName ? ` for "${createCustomerConfirmName}"` : ''}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => { setCreateCustomerConfirmOpen(false); setCreateCustomerConfirmName(null); }} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            No
          </Button>
          <Button
            variant="contained"
            data-create-customer-yes
            autoFocus
            onClick={() => {
              const name = createCustomerConfirmName;
              setCreateCustomerConfirmOpen(false);
              setCreateCustomerConfirmName(null);
              if (name) {
                setPendingCustomerName(name);
                navigate('/master/customer-create', { state: { prefillName: name, returnTo: '/entry/sales-return' } });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d6561' }, boxShadow: 'none' }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Address Details Dialog */}
      <Dialog open={addressDialogOpen} onClose={() => setAddressDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Address Details</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f766e', mb: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Billing Address
          </Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Address</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} onFocus={handleTextFieldFocus} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Phone</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} onFocus={handleTextFieldFocus} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 1.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setAddressDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button
            variant="contained" size="small"
            onClick={() => { setCustomerAddress(billingAddress); setAddressDialogOpen(false); }}
            autoFocus
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Saved Success Dialog */}
      <Dialog
        open={savedDialogOpen}
        onClose={() => {
          setSavedDialogOpen(false);
          focusPrintButton();
        }}
        PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{
          onExited: () => {
            focusPrintButton();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Success</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{savedDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setSavedDialogOpen(false);
              focusPrintButton();
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-line' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setErrorDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return Warning Dialog */}
      <Dialog open={warningDialogOpen} onClose={() => setWarningDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2, maxWidth: 500 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon /> Warning: Quantity Exceeds Purchase
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 1.5 }}>
            The following items exceed the quantity purchased by this customer:
          </Typography>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {warningsList.map((w, index) => (
              <li key={index} style={{ fontSize: '0.85rem', color: '#1e293b', marginBottom: 6 }}>
                {w}
              </li>
            ))}
          </ul>
          <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mt: 2, fontWeight: 500 }}>
            Do you want to proceed anyway?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setWarningDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setWarningDialogOpen(false);
              if (returnId) {
                setEditConfirmOpen(true);
              } else {
                setSaveDialogOpen(true);
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, boxShadow: 'none' }}
          >
            Proceed
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Save Sales Return</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Do you want to save this sales return?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setSaveDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Confirm Edit</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Update this sales return with the current form values?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setEditConfirmOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Search Return Dialog */}
      <Dialog open={searchDialogOpen} onClose={() => { setSearchDialogOpen(false); setSearchError(''); }} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Search Sales Return</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Return No"
            value={searchInvoiceNo}
            onChange={(e) => setSearchInvoiceNo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            error={!!searchError}
            helperText={searchError}
            placeholder="e.g. SR-000001"
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setSearchDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSearch} disabled={searchLoading} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
            {searchLoading ? 'Loading...' : 'Search'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Delete Sales Return</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Are you sure you want to delete this sales return? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} sx={{ textTransform: 'none', borderRadius: 1.5, boxShadow: 'none' }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Select items from invoice - B2C style */}
      <Dialog open={selectItemsDialogOpen} onClose={() => setSelectItemsDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2, border: '1px solid #e2e8f0' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#0f766e', borderBottom: '1px solid #e2e8f0', pb: 1.5 }}>Select items to return</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {refInvoiceData && (
            <>
              <Box sx={{ mb: 2 }}>
                <MuiFormControlLabel
                  control={<Checkbox checked={
                    refInvoiceData.items.filter(i => {
                      const remaining = (i as any).remainingReturnableQuantity !== undefined ? (i as any).remainingReturnableQuantity : i.quantity;
                      return remaining > 0;
                    }).length > 0 && selectedRefItemIds.size === refInvoiceData.items.filter(i => {
                      const remaining = (i as any).remainingReturnableQuantity !== undefined ? (i as any).remainingReturnableQuantity : i.quantity;
                      return remaining > 0;
                    }).length
                  } onChange={(e) => selectAllRefItems(e.target.checked)} />}
                  label="Select All (Returnable)"
                  sx={{ '& .MuiFormControlLabel-label': { fontWeight: 600, color: '#475569' } }}
                />
              </Box>
              <TableContainer sx={{ maxHeight: 360, border: '1px solid #e2e8f0', borderRadius: 1.5, overflow: 'hidden' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}></TableCell>
                      <TableCell sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Item</TableCell>
                      <TableCell sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Batch#</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Purchased</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Returned</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Returnable</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Price</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {refInvoiceData.items.map((it) => {
                      const name = typeof it.productId === 'object' && (it.productId as { name?: string }).name ? (it.productId as { name: string }).name : (it.description || '');
                      const returnedQty = (it as any).returnedQuantity || 0;
                      const remainingQty = (it as any).remainingReturnableQuantity !== undefined ? (it as any).remainingReturnableQuantity : it.quantity;
                      const isSelected = selectedRefItemIds.has(it._id);
                      return (
                        <TableRow key={it._id} hover onClick={() => toggleRefItem(it._id)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f0fdfa' }, opacity: remainingQty <= 0 ? 0.6 : 1 }}>
                          <TableCell padding="checkbox">
                            <Checkbox checked={isSelected} disabled={remainingQty <= 0} onChange={() => toggleRefItem(it._id)} sx={{ color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }} />
                          </TableCell>
                          <TableCell>{name}</TableCell>
                          <TableCell sx={{ fontSize: '0.78rem', color: it.batchNumber ? '#0f766e' : '#94a3b8', fontStyle: it.batchNumber ? 'normal' : 'italic' }}>{it.batchNumber || '-'}</TableCell>
                          <TableCell align="right">{it.quantity}</TableCell>
                          <TableCell align="right">{returnedQty}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: remainingQty > 0 ? '#10b981' : '#ef4444' }}>{remainingQty}</TableCell>
                          <TableCell align="right">{it.unitPrice?.toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: '#0f766e' }}>{it.totalAmount?.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f0fdfa', borderRadius: 1.5, border: '1px solid #99f6e4' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f766e' }}>Selected Total: {selectedRefTotal.toFixed(2)}</Typography>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
          <Button onClick={() => setSelectItemsDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5 }}>Cancel</Button>
          <Button variant="contained" onClick={confirmSelectRefItems} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Selection Dialog */}
      <Dialog
        open={batchDialogOpen}
        onClose={() => setBatchDialogOpen(false)}
        onKeyDown={handleBatchDialogKeyDown}
        maxWidth="sm"
        fullWidth
        autoFocus={false}
        disableAutoFocus={true}
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{
          onEntered: () => {
            const firstRow = batchRowRefs.current[focusedBatchIndex] || batchRowRefs.current[0];
            if (firstRow) {
              firstRow.focus();
              firstRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          },
        }}
      >
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Select Batch</Typography>
          {pendingProduct && (
            <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mt: 0.3 }}>{pendingProduct.name}</Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {['Batch No', 'Expiry', 'Stock', 'P.Rate', rateType === 'WSale' ? 'W.Sale' : 'Retail', 'Action'].map((label, ci) => (
                    <TableCell key={ci} align={ci >= 2 && ci <= 4 ? 'right' : ci === 5 ? 'center' : 'left'}
                      sx={{ bgcolor: '#f0fdfa', fontWeight: 600, fontSize: '0.72rem', color: '#0f766e', py: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {availableBatches.map((batch, index) => (
                  <TableRow
                    key={batch.batchNumber}
                    ref={(el) => { batchRowRefs.current[index] = el; }}
                    tabIndex={index === focusedBatchIndex ? 0 : -1}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#f0fdfa' },
                      bgcolor: index === focusedBatchIndex ? '#ccfbf1 !important' : (index % 2 === 0 ? '#ffffff' : '#fafafa'),
                      outline: index === focusedBatchIndex ? '2px solid #0f766e !important' : 'none',
                      outlineOffset: -2,
                      transition: 'all 0.1s',
                      '&:focus': {
                        outline: '2px solid #0f766e !important',
                        bgcolor: '#ccfbf1 !important',
                      },
                    }}
                    onClick={() => {
                      setFocusedBatchIndex(index);
                      handleBatchSelect(batch);
                    }}
                    onFocus={() => setFocusedBatchIndex(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleBatchSelect(batch);
                      }
                    }}
                  >
                    <TableCell sx={{ fontSize: '0.8rem', color: '#334155', py: 0.75 }}>
                      {batch.batchNumber.length > 15 ? batch.batchNumber.substring(0, 15) + '...' : batch.batchNumber}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: '#475569', py: 0.75 }}>{(batch as any).expiryDate || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{batch.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#64748b', py: 0.75 }}>{batch.purchasePrice.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{(rateType === 'WSale' ? batch.wholesale : batch.retail).toFixed(2)}</TableCell>
                    <TableCell align="center" sx={{ py: 0.75 }}>
                      <Button size="small" variant="contained" tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); handleBatchSelect(batch); }}
                        sx={{ minWidth: 'auto', px: 1.5, py: 0.25, fontSize: '0.7rem', borderRadius: 1, boxShadow: 'none', bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', px: 2, py: 1 }}>
          <Button tabIndex={-1} onClick={() => setBatchDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Held Returns Dialog - B2C Style */}
      <Dialog open={holdListDialogOpen} onClose={() => setHoldListDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 2 }}>
          <HoldListIcon sx={{ color: '#f59e0b' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Held Sales Returns</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {heldReturns.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography sx={{ color: '#94a3b8', fontStyle: 'italic' }}>No held returns found</Typography>
            </Box>
          ) : (
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {heldReturns.map((held, idx) => (
                <Box
                  key={held.id}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: idx === heldReturns.length - 1 ? 'none' : '1px solid #f1f5f9',
                    '&:hover': { bgcolor: '#f8fafc' }
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, color: '#0f766e', fontSize: '0.95rem' }}>{held.customerName}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8', bgcolor: '#f1f5f9', px: 1, py: 0.2, borderRadius: 10 }}>{held.heldAt}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
                      {held.itemCount} items • Total: <strong style={{ color: '#1e293b' }}>{held.total.toFixed(2)}</strong>
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleRestoreHeldReturn(held)}
                      sx={{ textTransform: 'none', borderRadius: 1.5, borderColor: '#0f766e', color: '#0f766e', '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.05)', borderColor: '#0d6561' } }}
                    >
                      Restore
                    </Button>
                    <IconButton size="small" onClick={() => handleDeleteHeldReturn(held.id)} sx={{ color: '#ef4444', bgcolor: '#fee2e2', '&:hover': { bgcolor: '#fecaca' } }}>
                      <DeleteIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setHoldListDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
