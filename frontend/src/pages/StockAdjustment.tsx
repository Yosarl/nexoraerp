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
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Card,
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
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  FileDownload as FileDownloadIcon,
  Refresh as RefreshIcon,
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

export interface AdjustmentLineItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  barcode: string;
  batchNumber?: string;
  currentStock: number;
  adjustmentType: 'ADD' | 'REDUCE';
  quantity: number;
  newStock: number;
  costPrice: number;
  totalValue: number;
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
}

const COMMON_REASONS = [
  'Physical audit discrepancy',
  'Damaged Goods',
  'Expired Products',
  'Theft / Pilferage',
  'Found / Excess Stock',
  'Internal Consumption',
  'Scrap / Disposal',
  'Other',
];

export default function StockAdjustment() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Active View: 'new' | 'history'
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Header State
  const [adjustmentNo, setAdjustmentNo] = useState<string>('ADJ-00001');
  const [date, setDate] = useState<string>(getCurrentDate());
  const [primaryReason, setPrimaryReason] = useState<string>('Physical audit discrepancy');
  const [actionType, setActionType] = useState<'ADD' | 'REDUCE'>('REDUCE');
  const [narration, setNarration] = useState<string>('');

  // Product List
  const [productsList, setProductsList] = useState<any[]>([]);

  // Function to create new empty line
  const createEmptyLine = useCallback(
    (): AdjustmentLineItem => ({
      id: Math.random().toString(36).substr(2, 9),
      productId: '',
      productCode: '',
      productName: '',
      barcode: '',
      batchNumber: undefined,
      currentStock: 0,
      adjustmentType: actionType,
      quantity: 1,
      newStock: 0,
      costPrice: 0,
      totalValue: 0,
      reason: primaryReason,
      isCommitted: false,
    }),
    [actionType, primaryReason]
  );

  // Lines Grid State (Starts with one empty editable row like Sales Window)
  const [lines, setLines] = useState<AdjustmentLineItem[]>([
    {
      id: Math.random().toString(36).substr(2, 9),
      productId: '',
      productCode: '',
      productName: '',
      barcode: '',
      batchNumber: undefined,
      currentStock: 0,
      adjustmentType: 'REDUCE',
      quantity: 1,
      newStock: 0,
      costPrice: 0,
      totalValue: 0,
      reason: 'Physical audit discrepancy',
      isCommitted: false,
    },
  ]);

  // Active Row & Inline Numeric Editing State (Sales Window pattern)
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [editingNumericCell, setEditingNumericCell] = useState<{
    lineId: string;
    field: 'quantity' | 'costPrice';
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

  // History State & Filter Mode
  const [historyFilterMode, setHistoryFilterMode] = useState<'adjustment' | 'itemwise'>('adjustment');
  const [selectedFilterProduct, setSelectedFilterProduct] = useState<any | null>(null);
  const [itemActionFilter, setItemActionFilter] = useState<'ALL' | 'ADD' | 'REDUCE'>('ALL');
  const [historyList, setHistoryList] = useState<StockAdjustmentData[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyFromDate, setHistoryFromDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });
  const [historyToDate, setHistoryToDate] = useState<string>(getCurrentDate);
  const [selectedAdjustmentForView, setSelectedAdjustmentForView] =
    useState<StockAdjustmentData | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState<boolean>(false);

  // Input Refs for fast keyboard navigation
  const imeiInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const costInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Row Snapshot & Commit Refs (Sales Window pattern: uncommitted edits to a previously committed row are reverted on switch)
  const rowSnapshotRef = useRef<{ lineId: string; data: AdjustmentLineItem } | null>(null);
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

  const enterRow = useCallback((line: AdjustmentLineItem) => {
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

  // Filter for product Autocomplete matching Sales Window pattern
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

  // Number input parser matching Sales Window pattern
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

  // Fetch Next Adjustment Number
  const fetchNextNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await stockAdjustmentApi.getNextNo(companyId, financialYearId, {
        entryType: 'ADJUSTMENT',
        prefix: 'ADJ',
      });
      if (res.data?.data?.adjustmentNo) {
        setAdjustmentNo(res.data.data.adjustmentNo);
      }
    } catch (err: any) {
      console.error('Failed to get next adjustment number:', err);
    }
  }, [companyId, financialYearId]);

  // Load Products for search
  const loadProducts = useCallback(
    async (searchQuery?: string) => {
      if (!companyId) return;
      try {
        const res = await productApi.list(companyId, { search: searchQuery, limit: 5000 });
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
  const loadHistory = useCallback(
    async (customProdId?: string) => {
      if (!companyId || !financialYearId) return;
      setHistoryLoading(true);
      try {
        const activeProdId =
          customProdId !== undefined
            ? customProdId
            : selectedFilterProduct
            ? selectedFilterProduct._id || selectedFilterProduct.id
            : undefined;
        const res = await stockAdjustmentApi.list(companyId, financialYearId, {
          entryType: 'ADJUSTMENT',
          prefix: 'ADJ',
          search: historySearch || undefined,
          fromDate: historyFromDate || undefined,
          toDate: historyToDate || undefined,
          productId: activeProdId || undefined,
          limit: 500,
        });
        setHistoryList(res.data?.data?.list || []);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setHistoryLoading(false);
      }
    },
    [companyId, financialYearId, historySearch, historyFromDate, historyToDate, selectedFilterProduct]
  );

  const linesRef = useRef<AdjustmentLineItem[]>(lines);
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
    (lineId: string, field: keyof AdjustmentLineItem, value: any) => {
      setLines((prev) => {
        return prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = { ...line, [field]: value };

          // Recalculate new stock & line total
          const qty = field === 'quantity' ? Number(value) : line.quantity;
          const cost = field === 'costPrice' ? Number(value) : line.costPrice;
          const type = field === 'adjustmentType' ? value : line.adjustmentType;
          const curr = field === 'currentStock' ? Number(value) : line.currentStock;

          updated.newStock = type === 'ADD' ? curr + qty : curr - qty;
          updated.totalValue = parseFloat((qty * cost).toFixed(2));

          return updated;
        });
      });
    },
    []
  );

  // Handle Product Selection in a Grid Row
  const handleProductSelect = async (lineId: string, product: any | null) => {
    if (!product || typeof product !== 'object') {
      updateLine(lineId, 'productId', '');
      updateLine(lineId, 'productName', '');
      updateLine(lineId, 'productCode', '');
      updateLine(lineId, 'barcode', '');
      updateLine(lineId, 'currentStock', 0);
      updateLine(lineId, 'costPrice', 0);
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

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const newStock =
          line.adjustmentType === 'ADD' ? liveStock + line.quantity : liveStock - line.quantity;
        const totalVal = parseFloat((line.quantity * defaultCost).toFixed(2));
        return {
          ...line,
          productId: String(prodId),
          productCode: prodCode,
          productName: prodName,
          barcode,
          batchNumber: undefined,
          currentStock: liveStock,
          costPrice: defaultCost,
          newStock,
          totalValue: totalVal,
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

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== pendingBatchLineId) return line;
        const newStock =
          line.adjustmentType === 'ADD' ? batchStock + line.quantity : batchStock - line.quantity;
        const totalVal = parseFloat((line.quantity * batchCost).toFixed(2));
        return {
          ...line,
          productId: String(prodId),
          productCode: prodCode,
          productName: prodName,
          barcode,
          batchNumber: batch.batchNumber,
          currentStock: batchStock,
          costPrice: batchCost,
          newStock,
          totalValue: totalVal,
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

    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== pendingBatchLineId) return line;
        const newStock =
          line.adjustmentType === 'ADD' ? batchStock + line.quantity : batchStock - line.quantity;
        const totalVal = parseFloat((line.quantity * batchCost).toFixed(2));
        return {
          ...line,
          productId: String(prodId),
          productCode: prodCode,
          productName: prodName,
          barcode,
          batchNumber: batchNo.trim(),
          currentStock: batchStock,
          costPrice: batchCost,
          newStock,
          totalValue: totalVal,
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

  // Toggle Add / Reduce
  const handleToggleRowType = (index: number) => {
    setLines((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const newType = item.adjustmentType === 'ADD' ? 'REDUCE' : 'ADD';
      const newStock =
        newType === 'ADD' ? item.currentStock + item.quantity : item.currentStock - item.quantity;
      updated[index] = { ...item, adjustmentType: newType, newStock };
      return updated;
    });
  };

  // Commit Line and move to Next Row (Sales Window pattern)
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

  // Handle IMEI / Barcode scan or entry in grid row
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

  // Computed Totals (Only committed or valid items)
  const validItems = lines.filter((l) => l.productId && l.quantity > 0);
  const totalItemsCount = validItems.length;
  const totalLossValue = validItems
    .filter((it) => it.adjustmentType === 'REDUCE')
    .reduce((sum, it) => sum + it.totalValue, 0);
  const totalGainValue = validItems
    .filter((it) => it.adjustmentType === 'ADD')
    .reduce((sum, it) => sum + it.totalValue, 0);
  const netAdjustmentValue = totalGainValue - totalLossValue;

  // Active Line Info for Banner
  const activeLine = lines.find((l) => l.id === activeLineId) || validItems[validItems.length - 1];

  // Save or Update Adjustment
  const handleSaveAdjustment = async () => {
    if (!companyId || !financialYearId) {
      setErrorMessage('Please select a company and financial year first.');
      return;
    }

    // Flush any pending numeric input before saving
    let currentLines = lines;
    if (editingNumericCell) {
      const parsedVal = parseNumericInput(editingNumericCell.value);
      currentLines = lines.map((l) => {
        if (l.id !== editingNumericCell.lineId) return l;
        const updated = { ...l, [editingNumericCell.field]: parsedVal };
        const qty = editingNumericCell.field === 'quantity' ? parsedVal : l.quantity;
        const cost = editingNumericCell.field === 'costPrice' ? parsedVal : l.costPrice;
        updated.newStock = l.adjustmentType === 'ADD' ? l.currentStock + qty : l.currentStock - qty;
        updated.totalValue = parseFloat((qty * cost).toFixed(2));
        return updated;
      });
      setLines(currentLines);
      setEditingNumericCell(null);
    }

    const itemsToSave = currentLines.filter((l) => l.productId && l.quantity > 0);
    if (itemsToSave.length === 0) {
      setErrorMessage('Please add at least one valid product to adjust.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const payload: StockAdjustmentPayload = {
        companyId,
        financialYearId,
        entryType: 'ADJUSTMENT',
        prefix: 'ADJ',
        date,
        reason: primaryReason,
        narration,
        items: itemsToSave.map((it) => ({
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          barcode: it.barcode,
          batchNumber: it.batchNumber,
          adjustmentType: it.adjustmentType,
          quantity: it.quantity,
          costPrice: it.costPrice,
          reason: it.reason || primaryReason,
        })),
      };

      if (editingId) {
        const res = await stockAdjustmentApi.update(editingId, payload);
        if (res.data?.success) {
          setSuccessMessage(
            `Stock Adjustment ${res.data.data.adjustmentNo} updated successfully!`
          );
          handleClearForm();
        }
      } else {
        const res = await stockAdjustmentApi.create(payload);
        if (res.data?.success) {
          setSuccessMessage(
            `Stock Adjustment ${res.data.data.adjustmentNo} saved successfully!`
          );
          handleClearForm();
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save stock adjustment';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  // Clear Form / Cancel Editing
  const handleClearForm = () => {
    commitRowEdits();
    setEditingId(null);
    const newLine = createEmptyLine();
    setLines([newLine]);
    setActiveLineId(newLine.id);
    setEditingNumericCell(null);
    setNarration('');
    setErrorMessage('');
    setSuccessMessage('');
    fetchNextNo();
    setTimeout(() => {
      imeiInputRefs.current[newLine.id]?.focus();
    }, 60);
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // Load Adjustment for Editing
  const handleEditAdjustment = async (adj: StockAdjustmentData) => {
    setLoading(true);
    try {
      const res = await stockAdjustmentApi.getById(adj._id, companyId!);
      const data = res.data?.data || adj;
      setEditingId(data._id);
      setAdjustmentNo(data.adjustmentNo);
      setDate(data.date ? data.date.split('T')[0] : getCurrentDate());
      setPrimaryReason(data.reason || 'Physical audit discrepancy');
      setNarration(data.narration || '');

      const loadedLines: AdjustmentLineItem[] = data.items.map((it: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        productId: it.productId._id || it.productId,
        productCode: it.productCode || '',
        productName: it.productName || '',
        barcode: it.barcode || '',
        batchNumber: it.batchNumber || '',
        currentStock: it.currentStock ?? 0,
        adjustmentType: it.adjustmentType,
        quantity: it.quantity,
        newStock: it.newStock ?? 0,
        costPrice: it.costPrice ?? 0,
        totalValue: it.totalValue ?? 0,
        reason: it.reason || '',
        isCommitted: true,
      }));

      // Append one fresh empty line at end
      loadedLines.push(createEmptyLine());

      setLines(loadedLines);
      setActiveTab('new');
      setSuccessMessage(`Editing Stock Adjustment ${data.adjustmentNo}`);
    } catch (err) {
      setErrorMessage('Failed to load adjustment details for edit.');
    } finally {
      setLoading(false);
    }
  };

  const routeLocation = useLocation();
  const navigate = useNavigate();

  // Auto-load adjustment if navigated with adjustmentId or id in location state
  useEffect(() => {
    const state = routeLocation.state as { adjustmentId?: string; id?: string; adjustmentNo?: string } | null;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = state?.adjustmentId || state?.id || urlParams.get('id');
    if (targetId && companyId) {
      handleEditAdjustment({ _id: targetId } as any);
      navigate(routeLocation.pathname, { replace: true, state: {} });
    }
  }, [companyId, routeLocation.state, routeLocation.pathname, navigate]);

  // Navigation handlers
  const currentNavIndex = useMemo(() => {
    if (!editingId) return -1;
    return historyList.findIndex((r) => r._id === editingId || r.adjustmentNo === adjustmentNo);
  }, [historyList, editingId, adjustmentNo]);

  const navFirst = useCallback(() => {
    if (historyList.length === 0) return;
    handleEditAdjustment(historyList[historyList.length - 1]);
  }, [historyList, handleEditAdjustment]);

  const navPrev = useCallback(() => {
    if (historyList.length === 0) return;
    if (currentNavIndex < 0) {
      handleEditAdjustment(historyList[0]);
      return;
    }
    const targetIdx = currentNavIndex < historyList.length - 1 ? currentNavIndex + 1 : historyList.length - 1;
    handleEditAdjustment(historyList[targetIdx]);
  }, [historyList, currentNavIndex, handleEditAdjustment]);

  const navNext = useCallback(() => {
    if (historyList.length === 0) return;
    if (currentNavIndex <= 0) return;
    const targetIdx = currentNavIndex - 1;
    handleEditAdjustment(historyList[targetIdx]);
  }, [historyList, currentNavIndex, handleEditAdjustment]);

  const navLast = useCallback(() => {
    if (historyList.length === 0) return;
    handleEditAdjustment(historyList[0]);
  }, [historyList, handleEditAdjustment]);

  // Delete Adjustment
  const handleDeleteAdjustment = async (id: string, adjNo: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete and reverse Stock Adjustment ${adjNo}? This will revert inventory and cancel the accounting journal voucher.`
      )
    ) {
      return;
    }
    if (!companyId) return;
    try {
      await stockAdjustmentApi.delete(id, companyId);
      setSuccessMessage(`Stock Adjustment ${adjNo} deleted and reversed successfully.`);
      if (editingId === id) {
        handleClearForm();
      }
      if (activeTab === 'history') {
        loadHistory();
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to delete adjustment');
    }
  };

  const handleOpenDetails = (adj: StockAdjustmentData) => {
    setSelectedAdjustmentForView(adj);
    setViewDialogOpen(true);
  };

  // Flatten all items across adjustments for Item-Wise View
  const itemWiseRows = useMemo(() => {
    const list: Array<{
      id: string;
      adjustmentId: string;
      adjustmentNo: string;
      date: string;
      primaryReason: string;
      narration?: string;
      productId: string;
      productCode: string;
      productName: string;
      barcode: string;
      batchNumber?: string;
      adjustmentType: 'ADD' | 'REDUCE';
      currentStock: number;
      quantity: number;
      newStock: number;
      costPrice: number;
      totalValue: number;
      reason?: string;
      rawAdjustment: StockAdjustmentData;
    }> = [];

    const selectedId = selectedFilterProduct
      ? String(selectedFilterProduct._id || selectedFilterProduct.id)
      : null;

    for (const adj of historyList) {
      if (!Array.isArray(adj.items)) continue;
      for (let idx = 0; idx < adj.items.length; idx++) {
        const it = adj.items[idx];
        const itProdId = it.productId ? String(it.productId) : '';

        // Product-wise filter
        if (selectedId && itProdId && itProdId !== selectedId) {
          continue;
        }

        // Action type filter: ALL | ADD | REDUCE
        if (itemActionFilter !== 'ALL' && it.adjustmentType !== itemActionFilter) {
          continue;
        }

        // History search query filter
        if (historySearch.trim()) {
          const q = historySearch.trim().toLowerCase();
          const match =
            (adj.adjustmentNo && adj.adjustmentNo.toLowerCase().includes(q)) ||
            (it.productName && it.productName.toLowerCase().includes(q)) ||
            (it.productCode && it.productCode.toLowerCase().includes(q)) ||
            (it.barcode && it.barcode.toLowerCase().includes(q)) ||
            (it.batchNumber && it.batchNumber.toLowerCase().includes(q)) ||
            (it.reason && it.reason.toLowerCase().includes(q)) ||
            (adj.reason && adj.reason.toLowerCase().includes(q)) ||
            (adj.narration && adj.narration.toLowerCase().includes(q));
          if (!match) continue;
        }

        list.push({
          id: `${adj._id}_${idx}`,
          adjustmentId: adj._id,
          adjustmentNo: adj.adjustmentNo,
          date: adj.date,
          primaryReason: adj.reason,
          narration: adj.narration,
          productId: itProdId,
          productCode: it.productCode || '',
          productName: it.productName || '',
          barcode: it.barcode || '',
          batchNumber: it.batchNumber || '',
          adjustmentType: it.adjustmentType,
          currentStock: it.currentStock ?? 0,
          quantity: it.quantity ?? 0,
          newStock: it.newStock ?? 0,
          costPrice: it.costPrice ?? 0,
          totalValue: it.totalValue ?? 0,
          reason: it.reason || adj.reason || '',
          rawAdjustment: adj,
        });
      }
    }

    return list;
  }, [historyList, selectedFilterProduct, itemActionFilter, historySearch]);

  const itemWiseTotals = useMemo(() => {
    let totalAddQty = 0;
    let totalReduceQty = 0;
    let totalGainValue = 0;
    let totalLossValue = 0;

    for (const r of itemWiseRows) {
      if (r.adjustmentType === 'ADD') {
        totalAddQty += r.quantity;
        totalGainValue += r.totalValue;
      } else {
        totalReduceQty += r.quantity;
        totalLossValue += r.totalValue;
      }
    }

    const netValue = totalGainValue - totalLossValue;
    const netQty = totalAddQty - totalReduceQty;

    return {
      totalRecords: itemWiseRows.length,
      totalAddQty,
      totalReduceQty,
      netQty,
      totalGainValue,
      totalLossValue,
      netValue,
    };
  }, [itemWiseRows]);

  const historyTotals = useMemo(() => {
    let totalLoss = 0;
    let totalGain = 0;
    let totalItems = 0;

    for (const row of historyList) {
      totalLoss += row.totalLossValue || 0;
      totalGain += row.totalGainValue || 0;
      totalItems += row.totalItems || 0;
    }

    return {
      totalCount: historyList.length,
      totalItems,
      totalLoss,
      totalGain,
      netImpact: totalGain - totalLoss,
    };
  }, [historyList]);

  // Export CSV handler
  const handleExportCSV = () => {
    if (historyFilterMode === 'adjustment') {
      if (!historyList.length) return;
      const headers = [
        'Adjustment No',
        'Date',
        'Primary Reason',
        'Total Items',
        'Total Loss (AED)',
        'Total Gain (AED)',
        'Net Impact (AED)',
        'Narration',
      ];
      const csvRows = historyList.map((row) => [
        `"${row.adjustmentNo}"`,
        `"${row.date ? formatDateDisplay(row.date) : ''}"`,
        `"${(row.reason || '').replace(/"/g, '""')}"`,
        row.totalItems || 0,
        (row.totalLossValue || 0).toFixed(2),
        (row.totalGainValue || 0).toFixed(2),
        (row.netAdjustmentValue || 0).toFixed(2),
        `"${(row.narration || '').replace(/"/g, '""')}"`,
      ]);
      const csvContent =
        'data:text/csv;charset=utf-8,\uFEFF' +
        [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\r\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `StockAdjustments_${historyFromDate}_to_${historyToDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (!itemWiseRows.length) return;
      const headers = [
        'Date',
        'Adjustment No',
        'Product Code',
        'Product Name',
        'Barcode',
        'Batch No',
        'Type',
        'Prev Stock',
        'Adjusted Qty',
        'New Stock',
        'Cost Price (AED)',
        'Total Value (AED)',
        'Reason',
      ];
      const csvRows = itemWiseRows.map((r) => [
        `"${r.date ? formatDateDisplay(r.date) : ''}"`,
        `"${r.adjustmentNo}"`,
        `"${(r.productCode || '').replace(/"/g, '""')}"`,
        `"${(r.productName || '').replace(/"/g, '""')}"`,
        `"${(r.barcode || '').replace(/"/g, '""')}"`,
        `"${(r.batchNumber || '').replace(/"/g, '""')}"`,
        `"${r.adjustmentType}"`,
        r.currentStock,
        r.adjustmentType === 'ADD' ? `+${r.quantity}` : `-${r.quantity}`,
        r.newStock,
        r.costPrice.toFixed(2),
        r.totalValue.toFixed(2),
        `"${(r.reason || '').replace(/"/g, '""')}"`,
      ]);
      const csvContent =
        'data:text/csv;charset=utf-8,\uFEFF' +
        [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\r\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `StockAdjustment_ItemWise_${historyFromDate}_to_${historyToDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Box
      sx={{
        p: 2.5,
        maxWidth: 1440,
        margin: '0 auto',
        bgcolor: '#f1f5f9',
        minHeight: '100vh',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── TITLE & TOP SWITCHER BAR ─── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', fontSize: '1.25rem' }}
          >
            Stock Adjustment
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.82rem', mt: 0.2 }}>
            Reconcile physical stock with system inventory. Posts a Journal Voucher to the General Ledger on save.
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
            New adjustment
          </Button>

          <Button
            size="small"
            onClick={() => {
              setActiveTab('history');
              setHistoryFilterMode('adjustment');
            }}
            sx={{
              px: 2,
              py: 0.5,
              borderRadius: '6px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              bgcolor: activeTab === 'history' && historyFilterMode === 'adjustment' ? '#ffffff' : 'transparent',
              color: activeTab === 'history' && historyFilterMode === 'adjustment' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'history' && historyFilterMode === 'adjustment' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              '&:hover': {
                bgcolor: activeTab === 'history' && historyFilterMode === 'adjustment' ? '#ffffff' : 'rgba(255,255,255,0.5)',
              },
            }}
          >
            History
          </Button>

          <Button
            size="small"
            onClick={() => {
              setActiveTab('history');
              setHistoryFilterMode('itemwise');
            }}
            sx={{
              px: 2,
              py: 0.5,
              borderRadius: '6px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              bgcolor: activeTab === 'history' && historyFilterMode === 'itemwise' ? '#ffffff' : 'transparent',
              color: activeTab === 'history' && historyFilterMode === 'itemwise' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'history' && historyFilterMode === 'itemwise' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              '&:hover': {
                bgcolor: activeTab === 'history' && historyFilterMode === 'itemwise' ? '#ffffff' : 'rgba(255,255,255,0.5)',
              },
            }}
          >
            Item-Wise Details
          </Button>
        </Box>
      </Box>

      {/* Alerts */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 1.5, borderRadius: 1.5 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: 1.5 }} onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      {/* ─── TAB 0: NEW / EDIT ADJUSTMENT ─── */}
      {activeTab === 'new' && (
        <Box>
          {/* Header Card (Matching Sales Window Header & Live Product Info) */}
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
              {/* Adjustment No & Navigation Buttons */}
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
                    ADJUSTMENT NO
                  </Typography>

                  {/* Navigation buttons */}
                  <Box sx={{ display: 'inline-flex', gap: 0.3, alignItems: 'center' }}>
                    <Tooltip title="First Adjustment">
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
                    <Tooltip title="Previous Adjustment">
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
                    <Tooltip title="Next Adjustment">
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
                    <Tooltip title="Last Adjustment">
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
                  value={adjustmentNo}
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

              {/* Primary Reason */}
              <Grid item xs={12} sm={4} md={2.5} lg={2.2}>
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
                  PRIMARY REASON
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
                  {COMMON_REASONS.map((r) => (
                    <MenuItem key={r} value={r} sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Default Action */}
              <Grid item xs={6} sm={4} md={2} lg={1.6}>
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
                  ACTION
                </Typography>
                <TextField
                  select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as any)}
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
                  <MenuItem value="REDUCE" sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626' }}>
                    ▼ Reduce (-)
                  </MenuItem>
                  <MenuItem value="ADD" sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a' }}>
                    ▲ Add (+)
                  </MenuItem>
                </TextField>
              </Grid>

              {/* Narration */}
              <Grid item xs={12} sm={8} md={4.5} lg={4.6}>
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
                  REMARKS
                </Typography>
                <TextField
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Optional note..."
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
                          Live Stock
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.2, color: '#dc2626' }}>
                          {activeLine.currentStock}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>
                          Cost Rate
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f766e', lineHeight: 1.2 }}>
                          AED {activeLine.costPrice.toFixed(2)}
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
                      Select or type a product in the grid table below to view live details
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* ===== PRODUCT GRID (MATCHING SALES WINDOW DESIGN & COMMIT LOGIC) ===== */}
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
                      { label: 'ITEM IMEI / BARCODE', w: '140px', align: 'left' },
                      { label: 'ITEM NAME', w: 'auto', align: 'left' },
                      { label: 'CURRENT', w: '85px', align: 'right' },
                      { label: 'TYPE', w: '100px', align: 'center' },
                      { label: 'QTY', w: '80px', align: 'center' },
                      { label: 'NEW STOCK', w: '95px', align: 'center' },
                      { label: 'COST', w: '95px', align: 'right' },
                      { label: 'DIFF (AED)', w: '110px', align: 'right' },
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
                          borderRight: ci < 9 ? '1px solid rgba(255,255,255,0.15)' : 'none',
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

                      {/* ITEM IMEI / BARCODE */}
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
                          placeholder="Scan / IMEI"
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

                      {/* ITEM (Product Search Autocomplete directly inside grid cell) */}
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
                              updateLine(line.id, 'currentStock', 0);
                              updateLine(line.id, 'costPrice', 0);
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
                              placeholder="Search item or scan..."
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

                      {/* CURRENT STOCK */}
                      <TableCell
                        align="right"
                        sx={{
                          p: '3px 5px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: '#475569',
                          fontSize: '0.68rem',
                        }}
                      >
                        {line.currentStock}
                      </TableCell>

                      {/* TYPE (Pill Badge) */}
                      <TableCell
                        align="center"
                        sx={{
                          p: '2px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                        }}
                      >
                        <Box
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRowType(index);
                          }}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.3,
                            px: 1,
                            py: 0.2,
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            bgcolor: line.adjustmentType === 'REDUCE' ? '#fee2e2' : '#dcfce7',
                            color: line.adjustmentType === 'REDUCE' ? '#dc2626' : '#16a34a',
                            userSelect: 'none',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              opacity: 0.85,
                            },
                          }}
                          title="Click to toggle Add/Reduce"
                        >
                          {line.adjustmentType === 'REDUCE' ? '▼ Reduce' : '▲ Add'}
                        </Box>
                      </TableCell>

                      {/* QTY Input with Smooth Typing */}
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
                              setTimeout(() => costInputRefs.current[line.id]?.focus(), 50);
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

                      {/* NEW STOCK */}
                      <TableCell
                        align="center"
                        sx={{
                          p: '3px 5px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: '#0f172a',
                          fontSize: '0.68rem',
                        }}
                      >
                        {(() => {
                          const curQty =
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'quantity'
                              ? parseNumericInput(editingNumericCell.value)
                              : line.quantity;
                          return line.adjustmentType === 'ADD'
                            ? line.currentStock + curQty
                            : line.currentStock - curQty;
                        })()}
                      </TableCell>

                      {/* COST Input with Commit Logic & Advance to Next Row on Enter */}
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
                            editingNumericCell?.field === 'costPrice'
                              ? editingNumericCell.value
                              : line.costPrice === 0
                              ? ''
                              : String(line.costPrice)
                          }
                          onFocus={(e) => {
                            handleTextFieldFocus(e);
                            setActiveLineId(line.id);
                            enterRow(line);
                            setEditingNumericCell({
                              lineId: line.id,
                              field: 'costPrice',
                              value: line.costPrice === 0 ? '' : String(line.costPrice),
                            });
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingNumericCell({
                              lineId: line.id,
                              field: 'costPrice',
                              value: val,
                            });
                          }}
                          onBlur={() => {
                            const raw =
                              editingNumericCell?.lineId === line.id &&
                              editingNumericCell?.field === 'costPrice'
                                ? editingNumericCell.value
                                : '';
                            if (raw !== '') {
                              updateLine(line.id, 'costPrice', parseNumericInput(raw));
                            }
                            setEditingNumericCell(null);
                          }}
                          onKeyDown={(e) => {
                            handleGridArrowNavigation(e, line.id, costInputRefs);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const raw =
                                editingNumericCell?.lineId === line.id &&
                                editingNumericCell?.field === 'costPrice'
                                  ? editingNumericCell.value
                                  : '';
                              if (raw !== '') {
                                updateLine(line.id, 'costPrice', parseNumericInput(raw));
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
                            costInputRefs.current[line.id] = el;
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

                      {/* DIFF (AED) */}
                      <TableCell
                        align="right"
                        sx={{
                          p: '3px 5px',
                          borderRight: '1px solid #f0f0f0',
                          borderBottom: '1px solid #cbd5e1',
                          fontWeight: 800,
                          fontSize: '0.70rem',
                          color: line.adjustmentType === 'REDUCE' ? '#dc2626' : '#16a34a',
                        }}
                      >
                        {(() => {
                          const curQty =
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'quantity'
                              ? parseNumericInput(editingNumericCell.value)
                              : line.quantity;
                          const curCost =
                            editingNumericCell?.lineId === line.id &&
                            editingNumericCell?.field === 'costPrice'
                              ? parseNumericInput(editingNumericCell.value)
                              : line.costPrice;
                          const diff = parseFloat((curQty * curCost).toFixed(2));
                          return `${line.adjustmentType === 'REDUCE' ? '-' : '+'}${diff.toFixed(2)}`;
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

              {/* Loss Box */}
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
                  ▼ Stock loss · Debit P&L expense
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#b91c1c', mt: 0.2, fontSize: '1.05rem' }}>
                  AED {totalLossValue.toFixed(2)}
                </Typography>
              </Paper>

              {/* Gain Box */}
              <Paper
                elevation={0}
                sx={{
                  p: '10px 16px',
                  borderRadius: '10px',
                  bgcolor: '#f0fdf4',
                  border: '1px solid #dcfce7',
                }}
              >
                <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 600, fontSize: '0.72rem', display: 'block' }}>
                  ▲ Stock gain · Credit P&L income
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#15803d', mt: 0.2, fontSize: '1.05rem' }}>
                  AED {totalGainValue.toFixed(2)}
                </Typography>
              </Paper>

              {/* Net Impact Box */}
              <Paper
                elevation={0}
                sx={{
                  p: '10px 16px',
                  borderRadius: '10px',
                  bgcolor: '#ffffff',
                  border: '1px solid #e2e8f0',
                }}
              >
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.72rem', display: 'block' }}>
                  Net stock impact · Balance Sheet
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 800,
                    mt: 0.2,
                    fontSize: '1.05rem',
                    color: netAdjustmentValue >= 0 ? '#16a34a' : '#dc2626',
                  }}
                >
                  {netAdjustmentValue >= 0 ? '+' : ''} AED {netAdjustmentValue.toFixed(2)}
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
                onClick={handleSaveAdjustment}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveAdjustment();
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
                  'Update stock adjustment'
                ) : (
                  'Save stock adjustment'
                )}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ─── TAB 1: HISTORY (ADJUSTMENT-WISE & ITEM-WISE) ─── */}
      {activeTab === 'history' && (
        <Box>
          {/* Filter & Control Panel */}
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              mb: 1.5,
              borderRadius: '10px',
              bgcolor: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* ROW 1: PRIMARY FILTER MODE & ACTION BUTTONS */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                pb: 1,
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FilterListIcon sx={{ color: '#0f766e', fontSize: 16 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#1e293b' }}>
                  Filter Mode:
                </Typography>

                <FormControl component="fieldset">
                  <RadioGroup
                    row
                    value={historyFilterMode}
                    onChange={(e) => {
                      setHistoryFilterMode(e.target.value as 'adjustment' | 'itemwise');
                    }}
                    sx={{ gap: 1 }}
                  >
                    {/* 1. Adjustment Wise */}
                    <FormControlLabel
                      value="adjustment"
                      control={
                        <Radio
                          size="small"
                          sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 14 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                        />
                      }
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography
                            sx={{
                              fontSize: '0.72rem',
                              fontWeight: historyFilterMode === 'adjustment' ? 700 : 500,
                              color: historyFilterMode === 'adjustment' ? '#0f766e' : '#334155',
                            }}
                          >
                            Adjustment Wise (Default)
                          </Typography>
                          {historyFilterMode === 'adjustment' && (
                            <Chip label="Active" size="small" sx={{ height: 15, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.3 }} />
                          )}
                        </Box>
                      }
                      sx={{
                        m: 0,
                        px: 0.9,
                        py: 0.15,
                        borderRadius: 1.2,
                        bgcolor: historyFilterMode === 'adjustment' ? '#f0fdfa' : 'transparent',
                        border: historyFilterMode === 'adjustment' ? '1px solid #99f6e4' : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    />

                    {/* 2. Item Wise */}
                    <FormControlLabel
                      value="itemwise"
                      control={
                        <Radio
                          size="small"
                          sx={{ p: 0.2, '& .MuiSvgIcon-root': { fontSize: 14 }, color: '#0f766e', '&.Mui-checked': { color: '#0f766e' } }}
                        />
                      }
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography
                            sx={{
                              fontSize: '0.72rem',
                              fontWeight: historyFilterMode === 'itemwise' ? 700 : 500,
                              color: historyFilterMode === 'itemwise' ? '#0f766e' : '#334155',
                            }}
                          >
                            Item Wise (Product Details)
                          </Typography>
                          {historyFilterMode === 'itemwise' && (
                            <Chip label="Active" size="small" sx={{ height: 15, fontSize: '0.52rem', bgcolor: '#ccfbf1', color: '#0f766e', fontWeight: 700, px: 0.3 }} />
                          )}
                        </Box>
                      }
                      sx={{
                        m: 0,
                        px: 0.9,
                        py: 0.15,
                        borderRadius: 1.2,
                        bgcolor: historyFilterMode === 'itemwise' ? '#f0fdfa' : 'transparent',
                        border: historyFilterMode === 'itemwise' ? '1px solid #99f6e4' : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    />
                  </RadioGroup>
                </FormControl>
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshIcon sx={{ fontSize: 13 }} />}
                  onClick={() => loadHistory()}
                  disabled={historyLoading}
                  sx={{
                    height: 26,
                    px: 1,
                    fontSize: '0.70rem',
                    borderRadius: 1.2,
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
                  disabled={historyFilterMode === 'adjustment' ? !historyList.length : !itemWiseRows.length}
                  sx={{
                    height: 26,
                    px: 1,
                    fontSize: '0.70rem',
                    borderRadius: 1.2,
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
              </Box>
            </Box>

            {/* ROW 2: SUB-FILTER PRODUCT SELECTOR (SHOWN WHEN ITEM-WISE FILTER IS ACTIVE, MATCHING SALES REPORT) */}
            {historyFilterMode === 'itemwise' && (
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 1.2,
                  p: 0.9,
                  my: 1,
                  borderRadius: 1.5,
                  bgcolor: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                }}
              >
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', minWidth: 110 }}>
                  Filter by Product:
                </Typography>

                <Box sx={{ minWidth: 280, flex: 1, maxWidth: 500 }}>
                  <Autocomplete
                    size="small"
                    options={productsList}
                    value={selectedFilterProduct}
                    onChange={(_, newValue) => {
                      setSelectedFilterProduct(newValue);
                      loadHistory(newValue ? String(newValue._id || newValue.id) : '');
                    }}
                    getOptionLabel={(option) => {
                      if (!option) return '';
                      const codePart = option.code ? ` (${option.code})` : '';
                      const barcodePart = option.systemBarcode || option.barcode ? ` [${option.systemBarcode || option.barcode}]` : '';
                      return `${option.name || ''}${codePart}${barcodePart}`;
                    }}
                    isOptionEqualToValue={(option, value) => {
                      const oId = option._id || option.id;
                      const vId = value._id || value.id;
                      return oId && vId ? String(oId) === String(vId) : false;
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="All Products (Detailed Item Adjustment History)"
                        sx={{
                          bgcolor: '#ffffff',
                          '& .MuiOutlinedInput-root': {
                            height: 28,
                            minHeight: 28,
                            fontSize: '0.72rem',
                            py: 0,
                            px: 0.6,
                            borderRadius: 1.2,
                          },
                          '& .MuiInputBase-input': {
                            fontSize: '0.72rem',
                            py: '2px !important',
                          },
                        }}
                      />
                    )}
                    renderOption={(props, option) => (
                      <li {...props} key={option._id || option.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '4px 8px' }}>
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: '#0f172a' }}>
                          {option.name}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.8, mt: 0.2 }}>
                          {option.code && <Chip label={`Code: ${option.code}`} size="small" sx={{ height: 16, fontSize: '0.60rem', bgcolor: '#e2e8f0' }} />}
                          {(option.systemBarcode || option.barcode) && (
                            <Chip
                              label={`Barcode: ${option.systemBarcode || option.barcode}`}
                              size="small"
                              sx={{ height: 16, fontSize: '0.60rem', bgcolor: '#fef3c7', color: '#92400e' }}
                            />
                          )}
                        </Box>
                      </li>
                    )}
                  />
                </Box>

                {selectedFilterProduct && (
                  <Button
                    size="small"
                    variant="text"
                    color="secondary"
                    startIcon={<ClearIcon sx={{ fontSize: 13 }} />}
                    onClick={() => {
                      setSelectedFilterProduct(null);
                      loadHistory('');
                    }}
                    sx={{ height: 26, textTransform: 'none', fontWeight: 600, fontSize: '0.68rem', color: '#64748b' }}
                  >
                    Clear to "All Products"
                  </Button>
                )}

                {/* Adjustment Action Filter (ALL | ADD | REDUCE) */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>
                    Type:
                  </Typography>
                  <Box sx={{ display: 'inline-flex', bgcolor: '#e2e8f0', p: '2px', borderRadius: '6px' }}>
                    {(['ALL', 'ADD', 'REDUCE'] as const).map((t) => (
                      <Button
                        key={t}
                        size="small"
                        onClick={() => setItemActionFilter(t)}
                        sx={{
                          py: 0.1,
                          px: 1,
                          minWidth: 'auto',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          textTransform: 'none',
                          bgcolor: itemActionFilter === t ? '#ffffff' : 'transparent',
                          color:
                            itemActionFilter === t
                              ? t === 'ADD'
                                ? '#16a34a'
                                : t === 'REDUCE'
                                ? '#dc2626'
                                : '#0f172a'
                              : '#64748b',
                          boxShadow: itemActionFilter === t ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        {t === 'ALL' ? 'All' : t === 'ADD' ? '▲ Add' : '▼ Reduce'}
                      </Button>
                    ))}
                  </Box>
                </Box>
              </Box>
            )}

            {/* ROW 3: COMMON SEARCH & DATE CONTROLS */}
            <Grid container spacing={1.5} alignItems="center" sx={{ pt: 0.5 }}>
              <Grid item xs={12} sm={4}>
                <TextField
                  placeholder={
                    historyFilterMode === 'itemwise'
                      ? 'Search item name, code, barcode, batch, reason...'
                      : 'Search by Adjustment No, reason, product...'
                  }
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
                    sx: { borderRadius: '6px', fontSize: '0.78rem', height: 32 },
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
                  onClick={() => loadHistory()}
                  fullWidth
                  sx={{
                    borderRadius: '6px',
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: '#0f172a',
                    height: 32,
                    fontSize: '0.80rem',
                    '&:hover': { bgcolor: '#1e293b' },
                  }}
                >
                  Filter
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* KPI SUMMARY CARDS */}
          {historyFilterMode === 'itemwise' ? (
            <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Adjusted Items Count
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a', mt: 0.2 }}>
                    {itemWiseTotals.totalRecords} Lines
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #dcfce7', bgcolor: '#f0fdf4' }}>
                  <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Total Stock Added
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#16a34a', mt: 0.2 }}>
                    +{itemWiseTotals.totalAddQty}{' '}
                    <Typography component="span" sx={{ fontSize: '0.70rem', color: '#15803d', fontWeight: 600 }}>
                      (AED {itemWiseTotals.totalGainValue.toFixed(2)})
                    </Typography>
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #fee2e2', bgcolor: '#fef2f2' }}>
                  <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Total Stock Reduced
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#dc2626', mt: 0.2 }}>
                    -{itemWiseTotals.totalReduceQty}{' '}
                    <Typography component="span" sx={{ fontSize: '0.70rem', color: '#b91c1c', fontWeight: 600 }}>
                      (AED {itemWiseTotals.totalLossValue.toFixed(2)})
                    </Typography>
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Net Inventory Impact
                  </Typography>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      color: itemWiseTotals.netValue >= 0 ? '#16a34a' : '#dc2626',
                      mt: 0.2,
                    }}
                  >
                    {itemWiseTotals.netValue >= 0 ? '+' : ''}AED {itemWiseTotals.netValue.toFixed(2)}
                  </Typography>
                </Card>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Total Adjustments
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a', mt: 0.2 }}>
                    {historyTotals.totalCount} Documents ({historyTotals.totalItems} Items)
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #fee2e2', bgcolor: '#fef2f2' }}>
                  <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Total Loss Value
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#dc2626', mt: 0.2 }}>
                    AED {historyTotals.totalLoss.toFixed(2)}
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #dcfce7', bgcolor: '#f0fdf4' }}>
                  <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Total Gain Value
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#16a34a', mt: 0.2 }}>
                    AED {historyTotals.totalGain.toFixed(2)}
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Card elevation={0} sx={{ p: 1.2, borderRadius: '8px', border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    Net Ledger Impact
                  </Typography>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      color: historyTotals.netImpact >= 0 ? '#16a34a' : '#dc2626',
                      mt: 0.2,
                    }}
                  >
                    {historyTotals.netImpact >= 0 ? '+' : ''}AED {historyTotals.netImpact.toFixed(2)}
                  </Typography>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* VIEW 1: ADJUSTMENT WISE TABLE */}
          {historyFilterMode === 'adjustment' && (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ borderRadius: '10px', bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}
            >
              <Table size="small">
                <TableHead sx={{ bgcolor: '#0f766e' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      ADJUSTMENT NO
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      DATE
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      PRIMARY REASON
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      ITEMS
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      TOTAL LOSS
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      TOTAL GAIN
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      NET IMPACT
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8 }}>
                      ACTIONS
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {historyLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={28} />
                      </TableCell>
                    </TableRow>
                  ) : historyList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                        No stock adjustments found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyList.map((row) => (
                      <TableRow
                        key={row._id}
                        hover
                        onDoubleClick={() => handleEditAdjustment(row)}
                        sx={{ cursor: 'pointer' }}
                      >
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
                        <TableCell align="right" sx={{ color: '#dc2626', fontWeight: 600, fontSize: '0.75rem' }}>
                          AED {(row.totalLossValue ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: '#16a34a', fontWeight: 600, fontSize: '0.75rem' }}>
                          AED {(row.totalGainValue ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: (row.netAdjustmentValue ?? 0) >= 0 ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {(row.netAdjustmentValue ?? 0) >= 0 ? '+' : ''}
                          AED {(row.netAdjustmentValue ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetails(row);
                              }}
                              title="View Details"
                            >
                              <ViewIcon fontSize="small" sx={{ color: '#64748b' }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditAdjustment(row);
                              }}
                              title="Edit"
                            >
                              <EditIcon fontSize="small" sx={{ color: '#2563eb' }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAdjustment(row._id, row.adjustmentNo);
                              }}
                              title="Delete"
                            >
                              <DeleteIcon fontSize="small" sx={{ color: '#dc2626' }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* VIEW 2: ITEM WISE (PRODUCT ADJUSTMENT DETAILS) TABLE */}
          {historyFilterMode === 'itemwise' && (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ borderRadius: '10px', bgcolor: '#ffffff', border: '1px solid #e2e8f0', maxHeight: 560 }}
            >
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: '#0f766e' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 90 }}>
                      DATE
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 110 }}>
                      ADJ NO
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 95 }}>
                      CODE
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 180 }}>
                      PRODUCT NAME
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 110 }}>
                      BARCODE
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 90 }}>
                      BATCH NO
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 85 }}>
                      TYPE
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 80 }}>
                      PREV
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 90 }}>
                      QTY
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 80 }}>
                      NEW
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 95 }}>
                      COST (AED)
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 110 }}>
                      TOTAL (AED)
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 140 }}>
                      REASON
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', py: 0.8, bgcolor: '#0f766e', minWidth: 80 }}>
                      ACTIONS
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {historyLoading ? (
                    <TableRow>
                      <TableCell colSpan={14} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={28} />
                      </TableCell>
                    </TableRow>
                  ) : itemWiseRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                        No item adjustment records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    itemWiseRows.map((row) => (
                      <TableRow
                        key={row.id}
                        hover
                        onDoubleClick={() => handleEditAdjustment(row.rawAdjustment)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={{ color: '#475569', fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
                          {row.date ? formatDateDisplay(row.date) : '-'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#2563eb', fontSize: '0.73rem' }}>
                          {row.adjustmentNo}
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>
                          {row.productCode || '—'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#0f172a', fontSize: '0.74rem' }}>
                          {row.productName}
                        </TableCell>
                        <TableCell sx={{ color: '#475569', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                          {row.barcode || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                          {row.batchNumber || '—'}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={row.adjustmentType === 'ADD' ? '▲ Add' : '▼ Reduce'}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.60rem',
                              fontWeight: 700,
                              bgcolor: row.adjustmentType === 'ADD' ? '#dcfce7' : '#fee2e2',
                              color: row.adjustmentType === 'ADD' ? '#16a34a' : '#dc2626',
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ color: '#64748b', fontSize: '0.73rem' }}>
                          {row.currentStock}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: row.adjustmentType === 'ADD' ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {row.adjustmentType === 'ADD' ? `+${row.quantity}` : `-${row.quantity}`}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.73rem' }}>
                          {row.newStock}
                        </TableCell>
                        <TableCell align="right" sx={{ color: '#475569', fontSize: '0.73rem' }}>
                          {row.costPrice.toFixed(2)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: row.adjustmentType === 'ADD' ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {row.totalValue.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ color: '#475569', fontSize: '0.72rem' }}>
                          {row.reason}
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.3, justifyContent: 'center' }}>
                            <Tooltip title="View Adjustment Details">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDetails(row.rawAdjustment);
                                }}
                              >
                                <ViewIcon sx={{ fontSize: '0.95rem', color: '#64748b' }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit this Adjustment">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditAdjustment(row.rawAdjustment);
                                }}
                              >
                                <EditIcon sx={{ fontSize: '0.95rem', color: '#2563eb' }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>

                {/* Table Footer with Summary Totals */}
                {itemWiseRows.length > 0 && (
                  <TableHead sx={{ bgcolor: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#0f172a' }}>
                        Total ({itemWiseTotals.totalRecords} Items)
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.70rem', color: '#64748b' }}>
                        Summary
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.70rem', color: '#64748b' }}>
                        —
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.74rem', color: '#0f172a' }}>
                        Net {itemWiseTotals.netQty >= 0 ? `+${itemWiseTotals.netQty}` : itemWiseTotals.netQty}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.70rem', color: '#64748b' }}>
                        —
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.70rem', color: '#64748b' }}>
                        —
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.76rem',
                          color: itemWiseTotals.netValue >= 0 ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {itemWiseTotals.netValue >= 0 ? '+' : ''}AED {itemWiseTotals.netValue.toFixed(2)}
                      </TableCell>
                      <TableCell colSpan={2} sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                        (Gain: AED {itemWiseTotals.totalGainValue.toFixed(2)} | Loss: AED {itemWiseTotals.totalLossValue.toFixed(2)})
                      </TableCell>
                    </TableRow>
                  </TableHead>
                )}
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* ─── BATCH SELECTION DIALOG ─── */}
      <Dialog
        open={batchDialogOpen}
        onClose={() => setBatchDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '10px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
          Select Batch for {pendingBatchProduct?.name}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.80rem' }}>
            This product has batch tracking enabled. Choose an existing batch or enter a specific batch number:
          </Typography>

          {availableBatches.length > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '6px', maxHeight: 220 }}>
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: '#0f766e' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', bgcolor: '#0f766e' }}>Batch No</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', bgcolor: '#0f766e' }}>
                      Expiry Date
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', bgcolor: '#0f766e' }}>
                      Current Stock
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', bgcolor: '#0f766e' }}>
                      Cost (AED)
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem', bgcolor: '#0f766e' }}>
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {availableBatches.map((b) => (
                    <TableRow key={b.batchNumber} hover>
                      <TableCell sx={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.75rem' }}>
                        {b.batchNumber}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                        {b.expiryDate ? formatDateDisplay(b.expiryDate) : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: b.quantity > 0 ? '#16a34a' : '#dc2626' }}>
                        {b.quantity}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {parseFloat(String(b.purchasePrice || 0)).toFixed(2)}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleSelectBatch(b)}
                          sx={{
                            borderRadius: '4px',
                            textTransform: 'none',
                            fontSize: '0.70rem',
                            fontWeight: 700,
                            bgcolor: '#0f766e',
                            py: 0.3,
                            '&:hover': { bgcolor: '#0d655e' },
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
            <Alert severity="info" sx={{ mb: 1.5, py: 0.5, fontSize: '0.78rem' }}>
              No previous batches recorded yet. Enter a batch number below to add new stock into:
            </Alert>
          )}

          {/* Custom Batch Number Input */}
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed #cbd5e1' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', display: 'block', mb: 0.6, fontSize: '0.72rem' }}>
              Or enter a new / specific batch number:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                placeholder="Enter batch number (e.g. 2222)..."
                value={customBatchInput}
                onChange={(e) => setCustomBatchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customBatchInput.trim()) {
                    e.preventDefault();
                    handleCreateOrApplyCustomBatch(customBatchInput);
                  }
                }}
                fullWidth
                sx={{
                  '& .MuiOutlinedInput-root': { height: 32, fontSize: '0.78rem', borderRadius: '6px' },
                }}
              />
              <Button
                variant="contained"
                onClick={() => handleCreateOrApplyCustomBatch(customBatchInput)}
                disabled={!customBatchInput.trim()}
                sx={{
                  borderRadius: '6px',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  bgcolor: '#0f172a',
                  px: 2,
                  whiteSpace: 'nowrap',
                  '&:hover': { bgcolor: '#1e293b' },
                }}
              >
                Apply Batch
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button onClick={() => setBatchDialogOpen(false)} color="inherit" sx={{ fontSize: '0.78rem', textTransform: 'none' }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── VIEW DETAILS DIALOG ─── */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '10px' } }}
      >
        {selectedAdjustmentForView && (
          <>
            <DialogTitle sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
              Adjustment Details - {selectedAdjustmentForView.adjustmentNo}
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={{ mb: 1.5, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                  <strong>Date:</strong>{' '}
                  {selectedAdjustmentForView.date
                    ? formatDateDisplay(selectedAdjustmentForView.date)
                    : '-'}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                  <strong>Reason:</strong> {selectedAdjustmentForView.reason}
                </Typography>
                {selectedAdjustmentForView.narration && (
                  <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                    <strong>Narration:</strong> {selectedAdjustmentForView.narration}
                  </Typography>
                )}
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '6px' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#0f766e' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem' }}>Item</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem' }}>
                        Type
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem' }}>
                        Qty
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem' }}>
                        Cost
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'white', fontSize: '0.68rem' }}>
                        Total Value
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedAdjustmentForView.items.map((it: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                            {it.productName}
                          </Typography>
                          {it.batchNumber && (
                            <Typography variant="caption" color="secondary" sx={{ fontSize: '0.65rem' }}>
                              Batch: {it.batchNumber}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={it.adjustmentType}
                            color={it.adjustmentType === 'ADD' ? 'success' : 'error'}
                            size="small"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.75rem' }}>{it.quantity}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{(it.costPrice ?? 0).toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                          {(it.totalValue ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setViewDialogOpen(false)} sx={{ fontSize: '0.80rem' }}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
