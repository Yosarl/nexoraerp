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
  createFilterOptions,
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
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  Search as SearchIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import {
  productApi,
  ledgerAccountApi,
  purchaseApi,
  purchaseReturnApi,
  stockApi,
  type PurchaseReturnListItem,
  type PurchaseReturnData,
  type PurchaseInvoiceData,
} from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';

const THEME = {
  primary: '#1e293b',
  border: '#e2e8f0',
  headerBg: '#1e293b',
  rowAlt: '#f8fafc',
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
  purchasePrice?: number;
  imei?: string;
  allowBatches?: boolean;
  unitOfMeasureId?: { _id: string; name?: string; shortCode?: string } | string;
  multiUnits?: MultiUnit[];
}

interface SupplierOption {
  _id: string;
  code?: string;
  name: string;
  address?: string;
  type: 'supplier';
}

interface CashOption {
  _id: string;
  code?: string;
  name: string;
  type: 'cash';
}

type SupplierCashOption = SupplierOption | CashOption;

interface LineItem {
  id: string;
  productId: string;
  productCode: string;
  name: string;
  imei: string;
  batchNumber: string;
  quantity: number;
  pRate: number;
  gross: number;
  discPercent: number;
  discAmount: number;
  vatAmount: number;
  total: number;
  unitId: string;
  unitName: string;
  multiUnitId?: string;
  availableUnits: UnitOption[];
  baseStockPieces: number;
  batchMaxPieces?: number;
}

const emptyLine = (): LineItem => ({
  id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
  productId: '',
  productCode: '',
  name: '',
  imei: '',
  batchNumber: '',
  quantity: 0,
  pRate: 0,
  gross: 0,
  discPercent: 0,
  discAmount: 0,
  vatAmount: 0,
  total: 0,
  unitId: '',
  unitName: '',
  availableUnits: [],
  baseStockPieces: 0,
});

