import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, Button, Grid, IconButton,
  Autocomplete, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, RadioGroup, FormControlLabel, Radio,
  MenuItem, Checkbox, FormControlLabel as MuiFormControlLabel, Divider,
} from '@mui/material';
import {
  Save as SaveIcon,
  Clear as ClearIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  Edit as EditIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { salesApi, ledgerAccountApi, productApi } from '../services/api';
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
}

interface Customer {
  _id: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
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
}

const emptyLine = (): LineItem => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
  productId: '', productCode: '', imei: '', name: '',
  unitId: '', unitName: '', availableUnits: [],
  quantity: 0, price: 0, purchasePrice: 0, gross: 0,
  discPercent: 0, discAmount: 0, vatAmount: 0, total: 0,
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
  const [customerName, setCustomerName] = useState('CASH');
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
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
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
  const customerAcRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const taxModeRef = useRef<HTMLInputElement>(null);
  const narrationRef = useRef<HTMLInputElement>(null);
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
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const rateTypeRef = useRef<HTMLInputElement>(null);
  const returnTypeRef = useRef<HTMLInputElement>(null);
  const refInvoiceNoRef = useRef<HTMLInputElement>(null);
  const imeiInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleCustomerSelect = useCallback((customer: Customer | null) => {
    if (!customer) {
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setPaymentType('Cash');
      return;
    }
    const isCash = customer._id === 'cash';
    setCustomerId(isCash ? null : customer._id);
    setCustomerName(customer.name);
    setCustomerAddress(customer.address || '');
    // Auto-fill billing address from customer ledger account
    setBillingAddress(customer.address || '');
    setBillingPhone(customer.phone || '');
    if (isCash) setPaymentType('Cash');
  }, []);
  const itemNameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
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
    setSelectedProductInfo({
      profit: 0,
      purchaseRate: product.purchasePrice ?? 0,
      lastVendor: (product as any).lastVendor ?? (product as any).lastSupplier ?? '-',
      totalStock: (product as any).stock ?? 0,
      previousPrice: (product as any).previousPrice ?? 0,
      retailPrice: product.retailPrice ?? 0,
      wholesalePrice: product.wholesalePrice ?? 0,
    });
  }, []);

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
    const cashOption = { _id: 'cash', code: 'CASH', name: 'CASH', address: '' };
    ledgerAccountApi.list(companyId, 'Customer').then((res) => {
      const list = (res.data.data ?? []) as Customer[];
      const all = [cashOption, ...(Array.isArray(list) ? list : [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
      setCustomers(all);
    }).catch(() => setCustomers([cashOption]));
  }, [companyId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Detect return from Customer Create page — read created ledger from state, set pending and reload customers
  useEffect(() => {
    const state = routeLocation.state as { createdLedgerName?: string } | null;
    if (routeLocation.pathname === '/entry/sales-return' && state?.createdLedgerName) {
      setPendingCustomerName(state.createdLedgerName);
      loadCustomers();
      navigate(routeLocation.pathname, { replace: true, state: {} });
    }
  }, [routeLocation.pathname, routeLocation.state, loadCustomers, navigate]);

  // Once customers list is reloaded after creating a new customer, auto-select it by name
  useEffect(() => {
    if (!pendingCustomerName) return;
    const found = customers.find((c) => (c.name || '').toLowerCase() === pendingCustomerName.toLowerCase());
    if (found) {
      handleCustomerSelect(found);
      setPendingCustomerName(null);
      setTimeout(() => customerAcRef.current?.focus(), 200);
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

  useEffect(() => {
    if (!companyId) return;
    productApi.list(companyId, { limit: 10000 }).then((res) => {
      const d = res.data?.data as { products?: ProductOption[] };
      const list = d?.products ?? [];
      setProducts(Array.isArray(list) ? list : []);
    }).catch(() => setProducts([]));
  }, [companyId]);

  const fetchRefInvoice = useCallback(async () => {
    if (!companyId || !refInvoiceNoInput.trim()) {
      setRefInvoiceError('Enter sales invoice number');
      return;
    }
    setRefInvoiceError('');
    setRefInvoiceLoading(true);
    try {
      const res = await salesApi.searchB2CByInvoiceNo(companyId, refInvoiceNoInput.trim());
      const data = res.data.data as typeof refInvoiceData;
      if (!data || !data.items?.length) {
        setRefInvoiceError('Invoice not found or has no items');
        return;
      }
      setRefInvoiceData(data);
      setRefInvoiceNoInput('');
      setSelectItemsDialogOpen(true);
      setSelectedRefItemIds(new Set(data.items.map((i: RefInvoiceItem) => i._id)));
    } catch (e: unknown) {
      setRefInvoiceError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Invoice not found');
    } finally {
      setRefInvoiceLoading(false);
    }
  }, [companyId, refInvoiceNoInput]);

  const confirmSelectRefItems = useCallback(() => {
    if (!refInvoiceData) return;
    const selected = refInvoiceData.items.filter((i) => selectedRefItemIds.has(i._id));
    if (selected.length === 0) {
      setErrorDialogMessage('Select at least one item');
      setErrorDialogOpen(true);
      return;
    }
    const newLines: LineItem[] = selected.map((it, idx) => {
      const pid = typeof it.productId === 'object' ? (it.productId as { _id: string })._id : String(it.productId);
      const name = typeof it.productId === 'object' && (it.productId as { name?: string }).name ? (it.productId as { name: string }).name : (it.description || '');
      const price = it.unitPrice ?? 0;
      const qty = it.quantity ?? 0;
      void (it.totalAmount ?? qty * price);
      const disc = it.discount ?? 0;
      const gross = qty * price;
      const net = gross - disc;
      const vatRate = refInvoiceData.vatType === 'NonVat' ? 0 : 5;
      const vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
      const lineTotal = parseFloat((net + vatAmount).toFixed(2));
      const uname = (it.unitName as string) || 'Pcs';
      const uid = (it as { unitId?: string }).unitId || 'pcs';
      const availableUnits: UnitOption[] = [{ id: uid, name: uname }];
      return {
        id: `ref-${idx}-${Date.now()}`,
        productId: pid,
        productCode: (it.productCode as string) || '',
        imei: (it.imei as string) || '',
        name: name || '',
        unitId: uid,
        unitName: uname,
        availableUnits,
        quantity: qty,
        price,
        purchasePrice: 0,
        gross,
        discPercent: 0,
        discAmount: disc,
        vatAmount,
        total: lineTotal,
      };
    });
    setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    setCustomerId(refInvoiceData.customerId ?? null);
    setCustomerName(refInvoiceData.customerName ?? '');
    setCustomerAddress(refInvoiceData.customerAddress ?? '');
    setVatType((refInvoiceData.vatType as 'Vat' | 'NonVat') || 'Vat');
    setOriginalInvoiceIdForReturn(refInvoiceData._id);
    setSelectItemsDialogOpen(false);
    setRefInvoiceData(null);
  }, [refInvoiceData, selectedRefItemIds]);

  const updateLine = useCallback((id: string, field: keyof LineItem, value: unknown) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const updated = { ...line, [field]: value };
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
  }, [vatType]);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.length > 0 ? filtered : [emptyLine()];
    });
  }, []);



  const handleProductSelect = useCallback((lineId: string, product: ProductOption) => {
    // Get price based on rateType
    let price = 0;
    switch (rateType) {
      case 'Retail':
        price = (product as any).retailPrice ?? (product as any).retail ?? product.purchasePrice ?? 0;
        break;
      case 'WSale':
        price = (product as any).wholesalePrice ?? (product as any).wholesale ?? product.purchasePrice ?? 0;
        break;
      case 'Special1':
        price = (product as any).specialPrice1 ?? product.purchasePrice ?? 0;
        break;
      case 'Special2':
        price = (product as any).specialPrice2 ?? product.purchasePrice ?? 0;
        break;
      default:
        price = (product as any).wholesalePrice ?? (product as any).wholesale ?? product.purchasePrice ?? 0;
    }
    const uid = product.unitId ?? 'pcs';
    const uname = product.unitName ?? 'Pcs';
    const availableUnits: UnitOption[] = [{ id: uid, name: uname }];
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const gross = line.quantity * price;
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
          unitId: uid,
          unitName: uname,
          availableUnits,
          price,
          gross,
          vatAmount,
          total,
        };
      })
    );
  }, [vatType, rateType]);

  const handleUnitChange = useCallback((lineId: string, unitId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const u = line.availableUnits.find((x) => x.id === unitId);
        return { ...line, unitId, unitName: u?.name ?? line.unitName };
      })
    );
  }, []);

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
        if (line.availableUnits.length > 0) {
          setTimeout(() => unitInputRefs.current[line.id]?.focus(), 50);
        } else {
          setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
        }
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
      const idx = lines.findIndex((l) => l.id === line.id);
      const isLastRow = idx === lines.length - 1;
      const isBlank = !line.productId || line.quantity <= 0;
      if (isLastRow && isBlank) {
        setTimeout(() => narrationRef.current?.focus(), 50);
        return;
      }
      if (line.quantity > 0) {
        const priceInput = priceInputRefs.current[line.id];
        if (priceInput) {
          priceInput.focus();
          priceInput.select();
        }
      }
    }
  }, [lines]);
  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = lines.findIndex((l) => l.id === line.id);
      if (idx >= 0 && idx < lines.length - 1) {
        const nextLine = lines[idx + 1];
        setTimeout(() => itemNameInputRefs.current[nextLine.id]?.focus(), 50);
      } else {
        setTimeout(() => narrationRef.current?.focus(), 50);
      }
    }
  }, [lines]);
  const handleDiscPercentKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setTimeout(() => discAmountInputRefs.current[line.id]?.focus(), 50);
    }
  }, []);
  const handleDiscAmountKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = lines.findIndex((l) => l.id === line.id);
      if (idx >= 0 && idx < lines.length - 1) {
        const nextLine = lines[idx + 1];
        setTimeout(() => itemNameInputRefs.current[nextLine.id]?.focus(), 50);
      } else {
        setTimeout(() => narrationRef.current?.focus(), 50);
      }
    }
  }, [lines]);

  const calculations = {
    subTotal: lines.reduce((s, l) => s + l.total, 0),
    totalVat: lines.reduce((s, l) => s + l.vatAmount, 0),
    otherDiscount: Number(otherDiscount) || 0,
    otherCharges: Number(otherCharges) || 0,
    roundOff: Number(roundOff) || 0,
    grandTotal: 0,
  };
  calculations.grandTotal = calculations.subTotal - calculations.otherDiscount + calculations.otherCharges + calculations.roundOff;

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
          unitName: l.unitName || undefined,
        })),
        otherDiscount: calculations.otherDiscount,
        otherCharges: calculations.otherCharges,
        roundOff: calculations.roundOff,
        narration: narration || undefined,
      };
      const res = await salesApi.createSalesReturn(payload);
      setSaveDialogOpen(false);
      setSavedDialogMessage(`Sales Return ${res.data.data.invoiceNo} saved successfully.`);
      setSavedDialogOpen(true);
      setLines([emptyLine()]);
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setNarration('');
      setOtherDiscount(0);
      setOtherCharges(0);
      setRoundOff(0);
      setOriginalInvoiceIdForReturn(null);
      loadNextInvoiceNo();
    } catch (e: unknown) {
      setErrorDialogMessage((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Save failed');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [companyId, financialYearId, date, returnType, originalInvoiceIdForReturn, customerId, customerName, customerAddress, cashAccountId, vatType, taxMode, lines, otherDiscount, otherCharges, roundOff, narration, calculations, loadNextInvoiceNo]);

  const handleClear = useCallback(() => {
    setLines([emptyLine()]);
    setCustomerId(null);
    setCustomerName('CASH');
    setCustomerAddress('');
    setBillingAddress('');
    setBillingPhone('');
    setReturnId(null);
    setNarration('');
    setOtherDiscPercent(0);
    setOtherDiscount(0);
    setOtherCharges(0);
    setRoundOff(0);
    setRefInvoiceData(null);
    setOriginalInvoiceIdForReturn(null);
    loadNextInvoiceNo();
  }, [loadNextInvoiceNo]);

  const handleSearch = useCallback(async () => {
    if (!companyId || !searchInvoiceNo.trim()) {
      setSearchError('Enter return invoice number');
      return;
    }
    setSearchError('');
    setSearchLoading(true);
    try {
      const res = await salesApi.searchSalesReturn(companyId, searchInvoiceNo.trim());
      const data = res.data.data as {
        _id: string; invoiceNo: string; date: string; returnType: string;
        originalInvoiceId?: string;
        customerId?: string; customerName?: string; customerAddress?: string; cashAccountId?: string;
        vatType?: string; taxMode?: string; items: Array<{
          productId: string | { _id: string; name?: string };
          productCode?: string;
          description?: string;
          quantity: number;
          unitPrice: number;
          discount?: number;
          totalAmount?: number;
          unitName?: string;
        }>;
        otherDiscount?: number;
        otherCharges?: number;
        roundOff?: number;
        narration?: string;
      };
      setReturnId(data._id);
      setInvoiceNo(data.invoiceNo);
      setDate(data.date ? new Date(data.date).toISOString().slice(0, 10) : getCurrentDate());
      setReturnType((data.returnType || 'OnAccount') as 'OnAccount' | 'ByRef');
      setOriginalInvoiceIdForReturn(data.originalInvoiceId ?? null);
      setCustomerId(data.customerId ?? null);
      setCustomerName(data.customerName ?? 'CASH');
      setCustomerAddress(data.customerAddress ?? '');
      setVatType((data.vatType as 'Vat' | 'NonVat') || 'Vat');
      setTaxMode((data.taxMode as 'inclusive' | 'exclusive') || 'exclusive');
      setOtherDiscount(data.otherDiscount ?? 0);
      setOtherCharges(data.otherCharges ?? 0);
      setRoundOff(data.roundOff ?? 0);
      setNarration(data.narration ?? '');
      if (data.cashAccountId) setCashAccountId(data.cashAccountId);
      const newLines: LineItem[] = (data.items || []).map((it, idx) => {
        const pid = typeof it.productId === 'object' && it.productId !== null ? (it.productId as { _id: string })._id : String(it.productId);
        const name = typeof it.productId === 'object' && (it.productId as { name?: string }).name ? (it.productId as { name: string }).name : (it.description || '');
        const price = it.unitPrice ?? 0;
        const qty = it.quantity ?? 0;
        void (it.totalAmount ?? qty * price);
        const disc = it.discount ?? 0;
        const gross = qty * price;
        const net = gross - disc;
        const vatRate = data.vatType === 'NonVat' ? 0 : 5;
        const vatAmount = parseFloat((net * (vatRate / 100)).toFixed(2));
        const lineTotal = parseFloat((net + vatAmount).toFixed(2));
        const uname = (it.unitName as string) || 'Pcs';
        const uid = (it as { unitId?: string }).unitId || 'pcs';
        const availableUnits: UnitOption[] = [{ id: uid, name: uname }];
        return {
          id: `loaded-${idx}-${Date.now()}`,
          productId: pid,
          productCode: (it.productCode as string) || '',
          imei: ((it as any).imei as string) || '',
          name: name || '',
          unitId: uid,
          unitName: uname,
          availableUnits,
          quantity: qty,
          price,
          purchasePrice: 0,
          gross,
          discPercent: 0,
          discAmount: disc,
          vatAmount,
          total: lineTotal,
        };
      });
      setLines(newLines.length > 0 ? newLines : [emptyLine()]);
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
      handleClear();
    } catch (e: unknown) {
      setErrorDialogMessage((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Delete failed');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [returnId, companyId, handleClear]);

  const toggleRefItem = (itemId: string) => {
    setSelectedRefItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };
  const selectAllRefItems = (checked: boolean) => {
    if (!refInvoiceData) return;
    setSelectedRefItemIds(checked ? new Set(refInvoiceData.items.map((i) => i._id)) : new Set());
  };

  const selectedRefTotal = refInvoiceData
    ? refInvoiceData.items.filter((i) => selectedRefItemIds.has(i._id)).reduce((s, i) => s + (i.totalAmount ?? 0), 0)
    : 0;

  return (
    <Box sx={{ p: 2, minHeight: '100%', bgcolor: '#f1f5f9' }} onClick={() => dispatch(setDrawerOpen(false))}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f766e', mb: 1.5 }}>
        Sales Return
      </Typography>

      {/* Header - B2C style */}
      <Paper elevation={0} sx={{ px: 2, py: 1.5, mb: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
            <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.5, px: 1.5, py: 0.6, textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>RETURN NO</Typography>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.3 }}>{invoiceNo}</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.7}>
            <DateInput label="Date" value={date} onChange={setDate} size="small" />
          </Grid>
          <Grid item xs={7.5} sm={4.6875} md={3.90625} lg={3.4375}>
            <Autocomplete
              size="small"
              options={customers}
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
              value={customers.find((c) => c.name === customerName) || null}
              onChange={(_, v) => handleCustomerSelect(v)}
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
              InputProps={{ readOnly: !!customerId }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
                '& .MuiInputBase-input': { fontSize: '0.75rem' },
                '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                ...(customerId ? { '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1.5 } } : {}),
              }}
            />
          </Grid>
          <Grid item xs="auto">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setAddressDialogOpen(true)}
              sx={{ height: 38, textTransform: 'none', borderRadius: 1.5, borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}
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
              sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="inclusive">Include</MenuItem>
              <MenuItem value="exclusive">Exclude</MenuItem>
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
              sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="OnAccount">On Account</MenuItem>
              <MenuItem value="ByRef">By Ref</MenuItem>
            </TextField>
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
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
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
                  sx={{ height: 40, textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
                >
                  {refInvoiceLoading ? 'Loading...' : 'Load'}
                </Button>
              </Grid>
            </>
          )}
        </Grid>
        <Divider sx={{ my: 1.5 }} />
        <Grid container spacing={1.5} alignItems="center">
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
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="Retail">Retail</MenuItem>
              <MenuItem value="WSale">WSale</MenuItem>
              <MenuItem value="Special1">Special Price 1</MenuItem>
              <MenuItem value="Special2">Special Price 2</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1.2, py: 0.5, bgcolor: '#f8fafc', height: '100%' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>VAT TYPE</Typography>
              <RadioGroup row value={vatType} onChange={(e) => setVatType(e.target.value as 'Vat' | 'NonVat')}>
                <FormControlLabel value="Vat" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Vat" sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                <FormControlLabel value="NonVat" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Non Vat" sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
              </RadioGroup>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1.2, py: 0.5, bgcolor: '#f8fafc', height: '100%' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>PAYMENT</Typography>
              <RadioGroup row value={paymentType} onChange={(e) => {
                const val = e.target.value as 'Cash' | 'Credit';
                if (val === 'Credit' && !customerId) return;
                setPaymentType(val);
                if (val === 'Cash') {
                  setCustomerId(null);
                  setCustomerName('CASH');
                  setCustomerAddress('');
                }
              }}>
                <FormControlLabel value="Cash" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Cash" sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                <FormControlLabel value="Credit" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Credit" disabled={!customerId} sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
              </RadioGroup>
            </Box>
          </Grid>
        </Grid>

        {/* Product Info Section */}
        <Grid container spacing={1.5} alignItems="stretch" sx={{ mt: 0.5 }}>
          <Grid item xs={12} md={12} lg={12}>
            <Box sx={{
              borderRadius: 1.5, px: 1.5, py: 0.8, height: '100%', display: 'flex', alignItems: 'center', gap: 1.5,
              background: selectedProductInfo ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)' : '#f8fafc',
              border: selectedProductInfo ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
              transition: 'all 0.2s',
            }}>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'nowrap', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>P.Rate</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.3 }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.purchaseRate * activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, px: 1, py: 0.3, bgcolor: '#fef2f2', borderRadius: 1 }}>
                    <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#dc2626', fontWeight: 600 }}>Stock</Typography>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.3, color: '#dc2626' }}>
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
                    <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Vendor</Typography>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3 }}>{selectedProductInfo.lastVendor ?? '-'}</Typography>
                  </Box>
                  {activeMultiUnitInfo && (
                    <>
                      <Box sx={{ width: '1px', height: 28, bgcolor: '#0f766e', opacity: 0.2, flexShrink: 0 }} />
                      {activeMultiUnitInfo.pcsInside != null && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Pcs Inside</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, color: '#7c3aed' }}>{activeMultiUnitInfo.pcsInside}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.wholesale != null && activeMultiUnitInfo.wholesale > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>WSale</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, color: '#1565c0' }}>{activeMultiUnitInfo.wholesale.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.retail != null && activeMultiUnitInfo.retail > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Retail</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, color: '#15803d' }}>{activeMultiUnitInfo.retail.toFixed(2)}</Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Select a product to view details</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Product Grid - B2C style */}
      <Paper elevation={0} sx={{ mb: 1, width: '100%', overflow: 'hidden', border: '1px solid #e0e7ef', borderRadius: 2, bgcolor: 'white' }}>
        <TableContainer sx={{ minHeight: 320, maxHeight: 400, width: '100%', bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }}>
          <Table stickyHeader size="small" sx={{ minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, '& .MuiTableCell-root': { fontSize: '0.82rem' }, '& .MuiInputBase-input': { fontSize: '0.82rem' } }}>
            <TableHead>
              <TableRow>
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
                    bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem', width: col.w,
                    p: '6px 4px', textAlign: ci >= 5 ? 'right' : 'center', letterSpacing: 0.3, textTransform: 'uppercase',
                    borderRight: ci < 12 ? '1px solid rgba(255,255,255,0.15)' : 'none',
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
                  }}
                >
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '0.8rem', bgcolor: '#f1f5f9' }}>{idx + 1}</TableCell>
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" value={line.productCode} fullWidth InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }} />
                  </TableCell>
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" value={line.imei} onChange={(e) => updateLine(line.id, 'imei', e.target.value)} onKeyDown={(e) => handleImeiKeyDown(e, line)} inputRef={(el) => { imeiInputRefs.current[line.id] = el; }} fullWidth placeholder="IMEI" sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }} />
                  </TableCell>
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
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
                        autoSelect
                        autoHighlight
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            variant="outlined"
                            placeholder="Item name"
                            inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }}
                            onKeyDown={(e) => handleItemNameKeyDown(e, line)}
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
                          />
                        )}
                        ListboxProps={{
                          sx: {
                            p: 0,
                            maxHeight: 250,
                            overflowX: 'hidden',
                            overflowY: 'auto',
                            '&::-webkit-scrollbar': { display: 'none' },
                            msOverflowStyle: 'none',
                            scrollbarWidth: 'none',
                            '& .MuiAutocomplete-option': {
                              minHeight: 'auto', py: 0.75, px: 2, fontSize: '0.82rem', bgcolor: 'transparent',
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
                        onKeyDown={(e) => handleItemNameKeyDown(e, line)}
                        fullWidth
                        placeholder="Item name"
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }} onClick={(e) => e.stopPropagation()}>
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
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
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
                  <TableCell align="right" sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
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
                      inputProps={{ min: 0, style: { textAlign: 'center' }, inputMode: 'decimal' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : (line.price === 0 ? '' : String(line.price))}
                      onFocus={() => { setEditingNumericCell({ lineId: line.id, field: 'price', value: line.price === 0 ? '' : String(line.price) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'price' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : ''; updateLine(line.id, 'price', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handlePriceKeyDown(e, line)}
                      inputRef={(el) => { priceInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right' }, inputMode: 'decimal' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '5px 6px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', fontSize: '0.82rem', fontWeight: 500, color: '#475569' }}>{line.gross.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={() => { setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'discPercent', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handleDiscPercentKeyDown(e, line)}
                      inputRef={(el) => { discPercentInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center' }, inputMode: 'decimal' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={() => { setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.lineId === line.id && prev?.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : ''; updateLine(line.id, 'discAmount', parseNumericInput(raw)); setEditingNumericCell(null); }}
                      onKeyDown={(e) => handleDiscAmountKeyDown(e, line)}
                      inputRef={(el) => { discAmountInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right' }, inputMode: 'decimal' }}
                      fullWidth
                      sx={{ ...numberInputStyle, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '5px 6px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', fontSize: '0.82rem', fontWeight: 500, color: '#64748b' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '5px 6px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', fontWeight: 700, fontSize: '0.85rem', color: '#0f766e' }}>{line.total.toFixed(2)}</TableCell>
                  <TableCell sx={{ p: '3px', borderBottom: '1px solid #eef2f6', textAlign: 'center' }}>
                    <IconButton size="small" onClick={() => removeLine(line.id)} sx={{ p: 0.3, color: '#ef4444', '&:hover': { bgcolor: '#fee2e2' } }}>
                      <DeleteIcon sx={{ fontSize: '0.85rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Bottom - B2C style: Adjustments + Grand Total */}
      <Paper elevation={0} sx={{ p: 2, mb: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={5} lg={3.5}>
            <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', p: 1.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#475569', mb: 1.2, letterSpacing: 0.3, textTransform: 'uppercase' }}>Adjustments</Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Disc %" type="number" value={editingNumericCell?.field === 'otherDiscPercent' && !editingNumericCell?.lineId ? editingNumericCell.value : (otherDiscPercent === 0 ? '' : String(otherDiscPercent))} onFocus={() => setEditingNumericCell({ field: 'otherDiscPercent', value: otherDiscPercent === 0 ? '' : String(otherDiscPercent) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscPercent' ? editingNumericCell.value : ''; handleOtherDiscPercentChange(parseNumericInput(raw)); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal', max: 100 }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Discount" type="number" value={editingNumericCell?.field === 'otherDiscount' && !editingNumericCell?.lineId ? editingNumericCell.value : (otherDiscount === 0 ? '' : String(otherDiscount))} onFocus={() => setEditingNumericCell({ field: 'otherDiscount', value: otherDiscount === 0 ? '' : String(otherDiscount) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscount' ? editingNumericCell.value : ''; setOtherDiscount(parseNumericInput(raw)); setOtherDiscPercent(0); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Charges" type="number" value={editingNumericCell?.field === 'otherCharges' && !editingNumericCell?.lineId ? editingNumericCell.value : (otherCharges === 0 ? '' : String(otherCharges))} onFocus={() => setEditingNumericCell({ field: 'otherCharges', value: otherCharges === 0 ? '' : String(otherCharges) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherCharges' ? editingNumericCell.value : ''; setOtherCharges(parseNumericInput(raw)); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Round Off" type="number" value={editingNumericCell?.field === 'roundOff' && !editingNumericCell?.lineId ? editingNumericCell.value : (roundOff === 0 ? '' : String(roundOff))} onFocus={() => setEditingNumericCell({ field: 'roundOff', value: roundOff === 0 ? '' : String(roundOff) })} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'roundOff' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'roundOff' ? editingNumericCell.value : ''; setRoundOff(parseNumericInput(raw)); setEditingNumericCell(null); }} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField size="small" label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} inputRef={narrationRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
              </Grid>
            </Box>
          </Grid>
          <Grid item xs={12} md={3.5} lg={5}>
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Box sx={{ background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)', borderRadius: 2, p: 2, mb: 1.5, textAlign: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 0.3 }}>Grand Total</Typography>
                <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '2.2rem', lineHeight: 1.1, letterSpacing: -0.5 }}>{calculations.grandTotal.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', p: 1.5, flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>This Bill</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{calculations.subTotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Total VAT</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{calculations.totalVat.toFixed(2)}</Typography>
                </Box>
                {[
                  { label: 'Round Off', value: roundOff },
                  { label: 'Other Discount', value: otherDiscount },
                  { label: 'Other Charges', value: otherCharges },
                ].map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.2 }}>
                    <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>{item.label}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>{item.value.toFixed(2)}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Action buttons - B2C style */}
      <Paper elevation={0} sx={{ p: 1.5, width: '100%', borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            ref={saveButtonRef}
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => setSaveDialogOpen(true)}
            disabled={loading || (returnType === 'ByRef' && !originalInvoiceIdForReturn)}
            sx={{ minWidth: 100, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
          >
            Save
          </Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
            disabled={lines.filter((l) => l.productId && l.quantity > 0).length === 0}
            sx={{ minWidth: 100, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
          >
            Print
          </Button>
          <Button
            variant="contained"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            sx={{ minWidth: 100, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#15803d' } }}
          >
            Clear
          </Button>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => setSearchDialogOpen(true)}
            disabled={loading}
            sx={{ minWidth: 90, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
          >
            Edit
          </Button>
          <Button
            variant="contained"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!returnId}
            sx={{ minWidth: 100, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#15803d' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
          >
            Delete
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={() => setSearchDialogOpen(true)}
            sx={{ minWidth: 140, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#15803d' } }}
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
      <Dialog open={savedDialogOpen} onClose={() => setSavedDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Success</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{savedDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setSavedDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setErrorDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>
            OK
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
                  control={<Checkbox checked={selectedRefItemIds.size === refInvoiceData.items.length} onChange={(e) => selectAllRefItems(e.target.checked)} />}
                  label="Select All"
                  sx={{ '& .MuiFormControlLabel-label': { fontWeight: 600, color: '#475569' } }}
                />
              </Box>
              <TableContainer sx={{ maxHeight: 360, border: '1px solid #e2e8f0', borderRadius: 1.5, overflow: 'hidden' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}></TableCell>
                      <TableCell sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Item</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Qty</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Price</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.75rem' }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {refInvoiceData.items.map((it) => {
                      const name = typeof it.productId === 'object' && (it.productId as { name?: string }).name ? (it.productId as { name: string }).name : (it.description || '');
                      return (
                        <TableRow key={it._id} hover onClick={() => toggleRefItem(it._id)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f0fdfa' } }}>
                          <TableCell padding="checkbox">
                            <Checkbox checked={selectedRefItemIds.has(it._id)} onChange={() => toggleRefItem(it._id)} sx={{ color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }} />
                          </TableCell>
                          <TableCell>{name}</TableCell>
                          <TableCell align="right">{it.quantity}</TableCell>
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
    </Box>
  );
}
