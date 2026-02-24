import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, Button, Grid, IconButton,
  Autocomplete, RadioGroup, FormControlLabel, Radio,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, MenuItem,
} from '@mui/material';
import {
  Delete as DeleteIcon, Save as SaveIcon, Print as PrintIcon,
  Clear as ClearIcon, Search as SearchIcon, Send as SendIcon,
  KeyboardDoubleArrowLeft as FirstIcon, KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon, KeyboardDoubleArrowRight as LastIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { quotationApi, productApi, ledgerAccountApi, stockApi, salesApi, purchaseApi } from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';

/* ──────────────── Interfaces ──────────────── */

interface UnitOption {
  id: string; name: string; isMultiUnit: boolean;
  multiUnitId?: string; imei?: string; price?: number; conversion?: number;
  retail?: number; wholesale?: number; specialPrice1?: number; specialPrice2?: number;
}

interface LineItem {
  id: string; productId: string; productCode: string; imei: string; name: string;
  unitId: string; unitName: string; availableUnits: UnitOption[];
  quantity: number; price: number; purchasePrice: number; gross: number;
  discPercent: number; discAmount: number; vatAmount: number; total: number;
  /** Total available stock for this product in BASE UNIT pieces */
  baseStockPieces: number;
  /** When set, user can only enter up to this many pieces (selected batch qty) */
  batchMaxPieces?: number;
  /** Batch number selected for this line (used for cross-row batch cap checks) */
  batchNumber?: string;
  isCommitted: boolean;
}

interface MultiUnit {
  multiUnitId: string; imei?: string; conversion?: number; price?: number;
  totalPrice?: number; retail?: number; wholesale?: number;
  specialPrice1?: number; specialPrice2?: number;
  unitId?: { _id: string; name?: string; shortCode?: string } | string;
}

interface Product {
  _id: string; code?: string; name: string; imei?: string;
  retailPrice?: number; wholesalePrice?: number; purchasePrice?: number;
  allowBatches?: boolean;
  unitOfMeasureId?: { _id: string; name?: string; shortCode?: string } | string;
  multiUnits?: MultiUnit[];
}

interface Customer { _id: string; code?: string; name: string; address?: string; phone?: string; }

const emptyLine = (): LineItem => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
  productId: '', productCode: '', imei: '', name: '',
  unitId: '', unitName: '', availableUnits: [],
  quantity: 0, price: 0, purchasePrice: 0, gross: 0,
  discPercent: 0, discAmount: 0, vatAmount: 0, total: 0,
  baseStockPieces: 0,
  isCommitted: false,
});