function buildAvailableUnitsFromProduct(product: Product | null): UnitOption[] {
  try {
    if (!product) return [];
    const availableUnits: UnitOption[] = [];
    const mainUnit = product.unitOfMeasureId;
    if (mainUnit) {
      const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
      const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
      if (mainUnitId) {
        availableUnits.push({
          id: mainUnitId,
          name: mainUnitName,
          isMultiUnit: false,
          imei: product.imei,
          price: product.purchasePrice ?? 0,
        });
      }
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
    return availableUnits;
  } catch {
    return [];
  }
}

const VAT_RATE = 5;

export default function PurchaseReturn() {
  const productFilterOptions = useMemo(
    () => createFilterOptions<Product>({ matchFrom: 'any', stringify: (opt) => opt.name || '' }),
    []
  );

  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);
  const financialYearId = useSelector((s: RootState) => s.app.selectedFinancialYearId);
  const dispatch = useDispatch();

  const handlePageClick = useCallback(() => {
    dispatch(setDrawerOpen(false));
  }, [dispatch]);

  // Header
  const [returnNo, setReturnNo] = useState('PR-000001');
  const [returnId, setReturnId] = useState<string | null>(null);
  const [date, setDate] = useState(getCurrentDate);
  const [returnType, setReturnType] = useState<'OnAccount' | 'ByRef'>('OnAccount');
  const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState('');
  const [originalPurchaseId, setOriginalPurchaseId] = useState<string | null>(null);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>('Vat');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');

  // Supplier / Cash: when cash selected -> cashAccountId set, supplierId null; when supplier -> supplierId set, cashAccountId null
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [, setSuppliers] = useState<SupplierOption[]>([]);
  const [, setCashAccounts] = useState<CashOption[]>([]);
  const [supplierCashOptions, setSupplierCashOptions] = useState<SupplierCashOption[]>([]);

  // Products & lines
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // Summary
  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [freightCharge, setFreightCharge] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [narration, setNarration] = useState('');

  // List & navigation
  const [returnList, setReturnList] = useState<PurchaseReturnListItem[]>([]);
  const [currentNavIndex, setCurrentNavIndex] = useState(-1);

  // Dialogs
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Stock alert (like Sales B2C)
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertMessage, setStockAlertMessage] = useState('');
  const qtyOverflowLineIdRef = useRef<string | null>(null);

  // Batch selection
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [focusedBatchIndex, setFocusedBatchIndex] = useState(0);
  const [availableBatches, setAvailableBatches] = useState<{
    batchNumber: string;
    quantity: number;
    purchasePrice: number;
    retail: number;
    wholesale: number;
    expiryDate?: string;
  }[]>([]);
  const [pendingProductSelection, setPendingProductSelection] = useState<{
    lineId: string;
    product: Product;
  } | null>(null);
  const batchRowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

  // Product info (optional)
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

  // Derive multi-unit info from current lines state
  const activeMultiUnitInfo = useMemo(() => {
    if (!activeLineId) return null;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line || !line.unitId) return null;
    const unit = line.availableUnits.find((u) => u.id === line.unitId);
    if (!unit?.isMultiUnit) return null;
    return {
      pcsInside: unit.conversion,
      multiUnitPrice: unit.price,
      wholesale: unit.wholesale,
      retail: unit.retail,
      specialPrice1: unit.specialPrice1,
      specialPrice2: unit.specialPrice2,
    };
  }, [activeLineId, lines]);

  // Editing numeric cells: string buffer so intermediate values like ".5" aren't destroyed
  const [editingNumericCell, setEditingNumericCell] = useState<{ lineId?: string; field: string; value: string } | null>(null);
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === '-') return 0;
    const normalized = raw === '.' || /^\.\d*$/.test(raw) ? '0' + raw : raw;
    return parseFloat(normalized) || 0;
  };

  // Refs for Enter-key focus flow
  const supplierInvRef = useRef<HTMLInputElement>(null);
  const supplierAcRef = useRef<HTMLInputElement>(null);
  const supplierNameRef = useRef<HTMLInputElement>(null);
  const purchaseInvNoRef = useRef<HTMLInputElement>(null);
  const taxRef = useRef<HTMLInputElement>(null);
  const itemCodeRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const nameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imeiRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discPctRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discAmtRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastProductSelectLineIdRef = useRef<string | null>(null);
  const otherDiscPercentRef = useRef<HTMLInputElement>(null);
  const otherDiscountRef = useRef<HTMLInputElement>(null);
  const otherChargesRef = useRef<HTMLInputElement>(null);
  const freightRef = useRef<HTMLInputElement>(null);
  const roundOffRef = useRef<HTMLInputElement>(null);
  const narrationRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Row edit commit/revert (same as B2C): snapshot when entering a row; commit only on Enter on Qty; revert when leaving without commit
  const rowSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);
  const rowCommittedRef = useRef(false);
  const committedLineIdRef = useRef<string | null>(null); // so we don't un-commit when focus moves within same row (Qty→Rate)
  const linesTableContainerRef = useRef<HTMLDivElement>(null);

  // Combined Supplier + Cash for Autocomplete value
  const selectedSupplierCashValue = useMemo(() => {
    if (supplierId)
      return supplierCashOptions.find((o) => o.type === 'supplier' && o._id === supplierId) || null;
    if (cashAccountId)
      return supplierCashOptions.find((o) => o.type === 'cash' && o._id === cashAccountId) || null;
    return null;
  }, [supplierId, cashAccountId, supplierCashOptions]);

  const calcVatAndTotal = useCallback(
    (net: number, isVat: boolean) => {
      if (!isVat) return { vatAmount: 0, total: net };
      if (taxMode === 'inclusive') {
        const vatAmount = parseFloat(((net * VAT_RATE) / (100 + VAT_RATE)).toFixed(2));
        return { vatAmount, total: parseFloat(net.toFixed(2)) };
      }
      const vatAmount = parseFloat(((net * VAT_RATE) / 100).toFixed(2));
      return { vatAmount, total: parseFloat((net + vatAmount).toFixed(2)) };
    },
    [taxMode]
  );

  useEffect(() => {
    setLines((prev) =>
      prev.map((line) => {
        if (!line.productId) return { ...line, availableUnits: line.availableUnits ?? [] };
        const updated = { ...line, availableUnits: line.availableUnits ?? [] };
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
    const netAdjustments = otherCharges + freightCharge + roundOff - otherDiscount;
    const vatFromAdjustments =
      vatType === 'Vat' && netAdjustments !== 0
        ? parseFloat(((netAdjustments * VAT_RATE) / (100 + VAT_RATE)).toFixed(2))
        : 0;
    const totalVat = itemsVat + vatFromAdjustments;
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + roundOff;
    return { itemsGross, itemsDiscount, itemsVat, totalVat, grandTotal };
  }, [lines, otherDiscount, otherCharges, freightCharge, roundOff, vatType]);

  const handleOtherDiscPercentChange = (percent: number) => {
    setOtherDiscPercent(percent);
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    setOtherDiscount(parseFloat(((subTotal * percent) / 100).toFixed(2)));
  };

  // Load suppliers and cash accounts
  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      try {
        const [supRes, cashRes] = await Promise.all([
          ledgerAccountApi.list(companyId, 'Supplier'),
          ledgerAccountApi.list(companyId, 'Cash'),
        ]);
        const supList = (supRes.data.data || []) as Array<{ _id: string; code?: string; name: string; address?: string }>;
        const cashList = (cashRes.data.data || []) as Array<{ _id: string; code?: string; name: string }>;
        setSuppliers(supList.map((s) => ({ ...s, type: 'supplier' as const })));
        setCashAccounts(cashList.map((c) => ({ ...c, type: 'cash' as const })));
        setSupplierCashOptions([
          ...cashList.map((c) => ({ _id: c._id, code: c.code, name: c.name, type: 'cash' as const })),
          ...supList.map((s) => ({ _id: s._id, code: s.code, name: s.name, address: s.address, type: 'supplier' as const })),
        ]);
      } catch {
        setSuppliers([]);
        setCashAccounts([]);
        setSupplierCashOptions([]);
      }
    };
    load();
  }, [companyId]);

  // Load products
  useEffect(() => {
    if (!companyId) return;
    productApi.list(companyId, { limit: 1000 }).then((res) => {
      setProducts((res.data.data?.products || []) as Product[]);
    }).catch(() => setProducts([]));
  }, [companyId]);

  // Load return list and next invoice no on mount
  useEffect(() => {
    if (!companyId || !financialYearId) return;
    const load = async () => {
      try {
        const [listRes, nextRes] = await Promise.all([
          purchaseReturnApi.list(companyId, financialYearId),
          purchaseReturnApi.getNextInvoiceNo(companyId, financialYearId),
        ]);
        if (listRes.data.success && Array.isArray(listRes.data.data)) {
          setReturnList(listRes.data.data);
        }
        if (nextRes.data.success && !returnId) {
          setReturnNo(nextRes.data.data.invoiceNo);
        }
      } catch {
        setReturnList([]);
      }
    };
    load();
  }, [companyId, financialYearId]);

  const loadReturnList = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await purchaseReturnApi.list(companyId, financialYearId);
      if (res.data.success && Array.isArray(res.data.data)) setReturnList(res.data.data);
    } catch {
      setReturnList([]);
    }
  }, [companyId, financialYearId]);

  const loadNextReturnNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await purchaseReturnApi.getNextInvoiceNo(companyId, financialYearId);
      if (res.data.success) setReturnNo(res.data.data.invoiceNo);
    } catch { }
  }, [companyId, financialYearId]);

  // Load purchase by invoice no (By Ref) -> fill lines and supplier
  const handleLoadPurchase = useCallback(async () => {
    if (!companyId || !purchaseInvoiceNo.trim()) return;
    setLoading(true);
    try {
      const res = await purchaseApi.search(companyId, purchaseInvoiceNo.trim());
      const inv = res.data.data as PurchaseInvoiceData;
      if (!inv || !inv.batches?.length) {
        setErrorMessage('Purchase invoice not found or has no batches');
        setErrorDialogOpen(true);
        return;
      }
      setOriginalPurchaseId(inv._id);
      setSupplierId(inv.supplierId || null);
      setCashAccountId(null);
      setSupplierName(inv.supplierName || '');
      setSupplierAddress('');
      setSupplierInvoiceNo(inv.supplierInvoiceNo || '');
      setVatType(inv.vatType || 'Vat');
      setTaxMode((inv as { taxMode?: string }).taxMode === 'exclusive' ? 'exclusive' : 'inclusive');
      const newLines: LineItem[] = inv.batches.map((b: {
        productId: string;
        productCode: string;
        productName: string;
        batchNumber?: string;
        quantity: number;
        purchasePrice: number;
        discAmount?: number;
        unitId?: string;
        unitName?: string;
        multiUnitId?: string;
      }, idx: number) => {
        const gross = b.quantity * b.purchasePrice;
        const disc = b.discAmount ?? 0;
        const net = gross - disc;
        const isVat = (inv.vatType || 'Vat') === 'Vat';
        const taxModeInv = (inv as { taxMode?: string }).taxMode ?? 'inclusive';
        let vatAmount = 0;
        let total = net;
        if (isVat) {
          if (taxModeInv === 'inclusive') {
            vatAmount = parseFloat((net * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
            total = net;
          } else {
            vatAmount = parseFloat((net * VAT_RATE / 100).toFixed(2));
            total = net + vatAmount;
          }
        }
        const discPercent = gross > 0 ? parseFloat(((disc / gross) * 100).toFixed(2)) : 0;
        const product = (products ?? []).find((p) => p._id === b.productId);
        const availableUnits = buildAvailableUnitsFromProduct(product ?? null);
        const savedUnitId = b.unitId;
        const selectedUnit = savedUnitId && availableUnits.some((u) => u.id === savedUnitId)
          ? availableUnits.find((u) => u.id === savedUnitId)
          : availableUnits[0];
        return {
          id: `load-${idx}-${Date.now()}`,
          productId: b.productId,
          productCode: b.productCode || '',
          name: b.productName || '',
          imei: selectedUnit?.imei ?? '',
          batchNumber: b.batchNumber || '',
          quantity: b.quantity,
          pRate: b.purchasePrice,
          gross,
          discPercent,
          discAmount: disc,
          vatAmount,
          total: parseFloat(total.toFixed(2)),
          unitId: selectedUnit?.id || '',
          unitName: selectedUnit?.name || '',
          multiUnitId: selectedUnit?.isMultiUnit ? selectedUnit?.multiUnitId : undefined,
          availableUnits,
          baseStockPieces: 0,
        };
      });
      setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    } catch (err: unknown) {
      setErrorMessage((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load purchase');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [companyId, purchaseInvoiceNo, products]);

  // Load a saved return into form
  const loadReturnIntoForm = useCallback(async (id: string) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await purchaseReturnApi.getById(id, companyId);
      const data = res.data.data as PurchaseReturnData;
      if (!res.data.success || !data) return;
      setReturnId(data._id);
      setReturnNo(data.invoiceNo);
      setDate(data.date);
      setReturnType(data.returnType);
      setOriginalPurchaseId(data.originalPurchaseId || null);
      setSupplierId(data.supplierId || null);
      setCashAccountId(data.cashAccountId || null);
      setSupplierName(data.supplierName || '');
      setSupplierInvoiceNo(data.supplierInvoiceNo || '');
      setVatType(data.vatType || 'Vat');
      setTaxMode((data.taxMode as 'inclusive' | 'exclusive') ?? 'inclusive');
      setOtherDiscount(data.otherDiscount ?? 0);
      setOtherCharges(data.otherCharges ?? 0);
      setFreightCharge(data.freightCharge ?? 0);
      setRoundOff(data.roundOff ?? 0);
      setNarration(data.narration || '');
      const subTotal = (data.items || []).reduce((s, i) => s + i.quantity * i.purchasePrice - (i.discAmount ?? 0), 0);
      setOtherDiscPercent(subTotal > 0 && (data.otherDiscount ?? 0) > 0
        ? parseFloat((((data.otherDiscount ?? 0) / subTotal) * 100).toFixed(2))
        : 0);
      const newLines: LineItem[] = (data.items || []).map((it, idx) => {
        const gross = it.quantity * it.purchasePrice;
        const disc = it.discAmount ?? 0;
        const net = gross - disc;
        const vt = calcVatAndTotal(net, (data.vatType || 'Vat') === 'Vat');
        const discPercent = gross > 0 ? parseFloat(((disc / gross) * 100).toFixed(2)) : 0;
        const product = (products ?? []).find((p) => p._id === it.productId);
        const availableUnits = buildAvailableUnitsFromProduct(product ?? null);
        const savedUnitId = it.unitId;
        const selectedUnit = savedUnitId && availableUnits.some((u) => u.id === savedUnitId)
          ? availableUnits.find((u) => u.id === savedUnitId)
          : availableUnits[0];
        return {
          id: `ret-${idx}-${Date.now()}`,
          productId: it.productId,
          productCode: it.productCode || '',
          name: it.productName || '',
          imei: (it as { imei?: string }).imei ?? selectedUnit?.imei ?? '',
          batchNumber: it.batchNumber || '',
          quantity: it.quantity,
          pRate: it.purchasePrice,
          gross,
          discPercent,
          discAmount: disc,
          vatAmount: vt.vatAmount,
          total: vt.total,
          unitId: selectedUnit?.id || it.unitId || '',
          unitName: selectedUnit?.name || it.unitName || '',
          multiUnitId: it.multiUnitId ?? (selectedUnit?.isMultiUnit ? selectedUnit?.multiUnitId : undefined),
          availableUnits,
          baseStockPieces: 0,
        };
      });
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
      committedLineIdRef.current = null;
      setLines(newLines.length > 0 ? newLines : [emptyLine()]);
      const idx = returnList.findIndex((r) => r._id === id);
      if (idx >= 0) setCurrentNavIndex(idx);
    } catch {
      setErrorMessage('Failed to load return');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [companyId, returnList, calcVatAndTotal, products]);

  const navFirst = useCallback(() => {
    if (returnList.length === 0) return;
    loadReturnIntoForm(returnList[0]._id);
  }, [returnList, loadReturnIntoForm]);

  const navPrev = useCallback(() => {
    if (returnList.length === 0) return;
    const idx = currentNavIndex <= 0 ? returnList.length - 1 : currentNavIndex - 1;
    loadReturnIntoForm(returnList[idx]._id);
  }, [returnList, currentNavIndex, loadReturnIntoForm]);

  const navNext = useCallback(() => {
    if (returnList.length === 0) return;
    const idx = currentNavIndex >= returnList.length - 1 ? 0 : currentNavIndex + 1;
    loadReturnIntoForm(returnList[idx]._id);
  }, [returnList, currentNavIndex, loadReturnIntoForm]);

  const navLast = useCallback(() => {
    if (returnList.length === 0) return;
    loadReturnIntoForm(returnList[returnList.length - 1]._id);
  }, [returnList, loadReturnIntoForm]);

  const updateLine = useCallback(
    (id: string, field: keyof LineItem, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };

          if (field === 'quantity' && updated.productId) {
            const currentUnit = updated.availableUnits.find((u) => u.id === updated.unitId);
            const conv = (currentUnit?.isMultiUnit && currentUnit?.conversion) ? currentUnit.conversion : 1;
            let maxQtyForThisRow = 0;
            if (updated.batchMaxPieces != null && updated.batchMaxPieces > 0) {
              maxQtyForThisRow = updated.batchMaxPieces / conv;
            } else if (updated.baseStockPieces >= 0) {
              const usedByOtherRows = prev.reduce((sum, l) => {
                if (l.id === id || l.productId !== updated.productId) return sum;
                const u = l.availableUnits.find((au) => au.id === l.unitId);
                const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
                return sum + (l.quantity * c);
              }, 0);
              const remainingPieces = updated.baseStockPieces - usedByOtherRows;
              maxQtyForThisRow = remainingPieces / conv;
            }
            if (updated.baseStockPieces !== undefined && updated.quantity > maxQtyForThisRow) {
              updated.quantity = Math.max(parseFloat(maxQtyForThisRow.toFixed(4)), 0);
            }
          }

          if (['quantity', 'pRate', 'discPercent', 'discAmount'].includes(field)) {
            updated.gross = parseFloat((updated.quantity * updated.pRate).toFixed(2));
            if (field === 'discPercent')
              updated.discAmount = parseFloat(((updated.gross * updated.discPercent) / 100).toFixed(2));
            else if (field === 'discAmount')
              updated.discPercent = updated.gross > 0 ? parseFloat(((updated.discAmount / updated.gross) * 100).toFixed(2)) : 0;
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

  // Get batches for a product from backend
  const getBatchesForProduct = useCallback(async (productId: string) => {
    try {
      if (!companyId) return [];
      const res = await purchaseApi.getProductBatches(companyId, productId);
      return res.data.data || [];
    } catch {
      return [];
    }
  }, [companyId]);

  // Complete product selection after batch is chosen - focuses Qty like Sales B2C
  const completeProductSelection = useCallback(
    async (lineId: string, product: Product, selectedBatch?: typeof availableBatches[0]): Promise<void> => {
      const purchasePrice = selectedBatch?.purchasePrice ?? product.purchasePrice ?? 0;

      let totalStock = 0;
      if (selectedBatch) {
        totalStock = selectedBatch.quantity;
      } else {
        try {
          if (companyId) {
            const stockRes = await stockApi.getProductStock(companyId, product._id);
            totalStock = stockRes.data.data?.stock ?? 0;
          }
        } catch {
          totalStock = (product as any).stock ?? (product as any).quantity ?? 0;
        }
      }

      // Block return if no stock available
      let remainingStock = totalStock;
      if (!selectedBatch) {
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
        setStockAlertMessage(`Cannot return "${product.name}" — no stock available.`);
        setStockAlertOpen(true);
        // Clear the line since it's invalid
        updateLine(lineId, 'productId', '');
        updateLine(lineId, 'productCode', '');
        updateLine(lineId, 'name', '');
        return;
      }

      const availableUnits = buildAvailableUnitsFromProduct({ ...product, purchasePrice });
      const selectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
      const isMultiUnit = selectedUnit?.isMultiUnit && selectedUnit?.conversion;
      const usePrice = parseFloat((isMultiUnit && selectedUnit
        ? purchasePrice * (selectedUnit.conversion ?? 1)
        : (selectedUnit?.price ?? purchasePrice)).toFixed(2));
      const useImei = selectedUnit?.imei || product.imei || '';

      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          const updated = {
            ...l,
            productId: product._id,
            productCode: product.code || '',
            name: product.name,
            imei: useImei,
            unitId: selectedUnit?.id || '',
            unitName: selectedUnit?.name || '',
            multiUnitId: selectedUnit?.isMultiUnit ? selectedUnit?.multiUnitId : undefined,
            availableUnits,
            pRate: usePrice,
            quantity: l.quantity || 1,
            batchNumber: selectedBatch?.batchNumber || '',
            baseStockPieces: totalStock,
            batchMaxPieces: selectedBatch ? selectedBatch.quantity : undefined,
          };
          updated.gross = parseFloat((updated.quantity * updated.pRate).toFixed(2));
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        })
      );
      setActiveLineId(lineId);
      if (!rowSnapshotRef.current) {
        rowCommittedRef.current = true;
      }
      setSelectedProductInfo({
        purchaseRate: usePrice,
        lastVendor: (product as any).lastVendor ?? '-',
        totalStock: totalStock,
        previousPrice: (product as any).previousPrice ?? 0,
        retailPrice: (product as any).retailPrice ?? 0,
        wholesalePrice: (product as any).wholesalePrice ?? 0,
        batchNumber: selectedBatch?.batchNumber || undefined,
      });

      // Focus Qty after batch selection (like Sales B2C) - use longer delay and multiple attempts
      const tryFocus = () => {
        const qtyInput = qtyRefs.current[lineId];
        if (qtyInput) {
          qtyInput.focus();
          return true;
        }
        return false;
      };

      // Try multiple times to catch it after render completes
      setTimeout(tryFocus, 150);
      setTimeout(tryFocus, 300);
      setTimeout(tryFocus, 500);
    },
    [vatType, calcVatAndTotal]
  );

  // Handle batch selection from dialog
  const handleBatchSelect = useCallback(async (selectedBatch: typeof availableBatches[0]) => {
    const lineId = pendingProductSelection?.lineId;
    if (pendingProductSelection) {
      await completeProductSelection(
        pendingProductSelection.lineId,
        pendingProductSelection.product,
        selectedBatch
      );
    }
    setBatchDialogOpen(false);
    setAvailableBatches([]);
    setPendingProductSelection(null);
    // MUI Dialog restores focus to the previously-focused element (item name input)
    // after the dialog closes, which overrides the focus set by completeProductSelection.
    // Add extra focus attempts with longer delays to win the focus battle.
    // Note: use qtyRefs directly instead of focusQtyForLine to avoid temporal dead zone.
    if (lineId) {
      const focusQty = () => {
        const el =
          qtyRefs.current[lineId] ??
          document.querySelector<HTMLInputElement>(`input[data-purchase-return-qty="${lineId}"]`) ??
          document.querySelector<HTMLTableRowElement>(`tr[data-line-id="${lineId}"]`)?.querySelector<HTMLInputElement>('input[type="number"]');
        el?.focus();
      };
      [100, 200, 400, 600].forEach((ms) => setTimeout(focusQty, ms));
    }
  }, [pendingProductSelection, completeProductSelection]);

  // Handle batch dialog close without selection
  const handleBatchDialogClose = useCallback(() => {
    setBatchDialogOpen(false);
    setAvailableBatches([]);
    setPendingProductSelection(null);
    setFocusedBatchIndex(0);
  }, []);

  // Scroll focused batch into view
  useEffect(() => {
    if (batchDialogOpen && batchRowRefs.current[focusedBatchIndex]) {
      batchRowRefs.current[focusedBatchIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [batchDialogOpen, focusedBatchIndex]);

  // Handle keyboard navigation in batch dialog
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
      if (selectedBatch) {
        handleBatchSelect(selectedBatch);
      }
    } else if (e.key === 'Escape') {
      handleBatchDialogClose();
    }
  }, [batchDialogOpen, availableBatches, focusedBatchIndex, handleBatchSelect, handleBatchDialogClose]);

  // Open batch dialog when returning to item field and pressing Enter (for already-selected batch products)
  const openBatchDialogForLine = useCallback(async (line: LineItem): Promise<boolean> => {
    if (!line.productId) return false;
    let product = products.find((p) => p._id === line.productId);
    if (!product) return false;
    if (companyId) {
      try {
        const res = await productApi.get(product._id, companyId);
        const fetched = res.data?.data as { allowBatches?: boolean } | undefined;
        if (fetched) {
          product = { ...product, allowBatches: fetched.allowBatches === true };
        }
      } catch {
        // use original product
      }
    }
    if ((product as { allowBatches?: boolean }).allowBatches !== true) return false;
    const batches = await getBatchesForProduct(product._id);
    if (batches.length > 1) {
      setAvailableBatches(batches);
      setPendingProductSelection({ lineId: line.id, product });
      setFocusedBatchIndex(0);
      setBatchDialogOpen(true);
      return true;
    }
    return false;
  }, [products, getBatchesForProduct, companyId]);

  const handleProductSelect = useCallback(
    async (lineId: string, product: Product | null) => {
      if (!product) {
        updateLine(lineId, 'productId', '');
        updateLine(lineId, 'productCode', '');
        updateLine(lineId, 'name', '');
        updateLine(lineId, 'imei', '');
        updateLine(lineId, 'pRate', 0);
        updateLine(lineId, 'unitId', '');
        updateLine(lineId, 'unitName', '');
        updateLine(lineId, 'availableUnits', []);
        setSelectedProductInfo(null);
        return;
      }

      // Fetch actual product to check allowBatches flag from server
      let productToUse = product;
      try {
        if (companyId) {
          const res = await productApi.get(product._id, companyId);
          const fetched = res.data?.data as { allowBatches?: boolean } | undefined;
          if (fetched) {
            productToUse = { ...product, allowBatches: fetched.allowBatches === true };
          }
        }
      } catch {
        // Use original product if fetch fails
      }

      // Check if batch selection is enabled (allowBatches === true)
      const batchSelectionEnabled = (productToUse as { allowBatches?: boolean }).allowBatches === true;

      if (batchSelectionEnabled) {
        // Fetch batches and show dialog if multiple batches exist
        const batches = await getBatchesForProduct(productToUse._id);
        if (batches.length > 1) {
          setAvailableBatches(batches);
          setPendingProductSelection({ lineId, product: productToUse });
          setFocusedBatchIndex(0);
          setBatchDialogOpen(true);
          return; // Don't complete selection yet - user will pick batch
        }
        if (batches.length === 1) {
          // Single batch - auto-select it
          await completeProductSelection(lineId, productToUse, batches[0]);
          return;
        }
      }

      // No batches or batch selection disabled - proceed with normal selection
      await completeProductSelection(lineId, productToUse);
    },
    [getBatchesForProduct, completeProductSelection, updateLine, companyId]
  );

  const handleUnitChange = useCallback(
    (lineId: string, unitId: string) => {
      const currentLine = lines.find((l) => l.id === lineId);
      const selectedUnit = (currentLine?.availableUnits ?? []).find((u) => u.id === unitId);
      if (!currentLine || !selectedUnit) return;

      const product = products.find((p) => p._id === currentLine.productId);
      const basePurchasePrice = product?.purchasePrice ?? 0;
      const isMultiUnit = selectedUnit.isMultiUnit && selectedUnit.conversion;
      const newPrice = parseFloat((isMultiUnit
        ? basePurchasePrice * (selectedUnit.conversion ?? 1)
        : (selectedUnit.price ?? basePurchasePrice)).toFixed(2));

      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = {
            ...line,
            unitId: selectedUnit.id,
            unitName: selectedUnit.name,
            multiUnitId: selectedUnit.isMultiUnit ? selectedUnit.multiUnitId : undefined,
            imei: selectedUnit.imei || line.imei,
            pRate: newPrice,
            quantity: line.quantity || 1,
          };
          updated.gross = parseFloat((updated.quantity * updated.pRate).toFixed(2));
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        })
      );
    },
    [lines, products, vatType, calcVatAndTotal]
  );

  // Focus Qty input for a line (by ref, data attr, or row lookup)
  const focusQtyForLine = useCallback((lineId: string) => {
    const el =
      qtyRefs.current[lineId] ??
      document.querySelector<HTMLInputElement>(`input[data-purchase-return-qty="${lineId}"]`) ??
      document.querySelector<HTMLTableRowElement>(`tr[data-line-id="${lineId}"]`)?.querySelector<HTMLInputElement>('input[type="number"]');
    el?.focus();
  }, []);

  const handleUnitKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusQtyForLine(lineId);
    }
  }, [focusQtyForLine]);

  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.select();
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    if (['+', '-', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLElement).blur();
    }
  };

  // IMEI/Barcode search: lookup by IMEI API → barcode API → local product code
  const handleImeiSearch = useCallback(
    async (lineId: string, searchValue: string): Promise<boolean> => {
      if (!searchValue.trim() || !companyId) return false;
      const searchTerm = searchValue.trim();
      try {
        let product: Product | null = null;
        try {
          const res = await productApi.getByImei(companyId, searchTerm);
          if (res.data.data) {
            const d = res.data.data as { product?: Product } | Product;
            product = 'product' in d ? d.product || null : d as Product;
          }
        } catch { /* try barcode */ }
        if (!product) {
          try {
            const res = await productApi.getByBarcode(companyId, searchTerm);
            if (res.data.data) {
              const d = res.data.data as { product?: Product } | Product;
              product = 'product' in d ? d.product || null : d as Product;
            }
          } catch { /* try local code */ }
        }
        if (!product) {
          product = products.find((p) => p.code === searchTerm || p.code?.toLowerCase() === searchTerm.toLowerCase()) || null;
        }
        if (product) {
          handleProductSelect(lineId, product);
          setTimeout(() => focusQtyForLine(lineId), 100);
          return true;
        }
        return false;
      } catch { return false; }
    },
    [companyId, handleProductSelect, products, focusQtyForLine]
  );

  // Item Code search: lookup by product code in local list
  const handleItemCodeSearch = useCallback(
    (lineId: string, code: string): boolean => {
      if (!code.trim()) return false;
      const term = code.trim();
      const product = products.find((p) => p.code === term || p.code?.toLowerCase() === term.toLowerCase()) || null;
      if (product) {
        handleProductSelect(lineId, product);
        setTimeout(() => focusQtyForLine(lineId), 100);
        return true;
      }
      return false;
    },
    [products, handleProductSelect, focusQtyForLine]
  );

  const removeLine = (id: string) => {
    if (rowSnapshotRef.current?.lineId === id) {
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    if (committedLineIdRef.current === id) committedLineIdRef.current = null;
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.length === 0 ? [emptyLine()] : filtered;
    });
    setSelectedProductInfo(null);
    setActiveLineId(null);
  };

  const handleRowClick = async (line: LineItem) => {
    setActiveLineId(line.id);

    if (!line.productId) {
      setSelectedProductInfo(null);
      return;
    }
    const product = products.find(p => p._id === line.productId);

    setSelectedProductInfo({
      purchaseRate: line.pRate,
      lastVendor: product ? ((product as any).lastVendor ?? '-') : '-',
      totalStock: line.baseStockPieces, // use the baseStockPieces which includes total stock
      previousPrice: product ? ((product as any).previousPrice ?? 0) : 0,
      retailPrice: product ? ((product as any).retailPrice ?? 0) : 0,
      wholesalePrice: product ? ((product as any).wholesalePrice ?? 0) : 0,
      batchNumber: line.batchNumber || undefined,
    });
  };

  // Revert uncommitted row edits back to snapshot (same as B2C)
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
      // Clear editing cell for the reverted row so the field shows reverted value (e.g. old qty) not stale blank
      if (snapshot.lineId) {
        setEditingNumericCell((prev) =>
          prev && prev.lineId === snapshot.lineId ? null : prev
        );
      }
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    committedLineIdRef.current = null;
  }, []);

  // Called when user enters a row (focus any cell) — revert previous row if uncommitted, snapshot this row
  const enterRow = useCallback((line: LineItem) => {
    if (rowSnapshotRef.current && rowSnapshotRef.current.lineId === line.id) return;
    // Moving within same row after committing via Enter on Price: don't re-snapshot
    if (rowCommittedRef.current && committedLineIdRef.current === line.id) {
      committedLineIdRef.current = null;
      return;
    }
    revertUncommittedRow();
    committedLineIdRef.current = null;
    if (line.productId) {
      rowSnapshotRef.current = {
        lineId: line.id,
        data: { ...line, availableUnits: [...(line.availableUnits ?? [])] },
      };
      rowCommittedRef.current = false;
    }
  }, [revertUncommittedRow]);

  // Shared commit so both blur and Enter persist qty (avoids blur/focus race where next field's onFocus clears editingNumericCell before qty blur runs)
  // When skipClearEditingCell is true (Enter path), we don't clear so the field keeps showing typed value until next field's onFocus; then line state is already updated.
  const commitQuantity = useCallback((line: LineItem, rawValue: string, skipClearEditingCell?: boolean) => {
    const parsedQty = parseNumericInput(rawValue);
    if (!skipClearEditingCell) {
      setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? null : prev);
    }

    if (!line.productId) {
      updateLine(line.id, 'quantity', parsedQty);
      return;
    }

    const currentUnit = line.availableUnits.find((u) => u.id === line.unitId);
    const conv = (currentUnit?.isMultiUnit && currentUnit?.conversion) ? currentUnit.conversion : 1;
    let maxQtyForThisRow = 0;
    if (line.batchMaxPieces != null && line.batchMaxPieces > 0) {
      maxQtyForThisRow = line.batchMaxPieces / conv;
    } else if (line.baseStockPieces >= 0) {
      const usedByOtherRows = lines.reduce((sum, l) => {
        if (l.id === line.id || l.productId !== line.productId) return sum;
        const u = l.availableUnits.find((au) => au.id === l.unitId);
        const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
        return sum + (l.quantity * c);
      }, 0);
      const remainingPieces = line.baseStockPieces - usedByOtherRows;
      maxQtyForThisRow = remainingPieces / conv;
    }

    const cappedQty = Math.max(parseFloat((maxQtyForThisRow || 0).toFixed(4)), 0);
    if (line.baseStockPieces !== undefined && parsedQty > cappedQty) {
      setStockAlertMessage('Qty not available');
      setStockAlertOpen(true);
      qtyOverflowLineIdRef.current = line.id;
      updateLine(line.id, 'quantity', cappedQty);
    } else {
      updateLine(line.id, 'quantity', parsedQty);
    }
  }, [updateLine, lines]);

  const handleQtyBlur = useCallback((line: LineItem) => {
    const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : '';
    commitQuantity(line, raw);
  }, [editingNumericCell, commitQuantity]);

  // ─── Qty Enter → persist qty value and move to Rate (row stays uncommitted until Enter in Price) ───
  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = (e.target as HTMLInputElement)?.value ?? '';
    commitQuantity(line, raw, true);
    // Don't mark row as committed here — only Enter in Price commits the row
    committedLineIdRef.current = line.id; // prevent re-snapshot when focus moves Qty→Rate
    setTimeout(() => {
      const el = rateRefs.current[line.id];
      if (el) {
        el.focus();
        el.select();
      }
    }, 10);
  }, [commitQuantity]);

  // ─── Price (Rate) Enter → THE commit point: validate, accept changes, then move to next row / add new row ───
  const handleRateKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = (e.target as HTMLInputElement)?.value ?? '';
    updateLine(lineId, 'pRate', parseNumericInput(raw));

    // Defer so the pRate updateLine is applied before we read line state for validation
    setTimeout(() => {
      setLines((currentLines) => {
        const currentIndex = currentLines.findIndex((l) => l.id === lineId);
        const line = currentLines[currentIndex];
        if (!line) return currentLines;

        // ── Validate before committing ──
        if (!line.productCode || !line.name) {
          setTimeout(() => itemCodeRefs.current[lineId]?.focus(), 30);
          return currentLines;
        }
        if (line.quantity <= 0) {
          setTimeout(() => qtyRefs.current[lineId]?.focus(), 30);
          return currentLines;
        }
        if (line.pRate <= 0) {
          setTimeout(() => rateRefs.current[lineId]?.focus(), 30);
          return currentLines;
        }

        // ── Valid → commit row (clear snapshot so leaving won't revert) ──
        rowCommittedRef.current = true;
        rowSnapshotRef.current = null;
        committedLineIdRef.current = lineId;

        // Move to next row's IMEI, or add a new row
        if (currentIndex >= 0 && currentIndex < currentLines.length - 1) {
          const nextLine = currentLines[currentIndex + 1];
          setTimeout(() => imeiRefs.current[nextLine.id]?.focus(), 30);
          return currentLines;
        }

        const newLine = emptyLine();
        setTimeout(() => imeiRefs.current[newLine.id]?.focus(), 50);
        return [...currentLines, newLine];
      });
    }, 50);
  }, [updateLine]);

  // Disc% Enter → commit then move to Price (Rate) field
  const handleDiscPercentKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = (e.target as HTMLInputElement)?.value ?? '';
    updateLine(lineId, 'discPercent', parseNumericInput(raw));
    committedLineIdRef.current = lineId;
    setTimeout(() => {
      const el = rateRefs.current[lineId];
      if (el) {
        el.focus();
        el.select();
      }
    }, 10);
  }, [updateLine]);

  // Disc Amt Enter → commit then move to Price (Rate) field (same row)
  const handleDiscAmountKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = (e.target as HTMLInputElement)?.value ?? '';
    updateLine(lineId, 'discAmount', parseNumericInput(raw));
    committedLineIdRef.current = lineId;
    setTimeout(() => {
      const el = rateRefs.current[lineId];
      if (el) {
        el.focus();
        el.select();
      }
    }, 10);
  }, [updateLine]);

  const handleClear = useCallback(async () => {
    setReturnId(null);
    setOriginalPurchaseId(null);
    setDate(getCurrentDate());
    setReturnType('OnAccount');
    setPurchaseInvoiceNo('');
    setSupplierInvoiceNo('');
    setVatType('Vat');
    setTaxMode('inclusive');
    setSupplierId(null);
    setCashAccountId(null);
    setSupplierName('');
    setSupplierAddress('');
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    committedLineIdRef.current = null;
    setLines([emptyLine()]);
    setOtherDiscPercent(0);
    setOtherDiscount(0);
    setOtherCharges(0);
    setFreightCharge(0);
    setRoundOff(0);
    setNarration('');
    setCurrentNavIndex(-1);
    setSelectedProductInfo(null);
    await loadNextReturnNo();
    await loadReturnList();
  }, [loadNextReturnNo, loadReturnList]);

  const handleSave = useCallback(async (isEditUpdate?: boolean) => {
    if (!companyId || !financialYearId) {
      setErrorMessage('Please select company and financial year');
      setErrorDialogOpen(true);
      return;
    }
    const hasSupplierOrCash = !!supplierId || !!cashAccountId;
    if (!hasSupplierOrCash) {
      setErrorMessage('Please select Supplier or Cash Account');
      setErrorDialogOpen(true);
      return;
    }
    const validLines = lines.filter((l) => l.productId && l.productCode);
    if (validLines.length === 0) {
      setErrorMessage('Add at least one line with a product');
      setErrorDialogOpen(true);
      return;
    }
    const items = validLines.map((l) => ({
      productId: l.productId,
      productCode: l.productCode,
      productName: l.name,
      quantity: l.quantity,
      purchasePrice: l.pRate,
      discAmount: l.discAmount,
      batchNumber: l.batchNumber || undefined,
      unitId: l.unitId || undefined,
      unitName: l.unitName || undefined,
      multiUnitId: l.multiUnitId,
    }));
    const itemsDiscount = validLines.reduce((s, l) => s + l.discAmount, 0);
    const payload = {
      companyId,
      financialYearId,
      date: date || undefined,
      returnType,
      originalPurchaseId: returnType === 'ByRef' ? (originalPurchaseId || undefined) : undefined,
      supplierId: supplierId || undefined,
      supplierName: supplierName || undefined,
      supplierInvoiceNo: supplierInvoiceNo || undefined,
      cashAccountId: cashAccountId || undefined,
      vatType,
      taxMode,
      items,
      itemsDiscount,
      otherDiscount,
      otherCharges,
      freightCharge,
      roundOff,
      narration: narration || undefined,
    };
    setLoading(true);
    try {
      if (isEditUpdate && returnId) {
        await purchaseReturnApi.update(returnId, companyId, payload);
        setSuccessMessage('Purchase Return updated successfully.');
        setSuccessDialogOpen(true);
        await loadReturnList();
      } else {
        await purchaseReturnApi.create(payload);
        setSuccessMessage('Purchase Return saved successfully.');
        setSuccessDialogOpen(true);
        await handleClear();
      }
    } catch (err: unknown) {
      setErrorMessage((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  }, [
    companyId,
    financialYearId,
    supplierId,
    cashAccountId,
    supplierName,
    supplierInvoiceNo,
    lines,
    date,
    returnType,
    originalPurchaseId,
    vatType,
    taxMode,
    otherDiscount,
    otherCharges,
    freightCharge,
    roundOff,
    narration,
    returnId,
    handleClear,
    loadReturnList,
  ]);

  const handleSearchSubmit = useCallback(async () => {
    if (!companyId || !searchInvoiceNo.trim()) return;
    try {
      const res = await purchaseReturnApi.search(companyId, searchInvoiceNo.trim());
      const data = res.data.data;
      if (data) {
        setSearchDialogOpen(false);
        setSearchInvoiceNo('');
        await loadReturnIntoForm(data._id);
      } else {
        setErrorMessage('Return not found');
        setErrorDialogOpen(true);
      }
    } catch {
      setErrorMessage('Return not found');
      setErrorDialogOpen(true);
    }
  }, [companyId, searchInvoiceNo, loadReturnIntoForm]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!returnId || !companyId) return;
    setDeleteDialogOpen(false);
    try {
      await purchaseReturnApi.delete(returnId, companyId);
      setSuccessMessage('Purchase Return deleted.');
      setSuccessDialogOpen(true);
      await handleClear();
      await loadReturnList();
    } catch (err: unknown) {
      setErrorMessage((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete');
      setErrorDialogOpen(true);
    }
  }, [returnId, companyId, handleClear, loadReturnList]);

  const numberInputStyle = {
    '& input[type=number]': { MozAppearance: 'textfield' },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
      WebkitAppearance: 'none',
      margin: 0,
    },
  };

  if (!companyId || !financialYearId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select a company and financial year.</Alert>
      </Box>
    );
  }

  return (
    <Box
      onClick={handlePageClick}
      sx={{
        p: 0.5,
        bgcolor: '#ffffff',
        minHeight: '100vh',
        height: '100%',
        width: '100%',
        maxWidth: 1600,
        mx: 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        '& .MuiInputLabel-root': { fontWeight: 600, color: '#1e293b' },
        ...numberInputStyle,
      }}
    >
      <Typography component="h1" variant="h6" sx={{ fontWeight: 700, color: '#0f766e', mb: 1, fontSize: '1.1rem' }}>
        Purchase Return
      </Typography>

      {/* Purchase Return Card - same style as Purchase Entry */}
      <Paper elevation={0} sx={{ px: 2, py: 1.5, mb: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
            <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.5, px: 1.5, py: 0.6, textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>RETURN NO</Typography>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.3 }}>{returnNo}</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.7}>
            <DateInput label="Date" value={date} onChange={setDate} size="small" />
          </Grid>
          {/* VAT Type + Return Type - first row, together (same as Purchase Entry) */}
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
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>RETURN TYPE</Typography>
                <RadioGroup row value={returnType} onChange={(e) => setReturnType(e.target.value as 'OnAccount' | 'ByRef')}>
                  <FormControlLabel value="OnAccount" control={<Radio size="small" sx={{ p: 0.3 }} />} label="On Account" sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                  <FormControlLabel value="ByRef" control={<Radio size="small" sx={{ p: 0.3 }} />} label="By Ref" sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem' } }} />
                </RadioGroup>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.8}>
            <TextField
              label="Supplier Inv No"
              size="small"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              inputRef={supplierInvRef}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); supplierAcRef.current?.focus(); } }}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={2.5} lg={2.2}>
            <Autocomplete<SupplierCashOption>
              size="small"
              options={supplierCashOptions}
              groupBy={(opt) => (opt.type === 'cash' ? 'Cash Accounts' : 'Suppliers')}
              getOptionLabel={(opt) => opt.name || ''}
              value={selectedSupplierCashValue}
              onChange={(_, v) => {
                if (!v) {
                  setSupplierId(null);
                  setCashAccountId(null);
                  setSupplierName('');
                  setSupplierAddress('');
                  return;
                }
                if (v.type === 'cash') {
                  setCashAccountId(v._id);
                  setSupplierId(null);
                  setSupplierName('');
                  setSupplierAddress('');
                } else {
                  setSupplierId(v._id);
                  setCashAccountId(null);
                  setSupplierName(v.name);
                  setSupplierAddress(v.address || '');
                }
              }}
              ListboxProps={{
                sx: {
                  p: 0,
                  maxHeight: 250,
                  overflowY: 'auto',
                  '& .MuiAutocomplete-groupLabel': { bgcolor: '#f1f5f9', color: '#1e293b', fontWeight: 600, fontSize: '0.75rem', py: 0.5, px: 2 },
                  '& .MuiAutocomplete-option': { minHeight: 'auto', py: 0.75, px: 2, fontSize: '0.85rem', bgcolor: 'transparent', '&[data-focus="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' }, '&[aria-selected="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' }, '&.Mui-focused': { bgcolor: '#0f766e !important', color: '#ffffff !important' } },
                },
              }}
              renderOption={(props, opt) => (
                <li {...props} key={opt._id} style={{ fontSize: '0.85rem', fontWeight: 400, padding: '6px 14px', background: '#ffffff', color: opt.type === 'cash' ? '#0ea5e9' : '#334155', cursor: 'pointer' }}>
                  {opt.name}
                </li>
              )}
              isOptionEqualToValue={(a, b) => a._id === b._id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={supplierAcRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); supplierNameRef.current?.focus(); } }}
                  label="Supplier / Cash A/C"
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                />
              )}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={2.5} lg={2.2}>
            <TextField
              label="Supplier Name / Address"
              size="small"
              value={supplierAddress || supplierName}
              onChange={(e) => {
                setSupplierAddress(e.target.value);
                if (!supplierId && !cashAccountId) setSupplierName(e.target.value);
              }}
              inputRef={supplierNameRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (returnType === 'ByRef') purchaseInvNoRef.current?.focus();
                  else taxRef.current?.focus();
                }
              }}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: supplierId || cashAccountId ? '#f1f5f9' : undefined } }}
            />
          </Grid>
          {returnType === 'ByRef' && (
            <>
              <Grid item xs={6} sm={4} md={2} lg={1.5}>
                <TextField
                  label="Purchase Invoice No"
                  size="small"
                  value={purchaseInvoiceNo}
                  onChange={(e) => setPurchaseInvoiceNo(e.target.value)}
                  inputRef={purchaseInvNoRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); taxRef.current?.focus(); } }}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                />
              </Grid>
              <Grid item xs="auto">
                <Button variant="contained" size="small" onClick={handleLoadPurchase} disabled={loading} sx={{ borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none' }}>
                  Load
                </Button>
              </Grid>
            </>
          )}
          {/* Navigation - same style as Purchase Entry */}
          <Grid item xs="auto">
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              {[
                { icon: <FirstIcon />, handler: navFirst, tip: 'First', disabled: returnList.length === 0 },
                { icon: <PrevIcon />, handler: navPrev, tip: 'Previous', disabled: returnList.length === 0 || currentNavIndex === 0 },
                { icon: <NextIcon />, handler: navNext, tip: 'Next', disabled: returnList.length === 0 || currentNavIndex >= returnList.length - 1 },
                { icon: <LastIcon />, handler: navLast, tip: 'Last', disabled: returnList.length === 0 },
              ].map((nav, i) => (
                <Tooltip key={i} title={`${nav.tip} Return`}>
                  <span>
                    <Button variant="contained" size="small" onClick={nav.handler} disabled={nav.disabled} sx={{ flex: 1, py: 0.4, minWidth: 36, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none', '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
                      {nav.icon}
                    </Button>
                  </span>
                </Tooltip>
              ))}
              {returnList.length > 0 && (
                <Typography sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.7rem', ml: 0.3 }}>
                  {currentNavIndex >= 0 ? `${currentNavIndex + 1}/${returnList.length}` : `${returnList.length}`}
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs />
          {/* Product Info - same style as Purchase Entry */}
          <Grid item xs={12} md={12} lg={6}>
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
                      {selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, px: 1, py: 0.3, bgcolor: '#fef2f2', borderRadius: 1 }}>
                    <Typography sx={{ fontSize: '0.62rem', lineHeight: 1, color: '#dc2626', fontWeight: 600 }}>Stock</Typography>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.3, color: '#dc2626' }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? ((selectedProductInfo.totalStock ?? selectedProductInfo.stock ?? 0) / activeMultiUnitInfo.pcsInside).toFixed(2)
                        : (selectedProductInfo.totalStock ?? selectedProductInfo.stock ?? '-')}
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
          {/* Tax - same style as Purchase Entry */}
          <Grid item xs="auto">
            <TextField
              size="small"
              select
              label="Tax"
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              inputRef={taxRef}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const first = lines[0]; if (first) itemCodeRefs.current[first.id]?.focus(); } }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 130, height: 38, '& .MuiOutlinedInput-root': { borderRadius: 1.5, height: 38 } }}
            >
              <MenuItem value="inclusive">Include Tax</MenuItem>
              <MenuItem value="exclusive">Exclude Tax</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Lines table - same style as Purchase Entry */}
      <Paper elevation={0} sx={{ mb: 0.5, bgcolor: 'white', borderRadius: 2, border: '2px solid #000000', overflow: 'hidden' }}>
        <TableContainer
          ref={linesTableContainerRef}
          sx={{ minHeight: 320, maxHeight: 400, width: '100%', bgcolor: '#f4f6f8' }}
          onBlurCapture={() => {
            const container = linesTableContainerRef.current;
            if (!container) return;
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
          <Table stickyHeader size="small" sx={{ minWidth: '100%', '& .MuiTableCell-root': { fontSize: '0.78rem' }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '3%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Sl</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '10%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Item Code</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '9%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>IMEI</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '14%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Item Name</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Unit</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Qty</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '10%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Rate</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '8%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Disc %</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '8%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Disc Amt</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '8%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>VAT</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '10%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Total</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '3%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow
                  key={line.id}
                  data-line-id={line.id}
                  onClick={() => handleRowClick(line)}
                  onFocusCapture={() => { enterRow(line); setActiveLineId(line.id); handleRowClick(line); }}
                  sx={{ bgcolor: idx % 2 === 0 ? '#f8fafc' : 'white', '&:hover': { bgcolor: '#e0f2fe' } }}
                >
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem' }}>{idx + 1}</TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      value={line.productCode}
                      onChange={(e) => updateLine(line.id, 'productCode', e.target.value)}
                      onFocus={handleTextFieldFocus}
                      inputRef={(el) => { itemCodeRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null; }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const code = line.productCode;
                          if (code && handleItemCodeSearch(line.id, code)) return;
                          imeiRefs.current[line.id]?.focus();
                        }
                      }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      value={line.imei}
                      onChange={(e) => updateLine(line.id, 'imei', e.target.value)}
                      onFocus={handleTextFieldFocus}
                      inputRef={(el) => { imeiRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null; }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = line.imei;
                          if (val && await handleImeiSearch(line.id, val)) return;
                          setTimeout(() => {
                            const next = nameInputRefs.current[line.id] ?? unitRefs.current[line.id];
                            next?.focus();
                          }, 50);
                        }
                      }}
                      fullWidth
                      placeholder="IMEI"
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <Autocomplete
                      size="small"
                      options={products}
                      filterOptions={productFilterOptions}
                      getOptionLabel={(opt) => opt.name || ''}
                      value={products.find((p) => p._id === line.productId) || null}
                      openOnFocus
                      blurOnSelect={false}
                      onChange={(_, v) => {
                        handleProductSelect(line.id, v || null);
                        if (v) {
                          lastProductSelectLineIdRef.current = line.id;
                          const lineId = line.id;
                          [0, 50, 150, 300].forEach((ms) => setTimeout(() => focusQtyForLine(lineId), ms));
                        }
                      }}
                      onClose={() => {
                        if (lastProductSelectLineIdRef.current === line.id) {
                          lastProductSelectLineIdRef.current = null;
                          setTimeout(() => focusQtyForLine(line.id), 80);
                        }
                      }}
                      ListboxProps={{
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter') {
                            const lineId = line.id;
                            setTimeout(() => focusQtyForLine(lineId), 120);
                          }
                        },
                      }}
                      isOptionEqualToValue={(a, b) => a._id === b._id}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          inputRef={(el: HTMLInputElement | null) => {
                            const input = el?.querySelector?.('input') ?? el ?? null;
                            nameInputRefs.current[line.id] = input;
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const focusInListbox = document.activeElement?.closest?.('.MuiAutocomplete-listbox') != null;
                            if (focusInListbox) return;

                            const listOpen = (e.target as HTMLInputElement)?.getAttribute?.('aria-expanded') === 'true';
                            if (listOpen) {
                              setTimeout(() => focusQtyForLine(line.id), 150);
                              return;
                            }

                            e.preventDefault();
                            e.stopPropagation();

                            // Get current typed value from DOM (user may have just typed, state not yet updated)
                            const inputEl = (e.target as HTMLElement)?.closest?.('input') || (e.target as HTMLInputElement) || nameInputRefs.current[line.id];
                            const typed = (inputEl && 'value' in inputEl ? (inputEl as HTMLInputElement).value : line.name)?.trim() ?? '';

                            const currentProduct = line.productId ? products.find((p) => p._id === line.productId) : null;

                            // If user typed something, try to match a product: exact match first, then single "starts with" match
                            if (typed) {
                              const exactMatch = products.find((p) => (p.name || '').trim().toLowerCase() === typed.toLowerCase());
                              const isDifferentProduct = !currentProduct || (currentProduct?.name || '').trim().toLowerCase() !== typed.toLowerCase();
                              if (exactMatch && isDifferentProduct) {
                                handleProductSelect(line.id, exactMatch).then(() => {
                                  setTimeout(() => focusQtyForLine(line.id), 150);
                                });
                                return;
                              }
                              // No exact match: if exactly one product name starts with typed text, use it (e.g. "lenov" -> "Lenovo")
                              let singleMatch: Product | null = null;
                              const startsWithMatches = products.filter((p) => (p.name || '').trim().toLowerCase().startsWith(typed.toLowerCase()));
                              if (startsWithMatches.length === 1) singleMatch = startsWithMatches[0];
                              // Allow small typo at end: e.g. "lenova" -> try "lenov" so "Lenovo" matches
                              if (!singleMatch && typed.length >= 4) {
                                for (let drop = 1; drop <= 2 && !singleMatch; drop++) {
                                  const prefix = typed.toLowerCase().slice(0, -drop);
                                  const matches = products.filter((p) => (p.name || '').trim().toLowerCase().startsWith(prefix));
                                  if (matches.length === 1) singleMatch = matches[0];
                                }
                              }
                              if (singleMatch && (!currentProduct || currentProduct._id !== singleMatch._id)) {
                                handleProductSelect(line.id, singleMatch).then(() => {
                                  setTimeout(() => focusQtyForLine(line.id), 150);
                                });
                                return;
                              }
                            }

                            // If row already has a product, try to open batch dialog
                            if (line.productId) {
                              openBatchDialogForLine(line).then((opened) => {
                                if (!opened) {
                                  setTimeout(() => focusQtyForLine(line.id), 50);
                                }
                              });
                              return;
                            }

                            // No product yet - focus Qty
                            focusQtyForLine(line.id);
                          }}
                          placeholder="Item Name"
                          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                        />
                      )}
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
                      disabled={(line.availableUnits ?? []).length === 0}
                      inputRef={(el) => { unitRefs.current[line.id] = el?.querySelector?.('input') ?? (el as HTMLInputElement | null) ?? null; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                    >
                      {(line.availableUnits ?? []).length === 0 ? (
                        <MenuItem value="" sx={{ fontSize: '0.78rem' }}>-</MenuItem>
                      ) : (
                        (line.availableUnits ?? []).map((u) => (
                          <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.78rem' }}>{u.name}</MenuItem>
                        ))
                      )}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => handleQtyBlur(line)}
                      inputRef={(el) => { const input = el?.querySelector?.('input') ?? el ?? null; qtyRefs.current[line.id] = input; if (input) input.setAttribute('data-purchase-return-qty', line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.78rem' } }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleQtyKeyDown(e, line); }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : (line.pRate === 0 ? '' : String(line.pRate))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'pRate', value: line.pRate === 0 ? '' : String(line.pRate) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : ''; updateLine(line.id, 'pRate', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? null : prev); }}
                      inputRef={(el) => { rateRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null; }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleRateKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.78rem' } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'discPercent', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? null : prev); }}
                      inputRef={(el) => { discPctRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null; }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleDiscPercentKeyDown(e, line.id); }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'right', fontSize: '0.78rem' } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : ''; updateLine(line.id, 'discAmount', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? null : prev); }}
                      inputRef={(el) => { discAmtRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null; }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); handleDiscAmountKeyDown(e, line.id); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.78rem' } }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1, '& fieldset': { borderColor: THEME.border } } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem', textAlign: 'right' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.78rem', textAlign: 'right' }}>{line.total.toFixed(2)}</TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <IconButton size="small" onClick={() => removeLine(line.id)} sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#ef4444' } }}>
                      <DeleteIcon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Summary - same style as Purchase Entry */}
      <Grid container spacing={1}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 1.5, height: '100%', bgcolor: 'white', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontWeight: 600, color: '#1e293b', mb: 0.5, fontSize: '0.78rem' }}>Narration</Typography>
            <TextField
              multiline
              rows={4}
              fullWidth
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              inputRef={narrationRef}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveButtonRef.current?.focus(); } }}
              placeholder="Notes..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'white', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontWeight: 600, color: '#1e293b', mb: 0.5, fontSize: '0.78rem' }}>Summary</Typography>
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Other Disc %</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={otherDiscPercent === 0 ? '' : otherDiscPercent}
                  onChange={(e) => handleOtherDiscPercentChange(parseFloat(e.target.value) || 0)}
                  inputRef={otherDiscPercentRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); otherDiscountRef.current?.focus(); } }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Other Discount</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={otherDiscount === 0 ? '' : otherDiscount}
                  onChange={(e) => setOtherDiscount(parseFloat(e.target.value) || 0)}
                  inputRef={otherDiscountRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); otherChargesRef.current?.focus(); } }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Other Charges</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={otherCharges === 0 ? '' : otherCharges}
                  onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
                  inputRef={otherChargesRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); freightRef.current?.focus(); } }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Freight</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={freightCharge === 0 ? '' : freightCharge}
                  onChange={(e) => setFreightCharge(parseFloat(e.target.value) || 0)}
                  inputRef={freightRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); roundOffRef.current?.focus(); } }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Round Off</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={roundOff === 0 ? '' : roundOff}
                  onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                  inputRef={roundOffRef}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); narrationRef.current?.focus(); } }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Gross Total</Typography>
                <TextField size="small" value={calculations.itemsGross.toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }} />
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Total VAT</Typography>
                <TextField size="small" value={calculations.totalVat.toFixed(2)} InputProps={{ readOnly: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }} />
              </Grid>
              <Grid item xs={12}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', mb: 0.3 }}>Grand Total</Typography>
                <TextField
                  size="small"
                  value={calculations.grandTotal.toFixed(2)}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: THEME.primary }, '& .MuiInputBase-input': { fontWeight: 700, color: 'white', fontSize: '0.9rem' } }}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Action Buttons - same style as Purchase Entry */}
      <Paper elevation={0} sx={{ p: 1, mt: 0.5, bgcolor: 'white', borderRadius: 1, border: '2px solid #000000', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" size="small" startIcon={<ClearIcon />} onClick={handleClear} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
          Clear
        </Button>
        <Button ref={saveButtonRef} variant="contained" size="small" startIcon={<SaveIcon />} onClick={() => handleSave()} disabled={loading || !!returnId} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Save
        </Button>
        <Button variant="contained" size="small" startIcon={<EditIcon />} onClick={() => setEditConfirmOpen(true)} disabled={!returnId || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Edit
        </Button>
        <Button variant="contained" size="small" startIcon={<DeleteIcon />} onClick={() => setDeleteDialogOpen(true)} disabled={!returnId} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Delete
        </Button>
        <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={() => setSearchDialogOpen(true)} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
          Search
        </Button>
      </Paper>

      {/* Success dialog */}
      <Dialog open={successDialogOpen} onClose={() => setSuccessDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Success</DialogTitle>
        <DialogContent>{successMessage}</DialogContent>
        <DialogActions>
          <Button onClick={() => setSuccessDialogOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Error dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>{errorMessage}</DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Stock Alert Dialog (like Sales B2C) */}
      <Dialog open={stockAlertOpen} onClose={() => {
        setStockAlertOpen(false);
        const lineId = qtyOverflowLineIdRef.current;
        if (lineId) {
          qtyOverflowLineIdRef.current = null;
          setTimeout(() => qtyRefs.current[lineId]?.focus(), 50);
        }
      }} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon sx={{ fontSize: 22, color: '#f59e0b' }} />
          Out of Stock
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{stockAlertMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => {
            setStockAlertOpen(false);
            const lineId = qtyOverflowLineIdRef.current;
            if (lineId) {
              qtyOverflowLineIdRef.current = null;
              setTimeout(() => qtyRefs.current[lineId]?.focus(), 50);
            }
          }} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit confirm */}
      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Confirm Edit</DialogTitle>
        <DialogContent>Update this purchase return with the current form values?</DialogContent>
        <DialogActions>
          <Button onClick={() => setEditConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => { setEditConfirmOpen(false); handleSave(true); }} sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Delete Purchase Return?</DialogTitle>
        <DialogContent>This action cannot be undone.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Search dialog */}
      <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Search by Return No</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Invoice No"
            value={searchInvoiceNo}
            onChange={(e) => setSearchInvoiceNo(e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g. PR-000001"
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSearchSubmit}>
            Search
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Selection Dialog */}
      <Dialog
        open={batchDialogOpen}
        onClose={handleBatchDialogClose}
        onKeyDown={handleBatchDialogKeyDown}
        maxWidth="sm"
        fullWidth
        keepMounted={false}
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
                  {['Batch No', 'Expiry Date', 'Stock', 'P.Rate', 'W.Sale', 'Retail', 'Action'].map((label, ci) => (
                    <TableCell key={ci} align={ci >= 2 && ci <= 6 ? 'right' : ci === 6 ? 'center' : 'left'}
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
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{batch.wholesale.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{batch.retail.toFixed(2)}</TableCell>
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
    </Box>
  );
}
