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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import {
  productApi,
  purchaseApi,
  openingStockApi,
  stockApi,
  type OpeningStockEntryData,
  type OpeningStockListItem,
} from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';

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
  pRate: number;
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
});

export default function OpeningStock() {
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

  const [entryNo, setEntryNo] = useState('OS-000001');
  const [entryId, setEntryId] = useState<string | null>(null);
  const [date, setDate] = useState(getCurrentDate);
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>('Vat');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [narration, setNarration] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  const imeiInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemNameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discPercentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discAmountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const profitPercentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const retailInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const wholesaleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const rowSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);
  const rowCommittedRef = useRef(false);

  const [entryList, setEntryList] = useState<OpeningStockListItem[]>([]);
  const [currentNavIndex, setCurrentNavIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [searchEntryNo, setSearchEntryNo] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [editingNumericCell, setEditingNumericCell] = useState<{
    lineId?: string;
    field: string;
    value: string;
  } | null>(null);

  // Selected Product Info (mirrors Purchase Entry)
  const [selectedProductInfo, setSelectedProductInfo] = useState<{
    stock: number;
    lastVendor: string;
    purchaseRate: number;
    retailPrice: number;
    wholesalePrice: number;
  } | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Derive multi-unit info for active line (for Info panel)
  const activeMultiUnitInfo = useMemo(() => {
    if (!activeLineId) return null;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line?.unitId) return null;
    const unit = line.availableUnits?.find((u) => u.id === line.unitId);
    if (!unit?.isMultiUnit) return null;
    return {
      pcsInside: unit.conversion ?? 0,
      wholesale: unit.wholesale,
      retail: unit.retail,
      specialPrice1: unit.specialPrice1,
      specialPrice2: unit.specialPrice2,
    };
  }, [activeLineId, lines]);

  const VAT_RATE = 5;
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === '-') return 0;
    const normalized = raw === '.' || /^\.\d*$/.test(raw) ? '0' + raw : raw;
    return parseFloat(normalized) || 0;
  };

  const calcVatAndTotal = useCallback(
    (net: number, isVat: boolean) => {
      if (!isVat) return { vatAmount: 0, total: net };
      if (taxMode === 'inclusive') {
        const vatAmount = parseFloat((net * (VAT_RATE / (100 + VAT_RATE))).toFixed(2));
        return { vatAmount, total: parseFloat(net.toFixed(2)) };
      }
      const vatAmount = parseFloat((net * (VAT_RATE / 100)).toFixed(2));
      return { vatAmount, total: parseFloat((net + vatAmount).toFixed(2)) };
    },
    [taxMode]
  );

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
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const totalItems = lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
    return { itemsGross, itemsDiscount, itemsVat, subTotal, grandTotal: subTotal, totalItems };
  }, [lines]);

  const updateLine = useCallback(
    (id: string, field: keyof LineItem, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };
          if (
            [
              'quantity',
              'pRate',
              'discPercent',
              'discAmount',
              'retail',
              'wholesale',
              'profitPercent',
            ].includes(field)
          ) {
            updated.gross = parseFloat((updated.quantity * updated.pRate).toFixed(2));
            if (field === 'discPercent') {
              updated.discAmount = parseFloat(
                ((updated.gross * updated.discPercent) / 100).toFixed(2)
              );
            } else if (field === 'discAmount') {
              updated.discPercent =
                updated.gross > 0
                  ? parseFloat(((updated.discAmount / updated.gross) * 100).toFixed(2))
                  : 0;
            }
            const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
            const vt = calcVatAndTotal(net, vatType === 'Vat');
            updated.vatAmount = vt.vatAmount;
            updated.total = vt.total;
            if (field === 'profitPercent' && updated.pRate > 0) {
              const priceWithProfit = parseFloat(
                (updated.pRate * (1 + updated.profitPercent / 100)).toFixed(2)
              );
              updated.retail = priceWithProfit;
              updated.wholesale = priceWithProfit;
            } else if (field === 'retail' && updated.pRate > 0) {
              updated.profitPercent = parseFloat(
                (((updated.retail - updated.pRate) / updated.pRate) * 100).toFixed(2)
              );
            } else if (
              field === 'pRate' &&
              updated.pRate > 0 &&
              updated.retail > 0
            ) {
              updated.profitPercent = parseFloat(
                (((updated.retail - updated.pRate) / updated.pRate) * 100).toFixed(2)
              );
            }
          }
          return updated;
        })
      );
    },
    [vatType, calcVatAndTotal]
  );

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await productApi.list(companyId, { limit: 1000 });
      setProducts((res.data.data?.products || []) as Product[]);
    } catch {
      // ignore
    }
  }, [companyId]);

  const loadEntryList = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await openingStockApi.entries.list(companyId, financialYearId);
      if (res.data.success) setEntryList(res.data.data);
    } catch {
      // ignore
    }
  }, [companyId, financialYearId]);

  const loadNextEntryNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await openingStockApi.entries.getNextEntryNo(companyId, financialYearId);
      if (res.data.success && !entryId) setEntryNo(res.data.data.entryNo);
    } catch {
      // ignore
    }
  }, [companyId, financialYearId, entryId]);

  const focusQtyForLine = useCallback((lineId: string) => {
    const el =
      qtyInputRefs.current[lineId] ??
      document.querySelector<HTMLInputElement>(`input[data-opening-stock-qty="${lineId}]`);
    el?.focus();
  }, []);

  const loadEntryIntoForm = useCallback(
    async (id: string) => {
      if (!companyId) return;
      try {
        setLoading(true);
        const res = await openingStockApi.entries.getById(id, companyId);
        if (!res.data.success || !res.data.data) return;
        const entry = res.data.data;

        setEntryId(entry._id);
        setEntryNo(entry.entryNo);
        setDate(entry.date);
        setVatType((entry.vatType as 'Vat' | 'NonVat') || 'Vat');
        setTaxMode((entry.taxMode as 'inclusive' | 'exclusive') ?? 'inclusive');
        setNarration(entry.narration || '');
        setIsSaved(true);
        setSuccessMessage('');

        const newLines: LineItem[] = entry.batches.map((b: OpeningStockEntryData['batches'][0], idx: number) => {
          const product = products.find((p) => p._id === b.productId);
          const gross = b.quantity * b.purchasePrice;
          const discPercent =
            gross > 0 ? parseFloat(((b.discAmount / gross) * 100).toFixed(2)) : 0;
          const profitPercent =
            b.purchasePrice > 0 && b.retail > 0
              ? ((b.retail - b.purchasePrice) / b.purchasePrice) * 100
              : 0;

          const availableUnits: UnitOption[] = [];
          if (product) {
            const mainUnit = product.unitOfMeasureId;
            if (mainUnit) {
              const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
              const mainUnitName =
                typeof mainUnit === 'object'
                  ? mainUnit.shortCode || mainUnit.name || 'Main'
                  : 'Main';
              availableUnits.push({
                id: mainUnitId,
                name: mainUnitName,
                isMultiUnit: false,
                imei: product.imei,
                price: product.purchasePrice ?? 0,
              });
            }
            if (
              product.allowBatches === false &&
              product.multiUnits &&
              product.multiUnits.length > 0
            ) {
              product.multiUnits.forEach((mu) => {
                const muUnitId =
                  typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
                const muUnitName =
                  typeof mu.unitId === 'object'
                    ? mu.unitId?.shortCode || mu.unitId?.name || 'Unit'
                    : 'Unit';
                if (muUnitId) {
                  availableUnits.push({
                    id: muUnitId,
                    name: muUnitName,
                    isMultiUnit: true,
                    multiUnitId: mu.multiUnitId,
                    imei: mu.imei,
                    conversion: mu.conversion,
                    wholesale: mu.wholesale,
                    retail: mu.retail,
                    specialPrice1: mu.specialPrice1,
                    specialPrice2: mu.specialPrice2,
                    price: mu.price,
                  });
                }
              });
            }
          }

          const net = parseFloat((gross - b.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, (entry.vatType as 'Vat' | 'NonVat') === 'Vat');
          return {
            id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
            productId: b.productId,
            productCode: product?.code ?? b.productCode ?? '',
            imei: '',
            name: product?.name ?? b.productName ?? '',
            unitId: availableUnits[0]?.id || '',
            unitName: availableUnits[0]?.name || '',
            multiUnitId: b.multiUnitId,
            availableUnits,
            quantity: b.quantity,
            pRate: b.purchasePrice,
            gross,
            discPercent,
            discAmount: b.discAmount,
            vatAmount: vt.vatAmount,
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            mrp: b.retail,
            retail: b.retail,
            wholesale: b.wholesale,
            branch: 'MAIN BRANCH',
            total: vt.total,
            expiryDate: b.expiryDate || '',
            specialPrice1: b.specialPrice1 ?? 0,
            specialPrice2: b.specialPrice2 ?? 0,
            batchNumber: b.batchNumber || '',
          };
        });

        setLines(newLines.length > 0 ? newLines : [emptyLine()]);
        rowSnapshotRef.current = null;
        rowCommittedRef.current = false;
        setSelectedProductInfo(null);
        setActiveLineId(null);

        const idx = entryList.findIndex((e) => e._id === id);
        if (idx >= 0) setCurrentNavIndex(idx);
      } catch {
        showErrorDialog('Failed to load opening stock entry');
      } finally {
        setLoading(false);
      }
    },
    [companyId, products, entryList, calcVatAndTotal]
  );

  const showErrorDialog = (msg: string) => {
    setErrorDialogMessage(msg);
    setErrorDialogOpen(true);
  };

  const showSuccessDialog = (msg: string) => {
    setSuccessMessage(msg);
    setSavedDialogOpen(true);
  };

  useEffect(() => {
    if (!companyId || !financialYearId) return;
    loadProducts();
    loadEntryList();
    loadNextEntryNo();
  }, [companyId, financialYearId]);

  const handleProductSelect = useCallback(
    async (lineId: string, product: Product | null, searchedImei?: string) => {
      if (!product) {
        updateLine(lineId, 'productId', '');
        updateLine(lineId, 'productCode', '');
        updateLine(lineId, 'name', '');
        updateLine(lineId, 'imei', '');
        updateLine(lineId, 'pRate', 0);
        setSelectedProductInfo(null);
        return;
      }

      const purchasePrice = product.purchasePrice ?? 0;
      const retailPrice = product.retailPrice ?? 0;
      const wholesalePrice = product.wholesalePrice ?? 0;
      const mrp = (product as { mrp?: number }).mrp ?? retailPrice;

      const availableUnits: UnitOption[] = [];
      const mainUnit = product.unitOfMeasureId;
      if (mainUnit) {
        const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
        const mainUnitName =
          typeof mainUnit === 'object' ? mainUnit.shortCode || mainUnit.name || 'Main' : 'Main';
        availableUnits.push({
          id: mainUnitId,
          name: mainUnitName,
          isMultiUnit: false,
          imei: product.imei,
          price: purchasePrice,
        });
      }
      if (
        product.allowBatches === false &&
        product.multiUnits &&
        product.multiUnits.length > 0
      ) {
        product.multiUnits.forEach((mu) => {
          const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
          const muUnitName =
            typeof mu.unitId === 'object'
              ? mu.unitId?.shortCode || mu.unitId?.name || 'Unit'
              : 'Unit';
          if (muUnitId) {
            const conv = mu.conversion || 1;
            const perPiecePrice = mu.wholesale
              ? mu.wholesale / conv
              : mu.totalPrice
                ? mu.totalPrice / conv
                : mu.price ?? 0;
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

      let selectedUnit: UnitOption | null = null;
      if (searchedImei) {
        const searchImeiStr = String(searchedImei).trim();
        selectedUnit =
          availableUnits.find((u) => u.imei?.trim() === searchImeiStr) || null;
      }
      if (!selectedUnit) selectedUnit = availableUnits[0] || null;

      const isMultiUnit =
        selectedUnit?.isMultiUnit && selectedUnit?.conversion;
      const usePrice = parseFloat(
        (
          isMultiUnit
            ? purchasePrice * (selectedUnit!.conversion!)
            : selectedUnit?.price ?? purchasePrice
        ).toFixed(2)
      );
      const useImei = selectedUnit?.imei || product.imei || '';
      const useRetail =
        isMultiUnit && selectedUnit!.retail ? selectedUnit!.retail : retailPrice;
      const useWholesale =
        isMultiUnit && selectedUnit!.wholesale ? selectedUnit!.wholesale : wholesalePrice;
      const profitPercent =
        usePrice > 0 && useRetail > 0 ? ((useRetail - usePrice) / usePrice) * 100 : 0;

      let batchNum = '';
      try {
        if (companyId) {
          const res = await purchaseApi.getNextBatchNo(companyId);
          batchNum = res.data?.data?.batchNumber ?? '';
        }
      } catch {
        // leave empty
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
            quantity: 1,
            gross: parseFloat((1 * usePrice).toFixed(2)),
            mrp,
            retail: useRetail,
            wholesale: useWholesale,
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
      setActiveLineId(lineId);
      rowCommittedRef.current = true;
      rowSnapshotRef.current = null;

      let actualStock = 0;
      try {
        if (companyId && product._id) {
          const stockRes = await stockApi.getProductStock(companyId, product._id);
          actualStock = stockRes.data.data?.stock ?? 0;
        }
      } catch {
        const p = product as Product & { stock?: number; quantity?: number };
        actualStock = p.stock ?? p.quantity ?? 0;
      }
      const pExt = product as Product & { lastVendor?: string; lastSupplier?: string };
      setSelectedProductInfo({
        stock: actualStock,
        lastVendor: pExt.lastVendor ?? pExt.lastSupplier ?? 'N/A',
        purchaseRate: usePrice,
        retailPrice: useRetail,
        wholesalePrice: useWholesale,
      });
      setTimeout(() => focusQtyForLine(lineId), 100);
    },
    [
      updateLine,
      vatType,
      calcVatAndTotal,
      companyId,
      focusQtyForLine,
    ]
  );

  const handleImeiSearch = useCallback(
    async (lineId: string, searchValue: string): Promise<boolean> => {
      if (!searchValue.trim() || !companyId) return false;
      let product: Product | undefined;
      try {
        const res = await productApi.getByBarcode(companyId, searchValue.trim());
        const data = (res.data.data as Product) || null;
        if (data) product = data;
      } catch {
        // fallback: find in loaded products by imei
        product = products.find(
          (p) =>
            (p.imei && p.imei.trim() === searchValue.trim()) ||
            (p as { internationalBarcode?: string }).internationalBarcode === searchValue.trim()
        ) as Product | undefined;
      }
      if (product) {
        await handleProductSelect(lineId, product, searchValue.trim());
        const currentIndex = lines.findIndex((l) => l.id === lineId);
        if (currentIndex === lines.length - 1) {
          const newLineId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          setLines((prev) => [...prev, { ...emptyLine(), id: newLineId }]);
          setTimeout(() => imeiInputRefs.current[newLineId]?.focus(), 100);
        } else {
          setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 100);
        }
        return true;
      }
      return false;
    },
    [companyId, handleProductSelect, lines, products]
  );

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

  const enterRow = useCallback(
    (line: LineItem) => {
      if (rowSnapshotRef.current?.lineId === line.id) return;
      revertUncommittedRow();
      if (line.productId) {
        rowSnapshotRef.current = {
          lineId: line.id,
          data: { ...line, availableUnits: [...(line.availableUnits || [])] },
        };
        rowCommittedRef.current = false;
      }
    },
    [revertUncommittedRow]
  );

  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    priceInputRefs.current[lineId]?.focus();
  }, []);

  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    discPercentInputRefs.current[lineId]?.focus();
  }, []);

  const handleDiscPercentKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    discAmountInputRefs.current[lineId]?.focus();
  }, []);

  const handleDiscAmountKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    profitPercentInputRefs.current[lineId]?.focus();
  }, []);

  const handleProfitPercentKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    retailInputRefs.current[lineId]?.focus();
  }, []);

  const handleRetailKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    wholesaleInputRefs.current[lineId]?.focus();
  }, []);

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

          rowCommittedRef.current = true;
          rowSnapshotRef.current = null;

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

  const handleUnitKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      focusQtyForLine(lineId);
    },
    [focusQtyForLine]
  );

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    if (['+', '-', 'e', 'E'].includes(e.key)) e.preventDefault();
  };

  const handleRowClick = useCallback(
    async (line: LineItem) => {
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
        const p = product as (Product & { stock?: number; quantity?: number }) | undefined;
        actualStock = p?.stock ?? p?.quantity ?? 0;
      }
      const pExt = product as (Product & { lastVendor?: string; lastSupplier?: string }) | undefined;
      setSelectedProductInfo({
        stock: actualStock,
        lastVendor: pExt?.lastVendor ?? pExt?.lastSupplier ?? 'N/A',
        purchaseRate: product?.purchasePrice ?? line.pRate,
        retailPrice: product?.retailPrice ?? line.retail,
        wholesalePrice: product?.wholesalePrice ?? line.wholesale,
      });
    },
    [companyId, products, enterRow]
  );

  const removeLine = useCallback((id: string) => {
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      if (rowSnapshotRef.current?.lineId === id) {
        rowSnapshotRef.current = null;
        rowCommittedRef.current = false;
      }
      return filtered.length === 0 ? [emptyLine()] : filtered;
    });
    setSelectedProductInfo(null);
    setActiveLineId(null);
  }, []);

  const handleProductHighlight = useCallback(
    async (_e: React.SyntheticEvent, option: unknown) => {
      if (!option || typeof option === 'string') return;
      const product = option as Product;
      let actualStock = 0;
      try {
        if (companyId && product._id) {
          const stockRes = await stockApi.getProductStock(companyId, product._id);
          actualStock = stockRes.data.data?.stock ?? 0;
        }
      } catch {
        const p = product as Product & { stock?: number; quantity?: number };
        actualStock = p.stock ?? p.quantity ?? 0;
      }
      const pExt = product as Product & { lastVendor?: string; lastSupplier?: string };
      setSelectedProductInfo({
        stock: actualStock,
        lastVendor: pExt.lastVendor ?? pExt.lastSupplier ?? 'N/A',
        purchaseRate: product.purchasePrice ?? 0,
        retailPrice: product.retailPrice ?? 0,
        wholesalePrice: product.wholesalePrice ?? 0,
      });
    },
    [companyId]
  );

  const handleUnitChange = useCallback(
    (lineId: string, unitId: string) => {
      const currentLine = lines.find((l) => l.id === lineId);
      const selectedUnit = currentLine?.availableUnits?.find((u) => u.id === unitId);
      if (!currentLine || !selectedUnit) return;

      const product = products.find((p) => p._id === currentLine.productId);
      const basePurchasePrice = product?.purchasePrice ?? 0;
      const baseRetailPrice = product?.retailPrice ?? 0;
      const baseWholesalePrice = product?.wholesalePrice ?? 0;
      const isMultiUnit = selectedUnit.isMultiUnit && selectedUnit.conversion;
      const newPrice = parseFloat(
        (
          isMultiUnit
            ? basePurchasePrice * (selectedUnit.conversion!)
            : selectedUnit.price ?? basePurchasePrice
        ).toFixed(2)
      );
      const newRetail =
        isMultiUnit && selectedUnit.retail ? selectedUnit.retail : baseRetailPrice;
      const newWholesale =
        isMultiUnit && selectedUnit.wholesale ? selectedUnit.wholesale : baseWholesalePrice;
      const newSpecialPrice1 =
        isMultiUnit && selectedUnit.specialPrice1 ? selectedUnit.specialPrice1 : 0;
      const newSpecialPrice2 =
        isMultiUnit && selectedUnit.specialPrice2 ? selectedUnit.specialPrice2 : 0;
      const newQuantity = 1;
      const newProfitPercent =
        newPrice > 0 && newRetail > 0 ? ((newRetail - newPrice) / newPrice) * 100 : 0;

      setLines((prev) =>
        prev.map((line) => {
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
        })
      );

      if (activeLineId === lineId) {
        setSelectedProductInfo((prev) =>
          prev
            ? {
                ...prev,
                purchaseRate: newPrice,
                retailPrice: newRetail,
                wholesalePrice: newWholesale,
              }
            : null
        );
      }
    },
    [lines, products, vatType, calcVatAndTotal, activeLineId]
  );

  const groupIntoBatches = useCallback(
    (items: LineItem[]) => {
      const batchMap = new Map<
        string,
        {
          batchNumber: string;
          productId: string;
          productCode: string;
          productName: string;
          purchasePrice: number;
          expiryDate: string;
          totalQuantity: number;
          discAmount: number;
          retail: number;
          wholesale: number;
          specialPrice1: number;
          specialPrice2: number;
          multiUnitId?: string;
        }
      >();

      items.forEach((item) => {
        const prod = products.find((p) => p._id === item.productId);
        const noBatches = prod?.allowBatches === false;
        const batchKey = noBatches
          ? `${item.productId}-NO-BATCH`
          : `${item.productId}-${item.pRate}-${item.expiryDate || 'no-expiry'}`;

        if (batchMap.has(batchKey)) {
          const existing = batchMap.get(batchKey)!;
          const oldQty = existing.totalQuantity;
          existing.totalQuantity += item.quantity;
          existing.discAmount += item.discAmount;
          if (noBatches && existing.totalQuantity > 0) {
            existing.purchasePrice =
              (oldQty * existing.purchasePrice + item.quantity * item.pRate) /
              existing.totalQuantity;
          }
        } else {
          batchMap.set(batchKey, {
            batchNumber: item.batchNumber?.trim() || '',
            productId: item.productId,
            productCode: item.productCode,
            productName: item.name,
            purchasePrice: item.pRate,
            expiryDate: noBatches ? '' : item.expiryDate,
            totalQuantity: item.quantity,
            discAmount: item.discAmount,
            retail: item.retail,
            wholesale: item.wholesale,
            specialPrice1: item.specialPrice1,
            specialPrice2: item.specialPrice2,
            multiUnitId: item.multiUnitId,
          });
        }
      });

      return Array.from(batchMap.values());
    },
    [products]
  );

  const handleSave = useCallback(async () => {
    if (!companyId || !financialYearId) {
      showErrorDialog('Please select company and financial year');
      return;
    }

    // Before save: validate only the last row. If it's a trailing draft (incomplete), auto-remove it.
    let linesToSave = lines;
    const lastRow = lines.length > 0 ? lines[lines.length - 1] : null;
    if (lastRow) {
      const nameEmpty = !(lastRow.name || '').trim();
      const product = products.find((p) => p._id === lastRow.productId);
      const productRequiresImei =
        product &&
        ((product.imei && String(product.imei).trim()) ||
          (product.multiUnits && product.multiUnits.some((mu) => mu.imei && String(mu.imei).trim())));
      const imeiInvalidOrEmpty = productRequiresImei ? !(lastRow.imei || '').trim() : false;
      const qtyBlankOrZero = lastRow.quantity == null || lastRow.quantity === 0;
      const pRateBlankOrZero = lastRow.pRate == null || lastRow.pRate === 0;
      const isLastRowIncomplete =
        (nameEmpty || imeiInvalidOrEmpty) && (qtyBlankOrZero || pRateBlankOrZero);
      if (isLastRowIncomplete) {
        linesToSave = lines.slice(0, -1);
      }
    }

    const rowsWithProductId = linesToSave.filter((l) => l.productId);
    const rowsWithNameOrCodeButNoId = linesToSave.filter(
      (l) => (l.name?.trim() || l.productCode?.trim()) && !l.productId
    );
    if (rowsWithNameOrCodeButNoId.length > 0) {
      showErrorDialog(
        'One or more rows have a product name/code but no product selected. Please select the product from the list so the correct product ID is saved.'
      );
      return;
    }
    if (rowsWithProductId.length === 0) {
      showErrorDialog('At least one product is required. Select the product from the list for each row.');
      return;
    }

    const batches = groupIntoBatches(rowsWithProductId).map((b) => ({
      productId: b.productId,
      productCode: b.productCode,
      productName: b.productName,
      batchNumber: b.batchNumber,
      purchasePrice: b.purchasePrice,
      quantity: b.totalQuantity,
      discAmount: b.discAmount,
      expiryDate: b.expiryDate || undefined,
      retail: b.retail,
      wholesale: b.wholesale,
      specialPrice1: b.specialPrice1,
      specialPrice2: b.specialPrice2,
      multiUnitId: b.multiUnitId,
    }));

    setLoading(true);
    try {
      const payload = {
        companyId,
        financialYearId,
        date: date || undefined,
        vatType,
        taxMode,
        narration: narration || undefined,
        batches,
      };

      if (entryId) {
        await openingStockApi.entries.update(entryId, payload);
        setSuccessMessage('Opening stock entry updated successfully.');
      } else {
        const res = await openingStockApi.entries.create(payload);
        setEntryId(res.data.data.entryId);
        setEntryNo(res.data.data.entryNo);
        setSuccessMessage('Opening stock entry saved successfully.');
      }
      if (linesToSave.length < lines.length) {
        setLines(linesToSave.length > 0 ? linesToSave : [emptyLine()]);
      }
      setIsSaved(true);
      setSavedDialogOpen(true);
      await loadEntryList();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to save';
      showErrorDialog(msg);
    } finally {
      setLoading(false);
    }
  }, [
    companyId,
    financialYearId,
    lines,
    products,
    date,
    vatType,
    taxMode,
    narration,
    entryId,
    groupIntoBatches,
    loadEntryList,
  ]);

  const handleClear = useCallback(async () => {
    setEntryId(null);
    setDate(getCurrentDate());
    setVatType('Vat');
    setTaxMode('inclusive');
    setNarration('');
    setLines([emptyLine()]);
    setIsSaved(false);
    setSuccessMessage('');
    setCurrentNavIndex(-1);
    setActiveLineId(null);
    setSelectedProductInfo(null);
    setEditingNumericCell(null);
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    try {
      if (companyId && financialYearId) {
        const res = await openingStockApi.entries.getNextEntryNo(companyId, financialYearId);
        if (res.data.success) setEntryNo(res.data.data.entryNo);
      }
    } catch {
      // keep current
    }
  }, [companyId, financialYearId]);

  const handleSearchSubmit = useCallback(() => {
    const trimmed = searchEntryNo.trim();
    if (!trimmed) return;
    const found = entryList.find(
      (e) => e.entryNo.toLowerCase() === trimmed.toLowerCase()
    );
    if (found) {
      setSearchDialogOpen(false);
      setSearchEntryNo('');
      loadEntryIntoForm(found._id);
    } else {
      showErrorDialog('Entry not found');
    }
  }, [searchEntryNo, entryList, loadEntryIntoForm]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!entryId || !companyId) return;
    setDeleteDialogOpen(false);
    try {
      await openingStockApi.entries.delete(entryId, companyId);
      await handleClear();
      await loadEntryList();
      showSuccessDialog('Opening stock entry deleted.');
    } catch {
      showErrorDialog('Failed to delete');
    }
  }, [entryId, companyId, handleClear, loadEntryList]);

  const navFirst = useCallback(() => {
    if (entryList.length === 0) return;
    loadEntryIntoForm(entryList[0]._id);
  }, [entryList, loadEntryIntoForm]);

  const navPrev = useCallback(() => {
    if (entryList.length === 0) return;
    if (currentNavIndex < 0) {
      loadEntryIntoForm(entryList[entryList.length - 1]._id);
      return;
    }
    const idx = currentNavIndex > 0 ? currentNavIndex - 1 : 0;
    loadEntryIntoForm(entryList[idx]._id);
  }, [entryList, currentNavIndex, loadEntryIntoForm]);

  const navNext = useCallback(() => {
    if (entryList.length === 0) return;
    const idx =
      currentNavIndex < entryList.length - 1
        ? currentNavIndex + 1
        : entryList.length - 1;
    loadEntryIntoForm(entryList[idx]._id);
  }, [entryList, currentNavIndex, loadEntryIntoForm]);

  const navLast = useCallback(() => {
    if (entryList.length === 0) return;
    loadEntryIntoForm(entryList[entryList.length - 1]._id);
  }, [entryList, loadEntryIntoForm]);

  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.select();
  };

  const tableContainerRef = useRef<HTMLDivElement>(null);

  if (!companyId || !financialYearId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select a company and financial year to continue.</Alert>
      </Box>
    );
  }

  const numberInputStyle = {
    '& input[type=number]': { MozAppearance: 'textfield' },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
      { WebkitAppearance: 'none', margin: 0 },
  };

  return (
    <Box
      onClick={handlePageClick}
      sx={{
        p: 0.5,
        bgcolor: '#ffffff',
        minHeight: '100vh',
        width: '100%',
        maxWidth: 1600,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        '& .MuiInputLabel-root': { fontWeight: 600, color: '#1e293b' },
        ...numberInputStyle,
      }}
    >
      <Typography
        component="h1"
        variant="h6"
        sx={{ fontWeight: 700, color: '#0f766e', mb: 1, fontSize: '1.1rem' }}
      >
        Opening Stock
      </Typography>

      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.5,
          mb: 1,
          borderRadius: 2,
          bgcolor: 'white',
          border: '1px solid #e0e7ef',
        }}
      >
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={6} sm={3} md={1.8}>
            <Box
              sx={{
                bgcolor: '#0f766e',
                borderRadius: 1.5,
                px: 1.5,
                py: 0.6,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.65rem',
                  fontWeight: 500,
                }}
              >
                ENTRY NO
              </Typography>
              <Typography
                sx={{ color: 'white', fontWeight: 800, fontSize: '0.9rem' }}
              >
                {entryNo}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <DateInput label="Date" value={date} onChange={setDate} size="small" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box
              sx={{
                border: '1px solid #e2e8f0',
                borderRadius: 1.5,
                px: 1.2,
                py: 0.5,
                bgcolor: '#f8fafc',
              }}
            >
              <Typography
                sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', mb: 0.2 }}
              >
                VAT TYPE
              </Typography>
              <Grid container spacing={0.5}>
                <Grid item>
                  <Button
                    size="small"
                    variant={vatType === 'Vat' ? 'contained' : 'outlined'}
                    onClick={() => setVatType('Vat')}
                    sx={{ minWidth: 60, fontSize: '0.78rem' }}
                  >
                    Vat
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    size="small"
                    variant={vatType === 'NonVat' ? 'contained' : 'outlined'}
                    onClick={() => setVatType('NonVat')}
                    sx={{ minWidth: 60, fontSize: '0.78rem' }}
                  >
                    Non Vat
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              label="Tax Mode"
              size="small"
              select
              fullWidth
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="inclusive">Inclusive</MenuItem>
              <MenuItem value="exclusive">Exclusive</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              label="Narration"
              size="small"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              fullWidth
              placeholder="Opening stock"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />
          </Grid>
          <Grid item xs={12}>
            <Box
              sx={{
                borderRadius: 1.5,
                px: 1.5,
                py: 0.8,
                minHeight: 40,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                background: selectedProductInfo
                  ? 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)'
                  : '#f8fafc',
                border: selectedProductInfo ? '1px solid #5eead4' : '1px dashed #cbd5e1',
                transition: 'all 0.2s',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#64748b',
                  letterSpacing: 0.3,
                  whiteSpace: 'nowrap',
                }}
              >
                Info
              </Typography>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#dc2626',
                        fontSize: '0.65rem',
                        lineHeight: 1,
                        fontWeight: 600,
                      }}
                    >
                      Stock
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        color: '#dc2626',
                        fontSize: '0.8rem',
                        lineHeight: 1.2,
                      }}
                    >
                      {activeMultiUnitInfo?.pcsInside
                        ? (selectedProductInfo.stock / activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.stock}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                    >
                      P.Rate
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: '#1e293b',
                        fontSize: '0.78rem',
                        lineHeight: 1.2,
                      }}
                    >
                      {activeMultiUnitInfo?.pcsInside
                        ? (
                            selectedProductInfo.purchaseRate * activeMultiUnitInfo.pcsInside
                          ).toFixed(2)
                        : selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  {!activeMultiUnitInfo && (
                    <>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                        >
                          Retail
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: '#1e293b',
                            fontSize: '0.78rem',
                            lineHeight: 1.2,
                          }}
                        >
                          {selectedProductInfo.retailPrice.toFixed(2)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                        >
                          WSale
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: '#1e293b',
                            fontSize: '0.78rem',
                            lineHeight: 1.2,
                          }}
                        >
                          {selectedProductInfo.wholesalePrice.toFixed(2)}
                        </Typography>
                      </Box>
                    </>
                  )}
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                    >
                      Vendor
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: '#1e293b',
                        fontSize: '0.78rem',
                        lineHeight: 1.2,
                      }}
                    >
                      {selectedProductInfo.lastVendor}
                    </Typography>
                  </Box>
                  {activeMultiUnitInfo && (
                    <>
                      <Box
                        sx={{
                          width: '1px',
                          height: 24,
                          bgcolor: '#cbd5e1',
                          flexShrink: 0,
                        }}
                      />
                      {activeMultiUnitInfo.pcsInside != null && activeMultiUnitInfo.pcsInside > 0 && (
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                          >
                            Pcs
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: '#0f766e',
                              fontSize: '0.78rem',
                              lineHeight: 1.2,
                            }}
                          >
                            {activeMultiUnitInfo.pcsInside}
                          </Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.wholesale != null &&
                        activeMultiUnitInfo.wholesale > 0 && (
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                            >
                              M.WS
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 700,
                                color: '#0f766e',
                                fontSize: '0.78rem',
                                lineHeight: 1.2,
                              }}
                            >
                              {activeMultiUnitInfo.wholesale.toFixed(2)}
                            </Typography>
                          </Box>
                        )}
                      {activeMultiUnitInfo.retail != null && activeMultiUnitInfo.retail > 0 && (
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ color: '#64748b', fontSize: '0.65rem', lineHeight: 1 }}
                          >
                            M.Ret
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: '#0f766e',
                              fontSize: '0.78rem',
                              lineHeight: 1.2,
                            }}
                          >
                            {activeMultiUnitInfo.retail.toFixed(2)}
                          </Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography
                  sx={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}
                >
                  Select a product
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          mb: 0.5,
          bgcolor: 'white',
          borderRadius: 2,
          border: '2px solid #000000',
          overflow: 'hidden',
        }}
      >
        <TableContainer
          ref={tableContainerRef}
          sx={{ minHeight: 400, maxHeight: 400, width: '100%', bgcolor: '#f4f6f8' }}
          onBlurCapture={() => {
            setTimeout(() => {
              const active = document.activeElement;
              if (!active || !tableContainerRef.current) return;
              const inPopper = active.closest(
                '.MuiAutocomplete-popper, .MuiAutocomplete-listbox, .MuiPopper-root'
              );
              if (inPopper) return;
              if (!tableContainerRef.current.contains(active)) {
                revertUncommittedRow();
              }
            }, 100);
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: '100%',
              tableLayout: 'fixed',
              '& .MuiTableCell-root': { fontSize: '0.875rem' },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '2.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Sl</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '9%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Int Barcode</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '14%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Item Name</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Unit</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Qty</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>P Rate</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Gross</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>DISC%</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Disc</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>VAT</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Total</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Profit %</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>Retail</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>WholeSale</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '6.5%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>BRANCH</TableCell>
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '3%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }} />
                <TableCell sx={{ background: '#d53e4f', color: 'white', fontWeight: 600, width: '3%', p: 0.5, textAlign: 'center', fontSize: '0.75rem' }}>×</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow
                  key={line.id}
                  sx={{
                    bgcolor: idx % 2 === 0 ? '#f8fafc' : 'white',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#e0f2fe' },
                  }}
                  onClick={() => handleRowClick(line)}
                  onFocusCapture={() => {
                    enterRow(line);
                    setActiveLineId(line.id);
                    handleRowClick(line);
                  }}
                >
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>
                    {idx + 1}
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      value={line.imei}
                      onChange={(e) => updateLine(line.id, 'imei', e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        if (!line.imei.trim()) {
                          itemNameInputRefs.current[line.id]?.focus();
                        } else {
                          const found = await handleImeiSearch(line.id, line.imei);
                          if (!found) itemNameInputRefs.current[line.id]?.focus();
                        }
                      }}
                      fullWidth
                      inputRef={(el) => {
                        imeiInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 }, '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <Autocomplete
                      size="small"
                      options={products}
                      filterOptions={productFilterOptions}
                      getOptionLabel={(opt) => opt.name || ''}
                      value={products.find((p) => p._id === line.productId) || null}
                      onChange={(_, v) => {
                        handleProductSelect(line.id, v || null);
                        if (v) setTimeout(() => focusQtyForLine(line.id), 100);
                      }}
                      onHighlightChange={handleProductHighlight}
                      openOnFocus
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          inputRef={(el: HTMLInputElement | null) => {
                            const input = el?.querySelector?.('input') ?? el ?? null;
                            itemNameInputRefs.current[line.id] = input;
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const listOpen = (e.target as HTMLInputElement)?.getAttribute?.('aria-expanded') === 'true';
                            if (listOpen) {
                              setTimeout(() => focusQtyForLine(line.id), 150);
                              return;
                            }
                            e.preventDefault();
                            const typed = (line.name || '').trim().toLowerCase();
                            const match = products.find((p) => (p.name || '').toLowerCase() === typed);
                            if (match) {
                              handleProductSelect(line.id, match);
                              setTimeout(() => focusQtyForLine(line.id), 100);
                            } else {
                              focusQtyForLine(line.id);
                            }
                          }}
                          placeholder="Item Name"
                          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 }, '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                        />
                      )}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      select
                      fullWidth
                      value={line.unitId}
                      onChange={(e) => handleUnitChange(line.id, e.target.value)}
                      onKeyDown={(e) => handleUnitKeyDown(e, line.id)}
                      disabled={(line.availableUnits || []).length === 0}
                      inputRef={(el) => {
                        unitInputRefs.current[line.id] = el?.querySelector?.('input') ?? (el as HTMLInputElement | null) ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    >
                      {(line.availableUnits || []).length === 0 ? (
                        <MenuItem value="" sx={{ fontSize: '0.875rem' }}>-</MenuItem>
                      ) : (
                        (line.availableUnits || []).map((u) => (
                          <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.875rem' }}>{u.name}</MenuItem>
                        ))
                      )}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : '';
                        updateLine(line.id, 'quantity', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handleQtyKeyDown(e, line.id);
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        const input = el?.querySelector?.('input') ?? el ?? null;
                        qtyInputRefs.current[line.id] = input;
                        if (input) input.setAttribute('data-opening-stock-qty', line.id);
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : (line.pRate === 0 ? '' : String(line.pRate))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'pRate', value: line.pRate === 0 ? '' : String(line.pRate) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'pRate' ? editingNumericCell.value : '';
                        updateLine(line.id, 'pRate', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'pRate' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handlePriceKeyDown(e, line.id);
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        priceInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 500, fontSize: '0.875rem' }}>{line.gross.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : '';
                        updateLine(line.id, 'discPercent', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handleDiscPercentKeyDown(e, line.id);
                      }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        discPercentInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : '';
                        updateLine(line.id, 'discAmount', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handleDiscAmountKeyDown(e, line.id);
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        discAmountInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontSize: '0.875rem' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.875rem' }}>{line.total.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'profitPercent' ? editingNumericCell.value : (line.profitPercent === 0 ? '' : String(line.profitPercent))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'profitPercent', value: line.profitPercent === 0 ? '' : String(line.profitPercent) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'profitPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'profitPercent' ? editingNumericCell.value : '';
                        updateLine(line.id, 'profitPercent', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'profitPercent' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handleProfitPercentKeyDown(e, line.id);
                      }}
                      inputProps={{ style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        profitPercentInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'retail' ? editingNumericCell.value : (line.retail === 0 ? '' : String(line.retail))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'retail', value: line.retail === 0 ? '' : String(line.retail) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'retail' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'retail' ? editingNumericCell.value : '';
                        updateLine(line.id, 'retail', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'retail' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handleRetailKeyDown(e, line.id);
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        retailInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'wholesale' ? editingNumericCell.value : (line.wholesale === 0 ? '' : String(line.wholesale))}
                      onFocus={(e) => {
                        handleTextFieldFocus(e);
                        setEditingNumericCell({ lineId: line.id, field: 'wholesale', value: line.wholesale === 0 ? '' : String(line.wholesale) });
                      }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'wholesale' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => {
                        const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'wholesale' ? editingNumericCell.value : '';
                        updateLine(line.id, 'wholesale', parseNumericInput(raw));
                        setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'wholesale' ? null : prev);
                      }}
                      onKeyDown={(e) => {
                        handleNumberKeyDown(e);
                        handleWholesaleKeyDown(e, line.id);
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.875rem' } }}
                      fullWidth
                      inputRef={(el) => {
                        wholesaleInputRefs.current[line.id] = el?.querySelector?.('input') ?? el ?? null;
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                    <TextField
                      size="small"
                      value={line.branch}
                      onChange={(e) => updateLine(line.id, 'branch', e.target.value)}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 }, '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center' }} />
                  <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <IconButton
                      size="small"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeLine(line.id);
                      }}
                      sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#ef4444' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5 }}>
        <Typography sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>
          Grand Total: {calculations.grandTotal.toFixed(2)}
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 1,
          mt: 0.5,
          bgcolor: 'white',
          borderRadius: 1,
          border: '2px solid #000000',
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Button variant="contained" size="small" startIcon={<ClearIcon />} onClick={handleClear} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
          Clear
        </Button>
        <Button
          ref={saveButtonRef}
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!!entryId || loading}
          sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}
        >
          {isSaved ? 'Saved ✓' : 'Save'}
        </Button>
        <Button variant="contained" size="small" startIcon={<EditIcon />} onClick={() => setEditConfirmOpen(true)} disabled={!entryId || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Edit
        </Button>
        <Button variant="contained" size="small" startIcon={<DeleteIcon />} onClick={() => setDeleteDialogOpen(true)} disabled={!entryId} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
          Delete
        </Button>
        <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={() => setSearchDialogOpen(true)} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1, textTransform: 'none', fontWeight: 600, px: 2, fontSize: '0.85rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
          Search
        </Button>
        {entryList.length > 0 && (
          <>
            <Button variant="contained" size="small" onClick={navFirst} disabled={currentNavIndex <= 0} sx={{ minWidth: 36, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
              <FirstIcon fontSize="small" />
            </Button>
            <Button variant="contained" size="small" onClick={navPrev} disabled={entryList.length === 0} sx={{ minWidth: 36, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
              <PrevIcon fontSize="small" />
            </Button>
            <Button variant="contained" size="small" onClick={navNext} disabled={entryList.length === 0} sx={{ minWidth: 36, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
              <NextIcon fontSize="small" />
            </Button>
            <Button variant="contained" size="small" onClick={navLast} disabled={currentNavIndex >= entryList.length - 1 || entryList.length === 0} sx={{ minWidth: 36, borderRadius: 1.5, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
              <LastIcon fontSize="small" />
            </Button>
          </>
        )}
      </Paper>

      <Dialog open={savedDialogOpen} onClose={() => setSavedDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Success</DialogTitle>
        <DialogContent>{successMessage}</DialogContent>
        <DialogActions>
          <Button onClick={() => setSavedDialogOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>{errorDialogMessage}</DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Confirm Edit</DialogTitle>
        <DialogContent>Update this opening stock entry with the current form values?</DialogContent>
        <DialogActions>
          <Button onClick={() => setEditConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => { setEditConfirmOpen(false); handleSave(); }} sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>
            Update
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Delete Opening Stock Entry?</DialogTitle>
        <DialogContent>This action cannot be undone.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Search by Entry No</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Entry No"
            value={searchEntryNo}
            onChange={(e) => setSearchEntryNo(e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g. OS-000001"
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSearchSubmit}>Search</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
