import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  IconButton,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  CircularProgress,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  FirstPage as FirstIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  LastPage as LastIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import {
  productApi,
  stockApi,
  stockAdjustmentApi,
  purchaseApi,
  type StockAdjustmentData,
  type StockAdjustmentPayload,
} from '../services/api';
import DateInput, { getCurrentDate, formatDateDisplay } from '../components/DateInput';

export interface DamageLineItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  barcode: string;
  batchNumber?: string;
  purchaseDate?: string | null;
  currentStock: number;
  quantity: number;
  purchaseRate: number;
  totalAmount: number;
  reason: string;
  isCommitted: boolean;
}

interface BatchOption {
  batchNumber: string;
  productId: string;
  productName: string;
  purchasePrice: number;
  expiryDate: string;
  quantity: number;
  retail: number;
  wholesale: number;
  date?: string;
}

const DAMAGE_REASONS = [
  'Damaged Goods',
  'Expired Products',
  'Breakage / Leakage',
  'Spoilage / Deterioration',
  'Defective / Quality Failure',
  'Handling & Transit Damage',
  'Water / Environmental Damage',
  'Scrap / Disposal',
  'Other Damage',
];

export default function DamageWastage() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Active View: 'new' | 'history'
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Header State
  const [entryNo, setEntryNo] = useState<string>('DMG-00001');
  const [date, setDate] = useState<string>(getCurrentDate());
  const [primaryReason, setPrimaryReason] = useState<string>('Damaged Goods');
  const [narration, setNarration] = useState<string>('');

  // Product List
  const [productsList, setProductsList] = useState<any[]>([]);

  // Function to create new empty line
  const createEmptyLine = useCallback(
    (): DamageLineItem => ({
      id: Math.random().toString(36).substr(2, 9),
      productId: '',
      productCode: '',
      productName: '',
      barcode: '',
      batchNumber: undefined,
      purchaseDate: null,
      currentStock: 0,
      quantity: 1,
      purchaseRate: 0,
      totalAmount: 0,
      reason: primaryReason,
      isCommitted: false,
    }),
    [primaryReason]
  );

  // Lines Grid State
  const [lines, setLines] = useState<DamageLineItem[]>([
    {
      id: Math.random().toString(36).substr(2, 9),
      productId: '',
      productCode: '',
      productName: '',
      barcode: '',
      batchNumber: undefined,
      purchaseDate: null,
      currentStock: 0,
      quantity: 1,
      purchaseRate: 0,
      totalAmount: 0,
      reason: 'Damaged Goods',
      isCommitted: false,
    },
  ]);

  // Active Row & Inline Numeric Editing State
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [editingNumericCell, setEditingNumericCell] = useState<{
    lineId: string;
    field: 'quantity' | 'purchaseRate';
    value: string;
  } | null>(null);

  // Batch Selection State
  const [availableBatches, setAvailableBatches] = useState<BatchOption[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState<boolean>(false);
  const [pendingBatchLineId, setPendingBatchLineId] = useState<string | null>(null);
  const [pendingBatchProduct, setPendingBatchProduct] = useState<any | null>(null);
  const [customBatchInput, setCustomBatchInput] = useState<string>('');

  // Status & Feedback
  const [loading, setLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // History State
  const [historyList, setHistoryList] = useState<StockAdjustmentData[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyFromDate, setHistoryFromDate] = useState<string>(getCurrentDate);
  const [historyToDate, setHistoryToDate] = useState<string>(getCurrentDate);
  const [selectedEntryForView, setSelectedEntryForView] = useState<StockAdjustmentData | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState<boolean>(false);

  // Input Refs for fast keyboard navigation
  const imeiInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const rateInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Row Snapshot & Commit Refs (Sales Window pattern: uncommitted edits to a previously committed row are reverted on switch)
  const rowSnapshotRef = useRef<{ lineId: string; data: DamageLineItem } | null>(null);
  const rowCommittedRef = useRef<boolean>(false);

  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
      if (snapshot.lineId) {
        setEditingNumericCell((prev) =>
          prev && prev.lineId === snapshot.lineId ? null : prev
        );
      }
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  const enterRow = useCallback((line: DamageLineItem) => {
    if (rowSnapshotRef.current && rowSnapshotRef.current.lineId === line.id) return;
    revertUncommittedRow();
    if (line.isCommitted && line.productId) {
      rowSnapshotRef.current = {
        lineId: line.id,
        data: { ...line },
      };
      rowCommittedRef.current = false;
    }
  }, [revertUncommittedRow]);

  const commitRowEdits = useCallback(() => {
    rowCommittedRef.current = true;
    rowSnapshotRef.current = null;
  }, []);

  // Filter for product Autocomplete
  const productFilterOptions = useMemo(
    () => (options: any[], state: { inputValue: string }) => {
      const q = (state.inputValue || '').trim().toLowerCase();
      const name = (p: any) => (p.name || '').toLowerCase();
      const sortByName = (arr: any[]) =>
        arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      if (!q) return options;
      const startsWith = options.filter((p) => name(p).startsWith(q));
      const containsOnly = options.filter((p) => name(p).includes(q) && !name(p).startsWith(q));
      return [...sortByName(startsWith), ...sortByName(containsOnly)];
    },
    []
  );

  // Number input parser
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === '-') return 0;
    const normalized = raw === '.' || /^\.\d*$/.test(raw) ? '0' + raw : raw;
    return parseFloat(normalized) || 0;
  };

  // Focus & navigation helpers
  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.select();
  };

  const handleGridArrowNavigation = (
    e: React.KeyboardEvent<any>,
    currentLineId: string,
    refMap: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>
  ) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const idx = lines.findIndex((l) => l.id === currentLineId);
      if (idx === -1) return;
      const targetIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (targetIdx >= 0 && targetIdx < lines.length) {
        e.preventDefault();
        const targetId = lines[targetIdx].id;
        setActiveLineId(targetId);
        setTimeout(() => refMap.current[targetId]?.focus(), 30);
      }
    }
  };

  // Fetch Next Entry Number
  const fetchNextNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await stockAdjustmentApi.getNextNo(companyId, financialYearId, {
        entryType: 'DAMAGE',
        prefix: 'DMG',
      });
      if (res.data?.data?.adjustmentNo) {
        setEntryNo(res.data.data.adjustmentNo);
      }
    } catch (err: any) {
      console.error('Failed to get next damage/wastage number:', err);
    }
  }, [companyId, financialYearId]);

  // Load Products for search
  const loadProducts = useCallback(
    async (searchQuery?: string) => {
      if (!companyId) return;
      try {
        const res = await productApi.list(companyId, { search: searchQuery, limit: 200 });
        const data = (res.data as any)?.data;
        const list = Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data)
          ? data
          : [];
        setProductsList(list);
      } catch (err: any) {
        console.error('Failed to load products:', err);
        setProductsList([]);
      }
    },
    [companyId]
  );

  // Load History
  const loadHistory = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    setHistoryLoading(true);
    try {
      const res = await stockAdjustmentApi.list(companyId, financialYearId, {
        entryType: 'DAMAGE',
        prefix: 'DMG',
        search: historySearch || undefined,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
        limit: 100,
      });
      const allList = res.data?.data?.list || [];
      const damageOnly = allList.filter(
        (r) =>
          r.entryType === 'DAMAGE' ||
          r.adjustmentNo?.startsWith('DMG-') ||
          /damage|wastage|expired|spoilage|breakage|scrap|defective/i.test(r.reason || '')
      );
      setHistoryList(damageOnly);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [companyId, financialYearId, historySearch, historyFromDate, historyToDate]);

  const linesRef = useRef<DamageLineItem[]>(lines);
  linesRef.current = lines;

  const focusBarcodeField = useCallback((lineId?: string) => {
    setTimeout(() => {
      const targetId = lineId || linesRef.current[0]?.id;
      if (targetId && imeiInputRefs.current[targetId]) {
        imeiInputRefs.current[targetId]?.focus();
      }
    }, 60);
  }, []);

  useEffect(() => {
    if (companyId && financialYearId) {
      fetchNextNo();
      loadProducts();
      loadHistory();
    }
  }, [companyId, financialYearId, fetchNextNo, loadProducts, loadHistory]);

  useEffect(() => {
    if (activeTab === 'new') {
      focusBarcodeField();
    }
  }, [activeTab]);

  // Update a field on a line
  const updateLine = useCallback(
    (lineId: string, field: keyof DamageLineItem, value: any) => {
      setLines((prev) => {
        return prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = { ...line, [field]: value };

          // Recalculate line total amount
          const qty = field === 'quantity' ? Number(value) : line.quantity;
          const rate = field === 'purchaseRate' ? Number(value) : line.purchaseRate;
          updated.totalAmount = parseFloat((qty * rate).toFixed(2));

          return updated;
        });
      });
    },
    []
  );

  // Helper to fetch last purchase date for a product
  const fetchProductLastPurchaseDate = async (prodId: string): Promise<string | null> => {
    if (!companyId || !prodId) return null;
    try {
      const bRes = await purchaseApi.getProductBatches(companyId, prodId);
      const batches: any[] = bRes.data?.data || [];
      if (batches.length > 0) {
        const lastBatch = batches[batches.length - 1];
        if (lastBatch.date) {
          return new Date(lastBatch.date).toISOString().split('T')[0];
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Handle Product Selection in a Grid Row
  const handleProductSelect = async (lineId: string, product: any | null) => {
    if (!product || typeof product !== 'object') {
      updateLine(lineId, 'productId', '');
      updateLine(lineId, 'productName', '');
      updateLine(lineId, 'productCode', '');
      updateLine(lineId, 'barcode', '');
      updateLine(lineId, 'purchaseDate', null);
      updateLine(lineId, 'currentStock', 0);
      updateLine(lineId, 'purchaseRate', 0);
      return;
    }

    const prodId = product._id || product.id;
    const prodName = product.name || '';
    const prodCode = product.code || product.sku || '';
    const barcode = product.imei || product.systemBarcode || product.internationalBarcode || '';
    const defaultCost =
      product.purchasePrice != null ? product.purchasePrice : product.retailPrice ?? 0;

    // Check if product allows batch tracking
    if (product.allowBatches === true && companyId) {
      try {
        const batchRes = await purchaseApi.getProductBatches(companyId, String(prodId));
        const batches = batchRes.data?.data || [];
        setAvailableBatches(batches);
        setPendingBatchLineId(lineId);
        setPendingBatchProduct(product);
        setCustomBatchInput('');
        setBatchDialogOpen(true);
        return;
      } catch (bErr) {
        console.error('Error fetching batches:', bErr);
      }
    }

    // Default Non-Batch product flow
    let liveStock = 0;
    if (companyId && prodId) {
      try {
        const stockRes = await stockApi.getProductStock(companyId, String(prodId));
        liveStock = stockRes.data?.data?.stock ?? 0;
      } catch (err) {
        console.error('Error fetching stock:', err);
      }
    }

    // Fetch purchase date if available
    let pDate = await fetchProductLastPurchaseDate(String(prodId));
    if (!pDate && product.createdAt) {
      pDate = new Date(product.createdAt).toISOString().split('T')[0];
    }

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const totalVal = parseFloat((line.quantity * defaultCost).toFixed(2));
        return {
          ...line,
          productId: String(prodId),
          productCode: prodCode,
          productName: prodName,
          barcode,
          batchNumber: undefined,
          purchaseDate: pDate,
          currentStock: liveStock,
          purchaseRate: defaultCost,
          totalAmount: totalVal,
        };
      })
    );

    setActiveLineId(lineId);
    setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
  };

  // Batch selection handler from Dialog
  const handleSelectBatch = (batch: BatchOption) => {
    if (!pendingBatchLineId || !pendingBatchProduct) return;

    const prodId = pendingBatchProduct._id || pendingBatchProduct.id;
    const prodName = pendingBatchProduct.name || '';
    const prodCode = pendingBatchProduct.code || pendingBatchProduct.sku || '';
    const barcode =
      pendingBatchProduct.imei ||
      pendingBatchProduct.systemBarcode ||
      pendingBatchProduct.internationalBarcode ||
      '';
    const batchStock = batch.quantity ?? 0;
    const batchCost = batch.purchasePrice ?? pendingBatchProduct.purchasePrice ?? 0;
    const pDate = batch.date
      ? new Date(batch.date).toISOString().split('T')[0]
      : pendingBatchProduct.createdAt
      ? new Date(pendingBatchProduct.createdAt).toISOString().split('T')[0]
      : null;

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== pendingBatchLineId) return line;
        const totalVal = parseFloat((line.quantity * batchCost).toFixed(2));
        return {
          ...line,
          productId: String(prodId),
          productCode: prodCode,
          productName: prodName,
          barcode,
          batchNumber: batch.batchNumber,
          purchaseDate: pDate,
          currentStock: batchStock,
          purchaseRate: batchCost,
          totalAmount: totalVal,
        };
      })
    );

    const lineToFocus = pendingBatchLineId;
    setBatchDialogOpen(false);
    setPendingBatchLineId(null);
    setPendingBatchProduct(null);
    setCustomBatchInput('');

    setTimeout(() => qtyInputRefs.current[lineToFocus]?.focus(), 50);
  };

  // Custom / New Batch handler from Dialog
  const handleCreateOrApplyCustomBatch = (batchNo: string) => {
    if (!pendingBatchLineId || !pendingBatchProduct || !batchNo.trim()) return;

    const prodId = pendingBatchProduct._id || pendingBatchProduct.id;
    const prodName = pendingBatchProduct.name || '';
    const prodCode = pendingBatchProduct.code || pendingBatchProduct.sku || '';
    const barcode =
      pendingBatchProduct.imei ||
      pendingBatchProduct.systemBarcode ||
      pendingBatchProduct.internationalBarcode ||
      '';
    const defaultCost =
      pendingBatchProduct.purchasePrice != null
        ? pendingBatchProduct.purchasePrice
        : pendingBatchProduct.retailPrice ?? 0;

    const existing = availableBatches.find(
      (b) => b.batchNumber.toLowerCase() === batchNo.trim().toLowerCase()
    );
    const batchStock = existing ? existing.quantity : 0;
    const batchCost = existing ? (existing.purchasePrice ?? defaultCost) : defaultCost;
    const pDate = existing?.date
      ? new Date(existing.date).toISOString().split('T')[0]
      : pendingBatchProduct.createdAt
      ? new Date(pendingBatchProduct.createdAt).toISOString().split('T')[0]
      : null;

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== pendingBatchLineId) return line;
        const totalVal = parseFloat((line.quantity * batchCost).toFixed(2));
        return {
          ...line,
          productId: String(prodId),
          productCode: prodCode,
          productName: prodName,
          barcode,
          batchNumber: batchNo.trim(),
          purchaseDate: pDate,
          currentStock: batchStock,
          purchaseRate: batchCost,
          totalAmount: totalVal,
        };
      })
    );

    const lineToFocus = pendingBatchLineId;
    setBatchDialogOpen(false);
    setPendingBatchLineId(null);
    setPendingBatchProduct(null);
    setCustomBatchInput('');

    setTimeout(() => qtyInputRefs.current[lineToFocus]?.focus(), 50);
  };

  // Remove a line
  const handleRemoveRow = (index: number) => {
    setLines((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        return [createEmptyLine()];
      }
      return updated;
    });
  };

  // Commit Line and move to Next Row
  const commitRowAndAdvance = (lineId: string) => {
    commitRowEdits();
    setLines((current) => {
      const currentIndex = current.findIndex((l) => l.id === lineId);
      if (currentIndex === -1) return current;

      const line = current[currentIndex];
      if (!line.productId || line.quantity <= 0) {
        return current;
      }

      const updated = [...current];
      updated[currentIndex] = { ...line, isCommitted: true };

      // If at last row, append a fresh empty line
      if (currentIndex === current.length - 1) {
        const newLine = createEmptyLine();
        updated.push(newLine);
        enterRow(newLine);
        setActiveLineId(newLine.id);
        setTimeout(() => (imeiInputRefs.current[newLine.id] || itemNameInputRefs.current[newLine.id])?.focus(), 50);
      } else {
        const nextLine = updated[currentIndex + 1];
        enterRow(nextLine);
        setActiveLineId(nextLine.id);
        setTimeout(() => (imeiInputRefs.current[nextLine.id] || itemNameInputRefs.current[nextLine.id])?.focus(), 50);
      }

      return updated;
    });
  };

  // Handle Barcode scan or entry in grid row
  const handleImeiKeyDown = async (
    e: React.KeyboardEvent<any>,
    lineId: string,
    imeiValue: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = (imeiValue || '').trim();
      if (!code) {
        if (validItems.length > 0) {
          saveButtonRef.current?.focus();
        } else {
          setTimeout(() => itemNameInputRefs.current[lineId]?.focus(), 30);
        }
        return;
      }
      const match = productsList.find(
        (p) =>
          (p.imei && p.imei.trim() === code) ||
          (p.systemBarcode && p.systemBarcode.trim() === code) ||
          (p.internationalBarcode && p.internationalBarcode.trim() === code) ||
          (p.code && p.code.trim().toLowerCase() === code.toLowerCase())
      );
      if (match) {
        await handleProductSelect(lineId, match);
        setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
        return;
      }
      if (companyId) {
        try {
          const res = await productApi.getByBarcode(companyId, code);
          const prod = (res.data as any)?.data;
          if (prod) {
            await handleProductSelect(lineId, prod);
            setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
            return;
          }
        } catch (err) {
          // ignore
        }
      }
      setTimeout(() => itemNameInputRefs.current[lineId]?.focus(), 30);
    }
  };

  // Calculations
  const validItems = useMemo(() => lines.filter((l) => l.productId && l.quantity > 0), [lines]);
  const totalItemsCount = validItems.length;
  const totalQuantityCount = useMemo(
    () => validItems.reduce((sum, item) => sum + item.quantity, 0),
    [validItems]
  );
  const totalDamageValue = useMemo(
    () => validItems.reduce((sum, item) => sum + item.quantity * item.purchaseRate, 0),
    [validItems]
  );

  // Active line for live info strip
  const activeLine = useMemo(() => {
    return lines.find((l) => l.id === activeLineId) || lines.find((l) => l.productId) || lines[0];
  }, [lines, activeLineId]);

  // Clear Form
  const handleClearForm = () => {
    commitRowEdits();
    setLines([createEmptyLine()]);
    setEditingId(null);
    setNarration('');
    setPrimaryReason('Damaged Goods');
    setDate(getCurrentDate());
    setActiveLineId(null);
    setErrorMessage('');
    fetchNextNo();
    focusBarcodeField();
  };

  // Save / Update Damage Entry
  const handleSaveDamage = async () => {
    if (!companyId || !financialYearId) {
      setErrorMessage('Company or Financial Year not selected');
      return;
    }
    if (validItems.length === 0) {
      setErrorMessage('Please add at least one damaged product item with quantity > 0');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const payload: StockAdjustmentPayload = {
        companyId,
        financialYearId,
        adjustmentNo: entryNo,
        entryType: 'DAMAGE',
        prefix: 'DMG',
        date,
        reason: primaryReason,
        narration: narration.trim()
          ? `${narration.trim()} [Damage Entry: ${entryNo}]`
          : `Damage / Wastage Entry ${entryNo} - ${primaryReason}`,
        items: validItems.map((l) => ({
          productId: l.productId,
          productCode: l.productCode,
          productName: l.productName,
          barcode: l.barcode,
          batchNumber: l.batchNumber,
          adjustmentType: 'REDUCE',
          quantity: l.quantity,
          costPrice: l.purchaseRate,
          reason: l.reason || primaryReason,
        })),
      };

      if (editingId) {
        const res = await stockAdjustmentApi.update(editingId, payload);
        setSuccessMessage(
          `Damage Entry ${res.data.data.adjustmentNo || entryNo} updated successfully!`
        );
      } else {
        const res = await stockAdjustmentApi.create(payload);
        setSuccessMessage(
          `Damage Entry ${res.data.data.adjustmentNo || entryNo} saved successfully! Inventory reduced & voucher posted.`
        );
      }

      handleClearForm();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save damage entry';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // Load an existing record into Edit Mode
  const handleEditHistory = async (data: StockAdjustmentData) => {
    setEditingId(data._id);
    setEntryNo(data.adjustmentNo);
    setDate(data.date ? new Date(data.date).toISOString().split('T')[0] : getCurrentDate());
    setPrimaryReason(data.reason || 'Damaged Goods');
    setNarration(data.narration || '');

    const loadedLines: DamageLineItem[] = data.items.map((item) => ({
      id: Math.random().toString(36).substr(2, 9),
      productId: item.productId,
      productCode: item.productCode || '',
      productName: item.productName || '',
      barcode: item.barcode || '',
      batchNumber: item.batchNumber,
      purchaseDate: null,
      currentStock: item.currentStock || 0,
      quantity: item.quantity,
      purchaseRate: item.costPrice || 0,
      totalAmount: item.totalValue || parseFloat((item.quantity * item.costPrice).toFixed(2)),
      reason: item.reason || data.reason || 'Damaged Goods',
      isCommitted: true,
    }));

    // Append fresh empty line at end
    loadedLines.push(createEmptyLine());

    setLines(loadedLines);
    setActiveTab('new');
    setSuccessMessage(`Editing Damage Entry ${data.adjustmentNo}`);
  };

  const routeLocation = useLocation();
  const navigate = useNavigate();

  // Auto-load damage entry if navigated with damageId or id in location state
  useEffect(() => {
    const state = routeLocation.state as { damageId?: string; id?: string; entryNo?: string } | null;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = state?.damageId || state?.id || urlParams.get('id');
    if (targetId && companyId) {
      stockAdjustmentApi.getById(targetId, companyId).then((res) => {
        if (res.data?.data) {
          handleEditHistory(res.data.data);
        }
      }).catch(console.error);
      navigate(routeLocation.pathname, { replace: true, state: {} });
    }
  }, [companyId, routeLocation.state, routeLocation.pathname, navigate]);

  // Navigation handlers
  const currentNavIndex = useMemo(() => {
    if (!editingId) return -1;
    return historyList.findIndex((r) => r._id === editingId || r.adjustmentNo === entryNo);
  }, [historyList, editingId, entryNo]);

  const navFirst = useCallback(() => {
    if (historyList.length === 0) return;
    handleEditHistory(historyList[historyList.length - 1]);
  }, [historyList]);

  const navPrev = useCallback(() => {
    if (historyList.length === 0) return;
    if (currentNavIndex < 0) {
      handleEditHistory(historyList[0]);
      return;
    }
    const targetIdx = currentNavIndex < historyList.length - 1 ? currentNavIndex + 1 : historyList.length - 1;
    handleEditHistory(historyList[targetIdx]);
  }, [historyList, currentNavIndex]);

  const navNext = useCallback(() => {
    if (historyList.length === 0) return;
    if (currentNavIndex <= 0) return;
    const targetIdx = currentNavIndex - 1;
    handleEditHistory(historyList[targetIdx]);
  }, [historyList, currentNavIndex]);

  const navLast = useCallback(() => {
    if (historyList.length === 0) return;
    handleEditHistory(historyList[0]);
  }, [historyList]);

  // Delete & Reverse Entry
  const handleDeleteHistory = async (id: string, adjNo: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete and reverse Damage Entry ${adjNo}? This will restore stock inventory and cancel the accounting voucher.`
      )
    ) {
      return;
    }
    if (!companyId) return;
    try {
      await stockAdjustmentApi.delete(id, companyId);
      setSuccessMessage(`Damage Entry ${adjNo} deleted and reversed successfully.`);
      loadHistory();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to delete damage entry');
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 1.5 }, bgcolor: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      {/* ─── TOP TITLE & TAB HEADER ─── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1.2,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', fontSize: '1.25rem' }}
            >
              Damage / Wastage Entry
            </Typography>
            <Chip
              label="Stock Reduction"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.62rem',
                fontWeight: 700,
                bgcolor: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.80rem', mt: 0.2 }}>
            Record damaged, expired, spoiled, or wasted stock. Automatically posts accounting voucher and deducts inventory.
          </Typography>
        </Box>

        {/* Top Right Tab Buttons */}
        <Box
          sx={{
            display: 'inline-flex',
            bgcolor: '#e2e8f0',
            p: '3px',
            borderRadius: '8px',
            gap: '2px',
          }}
        >
          <Button
            size="small"
            onClick={() => setActiveTab('new')}
            sx={{
              px: 2,
              py: 0.5,
              borderRadius: '6px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              bgcolor: activeTab === 'new' ? '#ffffff' : 'transparent',
              color: activeTab === 'new' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'new' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              '&:hover': {
                bgcolor: activeTab === 'new' ? '#ffffff' : 'rgba(255,255,255,0.5)',
              },
            }}
          >
            New damage entry
          </Button>

          <Button
            size="small"
            onClick={() => setActiveTab('history')}
            sx={{
              px: 2,
              py: 0.5,
              borderRadius: '6px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              bgcolor: activeTab === 'history' ? '#ffffff' : 'transparent',
              color: activeTab === 'history' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'history' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              '&:hover': {
                bgcolor: activeTab === 'history' ? '#ffffff' : 'rgba(255,255,255,0.5)',
              },
            }}
          >
            History
          </Button>
        </Box>
      </Box>

      {/* Alerts */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 1.2, borderRadius: 1.5, py: 0.5 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 1.2, borderRadius: 1.5, py: 0.5 }} onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      {/* ─── TAB 0: NEW / EDIT DAMAGE ENTRY ─── */}
      {activeTab === 'new' && (
        <Box>
          {/* Header Card */}
          <Paper
            elevation={0}
            sx={{
              p: 1.25,
              mb: 0.7,
              borderRadius: 1.5,
              bgcolor: '#ffffff',
              border: '1px solid #e0e7ef',
            }}
          >
            <Grid container spacing={1} alignItems="center">
              {/* Entry / Damage No & Navigation Buttons */}
              <Grid item xs={12} sm={6} md={3.2} lg={2.6}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                  <Typography
                    sx={{
                      fontSize: '0.60rem',
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    ENTRY NO
                  </Typography>

                  {/* Navigation buttons */}
                  <Box sx={{ display: 'inline-flex', gap: 0.3, alignItems: 'center' }}>
                    <Tooltip title="First Damage Entry">
                      <span>
                        <IconButton
                          size="small"
                          onClick={navFirst}
                          disabled={historyList.length === 0 || currentNavIndex === historyList.length - 1}
                          sx={{ p: 0.2, width: 20, height: 20, borderRadius: '4px', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, '&.Mui-disabled': { opacity: 0.35 } }}
                        >
                          <FirstIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Previous Damage Entry">
                      <span>
                        <IconButton
                          size="small"
                          onClick={navPrev}
                          disabled={historyList.length === 0 || currentNavIndex >= historyList.length - 1}
                          sx={{ p: 0.2, width: 20, height: 20, borderRadius: '4px', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, '&.Mui-disabled': { opacity: 0.35 } }}
                        >
                          <PrevIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Next Damage Entry">
                      <span>
                        <IconButton
                          size="small"
                          onClick={navNext}
                          disabled={historyList.length === 0 || currentNavIndex <= 0}
                          sx={{ p: 0.2, width: 20, height: 20, borderRadius: '4px', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, '&.Mui-disabled': { opacity: 0.35 } }}
                        >
                          <NextIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Last Damage Entry">
                      <span>
                        <IconButton
                          size="small"
                          onClick={navLast}
                          disabled={historyList.length === 0 || currentNavIndex === 0}
                          sx={{ p: 0.2, width: 20, height: 20, borderRadius: '4px', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, '&.Mui-disabled': { opacity: 0.35 } }}
                        >
                          <LastIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {historyList.length > 0 && currentNavIndex >= 0 && (
                      <Typography sx={{ color: '#0f766e', fontWeight: 700, fontSize: '0.60rem', ml: 0.3 }}>
                        {historyList.length - currentNavIndex}/{historyList.length}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <TextField
                  value={entryNo}
                  size="small"
                  fullWidth
                  InputProps={{
                    readOnly: true,
                    sx: {
                      bgcolor: '#f8fafc',
                      borderRadius: 0.8,
                      fontWeight: 700,
                      fontSize: '0.70rem',
                      height: 24,
                      '& fieldset': { borderColor: '#e2e8f0' },
                    },
                  }}
                />
              </Grid>

              {/* Date */}
              <Grid item xs={6} sm={4} md={2} lg={1.8}>
                <Typography
                  sx={{
                    fontSize: '0.60rem',
                    fontWeight: 700,
                    color: '#475569',
                    letterSpacing: 0.5,
                    mb: 0.25,
                    textTransform: 'uppercase',
                  }}
                >
                  DATE
                </Typography>
                <DateInput label="" value={date} onChange={setDate} size="small" />
              </Grid>

              {/* Damage Reason / Type */}
              <Grid item xs={12} sm={4} md={3.5} lg={3.5}>
                <Typography
                  sx={{
                    fontSize: '0.60rem',
                    fontWeight: 700,
                    color: '#475569',
                    letterSpacing: 0.5,
                    mb: 0.25,
                    textTransform: 'uppercase',
                  }}
                >
                  DAMAGE / WASTAGE REASON
                </Typography>
                <TextField
                  select
                  value={primaryReason}
                  onChange={(e) => setPrimaryReason(e.target.value)}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'white',
                      borderRadius: 0.8,
                      height: 24,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      '& fieldset': { borderColor: '#e2e8f0' },
                    },
                    '& .MuiSelect-select': { py: 0, px: 0.8 },
                  }}
                >
                  {DAMAGE_REASONS.map((r) => (
                    <MenuItem key={r} value={r} sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Remarks / Narration */}
              <Grid item xs={12} sm={8} md={4.5} lg={4.5}>
                <Typography
                  sx={{
                    fontSize: '0.60rem',
                    fontWeight: 700,
                    color: '#475569',
                    letterSpacing: 0.5,
                    mb: 0.25,
                    textTransform: 'uppercase',
                  }}
                >
                  REMARKS / NARRATION
                </Typography>
                <TextField
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Optional damage notes..."
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'white',
                      borderRadius: 0.8,
                      height: 24,
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      '& fieldset': { borderColor: '#e2e8f0' },
                    },
                    '& .MuiOutlinedInput-input': { py: 0, px: 0.8 },
                  }}
                />
              </Grid>

              {/* Live Product Info Strip */}
              <Grid item xs={12}>
                <Box
                  sx={{
                    borderRadius: 1.2,
                    px: 1,
                    py: 0.3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    background: activeLine?.productId
                      ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)'
                      : '#f8fafc',
                    border: activeLine?.productId ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
                    minHeight: 26,
                  }}
                >
                  {activeLine?.productId ? (
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>
                          Item
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', lineHeight: 1.2 }}>
                          {activeLine.productName}
                        </Typography>
                      </Box>
                      {activeLine.productCode && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>
                            Code
                          </Typography>
                          <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, color: '#334155', lineHeight: 1.2 }}>
                            {activeLine.productCode}
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ minWidth: 0, px: 0.7, py: 0.1, bgcolor: '#fef2f2', borderRadius: 0.8 }}>
                        <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#dc2626', fontWeight: 600 }}>
                          Current Stock
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.2, color: '#dc2626' }}>
                          {activeLine.currentStock}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>
                          Purchase Date
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', lineHeight: 1.2 }}>
                          {activeLine.purchaseDate ? formatDateDisplay(activeLine.purchaseDate) : '-'}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>
                          Purchase Rate
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f766e', lineHeight: 1.2 }}>
                          AED {activeLine.purchaseRate.toFixed(2)}
                        </Typography>
                      </Box>
                      {activeLine.batchNumber && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>
                            Batch
                          </Typography>
                          <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, color: '#0284c7', lineHeight: 1.2 }}>
                            {activeLine.batchNumber}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      Scan or search a product in the grid table below to view item details
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* ===== PRODUCT GRID (STRICTLY REQUESTED COLUMNS ONLY) ===== */}
          <Paper
            elevation={0}
            sx={{
              mb: 0.7,
              width: '100%',
              overflow: 'hidden',
              border: '1px solid #e0e7ef',
              borderRadius: 1.5,
            }}
          >
            <TableContainer
              sx={{ minHeight: 320, maxHeight: 380, width: '100%', bgcolor: '#fafbfc' }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  '& .MuiTableCell-root': {
                    fontSize: '0.68rem',
                    py: '2px',
                    px: '3px',
                    fontWeight: 700,
                    borderBottom: '1px solid #cbd5e1',
                  },
                  '& .MuiInputBase-input': { fontSize: '0.68rem', fontWeight: 700 },
                  '& .MuiAutocomplete-input': { fontSize: '0.68rem', fontWeight: 700 },
                  '& .MuiSelect-select': { fontSize: '0.68rem', fontWeight: 700 },
                }}
              >
                <TableHead>
                  <TableRow>
                    {[
                      { label: '#', w: '35px', align: 'center' },
                      { label: 'BARCODE', w: '150px', align: 'left' },
                      { label: 'ITEM NAME', w: 'auto', align: 'left' },
                      { label: 'PURCHASE DATE', w: '120px', align: 'center' },
                      { label: 'QTY', w: '90px', align: 'center' },
                      { label: 'PURCHASE RATE', w: '110px', align: 'right' },
                      { label: 'TOTAL AMOUNT', w: '120px', align: 'right' },
                      { label: '', w: '35px', align: 'center' },
                    ].map((col, ci) => (
                      <TableCell
                        key={ci}
                        align={col.align as any}
                        sx={{
                          bgcolor: '#0f766e',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: '0.65rem',
                          width: col.w,
                          p: '4px 3px',
                          letterSpacing: 0.2,
                          textTransform: 'uppercase',
                          borderRight: ci < 7 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                          borderBottom: '2px solid #0b534d',
                        }}
                      >
                        {col.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow
                      key={line.id}
                      sx={{
                        bgcolor:
                          activeLineId === line.id
                            ? '#e0f7fa'
                            : index === 0 && !line.productId
                            ? '#fffbeb'
                            : index % 2 === 0
                            ? '#f8fafb'
                            : 'white',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#e0f7fa' },
                        transition: 'background-color 0.1s',
                      }}
                      onClick={() => {
                        setActiveLineId(line.id);
                        enterRow(line);
                      }}
                    >
                      {/* # (Sl No) */}
                      <TableCell
                        sx={{
                          p: '2px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                          textAlign: 'center',
                          fontWeight: 700,
                          color: '#64748b',
                          fontSize: '0.68rem',
                          bgcolor: '#f1f5f9',
                        }}
                      >
                        {index + 1}
                      </TableCell>

                      {/* 1. BARCODE */}
                      <TableCell
                        sx={{
                          p: '2px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TextField
                          size="small"
                          variant="outlined"
                          placeholder="Scan / Barcode"
                          value={line.barcode}
                          inputRef={(el) => {
                            imeiInputRefs.current[line.id] = el;
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateLine(line.id, 'barcode', val);
                          }}
                          onFocus={(e) => {
                            handleTextFieldFocus(e);
                            setActiveLineId(line.id);
                            enterRow(line);
                          }}
                          onKeyDown={(e) => {
                            handleGridArrowNavigation(e, line.id, imeiInputRefs);
                            handleImeiKeyDown(e, line.id, line.barcode);
                          }}
                          sx={{
                            width: '100%',
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'white',
                              borderRadius: 0.8,
                              height: 24,
                              '& fieldset': { borderColor: '#e2e8f0' },
                            },
                            '& .MuiOutlinedInput-input': {
                              py: 0,
                              px: 0.5,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                            },
                          }}
                        />
                      </TableCell>

                      {/* 2. ITEM NAME */}
                      <TableCell
                        sx={{
                          p: '2px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Autocomplete
                          size="small"
                          freeSolo
                          options={Array.isArray(productsList) ? productsList : []}
                          filterOptions={productFilterOptions}
                          isOptionEqualToValue={(opt, val) => (opt._id || opt.id) === (val._id || val.id)}
                          getOptionLabel={(opt) => {
                            if (!opt) return '';
                            if (typeof opt === 'string') return opt;
                            return opt.name || '';
                          }}
                          value={productsList.find((p) => (p._id || p.id) === line.productId) || null}
                          inputValue={line.productName}
                          onInputChange={(_, v) => {
                            if (v.trim() === '') {
                              updateLine(line.id, 'productId', '');
                              updateLine(line.id, 'productName', '');
                              updateLine(line.id, 'productCode', '');
                              updateLine(line.id, 'barcode', '');
                              updateLine(line.id, 'purchaseDate', null);
                              updateLine(line.id, 'currentStock', 0);
                              updateLine(line.id, 'purchaseRate', 0);
                            } else {
                              updateLine(line.id, 'productName', v);
                            }
                          }}
                          onChange={(_, v) => {
                            if (v && typeof v !== 'string') {
                              handleProductSelect(line.id, v);
                            }
                          }}
                          autoHighlight
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              size="small"
                              variant="outlined"
                              placeholder="Search item name or code..."
                              inputRef={(el) => {
                                itemNameInputRefs.current[line.id] = el;
                              }}
                              onFocus={(e) => {
                                handleTextFieldFocus(e);
                                setActiveLineId(line.id);
                                enterRow(line);
                              }}
                              onKeyDown={(e) => {
                                handleGridArrowNavigation(e, line.id, itemNameInputRefs);
                                if (e.key === 'Enter') {
                                  if (line.productId) {
                                    e.preventDefault();
                                    setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
                                  } else {
                                    const typed = (line.productName || '').trim().toLowerCase();
                                    if (typed) {
                                      const match = productsList.find((p) =>
                                        (p.name && p.name.trim().toLowerCase() === typed) ||
                                        (p.code && p.code.trim().toLowerCase() === typed) ||
                                        (p.systemBarcode && p.systemBarcode.trim() === typed) ||
                                        (p.internationalBarcode && p.internationalBarcode.trim() === typed)
                                      );
                                      if (match) {
                                        e.preventDefault();
                                        handleProductSelect(line.id, match);
                                      }
                                    }
                                  }
                                }
                              }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  bgcolor: 'white',
                                  borderRadius: 0.8,
                                  height: 24,
                                  '& fieldset': { borderColor: '#e2e8f0' },
                                },
                                '& .MuiOutlinedInput-input': {
                                  py: 0,
                                  px: 0.5,
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                },
                              }}
                            />
                          )}
                          renderOption={(props, opt) => (
                            <li
                              {...props}
                              key={opt._id || opt.id}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '4px 10px',
                                cursor: 'pointer',
                              }}
                            >
                              <Box sx={{ width: '100%' }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                                  {opt.name}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, mt: 0.1, alignItems: 'center' }}>
                                  {opt.code && (
                                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.62rem' }}>
                                      Code: {opt.code}
                                    </Typography>
                                  )}
                                  {opt.allowBatches && (
                                    <Chip
                                      label="Batch"
                                      size="small"
                                      color="primary"
                                      sx={{ height: 14, fontSize: '0.55rem', fontWeight: 700 }}
                                    />
                                  )}
                                </Box>
                              </Box>
                            </li>
                          )}
                          ListboxProps={{
                            sx: {
                              p: 0,
                              maxHeight: 220,
                              overflowX: 'hidden',
                              overflowY: 'auto',
                              '& .MuiAutocomplete-option': {
                                minHeight: 'auto',
                                py: 0.5,
                                px: 1.5,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                bgcolor: 'transparent',
                                '&[data-focus="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                                '&[aria-selected="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                                '&.Mui-focused': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                                '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.15) !important', color: '#0f766e' },
                              },
                            },
                          }}
                          componentsProps={{
                            popper: {
                              placement: 'bottom-start',
                              modifiers: [
                                { name: 'flip', enabled: false },
                                { name: 'preventOverflow', enabled: false },
                              ],
                            },
                            paper: {
                              sx: {
                                width: '320px',
                                boxShadow: '0 8px 24px rgba(15,118,110,0.15)',
                                borderRadius: '8px',
                                border: '1px solid #99f6e4',
                                bgcolor: '#ffffff',
                                overflow: 'hidden',
                                mt: 0.5,
                              },
                            },
                          }}
                          sx={{ width: '100%' }}
                        />
                        {line.batchNumber && (
                          <Box sx={{ mt: 0.2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip
                              label={`Batch: ${line.batchNumber}`}
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const prod = productsList.find((p) => (p._id || p.id) === line.productId);
                                if (prod) {
                                  handleProductSelect(line.id, prod);
                                }
                              }}
                              clickable
                              title="Click to change batch"
                              sx={{
                                height: 18,
                                fontSize: '0.60rem',
                                fontWeight: 700,
                                bgcolor: '#e0f2fe',
                                color: '#0369a1',
                                border: '1px solid #bae6fd',
                                cursor: 'pointer',
                                '&:hover': { bgcolor: '#bae6fd' },
                              }}
                            />
                          </Box>
                        )}
                      </TableCell>

                      {/* 3. PURCHASE DATE (READ ONLY) */}
                      <TableCell
                        align="center"
                        sx={{
                          p: '3px 5px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: line.purchaseDate ? '#0369a1' : '#94a3b8',
                          fontSize: '0.68rem',
                          bgcolor: '#f8fafc',
                        }}
                      >
                        {line.purchaseDate ? formatDateDisplay(line.purchaseDate) : '-'}
                      </TableCell>

                      {/* 4. QTY Input */}
                      <TableCell
                        align="center"
                        sx={{
                          p: '2px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                        }}
                      >
                        <TextField
                          size="small"
                          variant="outlined"
                          type="number"
                          value={
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'quantity'
                              ? editingNumericCell.value
                              : line.quantity === 0
                              ? ''
                              : String(line.quantity)
                          }
                          onFocus={(e) => {
                            handleTextFieldFocus(e);
                            setActiveLineId(line.id);
                            enterRow(line);
                            setEditingNumericCell({
                              lineId: line.id,
                              field: 'quantity',
                              value: line.quantity === 0 ? '' : String(line.quantity),
                            });
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingNumericCell({
                              lineId: line.id,
                              field: 'quantity',
                              value: val,
                            });
                          }}
                          onBlur={() => {
                            const raw =
                              editingNumericCell?.lineId === line.id &&
                              editingNumericCell?.field === 'quantity'
                                ? editingNumericCell.value
                                : '';
                            if (raw !== '') {
                              updateLine(line.id, 'quantity', parseNumericInput(raw));
                            }
                            setEditingNumericCell(null);
                          }}
                          onKeyDown={(e) => {
                            handleGridArrowNavigation(e, line.id, qtyInputRefs);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const raw =
                                editingNumericCell?.lineId === line.id &&
                                editingNumericCell?.field === 'quantity'
                                  ? editingNumericCell.value
                                  : '';
                              if (raw !== '') {
                                updateLine(line.id, 'quantity', parseNumericInput(raw));
                              }
                              setEditingNumericCell(null);
                              setTimeout(() => rateInputRefs.current[line.id]?.focus(), 50);
                            }
                          }}
                          inputProps={{
                            min: 0.01,
                            step: 'any',
                            style: { textAlign: 'center', fontSize: '0.68rem', fontWeight: 700 },
                            inputMode: 'decimal',
                          }}
                          fullWidth
                          inputRef={(el) => {
                            qtyInputRefs.current[line.id] = el;
                          }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'white',
                              borderRadius: 0.8,
                              height: 24,
                              '& fieldset': { borderColor: '#e2e8f0' },
                            },
                            '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 },
                          }}
                        />
                      </TableCell>

                      {/* 5. PURCHASE RATE Input */}
                      <TableCell
                        align="right"
                        sx={{
                          p: '2px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                        }}
                      >
                        <TextField
                          size="small"
                          variant="outlined"
                          type="number"
                          value={
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'purchaseRate'
                              ? editingNumericCell.value
                              : line.purchaseRate === 0
                              ? ''
                              : String(line.purchaseRate)
                          }
                          onFocus={(e) => {
                            handleTextFieldFocus(e);
                            setActiveLineId(line.id);
                            enterRow(line);
                            setEditingNumericCell({
                              lineId: line.id,
                              field: 'purchaseRate',
                              value: line.purchaseRate === 0 ? '' : String(line.purchaseRate),
                            });
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingNumericCell({
                              lineId: line.id,
                              field: 'purchaseRate',
                              value: val,
                            });
                          }}
                          onBlur={() => {
                            const raw =
                              editingNumericCell?.lineId === line.id &&
                              editingNumericCell?.field === 'purchaseRate'
                                ? editingNumericCell.value
                                : '';
                            if (raw !== '') {
                              updateLine(line.id, 'purchaseRate', parseNumericInput(raw));
                            }
                            setEditingNumericCell(null);
                          }}
                          onKeyDown={(e) => {
                            handleGridArrowNavigation(e, line.id, rateInputRefs);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const raw =
                                editingNumericCell?.lineId === line.id &&
                                editingNumericCell?.field === 'purchaseRate'
                                  ? editingNumericCell.value
                                  : '';
                              if (raw !== '') {
                                updateLine(line.id, 'purchaseRate', parseNumericInput(raw));
                              }
                              setEditingNumericCell(null);
                              // Commit row and move to next row
                              commitRowAndAdvance(line.id);
                            }
                          }}
                          inputProps={{
                            min: 0,
                            step: 'any',
                            style: { textAlign: 'right', fontSize: '0.68rem', fontWeight: 700 },
                            inputMode: 'decimal',
                          }}
                          fullWidth
                          inputRef={(el) => {
                            rateInputRefs.current[line.id] = el;
                          }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'white',
                              borderRadius: 0.8,
                              height: 24,
                              '& fieldset': { borderColor: '#e2e8f0' },
                            },
                            '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 },
                          }}
                        />
                      </TableCell>

                      {/* 6. TOTAL AMOUNT (READ ONLY / CALCULATED) */}
                      <TableCell
                        align="right"
                        sx={{
                          p: '3px 5px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                          fontWeight: 800,
                          fontSize: '0.70rem',
                          color: '#dc2626',
                        }}
                      >
                        {(() => {
                          const curQty =
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'quantity'
                              ? parseNumericInput(editingNumericCell.value)
                              : line.quantity;
                          const curRate =
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'purchaseRate'
                              ? parseNumericInput(editingNumericCell.value)
                              : line.purchaseRate;
                          const total = parseFloat((curQty * curRate).toFixed(2));
                          return total.toFixed(2);
                        })()}
                      </TableCell>

                      {/* Action (Delete Icon) */}
                      <TableCell
                        sx={{ p: '2px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveRow(index)}
                          sx={{ p: 0.2, color: '#ef4444', '&:hover': { bgcolor: '#fee2e2' } }}
                        >
                          <DeleteIcon sx={{ fontSize: '0.72rem' }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* ─── BOTTOM SUMMARY & ACTION BUTTONS BAR ─── */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              mt: 1.5,
            }}
          >
            {/* Left Summary Cards */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {/* Items Count Box */}
              <Paper
                elevation={0}
                sx={{
                  p: '10px 16px',
                  borderRadius: '10px',
                  bgcolor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  minWidth: 95,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: '#64748b',
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'block',
                  }}
                >
                  ITEMS
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.2, fontSize: '1.25rem' }}>
                  {totalItemsCount}
                </Typography>
              </Paper>

              {/* Total Qty Box */}
              <Paper
                elevation={0}
                sx={{
                  p: '10px 16px',
                  borderRadius: '10px',
                  bgcolor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  minWidth: 105,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: '#64748b',
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'block',
                  }}
                >
                  TOTAL QTY
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.2, fontSize: '1.25rem' }}>
                  {totalQuantityCount}
                </Typography>
              </Paper>

              {/* Damage Loss Box */}
              <Paper
                elevation={0}
                sx={{
                  p: '10px 16px',
                  borderRadius: '10px',
                  bgcolor: '#fef2f2',
                  border: '1px solid #fee2e2',
                }}
              >
                <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 600, fontSize: '0.72rem', display: 'block' }}>
                  ▼ Total Damage Loss · P&L Expense
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#b91c1c', mt: 0.2, fontSize: '1.15rem' }}>
                  AED {totalDamageValue.toFixed(2)}
                </Typography>
              </Paper>
            </Box>

            {/* Right Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                variant="outlined"
                onClick={handleClearForm}
                sx={{
                  borderRadius: '6px',
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  color: '#64748b',
                  borderColor: '#e2e8f0',
                  bgcolor: '#ffffff',
                  px: 2.2,
                  py: 0.8,
                  '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' },
                }}
              >
                Clear all
              </Button>

              <Button
                ref={saveButtonRef}
                variant="contained"
                onClick={handleSaveDamage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveDamage();
                  }
                }}
                disabled={loading || validItems.length === 0}
                sx={{
                  borderRadius: '6px',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  px: 3,
                  py: 0.8,
                  bgcolor: '#0f172a',
                  color: '#ffffff',
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#1e293b', boxShadow: 'none' },
                  '&:focus': { outline: '2px solid #0f766e', outlineOffset: '2px' },
                }}
              >
                {loading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : editingId ? (
                  'Update damage entry'
                ) : (
                  'Save damage entry'
                )}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ─── TAB 1: HISTORY ─── */}
      {activeTab === 'history' && (
        <Box>
          <Paper
            elevation={0}
            sx={{
              p: '14px 18px',
              mb: 1.5,
              borderRadius: '10px',
              bgcolor: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  placeholder="Search by Entry No, reason, product..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  size="small"
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: '#64748b' }} />
                      </InputAdornment>
                    ),
                    sx: { borderRadius: '6px', fontSize: '0.82rem', height: 32 },
                  }}
                />
              </Grid>

              <Grid item xs={6} sm={3}>
                <DateInput label="From Date" value={historyFromDate} onChange={setHistoryFromDate} size="small" />
              </Grid>

              <Grid item xs={6} sm={3}>
                <DateInput label="To Date" value={historyToDate} onChange={setHistoryToDate} size="small" />
              </Grid>

              <Grid item xs={12} sm={2}>
                <Button
                  variant="contained"
                  onClick={loadHistory}
                  fullWidth
                  sx={{
                    borderRadius: '6px',
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: '#0f172a',
                    height: 32,
                    fontSize: '0.82rem',
                    '&:hover': { bgcolor: '#1e293b' },
                  }}
                >
                  Filter
                </Button>
              </Grid>
            </Grid>
          </Paper>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ borderRadius: '10px', bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <Table size="small">
              <TableHead sx={{ bgcolor: '#0f766e' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                    ENTRY NO
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                    DATE
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                    REASON
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                    ITEMS
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                    TOTAL LOSS AMOUNT
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                    ACTIONS
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {historyLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : historyList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                      No damage / wastage records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  historyList.map((row) => (
                    <TableRow key={row._id} hover>
                      <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.75rem' }}>
                        {row.adjustmentNo}
                      </TableCell>
                      <TableCell sx={{ color: '#475569', fontSize: '0.75rem' }}>
                        {row.date ? formatDateDisplay(row.date) : '-'}
                      </TableCell>
                      <TableCell sx={{ color: '#475569', fontSize: '0.75rem' }}>{row.reason}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                        {row.totalItems}
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                        AED {(row.totalLossValue ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedEntryForView(row);
                              setViewDialogOpen(true);
                            }}
                            title="View Details"
                            sx={{ color: '#0284c7', '&:hover': { bgcolor: '#e0f2fe' } }}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleEditHistory(row)}
                            title="Edit Damage Entry"
                            sx={{ color: '#f59e0b', '&:hover': { bgcolor: '#fef3c7' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteHistory(row._id, row.adjustmentNo)}
                            title="Delete & Revert Stock"
                            sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fee2e2' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ─── BATCH SELECTION DIALOG ─── */}
      <Dialog
        open={batchDialogOpen}
        onClose={() => setBatchDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', bgcolor: '#0f766e', color: 'white', py: 1.5 }}>
          Select Product Batch — {pendingBatchProduct?.name}
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2, fontSize: '0.80rem' }}>
            Choose an existing inventory batch or enter a batch number to record damaged stock:
          </Typography>

          {availableBatches.length > 0 ? (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', mb: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.70rem' }}>Batch Number</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.70rem' }}>Purchase Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.70rem' }}>Expiry Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                      Purchase Rate
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                      Available Stock
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {availableBatches.map((b, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontWeight: 700, color: '#0f766e', fontSize: '0.75rem' }}>
                        {b.batchNumber}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#475569' }}>
                        {b.date ? formatDateDisplay(b.date) : '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#475569' }}>
                        {b.expiryDate ? formatDateDisplay(b.expiryDate) : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        AED {(b.purchasePrice ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, color: '#dc2626', fontSize: '0.75rem' }}>
                        {b.quantity}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleSelectBatch(b)}
                          sx={{
                            borderRadius: '4px',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.70rem',
                            bgcolor: '#0f766e',
                            py: 0.2,
                            '&:hover': { bgcolor: '#0b534d' },
                          }}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.80rem' }}>
              No previous batches found for this product. You can enter a custom batch number below.
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Or enter custom batch number..."
              value={customBatchInput}
              onChange={(e) => setCustomBatchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customBatchInput.trim()) {
                  e.preventDefault();
                  handleCreateOrApplyCustomBatch(customBatchInput.trim());
                }
              }}
              fullWidth
              sx={{ '& .MuiOutlinedInput-input': { fontSize: '0.80rem' } }}
            />
            <Button
              variant="outlined"
              onClick={() => handleCreateOrApplyCustomBatch(customBatchInput.trim())}
              disabled={!customBatchInput.trim()}
              sx={{
                whiteSpace: 'nowrap',
                borderRadius: '6px',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.80rem',
              }}
            >
              Apply Custom Batch
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Button onClick={() => setBatchDialogOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── VIEW ENTRY DETAILS DIALOG ─── */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', bgcolor: '#0f766e', color: 'white', py: 1.5 }}>
          Damage Entry Details — {selectedEntryForView?.adjustmentNo}
        </DialogTitle>
        <DialogContent sx={{ p: 2.5 }}>
          {selectedEntryForView && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    DATE
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedEntryForView.date ? formatDateDisplay(selectedEntryForView.date) : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    REASON
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedEntryForView.reason}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    TOTAL LOSS AMOUNT
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#dc2626' }}>
                    AED {(selectedEntryForView.totalLossValue ?? 0).toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    JOURNAL VOUCHER
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f766e' }}>
                    {typeof selectedEntryForView.voucherId === 'object' && selectedEntryForView.voucherId?.voucherNo
                      ? selectedEntryForView.voucherId.voucherNo
                      : selectedEntryForView.voucherId
                      ? String(selectedEntryForView.voucherId)
                      : 'Generated'}
                  </Typography>
                </Grid>
                {selectedEntryForView.narration && (
                  <Grid item xs={12}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                      NARRATION
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#334155' }}>
                      {selectedEntryForView.narration}
                    </Typography>
                  </Grid>
                )}
              </Grid>

              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.70rem' }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.70rem' }}>Barcode</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.70rem' }}>Item Name</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                        Qty
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                        Purchase Rate
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.70rem' }}>
                        Total Amount
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedEntryForView.items.map((item, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontSize: '0.72rem', color: '#64748b' }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{item.barcode || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>
                          {item.productName}
                          {item.batchNumber && (
                            <Chip
                              label={`Batch: ${item.batchNumber}`}
                              size="small"
                              sx={{ ml: 1, height: 16, fontSize: '0.55rem', fontWeight: 700 }}
                            />
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                          {item.quantity}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
                          AED {(item.costPrice ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#dc2626' }}>
                          AED {(item.totalValue ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Button onClick={() => setViewDialogOpen(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