/* ════════════════════════════════════════════════════════════ */
export default function QuotationSales() {
  // Item Name list: same sort/filter logic as Cash/Customer A/C field
  const productFilterOptions = useMemo(
    () => (options: Product[], state: { inputValue: string }) => {
      const q = (state.inputValue || '').trim().toLowerCase();
      const name = (p: Product) => (p.name || '').toLowerCase();
      const sortByName = (arr: Product[]) =>
        arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      // When no search: show full list sorted alphabetically (like Cash/Customer A/C)
      if (!q) return sortByName(options);
      const startsWith = options.filter((p) => name(p).startsWith(q));
      const containsOnly = options.filter((p) => name(p).includes(q) && !name(p).startsWith(q));
      return [...sortByName(startsWith), ...sortByName(containsOnly)];
    },
    []
  );

  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);
  const financialYearId = useSelector((s: RootState) => s.app.selectedFinancialYearId);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const routeLocation = useLocation();

  const handlePageClick = useCallback(() => { dispatch(setDrawerOpen(false)); }, [dispatch]);

  /* ──── State ──── */
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [date, setDate] = useState(getCurrentDate);
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>('Vat');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [rateType, setRateType] = useState<'Retail' | 'WSale' | 'Special1' | 'Special2'>('WSale');
  const [location, setLocation] = useState('MAIN BRANCH');

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('CASH');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pendingCustomerName, setPendingCustomerName] = useState<string | null>(null);

  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [billingAddress, setBillingAddress] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [billingNarration, setBillingNarration] = useState('');
  const [shippingName, setShippingName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  const [shippingContactPerson, setShippingContactPerson] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [freightCharge, setFreightCharge] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [narration, setNarration] = useState('');

  // Numeric field editing: allow ".02" and trailing zeros while typing
  const [editingNumericCell, setEditingNumericCell] = useState<{ lineId?: string; field: string; value: string } | null>(null);
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === '-') return 0;
    const normalized = raw === '.' || (/^\.\d*$/.test(raw)) ? '0' + raw : raw;
    return parseFloat(normalized) || 0;
  };

  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoiceIds, setInvoiceIds] = useState<string[]>([]);

  // Product info for side panel
  const [selectedProductInfo, setSelectedProductInfo] = useState<{
    profit: number; purchaseRate: number; retailPrice: number; wholesalePrice: number;
    stock?: number; totalStock?: number; lastVendor?: string; batchNumber?: string; expiryDate?: string;
  } | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  // Derive multi-unit info from current lines state (always up-to-date)
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

  // Batch selection (for products with allowBatches and multiple batches)
  const batchRowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [focusedBatchIndex, setFocusedBatchIndex] = useState(0);
  const [availableBatches, setAvailableBatches] = useState<{
    batchNumber: string;
    productId: string;
    productName: string;
    purchasePrice: number;
    expiryDate: string;
    quantity: number;
    retail: number;
    wholesale: number;
  }[]>([]);
  const [pendingProductSelection, setPendingProductSelection] = useState<{
    lineId: string;
    product: Product;
    matchedMultiUnitId?: string;
    searchedImei?: string;
  } | null>(null);

  useEffect(() => {
    if (batchDialogOpen && batchRowRefs.current[focusedBatchIndex]) {
      batchRowRefs.current[focusedBatchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [batchDialogOpen, focusedBatchIndex]);

  /* ──── Dialogs ──── */
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editSuccessDialogOpen, setEditSuccessDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertMessage, setStockAlertMessage] = useState('');

  // Transaction History (Ctrl+M)
  const [txnHistoryDialogOpen, setTxnHistoryDialogOpen] = useState(false);
  const [txnHistoryData, setTxnHistoryData] = useState<Array<{ invoiceNo: string; date: string; customerName: string; quantity: number; unitPrice: number; unitName: string; discount: number; total: number }>>([]);
  const [txnHistoryProductName, setTxnHistoryProductName] = useState('');
  const [txnHistoryLoading, setTxnHistoryLoading] = useState(false);
  const [txnHistorySelectedIdx, setTxnHistorySelectedIdx] = useState(0);
  const [txnHistorySourceLineId, setTxnHistorySourceLineId] = useState<string | null>(null);
  // Profit Dialog (Ctrl+P)
  const [profitDialogOpen, setProfitDialogOpen] = useState(false);


  /* ──── Refs ──── */
  const customerAcRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const taxModeRef = useRef<HTMLInputElement>(null);
  const rateTypeRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const narrationRef = useRef<HTMLInputElement>(null);
  const imeiInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameSnapshotRef = useRef<{ lineId: string, data: LineItem } | null>(null);
  const itemNameListboxOpenRef = useRef(false);

  const unitInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const priceInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const discPercentInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const discAmountInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Row commit/revert snapshot (matches SalesB2C pattern)
  const rowSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);
  const rowCommittedRef = useRef(false);
  const txnHistoryRowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

  // When QTY exceeds stock, store lineId to refocus after dialog closes
  const qtyOverflowLineIdRef = useRef<string | null>(null);

  // Cache check for stock so we don't spam API
  const stockCacheRef = useRef<Map<string, { stock: number; ts: number }>>(new Map());
  const STOCK_CACHE_TTL = 30_000; // 30 seconds

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

  /* ──── Constants ──── */
  const VAT_RATE = 5;

  /* ──── Helpers ──── */
  const showErrorDialog = (msg: string) => { setErrorDialogMessage(msg); setErrorDialogOpen(true); };

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
    // When Vat: adjustments (other disc, other charges, freight, round off) are inclusive of tax — extract VAT
    const netAdjustments = otherCharges + freightCharge + roundOff - otherDiscount;
    const vatFromAdjustments = vatType === 'Vat' && netAdjustments !== 0
      ? parseFloat((netAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2))
      : 0;
    const totalVat = itemsVat + vatFromAdjustments;
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + roundOff;
    const totalItems = lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
    return { itemsGross, itemsDiscount, itemsVat, vatFromAdjustments, totalVat, subTotal, grandTotal, totalItems };
  }, [lines, otherDiscount, otherCharges, freightCharge, roundOff, vatType]);

  const handleOtherDiscPercentChange = (percent: number) => {
    setOtherDiscPercent(percent);
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    setOtherDiscount(parseFloat(((subTotal * percent) / 100).toFixed(2)));
  };

  const loadNextInvoiceNo = async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await quotationApi.getNextInvoiceNo(companyId, financialYearId);
      setInvoiceNo(res.data.data.invoiceNo);
    } catch (error) {
      console.error('Failed to load next invoice no:', error);
    }
  };

  /* ──── Data Loading ──── */
  useEffect(() => {
    if (!companyId || !financialYearId) return;
    loadNextInvoiceNo();
    loadProducts();
    loadCustomers();
    loadInvoiceIds();
    // Focus Cash/Customer A/C when page is ready (company & FY selected)
    const focusTimer = setTimeout(() => customerAcRef.current?.focus(), 400);
    return () => clearTimeout(focusTimer);
  }, [companyId, financialYearId]);

  // Focus customer AC when navigating to this page
  useEffect(() => {
    if (routeLocation.pathname === '/entry/quotation-sales') {
      setTimeout(() => customerAcRef.current?.focus(), 300);
    }
  }, [routeLocation.pathname]);

  // Return from customer creation
  useEffect(() => {
    if (pendingCustomerName && routeLocation.pathname === '/entry/quotation-sales') {
      loadCustomers();
      const timer = setTimeout(() => {
        const match = customers.find((c) => c.name?.toLowerCase() === pendingCustomerName?.toLowerCase());
        if (match) {
          setCustomerId(match._id);
          setCustomerName(match.name);
          setCustomerAddress(match.address || '');
          setPendingCustomerName(null);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [routeLocation.pathname, pendingCustomerName, customers]);

  const loadProducts = async () => {
    try {
      const res = await productApi.list(companyId!, { limit: 10000 });
      setProducts((res.data.data.products || []) as Product[]);
    } catch { /* ignore */ }
  };

  const loadCustomers = async () => {
    try {
      const res = await ledgerAccountApi.list(companyId!, 'Customer');
      const cashCustomer = { _id: 'cash', code: 'CASH', name: 'CASH', address: '' } as Customer;
      setCustomers([cashCustomer, ...(res.data.data as Customer[])]);
    } catch {
      setCustomers([{ _id: 'cash', code: 'CASH', name: 'CASH', address: '' } as Customer]);
    }
  };

  const loadInvoiceIds = async () => {
    try {
      const res = await quotationApi.list(companyId!, financialYearId!);
      setInvoiceIds(res.data.data.invoices.map((i) => i._id));
    } catch { /* ignore */ }
  };

  /* ──── Line Item Handlers ──── */
  const updateLine = useCallback(
    (id: string, field: keyof LineItem, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };

          // Cap quantity to available stock (or to batch max when a batch was selected)
          if (field === 'quantity' && updated.productId) {
            const currentUnit = updated.availableUnits.find((u) => u.id === updated.unitId);
            const conv = (currentUnit?.isMultiUnit && currentUnit?.conversion) ? currentUnit.conversion : 1;
            let maxQtyForThisRow = 0;
            let stockCheckActive = false;
            if (updated.batchMaxPieces != null && updated.batchMaxPieces > 0) {
              // Batch cap: subtract qty used by other rows with same product AND same batch
              const usedByOtherBatchRows = prev.reduce((sum, l) => {
                if (l.id === id || l.productId !== updated.productId) return sum;
                if (l.batchNumber !== updated.batchNumber) return sum;
                const u = l.availableUnits.find((au) => au.id === l.unitId);
                const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
                return sum + (l.quantity * c);
              }, 0);
              maxQtyForThisRow = (updated.batchMaxPieces - usedByOtherBatchRows) / conv;
              stockCheckActive = true;
            } else if (updated.baseStockPieces > 0) {
              const usedByOtherRows = prev.reduce((sum, l) => {
                if (l.id === id || l.productId !== updated.productId) return sum;
                const u = l.availableUnits.find((au) => au.id === l.unitId);
                const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
                return sum + (l.quantity * c);
              }, 0);
              const remainingPieces = updated.baseStockPieces - usedByOtherRows;
              maxQtyForThisRow = remainingPieces / conv;
              stockCheckActive = true;
            }
            if (stockCheckActive && updated.quantity > Math.max(maxQtyForThisRow, 0)) {
              updated.quantity = 0;
            }
          }

          if (field === 'price' && typeof updated.price === 'number') {
            updated.price = parseFloat(updated.price.toFixed(2));
          }

          if (['quantity', 'price', 'discPercent', 'discAmount'].includes(field)) {
            updated.gross = parseFloat((updated.quantity * updated.price).toFixed(2));
            if (field === 'discPercent') {
              updated.discAmount = parseFloat(((updated.gross * updated.discPercent) / 100).toFixed(2));
            } else if (field === 'discAmount') {
              updated.discPercent = updated.gross > 0 ? parseFloat(((updated.discAmount / updated.gross) * 100).toFixed(2)) : 0;
            }
            const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
            const vt = calcVatAndTotal(net, vatType === 'Vat');
            updated.vatAmount = vt.vatAmount;
            updated.total = vt.total;
          }
          return updated;
        })
      );
    },
    [vatType, calcVatAndTotal]
  );

  const removeLine = useCallback((id: string) => {
    // Clear snapshot if the removed row was being edited
    if (rowSnapshotRef.current?.lineId === id) {
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.length > 0 ? filtered : [emptyLine()];
    });
    setSelectedProductInfo(null);
    setActiveLineId(null);
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

  type BatchOption = typeof availableBatches[0];

  const completeProductSelection = useCallback(
    async (lineId: string, product: Product, selectedBatch?: BatchOption | null, matchedMultiUnitId?: string, searchedImei?: string) => {
      let mainPrice = 0;
      if (rateType === 'WSale') {
        mainPrice = selectedBatch?.wholesale ?? product.wholesalePrice ?? product.retailPrice ?? 0;
      } else if (rateType === 'Special1') {
        mainPrice = (product as any).specialPrice ?? product.retailPrice ?? 0;
      } else if (rateType === 'Special2') {
        mainPrice = (product as any).specialPrice2 ?? product.retailPrice ?? 0;
      } else {
        mainPrice = selectedBatch?.retail ?? product.retailPrice ?? 0;
      }
      mainPrice = parseFloat(mainPrice.toFixed(2));
      const purchaseRate = (product as any).purchasePrice ?? selectedBatch?.purchasePrice ?? 0;

      // Build available units
      const availableUnits: UnitOption[] = [];
      const mainUnit = product.unitOfMeasureId;
      if (mainUnit) {
        const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
        const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
        availableUnits.push({ id: mainUnitId, name: mainUnitName, isMultiUnit: false, imei: product.imei, price: mainPrice });
      }
      if (product.allowBatches === false && product.multiUnits?.length) {
        product.multiUnits.forEach((mu) => {
          const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
          const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
          if (muUnitId) {
            let muPrice = 0;
            const muRetail = mu.retail ?? 0, muWholesale = mu.wholesale ?? 0, muSp1 = mu.specialPrice1 ?? 0, muSp2 = mu.specialPrice2 ?? 0;
            if (rateType === 'WSale') muPrice = muWholesale;
            else if (rateType === 'Special1') muPrice = muSp1;
            else if (rateType === 'Special2') muPrice = muSp2;
            else muPrice = muRetail;
            if (!muPrice) muPrice = muRetail || muWholesale || 0;
            availableUnits.push({ id: muUnitId, name: muUnitName, isMultiUnit: true, multiUnitId: mu.multiUnitId, imei: mu.imei, price: muPrice, conversion: mu.conversion, retail: muRetail, wholesale: muWholesale, specialPrice1: muSp1, specialPrice2: muSp2 });
          }
        });
      }

      let selectedUnit: UnitOption | null = null;
      if (matchedMultiUnitId) {
        selectedUnit = availableUnits.find((u) => u.multiUnitId === matchedMultiUnitId) || null;
      }
      if (!selectedUnit && searchedImei) {
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
      const usePrice = parseFloat((selectedUnit?.price ?? mainPrice).toFixed(2));

      if (selectedUnit?.isMultiUnit) {
      } else {
      }

      let totalStock = 0;
      if (selectedBatch && selectedBatch.batchNumber !== 'MERGED') {
        // Real batch — use batch-level quantity
        totalStock = selectedBatch.quantity;
      } else {
        // No batch or merged batch — fetch real-time stock from InventoryTransaction
        let apiStock = 0;
        try {
          if (companyId) {
            const stockRes = await stockApi.getProductStock(companyId, product._id);
            apiStock = stockRes.data.data?.stock ?? 0;
          }
        } catch {
          apiStock = 0;
        }
        // For merged batches: use whichever is higher to avoid false out-of-stock blocks
        const batchStock = selectedBatch ? selectedBatch.quantity : 0;
        totalStock = Math.max(apiStock, batchStock);
      }

      let remainingStock = totalStock;
      if (!selectedBatch || selectedBatch.batchNumber === 'MERGED') {
        const usedInGrid = lines.reduce((sum, l) => {
          if (l.productId === product._id && l.id !== lineId) {
            const unit = l.availableUnits.find((u) => u.id === l.unitId);
            const conv = (unit?.isMultiUnit && unit?.conversion) ? unit.conversion : 1;
            return sum + (l.quantity * conv);
          }
          return sum;
        }, 0);
        remainingStock = totalStock - usedInGrid;
      }

      if (remainingStock <= 0) {
        setStockAlertMessage(`Cannot add "${product.name}" — no stock available.`);
        setStockAlertOpen(true);
        return;
      }

      const effectiveMaxQty = (selectedUnit?.isMultiUnit && selectedUnit?.conversion && selectedUnit.conversion > 0)
        ? remainingStock / selectedUnit.conversion
        : remainingStock;
      if (effectiveMaxQty <= 0) {
        setStockAlertMessage(`Cannot add "${product.name}" — not enough stock for this unit.`);
        setStockAlertOpen(true);
        return;
      }

      const defaultQty = Math.min(1, parseFloat(effectiveMaxQty.toFixed(4)));

      setSelectedProductInfo({
        profit: usePrice - purchaseRate, purchaseRate,
        retailPrice: selectedBatch?.retail ?? product.retailPrice ?? 0,
        wholesalePrice: selectedBatch?.wholesale ?? product.wholesalePrice ?? 0,
        stock: remainingStock, totalStock,
        lastVendor: (product as any).lastVendor ?? '-',
        batchNumber: selectedBatch?.batchNumber ?? (product as any).batchNumber ?? '',
        expiryDate: selectedBatch?.expiryDate ?? (product as any).expiryDate ?? '',
      });
      setActiveLineId(lineId);

      if (!rowSnapshotRef.current) {
        rowCommittedRef.current = true;
      }

      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = {
            ...line,
            productId: product._id,
            productCode: product.code || '',
            name: product.name,
            imei: selectedUnit?.imei || product.imei || '',
            unitId: selectedUnit?.id || '',
            unitName: selectedUnit?.name || '',
            availableUnits,
            quantity: defaultQty,
            baseStockPieces: totalStock,
            // Only cap by batch quantity for REAL batches — MERGED batch qty is unreliable
            batchMaxPieces: (selectedBatch && selectedBatch.batchNumber !== 'MERGED') ? selectedBatch.quantity : undefined,
            batchNumber: selectedBatch?.batchNumber,
            price: usePrice,
            purchasePrice: purchaseRate,
            gross: parseFloat((defaultQty * usePrice).toFixed(2)),
          };
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        })
      );

      setTimeout(() => { qtyInputRefs.current[lineId]?.focus(); }, 100);
    },
    [rateType, vatType, calcVatAndTotal, companyId, lines]
  );

  const handleProductSelect = useCallback(
    async (lineId: string, product: Product | null, matchedMultiUnitId?: string, searchedImei?: string) => {
      if (!product) {
        updateLine(lineId, 'productId', '');
        updateLine(lineId, 'productCode', '');
        updateLine(lineId, 'name', '');
        updateLine(lineId, 'price', 0);
        setSelectedProductInfo(null);
        setActiveLineId(null);
        return;
      }

      const batches = await getBatchesForProduct(product._id);
      // Only show batch dialog when batch selection is explicitly enabled (allowBatches === true). Applies to ALL products.
      const batchSelectionEnabled = product.allowBatches === true;

      if (!batchSelectionEnabled) {
        if (batches.length > 0) {
          const nonZeroBatches = batches.filter((b) => b.quantity > 0);
          const avgPurchasePrice = nonZeroBatches.length > 0
            ? nonZeroBatches.reduce((sum, b) => sum + b.purchasePrice, 0) / nonZeroBatches.length
            : batches[0].purchasePrice;
          const totalQty = nonZeroBatches.reduce((sum, b) => sum + b.quantity, 0) || batches.reduce((sum, b) => sum + b.quantity, 0);
          const avgRetail = nonZeroBatches.length > 0
            ? nonZeroBatches.reduce((sum, b) => sum + b.retail, 0) / nonZeroBatches.length
            : batches[0].retail;
          const avgWholesale = nonZeroBatches.length > 0
            ? nonZeroBatches.reduce((sum, b) => sum + b.wholesale, 0) / nonZeroBatches.length
            : batches[0].wholesale;
          const mergedBatch: BatchOption = {
            batchNumber: 'MERGED',
            productId: product._id,
            productName: product.name,
            purchasePrice: avgPurchasePrice,
            expiryDate: '',
            quantity: totalQty,
            retail: avgRetail,
            wholesale: avgWholesale,
          };
          await completeProductSelection(lineId, product, mergedBatch, matchedMultiUnitId, searchedImei);
        } else {
          await completeProductSelection(lineId, product, undefined, matchedMultiUnitId, searchedImei);
        }
        return;
      }

      if (batches.length > 1) {
        setAvailableBatches(batches);
        setPendingProductSelection({ lineId, product, matchedMultiUnitId, searchedImei });
        setFocusedBatchIndex(0);
        setBatchDialogOpen(true);
        return;
      }

      if (batches.length === 1) {
        await completeProductSelection(lineId, product, batches[0], matchedMultiUnitId, searchedImei);
      } else {
        await completeProductSelection(lineId, product, undefined, matchedMultiUnitId, searchedImei);
      }
    },
    [getBatchesForProduct, completeProductSelection, updateLine]
  );

  const handleBatchSelect = useCallback(async (selectedBatch: BatchOption) => {
    if (pendingProductSelection) {
      await completeProductSelection(
        pendingProductSelection.lineId,
        pendingProductSelection.product,
        selectedBatch,
        pendingProductSelection.matchedMultiUnitId,
        pendingProductSelection.searchedImei
      );
    }
    setBatchDialogOpen(false);
    setAvailableBatches([]);
    setPendingProductSelection(null);
  }, [pendingProductSelection, completeProductSelection]);

  const handleBatchDialogClose = useCallback(() => {
    setBatchDialogOpen(false);
    setAvailableBatches([]);
    setPendingProductSelection(null);
    setFocusedBatchIndex(0);
  }, []);

  const handleBatchDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!batchDialogOpen || availableBatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedBatchIndex((prev) => (prev < availableBatches.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedBatchIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedBatch = availableBatches[focusedBatchIndex];
      if (selectedBatch) handleBatchSelect(selectedBatch);
    } else if (e.key === 'Escape') {
      handleBatchDialogClose();
    }
  }, [batchDialogOpen, availableBatches, focusedBatchIndex, handleBatchSelect, handleBatchDialogClose]);

  // Handle unit change in the grid — recalculate price/totals for new unit
  const handleUnitChange = useCallback(
    (lineId: string, unitId: string) => {
      const currentLine = lines.find((l) => l.id === lineId);
      const selectedUnit = currentLine?.availableUnits.find((u) => u.id === unitId);
      if (!currentLine || !selectedUnit) return;

      // Pick multi-unit price based on rateType
      let newPrice = selectedUnit.price ?? currentLine.price;
      if (selectedUnit.isMultiUnit) {
        if (rateType === 'WSale' && selectedUnit.wholesale) newPrice = selectedUnit.wholesale;
        else if (rateType === 'Special1' && selectedUnit.specialPrice1) newPrice = selectedUnit.specialPrice1;
        else if (rateType === 'Special2' && selectedUnit.specialPrice2) newPrice = selectedUnit.specialPrice2;
        else if (rateType === 'Retail' && selectedUnit.retail) newPrice = selectedUnit.retail;
      }
      newPrice = parseFloat(newPrice.toFixed(2));

      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const conv = (selectedUnit.isMultiUnit && selectedUnit.conversion && selectedUnit.conversion > 0) ? selectedUnit.conversion : 1;
          let maxPieces: number;
          if (line.batchMaxPieces != null && line.batchMaxPieces > 0) {
            maxPieces = line.batchMaxPieces;
          } else {
            const usedByOtherRows = prev.reduce((sum, l) => {
              if (l.id === lineId || l.productId !== line.productId) return sum;
              const u = l.availableUnits.find((au) => au.id === l.unitId);
              const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
              return sum + (l.quantity * c);
            }, 0);
            maxPieces = line.baseStockPieces - usedByOtherRows;
          }
          const maxQty = Math.max(maxPieces / conv, 0);
          const newQuantity = Math.min(line.quantity, parseFloat(maxQty.toFixed(4)));

          const updated = {
            ...line,
            unitId: selectedUnit.id,
            unitName: selectedUnit.name,
            imei: selectedUnit.imei || '',
            price: newPrice,
            quantity: newQuantity,
            discPercent: 0,
            discAmount: 0,
          };
          updated.gross = parseFloat((updated.quantity * updated.price).toFixed(2));
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        })
      );

      // Update product info for multi-unit
      const isMulti = selectedUnit.isMultiUnit && selectedUnit.conversion;
      const multiCost = isMulti ? currentLine.purchasePrice * (selectedUnit.conversion!) : currentLine.purchasePrice;
      const profit = newPrice - multiCost;
      setSelectedProductInfo((prev) => prev ? { ...prev, profit } : null);

      if (isMulti) {
      }
    },
    [vatType, lines, rateType, calcVatAndTotal]
  );

  // Debounce timer for stock API calls
  const stockDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update Product Info when scrolling through product dropdown (debounced to avoid API flooding)
  const handleProductHighlight = useCallback((_e: React.SyntheticEvent, option: unknown) => {
    if (!option || typeof option === 'string') return;
    const product = option as Product;

    // Show instantly available info first (no API call)
    setSelectedProductInfo({
      profit: 0,
      purchaseRate: product.purchasePrice ?? 0,
      lastVendor: (product as any).lastVendor ?? (product as any).lastSupplier ?? '-',
      stock: (product as any).stock ?? 0,
      totalStock: (product as any).stock ?? 0,
      retailPrice: product.retailPrice ?? 0,
      wholesalePrice: product.wholesalePrice ?? 0,
      batchNumber: (product as any).batchNumber ?? '',
      expiryDate: (product as any).expiryDate ?? '',
    });

    // Debounce the stock API call (300ms)
    if (stockDebounceRef.current) clearTimeout(stockDebounceRef.current);
    stockDebounceRef.current = setTimeout(async () => {
      try {
        if (companyId && product._id) {
          const stockRes = await stockApi.getProductStock(companyId, product._id);
          const actualStock = stockRes.data.data?.stock ?? 0;
          setSelectedProductInfo((prev) => prev ? { ...prev, totalStock: actualStock, stock: actualStock } : null);
        }
      } catch {
        // keep the previously shown stock value
      }
    }, 300);
  }, [companyId]);

  /* ──── Key Navigation Handlers ──── */
  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>) => { e.target.select(); };

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    // Prevent up/down arrow increment/decrement on number fields
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      return;
    }
    // Allow: backspace, delete, tab, escape, enter, minus, arrows, home, end
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', '-', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (allowedKeys.includes(e.key) || (e.ctrlKey && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase()))) {
      return;
    }
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const selStart = input.selectionStart ?? value.length;
    const selEnd = input.selectionEnd ?? value.length;
    // Allow decimal point only if not already present
    if (e.key === '.') {
      if (value.includes('.')) { e.preventDefault(); }
      return;
    }
    // Block if not a number
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return;
    }
    // Restrict to 2 decimal places
    const dotIndex = value.indexOf('.');
    if (dotIndex !== -1 && selStart === selEnd) {
      const decimals = value.substring(dotIndex + 1);
      if (decimals.length >= 2 && selStart > dotIndex) {
        e.preventDefault();
      }
    }
  };

  // Handle arrow up/down navigation between rows for the same field
  const handleGridArrowNavigation = (
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
        setActiveLineId(targetLine.id);
        const targetInput = fieldRefs.current[targetLine.id];
        if (targetInput) {
          targetInput.focus();
          targetInput.select();
        }
      }
    }
  };

  const handleCustomerSelect = (customer: Customer | null) => {
    if (!customer) {
      setCustomerId(null);
      setCustomerName('CASH');
      setCustomerAddress('');
      setBillingAddress('');
      setBillingPhone('');
      return;
    }
    const isCash = customer._id === 'cash';
    setCustomerId(isCash ? null : customer._id);
    setCustomerName(customer.name);
    setCustomerAddress(customer.address || '');
    setBillingAddress(customer.address || '');
    setBillingPhone((customer as any).phone || '');
  };

  const handleCustomerAcKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target as HTMLInputElement;
      if (input.getAttribute('aria-expanded') === 'true') return;
      if (!customerId) {
        const typed = customerName.trim();
        if (typed && typed.toLowerCase() !== 'cash') {
          setPendingCustomerName(typed);
          navigate('/master/ledger/customer/new', { state: { prefillName: typed, returnTo: '/entry/quotation-sales' } });
          return;
        }
      }
      rateTypeRef.current?.focus();
    }
  };

  const handleRateTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstLineId = lines[0]?.id;
      if (firstLineId) {
        setTimeout(() => imeiInputRefs.current[firstLineId]?.focus(), 50);
      }
    }
  };

  // Revert uncommitted row edits back to snapshot
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
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

  // Called when user enters a row (click or focus from keyboard navigation)
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

  // IMEI / barcode search — look up product by IMEI and auto-select
  const handleImeiSearch = useCallback(
    async (lineId: string, imei: string) => {
      if (!imei || !companyId) return;
      const searchImei = imei.trim();
      try {
        const res = await productApi.getByImei(companyId, searchImei);
        if (res.data.data) {
          const data = res.data.data as { product?: Product; matchedMultiUnitId?: string } | Product;
          const product = 'product' in data && data.product ? data.product : data as Product;
          const matchedMultiUnitId = 'matchedMultiUnitId' in data ? data.matchedMultiUnitId : undefined;
          await handleProductSelect(lineId, product, matchedMultiUnitId, searchImei);

          // Don't create new row if any other row is missing Item Code
          const otherRowsMissingItemCode = lines.some((l) => l.id !== lineId && !l.productCode);
          if (otherRowsMissingItemCode) return;

          // Add a new row and focus on its IMEI field
          const newLine = emptyLine();
          setLines((prev) => [...prev, newLine]);
          setTimeout(() => {
            imeiInputRefs.current[newLine.id]?.focus();
          }, 100);
        }
      } catch {
        // ignore — product not found by IMEI
      }
    },
    [companyId, handleProductSelect, lines]
  );

  const handleImeiKeyDown = (e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = lines.find((l) => l.id === lineId);
      if (line?.imei) {
        // IMEI entered — search for product by IMEI
        handleImeiSearch(lineId, line.imei);
      } else {
        // No IMEI — move to Item Name
        itemNameInputRefs.current[lineId]?.focus();
      }
    }
  };

  // Handle Enter key on Unit field — focus on Qty
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

  // Open batch dialog for a line that has a batched product (called only on Enter key in item field)
  const openBatchDialogForLine = useCallback(async (line: LineItem): Promise<boolean> => {
    if (!line.productId) return false;
    const product = products.find((p) => p._id === line.productId);
    if (!product || product.allowBatches !== true) return false;
    const batches = await getBatchesForProduct(product._id);
    if (batches.length > 1) {
      setAvailableBatches(batches);
      setPendingProductSelection({ lineId: line.id, product });
      setFocusedBatchIndex(0);
      setBatchDialogOpen(true);
      return true;
    }
    return false;
  }, [products, getBatchesForProduct]);

  // Handle Enter key on Item Name field; Enter on batched product opens batch dialog
  const handleItemNameKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      // Use current input value from DOM so we don't rely on state (user may have just typed and state not yet updated)
      const inputEl = (e.target as HTMLElement)?.closest?.('input') || (e.target as HTMLInputElement) || itemNameInputRefs.current[line.id];
      const currentTyped = (inputEl && 'value' in inputEl ? (inputEl as HTMLInputElement).value : line.name) ?? '';
      const typed = currentTyped.trim();

      // If list is open, let Autocomplete handle the Enter key to select the highlighted item
      if (itemNameListboxOpenRef.current) {
        if (!typed) return; // Full list open, user selecting an option

        const isPrefixOfAny = products.some((p) => (p.name && String(p.name).toLowerCase().includes(typed.toLowerCase())));
        if (isPrefixOfAny) return;
      }

      // If user typed an exact product name (match by name), select that product immediately without waiting for list selection
      if (typed) {
        const exactMatch = products.find((p) => p.name.trim().toLowerCase() === typed.toLowerCase());
        const currentProduct = line.productId ? products.find((p) => p._id === line.productId) : null;
        const isDifferentProduct = !currentProduct || currentProduct.name.trim().toLowerCase() !== typed.toLowerCase();
        if (exactMatch && isDifferentProduct) {
          e.preventDefault();
          e.stopPropagation();
          handleProductSelect(line.id, exactMatch).then(() => {
            setTimeout(() => {
              qtyInputRefs.current[line.id]?.focus();
              qtyInputRefs.current[line.id]?.select();
            }, 100);
          });
          return;
        }
      }

      // If row already has a batched product, Enter always opens batch dialog (e.g. return to item field and press Enter)
      if (line.productId) {
        e.preventDefault();
        e.stopPropagation();
        openBatchDialogForLine(line).then((opened) => {
          if (!opened) {
            setTimeout(() => {
              qtyInputRefs.current[line.id]?.focus();
              qtyInputRefs.current[line.id]?.select();
            }, 50);
          }
        });
        return;
      }

      // If item name is blank and no product selected
      if (!line.productId && !typed && !itemNameListboxOpenRef.current) {
        const currentIndex = lines.findIndex((l) => l.id === line.id);
        if (currentIndex === lines.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => saveButtonRef.current?.focus(), 50);
          return;
        }
      }
      // If the row already has a product but name was edited to another exact match (handled above); otherwise restore/correct name
      if (line.productId) {
        const product = products.find((p) => p._id === line.productId);
        if (product && line.name !== product.name) {
          updateLine(line.id, 'name', product.name);
        }
        // Move focus to qty field (batched product case already handled above)
        setTimeout(() => {
          qtyInputRefs.current[line.id]?.focus();
          qtyInputRefs.current[line.id]?.select();
        }, 50);
      }
    }
  }, [products, updateLine, handleProductSelect, lines, openBatchDialogForLine]);

  // Handle Enter key on Qty field — focus on Price if qty > 0; if last row and any field blank, go to Save button
  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentIndex = lines.findIndex((l) => l.id === line.id);
      const isLastRow = currentIndex === lines.length - 1;

      const inputVal = qtyInputRefs.current[line.id]?.value;
      const currentQty = (inputVal !== undefined && inputVal !== '') ? (parseFloat(inputVal) || 0) : line.quantity;

      const isBlank = !line.productCode || currentQty <= 0 || line.price <= 0;
      if (isLastRow && isBlank) {
        setTimeout(() => saveButtonRef.current?.focus(), 50);
        return;
      }
      if (currentQty > 0) {
        const priceInput = priceInputRefs.current[line.id];
        if (priceInput) {
          priceInput.focus();
          priceInput.select();
        }
      }
    }
  }, [lines]);

  const handleDiscPercentKeyDown = (e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      discAmountInputRefs.current[lineId]?.focus();
    }
  };

  const handleDiscAmountKeyDown = (e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      qtyInputRefs.current[lineId]?.focus();
    }
  };

  // Handle Enter key on Price field — validate row, commit, and move to next row
  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      // Validate current row
      if (!line.productCode || !line.name || line.quantity <= 0 || line.price <= 0) {
        const currentIndex = lines.findIndex((l) => l.id === line.id);
        const isLastRow = currentIndex === lines.length - 1;
        const isBlank = !line.productCode || line.quantity <= 0 || line.price <= 0;
        // If last row and product code or qty or price is blank, go to Save button
        if (isLastRow && isBlank) {
          setTimeout(() => saveButtonRef.current?.focus(), 50);
          return;
        }
        if (!line.productCode || !line.name) {
          setTimeout(() => itemNameInputRefs.current[line.id]?.focus(), 50);
        } else if (line.quantity <= 0) {
          setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
        } else if (line.price <= 0) {
          setTimeout(() => priceInputRefs.current[line.id]?.focus(), 50);
        }
        return;
      }

      // Mark current row as committed (edits are accepted)
      rowCommittedRef.current = true;
      rowSnapshotRef.current = null;
      updateLine(line.id, 'isCommitted', true);

      const currentIndex = lines.findIndex((l) => l.id === line.id);

      // If there is a next row below, move focus to its IMEI field
      if (currentIndex >= 0 && currentIndex < lines.length - 1) {
        const nextLine = lines[currentIndex + 1];
        enterRow(nextLine);
        setActiveLineId(nextLine.id);
        setTimeout(() => {
          const nextInput = imeiInputRefs.current[nextLine.id];
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
        return;
      }

      // Last row: create a new row
      const newLine = emptyLine();
      setLines((prev) => [...prev, newLine]);
      setTimeout(() => {
        const imeiInput = imeiInputRefs.current[newLine.id];
        if (imeiInput) {
          imeiInput.focus();
        }
      }, 100);
    }
  }, [lines, enterRow]);

  // Handle QTY blur — if qty exceeds stock, show dialog and keep focus on QTY field (matches SalesB2C)
  const handleQtyBlur = useCallback((line: LineItem) => {
    const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : '';
    const parsedQty = parseNumericInput(raw);
    setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? null : prev);

    if (!line.productId) {
      updateLine(line.id, 'quantity', parsedQty);
      return;
    }

    const currentUnit = line.availableUnits.find((u) => u.id === line.unitId);
    const conv = (currentUnit?.isMultiUnit && currentUnit?.conversion) ? currentUnit.conversion : 1;
    let maxQtyForThisRow = 0;
    let stockCheckActive = false;
    if (line.batchMaxPieces != null && line.batchMaxPieces > 0) {
      // Batch cap: subtract qty used by other rows with same product AND same batch
      const usedByOtherBatchRows = lines.reduce((sum, l) => {
        if (l.id === line.id || l.productId !== line.productId) return sum;
        if (l.batchNumber !== line.batchNumber) return sum;
        const u = l.availableUnits.find((au) => au.id === l.unitId);
        const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
        return sum + (l.quantity * c);
      }, 0);
      maxQtyForThisRow = (line.batchMaxPieces - usedByOtherBatchRows) / conv;
      stockCheckActive = true;
    } else if (line.baseStockPieces > 0) {
      const usedByOtherRows = lines.reduce((sum, l) => {
        if (l.id === line.id || l.productId !== line.productId) return sum;
        const u = l.availableUnits.find((au) => au.id === l.unitId);
        const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
        return sum + (l.quantity * c);
      }, 0);
      const remainingPieces = line.baseStockPieces - usedByOtherRows;
      maxQtyForThisRow = remainingPieces / conv;
      stockCheckActive = true;
    }

    const cappedQty = Math.max(parseFloat((maxQtyForThisRow || 0).toFixed(4)), 0);
    if (stockCheckActive && parsedQty > cappedQty) {
      setStockAlertMessage('Qty not available');
      setStockAlertOpen(true);
      qtyOverflowLineIdRef.current = line.id;
      updateLine(line.id, 'quantity', 0);

      // Update the snapshot so that reverting the row doesn't bring back the original 1
      if (rowSnapshotRef.current?.lineId === line.id) {
        rowSnapshotRef.current.data.quantity = 0;
        rowSnapshotRef.current.data.gross = 0;
        rowSnapshotRef.current.data.discAmount = 0;
        rowSnapshotRef.current.data.vatAmount = 0;
        rowSnapshotRef.current.data.total = 0;
      }
    } else {
      updateLine(line.id, 'quantity', parsedQty);
    }
  }, [lines, editingNumericCell, updateLine]);

  /* ──── Row Click - update product info ──── */
  const handleRowClick = useCallback(async (line: LineItem) => {
    enterRow(line);
    setActiveLineId(line.id);
    if (!line.productId) {
      setSelectedProductInfo(null);
      return;
    }
    const product = products.find((p) => p._id === line.productId);
    const unit = line.availableUnits?.find((u) => u.id === line.unitId);
    const isMulti = unit?.isMultiUnit && unit?.conversion;
    const multiCost = isMulti ? line.purchasePrice * unit!.conversion! : line.purchasePrice;
    const profit = line.price - multiCost;

    if (isMulti && unit) {
    } else {
    }

    // Show cached stock immediately
    const cachedEntry = stockCacheRef.current.get(line.productId);

    setSelectedProductInfo({
      profit,
      purchaseRate: line.purchasePrice,
      retailPrice: product?.retailPrice ?? 0,
      wholesalePrice: product?.wholesalePrice ?? 0,
      stock: cachedEntry?.stock ?? (product as any)?.stock ?? 0,
      totalStock: cachedEntry?.stock ?? (product as any)?.stock ?? 0,
      lastVendor: (product as any)?.lastVendor ?? '-',
      batchNumber: (product as any)?.batchNumber ?? '',
      expiryDate: (product as any)?.expiryDate ?? '',
    });

    // Fetch fresh stock
    const actualStock = await getStockCached(line.productId);
    setSelectedProductInfo((prev) => prev ? { ...prev, totalStock: actualStock, stock: actualStock } : null);
  }, [products, getStockCached, enterRow]);

  /* ──── Invoice Actions ──── */
  const handleClear = useCallback(async () => {
    setInvoiceId(null);
    setLines([emptyLine()]);
    setCustomerId(null);
    setCustomerName('CASH');
    setCustomerAddress('');
    setOtherDiscPercent(0); setOtherDiscount(0);
    setOtherCharges(0); setFreightCharge(0); setRoundOff(0);
    setNarration('');
    setIsSaved(false);
    setSelectedProductInfo(null); setActiveLineId(null);
    setBillingAddress(''); setBillingPhone(''); setBillingNarration('');
    setShippingName(''); setShippingAddress(''); setShippingPhone(''); setShippingContactPerson('');
    loadNextInvoiceNo();
    setTimeout(() => customerAcRef.current?.focus(), 100);
  }, [companyId, financialYearId]);

  // Auto-scroll txn history selected row into view
  useEffect(() => {
    if (txnHistoryDialogOpen && txnHistoryRowRefs.current[txnHistorySelectedIdx]) {
      txnHistoryRowRefs.current[txnHistorySelectedIdx]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [txnHistoryDialogOpen, txnHistorySelectedIdx]);

  // Ctrl+M: open product transaction history for the active row's product
  const handleCtrlM = useCallback(async (lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line || !line.productId) return;
    if (!companyId) return;
    setTxnHistorySourceLineId(lineId);
    setTxnHistoryProductName(line.name);
    setTxnHistorySelectedIdx(0);
    setTxnHistoryLoading(true);
    setTxnHistoryDialogOpen(true);
    setTxnHistoryData([]);
    try {
      const res = await salesApi.getProductCustomerHistory(companyId, line.productId, customerId || undefined);
      if (res.data.success) {
        setTxnHistoryData(res.data.data);
      }
    } catch {
      /* silently ignore */
    } finally {
      setTxnHistoryLoading(false);
    }
  }, [lines, companyId, customerId]);

  // Apply selected transaction price to the grid line
  const handleTxnHistorySelect = useCallback((idx: number) => {
    if (!txnHistorySourceLineId || idx < 0 || idx >= txnHistoryData.length) return;
    const selectedPrice = parseFloat(txnHistoryData[idx].unitPrice.toFixed(2));
    const lineId = txnHistorySourceLineId;
    updateLine(lineId, 'price', selectedPrice);
    setTxnHistoryDialogOpen(false);
    setTxnHistorySourceLineId(null);
    setTimeout(() => {
      const priceInput = priceInputRefs.current[lineId];
      if (priceInput) { priceInput.focus(); priceInput.select(); }
    }, 100);
  }, [txnHistorySourceLineId, txnHistoryData, updateLine]);

  // Keyboard navigation inside the txn history dialog
  const handleTxnHistoryKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (txnHistoryData.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTxnHistorySelectedIdx((prev) => Math.min(prev + 1, txnHistoryData.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTxnHistorySelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleTxnHistorySelect(txnHistorySelectedIdx);
    } else if (e.key === 'Escape') {
      setTxnHistoryDialogOpen(false);
    }
  }, [txnHistoryData, txnHistorySelectedIdx, handleTxnHistorySelect]);

  // Global keydown handler for Ctrl+M / Ctrl+P on grid rows
  const handleGridKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      handleCtrlM(lineId);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      setProfitDialogOpen(true);
    }
  }, [handleCtrlM]);

  // Compute profit details for all filled grid rows (without VAT)
  const profitDetails = useMemo(() => {
    const rows = lines.filter((l) => l.productId).map((l) => {
      const unit = l.availableUnits.find((u) => u.id === l.unitId);
      const isMulti = unit?.isMultiUnit && unit?.conversion;
      const cost = isMulti ? l.purchasePrice * unit!.conversion! : l.purchasePrice;
      const totalWithoutVat = parseFloat((l.gross - l.discAmount).toFixed(2));
      const profit = parseFloat(((l.price - cost) * l.quantity).toFixed(2));
      return { name: l.name, qty: l.quantity, price: l.price, total: totalWithoutVat, profit };
    });
    const totals = {
      qty: parseFloat(rows.reduce((s, r) => s + r.qty, 0).toFixed(2)),
      total: parseFloat(rows.reduce((s, r) => s + r.total, 0).toFixed(2)),
      profit: parseFloat(rows.reduce((s, r) => s + r.profit, 0).toFixed(2)),
    };
    return { rows, totals };
  }, [lines]);

  // Ctrl+S global shortcut to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isSaved) {
          saveButtonRef.current?.click();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSaved]);

  const handleSave = async () => {
    setSaveDialogOpen(false);
    if (!companyId || !financialYearId) { showErrorDialog('Please select a company and financial year'); return; }

    // Auto-remove empty or incomplete last row before saving
    let linesToProcess = [...lines];
    if (linesToProcess.length > 1) {
      const last = linesToProcess[linesToProcess.length - 1];
      const isBlankOrInvalid =
        !last.productId ||
        !last.productCode ||
        last.quantity <= 0 ||
        last.price <= 0 ||
        !last.name;

      if (isBlankOrInvalid) {
        linesToProcess.pop();
        setLines([...linesToProcess]);
      }
    }

    // Validate rows - same logic as SalesB2C
    const rowsWithItemCode = linesToProcess.filter((l) => l.productCode);
    const rowsWithoutItemCode = linesToProcess.filter((l) => !l.productCode);

    // Check for multiple blank rows
    if (rowsWithoutItemCode.length > 1) {
      showErrorDialog('Enter data correctly. Multiple rows without product code found.');
      return;
    }

    // At least one product required
    if (rowsWithItemCode.length === 0) {
      showErrorDialog('At least one product with Item Code is required');
      return;
    }

    // Check for invalid quantity or price
    const invalidRows = rowsWithItemCode.filter((l) => l.quantity <= 0 || l.price <= 0);
    if (invalidRows.length > 0) {
      const invalidRowNumbers = invalidRows.map((l) => {
        const idx = linesToProcess.findIndex((line) => line.id === l.id);
        return idx + 1;
      });
      showErrorDialog(`Row(s) ${invalidRowNumbers.join(', ')} have invalid Quantity or Price. Quantity and Price must be greater than 0.`);
      return;
    }

    // Filter valid lines - exclude blank rows (same as SalesB2C)
    // A valid line must have: productId, productCode, quantity > 0, and price > 0
    const validLines = linesToProcess.filter((l) =>
      l.productId &&
      l.productCode &&
      l.quantity > 0 &&
      l.price > 0
    );

    if (validLines.length === 0) {
      showErrorDialog('At least one product is required');
      return;
    }

    setLoading(true);
    try {
      const apiItems = validLines.map((l) => ({
        productId: l.productId,
        productCode: l.productCode,
        imei: l.imei,
        multiUnitId: l.availableUnits.find((u) => u.id === l.unitId)?.multiUnitId,
        unitId: l.unitId,
        unitName: l.unitName,
        quantity: l.quantity,
        unitPrice: l.price,
        discountPercent: l.discPercent,
        discount: l.discAmount,
      }));

      if (invoiceId) {
        // Update
        await quotationApi.update(invoiceId, {
          companyId, financialYearId, date, items: apiItems,
          customerId: customerId || undefined, customerName, customerAddress,
          rateType, vatType, taxMode,
          otherDiscount, otherCharges, freightCharge, roundOff, narration,
          shippingName, shippingAddress, shippingPhone, shippingContactPerson,
        });
        setEditSuccessDialogOpen(true);
      } else {
        // Create
        const res = await quotationApi.create({
          companyId, financialYearId, date, items: apiItems,
          customerId: customerId || undefined, customerName, customerAddress,
          rateType, vatType, taxMode,
          otherDiscount, otherCharges, freightCharge, roundOff, narration,
          shippingName, shippingAddress, shippingPhone, shippingContactPerson,
        });
        setInvoiceId(res.data.data.invoiceId);
        setInvoiceNo(res.data.data.invoiceNo);
        setIsSaved(true);
        setSavedDialogOpen(true);
        loadInvoiceIds();
      }
    } catch (err: any) {
      showErrorDialog(err?.response?.data?.message || 'Failed to save quotation');
    } finally {
      setLoading(false);
    }
  };

  const handleEditConfirm = () => { setEditConfirmOpen(false); handleSave(); };

  const handleDelete = async () => {
    setDeleteDialogOpen(false);
    if (!invoiceId || !companyId) return;
    setLoading(true);
    try {
      await quotationApi.delete(invoiceId, companyId);
      handleClear();
      loadInvoiceIds();
    } catch (err: any) {
      showErrorDialog(err?.response?.data?.message || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setSearchDialogOpen(false);
    if (!companyId || !searchInvoiceNo.trim()) return;
    setLoading(true);
    try {
      const res = await quotationApi.search(companyId, searchInvoiceNo.trim());
      const inv = res.data.data as any;
      if (inv) loadInvoice(inv);
      else showErrorDialog('Quotation not found');
    } catch {
      showErrorDialog('Quotation not found');
    } finally {
      setLoading(false);
    }
  };

  const handlePostToSales = useCallback(() => {
    const validLines = lines.filter((l) => l.productId && l.productCode);
    if (validLines.length === 0) return;
    navigate('/entry/sales-b2c', {
      state: {
        fromQuotation: true,
        quotationInvoiceNo: invoiceNo,
        customerId: customerId || null,
        customerName: customerName || 'CASH',
        customerAddress: customerAddress || '',
        date,
        vatType,
        taxMode,
        rateType,
        otherDiscount,
        otherCharges,
        freightCharge,
        roundOff,
        narration: narration || '',
        shippingName: shippingName || '',
        shippingAddress: shippingAddress || '',
        shippingPhone: shippingPhone || '',
        shippingContactPerson: shippingContactPerson || '',
        lines: validLines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productCode: l.productCode,
          imei: l.imei || '',
          name: l.name,
          unitId: l.unitId || '',
          unitName: l.unitName || '',
          availableUnits: (l.availableUnits || []).map((u) => ({ id: u.id, name: u.name, isMultiUnit: u.isMultiUnit ?? false, multiUnitId: u.multiUnitId })),
          quantity: l.quantity,
          price: l.price,
          purchasePrice: l.purchasePrice ?? 0,
          gross: l.gross,
          discPercent: l.discPercent ?? 0,
          discAmount: l.discAmount ?? 0,
          vatAmount: l.vatAmount ?? 0,
          total: l.total,
        })),
      },
    });
  }, [lines, invoiceNo, customerId, customerName, customerAddress, date, vatType, taxMode, rateType, otherDiscount, otherCharges, freightCharge, roundOff, narration, shippingName, shippingAddress, shippingPhone, shippingContactPerson, navigate]);

  const loadInvoice = useCallback((inv: any) => {
    setInvoiceId(inv._id);
    setInvoiceNo(inv.invoiceNo);
    setDate(inv.date);
    setVatType(inv.vatType || 'Vat');
    setTaxMode((inv.taxMode as 'inclusive' | 'exclusive') ?? 'inclusive');
    setRateType(inv.rateType || 'WSale');
    setCustomerId(inv.customerId || null);
    setCustomerName(inv.customerName || '');
    setCustomerAddress(inv.customerAddress || '');
    setOtherDiscount(inv.otherDiscount ?? 0);
    setOtherCharges(inv.otherCharges ?? 0);
    setFreightCharge(inv.freightCharge ?? 0);
    setRoundOff(inv.roundOff ?? 0);
    setNarration(inv.narration || '');
    setShippingName(inv.shippingName || '');
    setShippingAddress(inv.shippingAddress || '');
    setShippingPhone(inv.shippingPhone || '');
    setShippingContactPerson(inv.shippingContactPerson || '');
    setIsSaved(true);

    if (inv.items?.length) {
      const newLines: LineItem[] = inv.items.map((item: any, idx: number) => {
        const availableUnits: any[] = [];
        if (item.product) {
          const product = item.product;
          const mainUnit = product.unitOfMeasureId;
          if (mainUnit) {
            const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
            const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
            availableUnits.push({ id: mainUnitId, name: mainUnitName, isMultiUnit: false, imei: product.imei, price: product.retailPrice || 0 });
          }
          if (product.allowBatches === false && product.multiUnits?.length) {
            product.multiUnits.forEach((mu: any) => {
              const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
              const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
              if (muUnitId) {
                availableUnits.push({ id: muUnitId, name: muUnitName, isMultiUnit: true, multiUnitId: mu.multiUnitId, imei: mu.imei, price: mu.retail || 0, conversion: mu.conversion, retail: mu.retail, wholesale: mu.wholesale, specialPrice1: mu.specialPrice1, specialPrice2: mu.specialPrice2 });
              }
            });
          }
        }
        if (availableUnits.length === 0 && item.unitId) {
          availableUnits.push({ id: item.unitId, name: item.unitName || 'Unit', isMultiUnit: false, price: item.unitPrice });
        }

        return {
          id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
          productId: item.productId || '',
          productCode: item.productCode || '',
          imei: item.imei || '',
          name: item.product?.name || '',
          unitId: item.unitId || '',
          unitName: item.unitName || '',
          availableUnits,
          quantity: item.quantity,
          price: item.unitPrice,
          purchasePrice: item.product?.purchasePrice ?? 0,
          gross: item.grossAmount || item.quantity * item.unitPrice,
          discPercent: item.discountPercent || 0,
          discAmount: item.discount || 0,
          vatAmount: item.vatAmount || 0,
          total: item.totalAmount || 0,
        };
      });
      setLines(newLines);
    }
  }, []);

  // Invoice navigation (same as SalesB2C)
  const handleNavInvoice = async (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (invoiceIds.length === 0) return;
    let targetId: string | undefined;
    const curIdx = invoiceId ? invoiceIds.indexOf(invoiceId) : -1;
    if (direction === 'first') {
      targetId = invoiceIds[invoiceIds.length - 1]; // First invoice (oldest)
    } else if (direction === 'last') {
      targetId = invoiceIds[0]; // Last invoice (newest)
    } else if (direction === 'prev') {
      if (curIdx < invoiceIds.length - 1) {
        targetId = invoiceIds[curIdx + 1];
      } else if (curIdx === -1) {
        targetId = invoiceIds[invoiceIds.length - 1];
      }
    } else if (direction === 'next') {
      if (curIdx > 0) {
        targetId = invoiceIds[curIdx - 1];
      } else if (curIdx === -1) {
        targetId = invoiceIds[0];
      }
    }
    if (!targetId || !companyId) return;
    try {
      const res = await quotationApi.getById(targetId, companyId);
      loadInvoice(res.data.data);
    } catch { /* ignore */ }
  };

  /* ──── Render ──── */
  const numberInputStyle = { '& input[type=number]': { MozAppearance: 'textfield' }, '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 } };
  const btnSx = { minWidth: 100, py: 0.8, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, boxShadow: 'none', bgcolor: '#16a34a', color: '#fff', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } };

  return (
    <Box onClick={handlePageClick} sx={{ p: { xs: 0.5, md: 1.5 }, bgcolor: '#eef2f6', minHeight: '100vh', width: '100%', maxWidth: 1600, mx: 'auto', boxSizing: 'border-box', ...numberInputStyle }}>

      {/* ===== TOP HEADER BAR ===== */}
      <Paper elevation={0} sx={{ px: 2, py: 1.5, mb: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        {/* Row 1: Invoice + Customer + Actions */}
        <Grid container spacing={1.5} alignItems="center">
          {/* Entry No - badge style (same as Sales B2C) */}
          <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
            <Box sx={{ bgcolor: '#db2777', borderRadius: 1.5, px: 1.5, py: 0.6, textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>ENTRY NO</Typography>
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
              onChange={(_, v) => handleCustomerSelect(v && typeof v !== 'string' ? v : null)}
              onOpen={() => { }}
              onClose={() => { }}
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
                  autoFocus
                  onKeyDown={handleCustomerAcKeyDown}
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
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
                '& .MuiInputBase-input': { fontSize: '0.75rem' },
                '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                ...(customerId ? { '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1.5 } } : {}),
              }}
            />
          </Grid>
          <Grid item xs="auto">
            <Button variant="outlined" size="small" onClick={() => setAddressDialogOpen(true)}
              sx={{ height: 38, textTransform: 'none', borderRadius: 1.5, borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}>
              Address
            </Button>
          </Grid>
          <Grid item xs="auto">
            <TextField size="small" select label="Tax" value={taxMode} onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 130, height: 38, '& .MuiOutlinedInput-root': { borderRadius: 1.5, height: 38 } }}>
              <MenuItem value="inclusive">Include Tax</MenuItem>
              <MenuItem value="exclusive">Exclude Tax</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        <Divider sx={{ my: 1.2 }} />

        {/* Row 2: Rate/Location/Nav | VAT | Product Info */}
        <Grid container spacing={1.5} alignItems="stretch">
          {/* Rate Type + Location + Navigation */}
          <Grid item xs={12} sm={6} md={4} lg={3}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" select label="Rate Type" value={rateType} onChange={(e) => setRateType(e.target.value as any)}
                  inputRef={rateTypeRef} onKeyDown={handleRateTypeKeyDown} InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}>
                  <MenuItem value="Retail">Retail</MenuItem>
                  <MenuItem value="WSale">WSale</MenuItem>
                  <MenuItem value="Special1">Special Price 1</MenuItem>
                  <MenuItem value="Special2">Special Price 2</MenuItem>
                </TextField>
                <TextField size="small" select label="Location" value={location} onChange={(e) => setLocation(e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ flex: 1.3, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}>
                  <MenuItem value="MAIN BRANCH">MAIN BRANCH</MenuItem>
                </TextField>
              </Box>
              {/* Navigation buttons */}
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {[
                  { icon: <FirstIcon />, handler: () => handleNavInvoice('first'), tip: 'First' },
                  { icon: <PrevIcon />, handler: () => handleNavInvoice('prev'), tip: 'Previous' },
                  { icon: <NextIcon />, handler: () => handleNavInvoice('next'), tip: 'Next' },
                  { icon: <LastIcon />, handler: () => handleNavInvoice('last'), tip: 'Last' },
                ].map((nav, i) => (
                  <Button key={i} variant="contained" size="small" onClick={nav.handler}
                    sx={{ flex: 1, py: 0.4, minWidth: 0, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none' }}>
                    {nav.icon}
                  </Button>
                ))}
              </Box>
            </Box>
          </Grid>

          {/* VAT Type */}
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1.2, py: 0.5, bgcolor: '#f8fafc', height: '100%' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>VAT TYPE</Typography>
              <RadioGroup row value={vatType} onChange={(e) => setVatType(e.target.value as 'Vat' | 'NonVat')}>
                <FormControlLabel value="Vat" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Vat" sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                <FormControlLabel value="NonVat" control={<Radio size="small" sx={{ p: 0.3 }} />} label="Non Vat" sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
              </RadioGroup>
            </Box>
          </Grid>

          {/* Product Info Section (same style as Sales B2C) */}
          <Grid item xs={12} md={12} lg={7.5}>
            <Box sx={{
              borderRadius: 1.5, px: 1.5, py: 0.8, height: '100%', display: 'flex', alignItems: 'center', gap: 1.5,
              background: selectedProductInfo ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)' : '#f8fafc',
              border: selectedProductInfo ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
              transition: 'all 0.2s',
            }}>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'nowrap', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                  <Box sx={{ minWidth: 0, px: 1, py: 0.3, bgcolor: (selectedProductInfo.profit ?? 0) >= 0 ? '#dcfce7' : '#fee2e2', borderRadius: 1 }}>
                    <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Profit</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.3, color: (selectedProductInfo.profit ?? 0) >= 0 ? '#15803d' : '#dc2626' }}>{(selectedProductInfo.profit ?? 0).toFixed(2)}</Typography>
                  </Box>
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
                        const pcsInside = activeMultiUnitInfo?.pcsInside;
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
                  {selectedProductInfo.batchNumber && (
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Batch</Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.3, color: '#0284c7' }}>
                        {selectedProductInfo.batchNumber.length > 10 ? selectedProductInfo.batchNumber.substring(0, 10) + '..' : selectedProductInfo.batchNumber}
                      </Typography>
                    </Box>
                  )}
                  {selectedProductInfo.expiryDate && (
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Expiry</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3, color: '#ea580c' }}>{selectedProductInfo.expiryDate}</Typography>
                    </Box>
                  )}
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
                      {activeMultiUnitInfo.specialPrice1 != null && activeMultiUnitInfo.specialPrice1 > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Spl.1</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, color: '#e65100' }}>{activeMultiUnitInfo.specialPrice1.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.specialPrice2 != null && activeMultiUnitInfo.specialPrice2 > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Spl.2</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, color: '#ad1457' }}>{activeMultiUnitInfo.specialPrice2.toFixed(2)}</Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}>Select a product to see details</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* ===== PRODUCT GRID ===== */}
      <Paper elevation={0} sx={{ mb: 1, width: '100%', overflow: 'hidden', border: '1px solid #e0e7ef', borderRadius: 2 }}>
        <TableContainer sx={{ minHeight: 400, maxHeight: 400, width: '100%', bgcolor: '#fafbfc' }}>
          <Table stickyHeader size="small" sx={{ minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, '& .MuiTableCell-root': { fontSize: '0.82rem' }, '& .MuiInputBase-input': { fontSize: '0.82rem' }, '& .MuiAutocomplete-input': { fontSize: '0.82rem' } }}>
            <TableHead>
              <TableRow>
                {[
                  { label: 'Sl', w: '3%' },
                  { label: 'IMEI', w: '9%' },
                  { label: 'Item Name', w: '20%' },
                  { label: 'Unit', w: '8%' },
                  { label: 'QTY', w: '6%' },
                  { label: 'Price', w: '7%' },
                  { label: 'Gross', w: '8%' },
                  { label: 'Disc%', w: '5%' },
                  { label: 'Disc', w: '6%' },
                  { label: 'VAT', w: '6%' },
                  { label: 'Total', w: '9%' },
                  { label: '', w: '3%' },
                ].map((col, ci) => (
                  <TableCell key={ci} sx={{
                    bgcolor: '#db2777', color: 'white', fontWeight: 600, fontSize: '0.75rem', width: col.w,
                    p: '6px 4px', textAlign: 'center', letterSpacing: 0.3, textTransform: 'uppercase',
                    borderRight: ci < 11 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                  }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, rowIdx) => (
                <TableRow key={line.id}
                  sx={{
                    bgcolor: activeLineId === line.id ? '#e0f7fa' : rowIdx === 0 && !line.productId ? '#fffbeb' : (rowIdx % 2 === 0 ? '#f8fafb' : 'white'),
                    cursor: 'pointer', '&:hover': { bgcolor: '#e0f7fa' }, transition: 'background-color 0.1s',
                  }}
                  onClick={() => handleRowClick(line)}
                  onKeyDownCapture={(e) => handleGridKeyDown(e, line.id)}
                  onFocusCapture={() => { handleRowClick(line); }}>
                  {/* Sl */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '0.8rem', bgcolor: '#f1f5f9' }}>{rowIdx + 1}</TableCell>
                  {/* IMEI */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" value={line.imei}
                      onChange={(e) => updateLine(line.id, 'imei', e.target.value)}
                      onFocus={handleTextFieldFocus} onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, imeiInputRefs); handleImeiKeyDown(e, line.id); }}
                      inputRef={(el) => { imeiInputRefs.current[line.id] = el; }}
                      fullWidth sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3, fontSize: '0.82rem' } }} />
                  </TableCell>
                  {/* Item Name */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={products}
                      filterOptions={productFilterOptions}
                      getOptionLabel={(o) => typeof o === 'string' ? o : o.name || ''}
                      isOptionEqualToValue={(o, v) => o._id === v._id}
                      value={products.find((p) => p._id === line.productId) || null}
                      inputValue={line.name}
                      onInputChange={(_, v) => updateLine(line.id, 'name', v)}
                      onChange={(_, v) => { if (v && typeof v !== 'string') handleProductSelect(line.id, v); }}
                      onOpen={() => { itemNameListboxOpenRef.current = true; }}
                      onClose={() => {
                        itemNameListboxOpenRef.current = false;
                      }}
                      autoHighlight
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="outlined"
                          inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }}
                          onFocus={() => handleItemNameFocus(line)}
                          onBlur={() => handleItemNameBlur(line)}
                          onKeyDown={(e) => handleItemNameKeyDown(e, line)}
                          inputProps={{ ...params.inputProps, style: { fontSize: '0.82rem' } }}
                          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, py: 0, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: '3px !important' } }}
                        />
                      )}
                      onHighlightChange={handleProductHighlight}
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
                  </TableCell>
                  {/* Unit */}
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
                  {/* Qty */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => handleQtyBlur(line)}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, qtyInputRefs); handleNumberKeyDown(e); handleQtyKeyDown(e, line); }}
                      inputRef={(el) => { qtyInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' }, inputMode: 'decimal' }}
                      fullWidth sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3 } }} />
                  </TableCell>
                  {/* Price */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : (line.price === 0 ? '' : String(line.price))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'price', value: line.price === 0 ? '' : String(line.price) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'price' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : ''; const num = parseFloat(parseNumericInput(raw).toFixed(2)); updateLine(line.id, 'price', num); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'price' ? null : prev); }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, priceInputRefs); handleNumberKeyDown(e); handlePriceKeyDown(e, line); }}
                      inputRef={(el) => { priceInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' }, inputMode: 'decimal' }}
                      fullWidth sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3 } }} />
                  </TableCell>
                  {/* Gross */}
                  <TableCell align="right" sx={{ p: '5px 6px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', fontSize: '0.82rem', fontWeight: 500, color: '#475569' }}>{line.gross.toFixed(2)}</TableCell>
                  {/* Disc% */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'discPercent', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? null : prev); }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, discPercentInputRefs); handleNumberKeyDown(e); handleDiscPercentKeyDown(e, line.id); }}
                      inputRef={(el) => { discPercentInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' } }}
                      fullWidth sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3 } }} />
                  </TableCell>
                  {/* Disc Amt */}
                  <TableCell sx={{ p: '3px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6' }}>
                    <TextField size="small" variant="outlined" type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : ''; updateLine(line.id, 'discAmount', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? null : prev); }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, discAmountInputRefs); handleNumberKeyDown(e); handleDiscAmountKeyDown(e, line.id); }}
                      inputRef={(el) => { discAmountInputRefs.current[line.id] = el; }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.82rem' } }}
                      fullWidth sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0.3 } }} />
                  </TableCell>
                  {/* VAT */}
                  <TableCell align="right" sx={{ p: '5px 6px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', fontSize: '0.82rem', color: '#64748b' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  {/* Total */}
                  <TableCell align="right" sx={{ p: '5px 6px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #eef2f6', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{line.total.toFixed(2)}</TableCell>
                  {/* Delete */}
                  <TableCell sx={{ p: '2px', textAlign: 'center', borderBottom: '1px solid #eef2f6' }}>
                    {line.productId && (
                      <IconButton size="small" onClick={() => removeLine(line.id)} sx={{ color: '#ef4444', p: 0.3, '&:hover': { bgcolor: '#fef2f2' } }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ===== BOTTOM SECTION ===== */}
      <Paper elevation={0} sx={{ p: 2, mb: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={2}>
          {/* Left Column - Adjustments (since no payment for quotation) */}
          <Grid item xs={12} md={3.5} lg={3.5}>
            <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', p: 1.5, height: '100%' }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#475569', mb: 1.2, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                Adjustments
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Disc %" type="number"
                    value={editingNumericCell?.field === 'otherDiscPercent' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscPercent === 0 ? '' : String(otherDiscPercent))}
                    onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscPercent', value: otherDiscPercent === 0 ? '' : String(otherDiscPercent) }); }}
                    onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? { ...prev, value: e.target.value } : prev)}
                    onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscPercent' ? editingNumericCell.value : ''; handleOtherDiscPercentChange(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? null : prev); }}
                    onKeyDown={handleNumberKeyDown}
                    inputProps={{ inputMode: 'decimal', max: 100 }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Discount" type="number"
                    value={editingNumericCell?.field === 'otherDiscount' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscount === 0 ? '' : String(otherDiscount))}
                    onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscount', value: otherDiscount === 0 ? '' : String(otherDiscount) }); }}
                    onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? { ...prev, value: e.target.value } : prev)}
                    onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscount' ? editingNumericCell.value : ''; setOtherDiscount(parseNumericInput(raw)); setOtherDiscPercent(0); setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? null : prev); }}
                    onKeyDown={handleNumberKeyDown}
                    inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Charges" type="number"
                    value={editingNumericCell?.field === 'otherCharges' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherCharges === 0 ? '' : String(otherCharges))}
                    onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherCharges', value: otherCharges === 0 ? '' : String(otherCharges) }); }}
                    onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? { ...prev, value: e.target.value } : prev)}
                    onBlur={() => { const raw = editingNumericCell?.field === 'otherCharges' ? editingNumericCell.value : ''; setOtherCharges(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? null : prev); }}
                    onKeyDown={handleNumberKeyDown}
                    inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Freight Charge" type="number"
                    value={editingNumericCell?.field === 'freightCharge' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (freightCharge === 0 ? '' : String(freightCharge))}
                    onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'freightCharge', value: freightCharge === 0 ? '' : String(freightCharge) }); }}
                    onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? { ...prev, value: e.target.value } : prev)}
                    onBlur={() => { const raw = editingNumericCell?.field === 'freightCharge' ? editingNumericCell.value : ''; setFreightCharge(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? null : prev); }}
                    onKeyDown={handleNumberKeyDown}
                    inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Round Off" type="number"
                    value={editingNumericCell?.field === 'roundOff' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (roundOff === 0 ? '' : String(roundOff))}
                    onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'roundOff', value: roundOff === 0 ? '' : String(roundOff) }); }}
                    onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'roundOff' ? { ...prev, value: e.target.value } : prev)}
                    onBlur={() => { const raw = editingNumericCell?.field === 'roundOff' ? editingNumericCell.value : ''; setRoundOff(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'roundOff' ? null : prev); }}
                    onKeyDown={handleNumberKeyDown}
                    inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)}
                    onFocus={handleTextFieldFocus}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }}
                    inputRef={narrationRef}
                    InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                </Grid>
              </Grid>
              {/* Qty Chip */}
              <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                <Chip label={`Qty: ${calculations.totalItems}`} size="small" sx={{ fontWeight: 700, bgcolor: '#e0f2fe', color: '#0369a1', fontSize: '0.78rem' }} />
              </Box>
            </Box>
          </Grid>

          {/* Right Column - Grand Total & Bill Summary */}
          <Grid item xs={12} md={8.5} lg={8.5}>
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {/* Grand Total */}
              <Box sx={{ background: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)', borderRadius: 2, p: 2, mb: 1.5, textAlign: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 0.3 }}>Grand Total</Typography>
                <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '2.2rem', lineHeight: 1.1, letterSpacing: -0.5 }}>{calculations.grandTotal.toFixed(2)}</Typography>
              </Box>
              {/* Bill breakdown */}
              <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', p: 1.5, flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>This Quotation</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{calculations.subTotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Before tax (incl. adjustments)</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{(calculations.grandTotal - calculations.totalVat).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Total VAT</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{calculations.totalVat.toFixed(2)}</Typography>
                </Box>
                {[
                  { label: 'Freight Chgs', value: freightCharge },
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

      {/* ===== ACTION BUTTONS ===== */}
      <Paper elevation={0} sx={{ p: 1.5, width: '100%', borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button ref={saveButtonRef} variant="contained" startIcon={<SaveIcon />}
            onClick={() => setSaveDialogOpen(true)} disabled={loading || isSaved} sx={btnSx}>
            Save
          </Button>
          <Button variant="contained" startIcon={<PrintIcon />} disabled={!isSaved} sx={btnSx}>Print</Button>
          <Button variant="contained" startIcon={<ClearIcon />} onClick={handleClear} sx={btnSx}>Clear</Button>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button variant="contained" startIcon={<SaveIcon />} onClick={() => setEditConfirmOpen(true)} disabled={!invoiceId || loading} sx={btnSx}>Edit</Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={handlePostToSales} disabled={!invoiceId} sx={btnSx}>Post to Sales</Button>
          <Button variant="contained" startIcon={<DeleteIcon />} onClick={() => setDeleteDialogOpen(true)} disabled={!invoiceId} sx={btnSx}>Delete</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<SearchIcon />} onClick={() => { setSearchInvoiceNo(''); setSearchDialogOpen(true); }} sx={btnSx}>Search Quotation</Button>
        </Box>
      </Paper>

      {/* ═══════════════ Dialogs ═══════════════ */}

      {/* Save Confirm */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Save Quotation</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Do you want to save this quotation?</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setSaveDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" data-confirm-btn onClick={handleSave} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Saved Success */}
      <Dialog open={savedDialogOpen} onClose={() => setSavedDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Saved Successfully</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Quotation {invoiceNo} has been saved.</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => setSavedDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Confirm */}
      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Edit Quotation</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Do you want to update this quotation?</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setEditConfirmOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" data-confirm-btn onClick={handleEditConfirm} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Success */}
      <Dialog open={editSuccessDialogOpen} onClose={() => { setEditSuccessDialogOpen(false); }} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Edited Successfully</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Quotation {invoiceNo} has been updated.</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => setEditSuccessDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#16a34a', '&:hover': { bgcolor: '#000' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Delete Quotation</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Are you sure you want to delete this quotation?</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" color="error" data-confirm-btn onClick={handleDelete} sx={{ textTransform: 'none', borderRadius: 1.5, boxShadow: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Search */}
      <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Search Quotation</DialogTitle>
        <DialogContent>
          <TextField autoFocus label="Quotation Number" value={searchInvoiceNo} onChange={(e) => setSearchInvoiceNo(e.target.value)}
            onFocus={handleTextFieldFocus} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            fullWidth size="small" sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setSearchDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSearch} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none' }}>Search</Button>
        </DialogActions>
      </Dialog>

      {/* Error */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{errorDialogMessage}</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => setErrorDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Stock Alert */}
      <Dialog open={stockAlertOpen} onClose={() => {
        setStockAlertOpen(false);
        const lineId = qtyOverflowLineIdRef.current;
        if (lineId) {
          qtyOverflowLineIdRef.current = null;
          setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
        }
      }} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}
        TransitionProps={{ onEntered: (node) => { (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]')?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#ea580c' }}>Stock Alert</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{stockAlertMessage}</Typography></DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => {
            setStockAlertOpen(false);
            const lineId = qtyOverflowLineIdRef.current;
            if (lineId) {
              qtyOverflowLineIdRef.current = null;
              setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
            }
          }} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#ea580c', '&:hover': { bgcolor: '#c2410c' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Batch Selection Dialog */}
      <Dialog
        open={batchDialogOpen}
        onClose={handleBatchDialogClose}
        onKeyDown={handleBatchDialogKeyDown}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Select Batch</Typography>
          {pendingProductSelection && (
            <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mt: 0.3 }}>{pendingProductSelection.product.name}</Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {['Batch No', 'Expiry Date', 'Stock', 'P.Rate', rateType === 'WSale' ? 'W.Sale' : 'Retail', 'Action'].map((label, ci) => (
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
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#f0fdfa' },
                      bgcolor: index === focusedBatchIndex ? '#ccfbf1 !important' : (index % 2 === 0 ? '#ffffff' : '#fafafa'),
                      outline: index === focusedBatchIndex ? '2px solid #0f766e' : 'none',
                      transition: 'all 0.1s',
                    }}
                    onClick={() => handleBatchSelect(batch)}
                  >
                    <TableCell sx={{ fontSize: '0.8rem', color: '#334155', py: 0.75 }}>
                      {batch.batchNumber.length > 15 ? batch.batchNumber.substring(0, 15) + '...' : batch.batchNumber}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: '#475569', py: 0.75 }}>{batch.expiryDate || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{batch.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#64748b', py: 0.75 }}>{batch.purchasePrice.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{(rateType === 'WSale' ? batch.wholesale : batch.retail).toFixed(2)}</TableCell>
                    <TableCell align="center" sx={{ py: 0.75 }}>
                      <Button size="small" variant="contained"
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
          <Button onClick={handleBatchDialogClose} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Address Details */}
      <Dialog open={addressDialogOpen} onClose={() => setAddressDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Address Details</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f766e', mb: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>Billing Address</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Address</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Phone</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Narration</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={billingNarration} onChange={(e) => setBillingNarration(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
          </Grid>
          <Divider sx={{ my: 1.5, borderColor: '#e2e8f0' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#475569', mb: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>Shipping Address</Typography>
          <Grid container spacing={1}>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Name</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={shippingName} onChange={(e) => setShippingName(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Address</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Phone</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
            <Grid item xs={3.5}><Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Contact</Typography></Grid>
            <Grid item xs={8.5}><TextField size="small" value={shippingContactPerson} onChange={(e) => setShippingContactPerson(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 1.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setAddressDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" size="small" onClick={() => { setCustomerAddress(billingAddress); setAddressDialogOpen(false); }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Product Transaction History Dialog (Ctrl+M) */}
      <Dialog
        open={txnHistoryDialogOpen}
        onClose={() => setTxnHistoryDialogOpen(false)}
        maxWidth="md"
        fullWidth
        onKeyDown={handleTxnHistoryKeyDown}
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0.5 }}>
          <Box>
            Transaction History
            <Typography sx={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, mt: 0.2 }}>{txnHistoryProductName}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center' }}>
            {customerId && (
              <Chip label="Customer" size="small" sx={{ bgcolor: '#fdf2f8', color: '#db2777', fontSize: '0.68rem', fontWeight: 600, height: 22, border: '1px solid #fbcfe8' }} />
            )}
            <Chip label={`${txnHistoryData.length} records`} size="small" sx={{ bgcolor: '#db2777', color: 'white', fontSize: '0.68rem', fontWeight: 700, height: 22 }} />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {txnHistoryLoading ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>Loading transactions...</Typography>
            </Box>
          ) : txnHistoryData.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>No Transactions Found</Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.78rem', mt: 0.5 }}>No sales history for this product{customerId ? ' under the selected customer' : ''}.</Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 380 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        { label: '#', w: '4%', align: 'center' as const },
                        { label: 'Invoice', w: '13%', align: 'left' as const },
                        { label: 'Date', w: '11%', align: 'left' as const },
                        { label: 'Customer', w: '19%', align: 'left' as const },
                        { label: 'Unit', w: '8%', align: 'center' as const },
                        { label: 'Qty', w: '8%', align: 'right' as const },
                        { label: 'Price', w: '12%', align: 'right' as const },
                        { label: 'Disc', w: '10%', align: 'right' as const },
                        { label: 'Total', w: '15%', align: 'right' as const },
                      ].map((col, ci) => (
                        <TableCell key={ci} sx={{
                          bgcolor: '#db2777', color: 'white', fontWeight: 600, fontSize: '0.72rem', width: col.w, textAlign: col.align,
                          textTransform: 'uppercase', letterSpacing: 0.3, py: 0.8, px: 1.2,
                        }}>
                          {col.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {txnHistoryData.map((row, i) => (
                      <TableRow
                        key={i}
                        ref={(el) => { txnHistoryRowRefs.current[i] = el; }}
                        onClick={() => setTxnHistorySelectedIdx(i)}
                        onDoubleClick={() => handleTxnHistorySelect(i)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: i === txnHistorySelectedIdx ? '#fdf2f8' : (i % 2 === 0 ? '#fff' : '#f8fafc'),
                          '&:hover': { bgcolor: i === txnHistorySelectedIdx ? '#fce7f3' : '#fdf2f8' },
                          outline: i === txnHistorySelectedIdx ? '2px solid #db2777' : 'none',
                          outlineOffset: -2,
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center', px: 1.2, py: 0.8 }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#db2777', px: 1.2, py: 0.8 }}>{row.invoiceNo}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#64748b', px: 1.2, py: 0.8 }}>{row.date ? new Date(row.date).toLocaleDateString() : ''}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#334155', px: 1.2, py: 0.8 }}>{row.customerName || 'Cash'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center', px: 1.2, py: 0.8 }}>{row.unitName || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', textAlign: 'right', color: '#334155', fontWeight: 500, px: 1.2, py: 0.8 }}>{row.quantity.toFixed(2)}</TableCell>
                        <TableCell sx={{
                          fontSize: '0.8rem', textAlign: 'right', px: 1.2, py: 0.8,
                          fontWeight: i === txnHistorySelectedIdx ? 800 : 600,
                          color: i === txnHistorySelectedIdx ? '#db2777' : '#1e293b',
                        }}>{row.unitPrice.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', textAlign: 'right', color: row.discount > 0 ? '#dc2626' : '#94a3b8', px: 1.2, py: 0.8 }}>{row.discount > 0 ? `-${row.discount.toFixed(2)}` : '0.00'}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', px: 1.2, py: 0.8 }}>{row.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Summary Footer */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2.5, px: 2, py: 1.2, bgcolor: '#f8fafc', borderTop: '1px solid #e0e7ef' }}>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Qty</Typography>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#db2777' }}>{txnHistoryData.reduce((s, r) => s + r.quantity, 0).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Discount</Typography>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#dc2626' }}>{txnHistoryData.reduce((s, r) => s + r.discount, 0).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Grand Total</Typography>
                  <Typography sx={{ fontSize: '0.92rem', fontWeight: 900, color: '#db2777' }}>{txnHistoryData.reduce((s, r) => s + r.total, 0).toFixed(2)}</Typography>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Typography sx={{ flex: 1, fontSize: '0.68rem', color: '#94a3b8' }}>↑↓ Navigate &middot; Enter Apply Price &middot; Double-click Select</Typography>
          <Button
            variant="contained"
            onClick={() => setTxnHistoryDialogOpen(false)}
            autoFocus
            sx={{ textTransform: 'none', borderRadius: 1.5, px: 2.5, fontWeight: 600, fontSize: '0.82rem', bgcolor: '#db2777', '&:hover': { bgcolor: '#be185d' }, boxShadow: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Profit Details Dialog (Ctrl+P) */}
      <Dialog
        open={profitDialogOpen}
        onClose={() => setProfitDialogOpen(false)}
        disableRestoreFocus
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0.5 }}>
          <Box>
            Profit Breakdown
            <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, mt: 0.2 }}>Excluding VAT</Typography>
          </Box>
          {profitDetails.rows.length > 0 && (
            <Box sx={{
              bgcolor: profitDetails.totals.profit >= 0 ? '#f0fdf4' : '#fef2f2',
              borderRadius: 1.5, px: 1.5, py: 0.5, textAlign: 'center',
              border: `1px solid ${profitDetails.totals.profit >= 0 ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <Typography sx={{ fontSize: '0.58rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>Net Profit</Typography>
              <Typography sx={{
                fontSize: '1.05rem', fontWeight: 900, lineHeight: 1.2,
                color: profitDetails.totals.profit >= 0 ? '#16a34a' : '#dc2626',
              }}>
                {profitDetails.totals.profit >= 0 ? '+' : ''}{profitDetails.totals.profit.toFixed(2)}
              </Typography>
            </Box>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {profitDetails.rows.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>No Items Yet</Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.78rem', mt: 0.5 }}>Add products to the grid to see profit details.</Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        { label: '#', w: '6%', align: 'center' as const },
                        { label: 'Item Name', w: '34%', align: 'left' as const },
                        { label: 'Qty', w: '12%', align: 'right' as const },
                        { label: 'Price', w: '16%', align: 'right' as const },
                        { label: 'Total', w: '16%', align: 'right' as const },
                        { label: 'Profit', w: '16%', align: 'right' as const },
                      ].map((col, ci) => (
                        <TableCell key={ci} sx={{
                          bgcolor: '#db2777', color: 'white', fontWeight: 600, fontSize: '0.72rem', width: col.w, textAlign: col.align,
                          textTransform: 'uppercase', letterSpacing: 0.3, py: 0.8, px: 1.2,
                        }}>
                          {col.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {profitDetails.rows.map((row, i) => (
                      <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? '#fff' : '#f8fafc', '&:hover': { bgcolor: '#fdf2f8' } }}>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center', px: 1.2, py: 0.8 }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 500, px: 1.2, py: 0.8 }}>{row.name}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: '#475569', px: 1.2, py: 0.8 }}>{row.qty.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: '#475569', px: 1.2, py: 0.8 }}>{row.price.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: '#1e293b', fontWeight: 600, px: 1.2, py: 0.8 }}>{row.total.toFixed(2)}</TableCell>
                        <TableCell sx={{
                          fontSize: '0.8rem', textAlign: 'right', fontWeight: 700, px: 1.2, py: 0.8,
                          color: row.profit >= 0 ? '#16a34a' : '#dc2626',
                        }}>
                          {row.profit >= 0 ? '+' : ''}{row.profit.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Summary Footer */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.2, bgcolor: '#f8fafc', borderTop: '1px solid #e0e7ef' }}>
                <Box sx={{ display: 'flex', gap: 2.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Items</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#db2777' }}>{profitDetails.rows.length}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Qty</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#db2777' }}>{profitDetails.totals.qty.toFixed(2)}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-end' }}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Sale Total</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>{profitDetails.totals.total.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{
                    textAlign: 'right', bgcolor: profitDetails.totals.profit >= 0 ? '#f0fdf4' : '#fef2f2',
                    px: 1.5, py: 0.5, borderRadius: 1.5, border: `1px solid ${profitDetails.totals.profit >= 0 ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Profit</Typography>
                    <Typography sx={{
                      fontSize: '0.92rem', fontWeight: 900,
                      color: profitDetails.totals.profit >= 0 ? '#16a34a' : '#dc2626',
                    }}>
                      {profitDetails.totals.profit >= 0 ? '+' : ''}{profitDetails.totals.profit.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            data-confirm-btn
            onClick={() => setProfitDialogOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 1.5, px: 2.5, fontWeight: 600, fontSize: '0.82rem', bgcolor: '#db2777', '&:hover': { bgcolor: '#be185d' }, boxShadow: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
