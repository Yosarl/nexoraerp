import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
  Autocomplete,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Badge,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import InventoryIcon from '@mui/icons-material/Inventory';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import LayersIcon from '@mui/icons-material/Layers';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { stockApi, productApi } from '../../services/api';
import StockMovementModal from '../../components/reports/StockMovementModal';
import ColumnManagerDrawer, { ColumnDefinition, mergeReportColumns } from '../../components/reports/ColumnManagerDrawer';

interface StockItem {
  rowId: string;
  productId: string;
  imei: string;
  itemName: string;
  batchNumber?: string | null;
  itemGroup: string;
  brand: string;
  category: string;
  qtyAvailable: number;
  purchaseRate: number;
  totalPurchaseRate: number;
  grossValue: number;
  sellingPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  specialPrice1: number;
  specialPrice2: number;
  expiryDate: string | null;
  branch: string;
  sellerName: string;
}

type SortKey = keyof StockItem | 'sl' | 'barcode';
type SortDir = 'asc' | 'desc';
type ReportMode = 'batch' | 'avg' | 'lastPurchase';

interface SearchFieldOption {
  id: string;
  label: string;
}

interface AdvancedStockFilters {
  sellerName: string;
  category: string;
  brand: string;
  itemName: string;
}

const DEFAULT_ADVANCED_FILTERS: AdvancedStockFilters = {
  sellerName: 'All',
  category: 'All',
  brand: 'All',
  itemName: 'All',
};

const SEARCH_FIELDS: SearchFieldOption[] = [
  { id: 'all', label: 'All' },
  { id: 'itemName', label: 'Item Name' },
  { id: 'imei', label: 'Official Med. Code / Barcode' },
  { id: 'batchNumber', label: 'Batch No' },
  { id: 'itemGroup', label: 'Item Group' },
  { id: 'brand', label: 'Brand' },
  { id: 'category', label: 'Category' },
  { id: 'qtyAvailable', label: 'Qty Available' },
  { id: 'purchaseRate', label: 'Purchase Rate' },
  { id: 'sellingPrice', label: 'Selling Price' },
  { id: 'retailPrice', label: 'Retail Price' },
  { id: 'wholesalePrice', label: 'Wholesale Price' },
  { id: 'specialPrice1', label: 'Special Price 1' },
  { id: 'specialPrice2', label: 'Special Price 2' },
  { id: 'expiryDate', label: 'Expiry Date' },
  { id: 'branch', label: 'Branch' },
  { id: 'sellerName', label: 'Seller Name' },
  { id: 'totalPurchaseRate', label: 'Cost Value' },
  { id: 'grossValue', label: 'Gross Value' },
];

const DEFAULT_STOCK_COLUMNS: ColumnDefinition[] = [
  { id: 'imei', label: 'Official Med. Code', defaultLabel: 'Official Med. Code', width: 130, defaultWidth: 130, visible: true, align: 'left', sortable: true },
  { id: 'barcode', label: 'Barcode', defaultLabel: 'Barcode', width: 100, defaultWidth: 100, visible: true, align: 'left', sortable: true },
  { id: 'itemName', label: 'Item Name', defaultLabel: 'Item Name', width: 220, defaultWidth: 220, visible: true, align: 'left', sortable: true },
  { id: 'batchNumber', label: 'Batch No', defaultLabel: 'Batch No', width: 95, defaultWidth: 95, visible: true, align: 'left', sortable: true },
  { id: 'expiryDate', label: 'Expiry Date', defaultLabel: 'Expiry Date', width: 95, defaultWidth: 95, visible: true, align: 'center', sortable: true },
  { id: 'sl', label: 'SL', defaultLabel: 'SL', width: 45, defaultWidth: 45, visible: true, align: 'center', sortable: false },
  { id: 'qtyAvailable', label: 'Qty', defaultLabel: 'Qty', width: 70, defaultWidth: 70, visible: true, align: 'center', sortable: true },
  { id: 'purchaseRate', label: 'P. Rate', defaultLabel: 'P. Rate', width: 80, defaultWidth: 80, visible: true, align: 'right', sortable: true },
  { id: 'totalPurchaseRate', label: 'Cost Value', defaultLabel: 'Cost Value', width: 95, defaultWidth: 95, visible: true, align: 'right', sortable: true },
  { id: 'grossValue', label: 'Gross Value', defaultLabel: 'Gross Value', width: 95, defaultWidth: 95, visible: true, align: 'right', sortable: true },
  { id: 'sellingPrice', label: 'Selling Price', defaultLabel: 'Selling Price', width: 95, defaultWidth: 95, visible: true, align: 'right', sortable: true },
  { id: 'retailPrice', label: 'Retail Price', defaultLabel: 'Retail Price', width: 95, defaultWidth: 95, visible: true, align: 'right', sortable: true },
  { id: 'branch', label: 'Branch', defaultLabel: 'Branch', width: 110, defaultWidth: 110, visible: true, align: 'left', sortable: true },
  { id: 'sellerName', label: 'Salesman Name', defaultLabel: 'Salesman Name', width: 105, defaultWidth: 105, visible: true, align: 'left', sortable: true },
  { id: 'itemGroup', label: 'Item Group', defaultLabel: 'Item Group', width: 100, defaultWidth: 100, visible: true, align: 'left', sortable: true },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 100, defaultWidth: 100, visible: true, align: 'left', sortable: true },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 110, defaultWidth: 110, visible: true, align: 'left', sortable: true },
  { id: 'wholesalePrice', label: 'Wholesale Price', defaultLabel: 'Wholesale Price', width: 95, defaultWidth: 95, visible: true, align: 'right', sortable: true },
  { id: 'specialPrice1', label: 'Sp. Price 1', defaultLabel: 'Sp. Price 1', width: 85, defaultWidth: 85, visible: true, align: 'right', sortable: true },
  { id: 'specialPrice2', label: 'Sp. Price 2', defaultLabel: 'Sp. Price 2', width: 85, defaultWidth: 85, visible: true, align: 'right', sortable: true },
];

const STOCK_REPORT_COLUMNS_KEY = 'stock_report_columns_custom_v3';

function getInitialStockColumns(): ColumnDefinition[] {
  try {
    const saved =
      localStorage.getItem(STOCK_REPORT_COLUMNS_KEY) ||
      localStorage.getItem('stock_report_columns_custom_v2');
    if (saved) {
      const parsed: ColumnDefinition[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeReportColumns(DEFAULT_STOCK_COLUMNS, parsed);
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_STOCK_COLUMNS;
}

const COL_HEADER_BASE = {
  bgcolor: '#0f766e',
  color: 'white',
  fontWeight: 600,
  fontSize: '0.72rem',
  py: 0.6,
  px: 0.6,
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  borderRight: '1px solid rgba(255,255,255,0.12)',
} as const;

function SortArrows({
  field,
  sortKey,
  sortDir,
  onSort,
}: {
  field: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey, dir: SortDir) => void;
}) {
  const isActive = sortKey === field;
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', ml: 0.2, verticalAlign: 'middle', position: 'relative', top: -1 }}>
      <IconButton
        size="small"
        onClick={(e) => { e.stopPropagation(); onSort(field, 'asc'); }}
        sx={{
          p: 0, width: 14, height: 12,
          color: isActive && sortDir === 'asc' ? '#ffffff' : 'rgba(255,255,255,0.35)',
          '&:hover': { color: '#ffffff' },
        }}
      >
        <ArrowDropUpIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton
        size="small"
        onClick={(e) => { e.stopPropagation(); onSort(field, 'desc'); }}
        sx={{
          p: 0, width: 14, height: 12,
          color: isActive && sortDir === 'desc' ? '#ffffff' : 'rgba(255,255,255,0.35)',
          '&:hover': { color: '#ffffff' },
        }}
      >
        <ArrowDropDownIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}

/** Format ISO date string (yyyy-mm-dd) to dd-mm-yyyy */
function formatDateDDMMYY(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

// All searchable string fields
const STRING_SEARCH_KEYS: (keyof StockItem)[] = [
  'itemName', 'imei', 'batchNumber', 'itemGroup', 'brand', 'category', 'branch', 'sellerName', 'expiryDate',
];
// All searchable numeric fields
const NUMERIC_SEARCH_KEYS: (keyof StockItem)[] = [
  'qtyAvailable', 'purchaseRate', 'totalPurchaseRate', 'grossValue', 'sellingPrice',
  'retailPrice', 'wholesalePrice', 'specialPrice1', 'specialPrice2',
];

/** Filter items by search term across selected field or all fields */
function filterItems(items: StockItem[], search: string, fieldId: string): StockItem[] {
  if (!search) return items;
  const sl = search.toLowerCase();

  if (fieldId !== 'all') {
    const isNumeric = NUMERIC_SEARCH_KEYS.includes(fieldId as keyof StockItem);
    return items.filter((item) => {
      const val = item[fieldId as keyof StockItem];
      if (val == null) return false;
      if (isNumeric) return String(val).includes(search);
      return String(val).toLowerCase().includes(sl);
    });
  }

  return items.filter((item) => {
    for (const f of STRING_SEARCH_KEYS) {
      const v = item[f];
      if (v != null && String(v).toLowerCase().includes(sl)) return true;
    }
    for (const f of NUMERIC_SEARCH_KEYS) {
      const v = item[f];
      if (v != null && String(v).includes(search)) return true;
    }
    return false;
  });
}

export default function StockReport() {
  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);

  // All items fetched from backend (unfiltered)
  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<SearchFieldOption>(SEARCH_FIELDS[0]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Report mode
  const [mode, setMode] = useState<ReportMode>('avg');

  // Show only +ve qty filter
  const [showPositiveOnly, setShowPositiveOnly] = useState(false);

  // Selected row
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Column Manager state
  const [columns, setColumns] = useState<ColumnDefinition[]>(getInitialStockColumns);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);

  // Multi-unit dialog state
  const [multiUnitDialogOpen, setMultiUnitDialogOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
  const [multiUnitProduct, setMultiUnitProduct] = useState<any | null>(null);
  const [multiUnitLoading, setMultiUnitLoading] = useState(false);
  const [multiUnitError, setMultiUnitError] = useState<string | null>(null);

  const handleRowDoubleClick = useCallback(async (item: StockItem) => {
    if (!companyId || !item.productId) return;
    setSelectedStockItem(item);
    setMultiUnitDialogOpen(true);
    setMultiUnitLoading(true);
    setMultiUnitError(null);
    setMultiUnitProduct(null);

    try {
      const res = await productApi.get(item.productId, companyId);
      if (res.data.success && res.data.data) {
        setMultiUnitProduct(res.data.data);
      } else {
        setMultiUnitError('Failed to load product details');
      }
    } catch (err: any) {
      setMultiUnitError(err.response?.data?.message || 'Error fetching multi-unit details');
    } finally {
      setMultiUnitLoading(false);
    }
  }, [companyId]);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback((key: SortKey, dir: SortDir) => {
    if (sortKey === key && sortDir === dir) {
      setSortKey(null);
      setSortDir('asc');
    } else {
      setSortKey(key);
      setSortDir(dir);
    }
  }, [sortKey, sortDir]);

  // Advanced Filters State
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<AdvancedStockFilters>(DEFAULT_ADVANCED_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AdvancedStockFilters>(DEFAULT_ADVANCED_FILTERS);

  // Stock Movement Window State
  const [stockMovementOpen, setStockMovementOpen] = useState(false);
  const [selectedMovementItem, setSelectedMovementItem] = useState<StockItem | null>(null);

  // F5 Keyboard Shortcut listener for Column Manager & F6 for Stock Movement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        setColumnManagerOpen((prev) => !prev);
      } else if (e.key === 'F6') {
        e.preventDefault();
        const selItem = allItems.find((i) => i.rowId === selectedRowId) || null;
        setSelectedMovementItem(selItem);
        setStockMovementOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allItems, selectedRowId]);

  const handleOpenFilter = () => {
    setDraftFilters(appliedFilters);
    setFilterDialogOpen(true);
  };

  const handleCloseFilter = () => {
    setFilterDialogOpen(false);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(0);
    handleCloseFilter();
  };

  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_ADVANCED_FILTERS);
    setAppliedFilters(DEFAULT_ADVANCED_FILTERS);
    setPage(0);
  };

  const handleResetColumns = () => {
    setColumns(DEFAULT_STOCK_COLUMNS);
    try {
      localStorage.removeItem(STOCK_REPORT_COLUMNS_KEY);
    } catch {}
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (appliedFilters.sellerName && appliedFilters.sellerName !== 'All') count++;
    if (appliedFilters.category && appliedFilters.category !== 'All') count++;
    if (appliedFilters.brand && appliedFilters.brand !== 'All') count++;
    if (appliedFilters.itemName && appliedFilters.itemName !== 'All') count++;
    return count;
  }, [appliedFilters]);

  // Dynamic filter options derived from current allItems
  const sellerOptions = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const val = (i.sellerName || '').trim();
      if (val && val !== '-') set.add(val);
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allItems]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const val = (i.category || '').trim();
      if (val && val !== '-') set.add(val);
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allItems]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const val = (i.brand || '').trim();
      if (val && val !== '-') set.add(val);
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allItems]);

  const itemNameOptions = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const val = (i.itemName || '').trim();
      if (val && val !== '-') set.add(val);
    });
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allItems]);

  // 1. Search + Advanced Filter pipeline
  const searchedItems = useMemo(() => {
    return filterItems(allItems, search, searchField.id);
  }, [allItems, search, searchField]);

  const advancedFilteredItems = useMemo(() => {
    return searchedItems.filter((item) => {
      if (appliedFilters.sellerName !== 'All' && item.sellerName !== appliedFilters.sellerName) {
        return false;
      }
      if (appliedFilters.category !== 'All' && item.category !== appliedFilters.category) {
        return false;
      }
      if (appliedFilters.brand !== 'All' && item.brand !== appliedFilters.brand) {
        return false;
      }
      if (appliedFilters.itemName !== 'All' && item.itemName !== appliedFilters.itemName) {
        return false;
      }
      return true;
    });
  }, [searchedItems, appliedFilters]);

  // 2. +ve qty filter
  const filteredItems = useMemo(() => {
    return showPositiveOnly ? advancedFilteredItems.filter((i) => i.qtyAvailable > 0) : advancedFilteredItems;
  }, [advancedFilteredItems, showPositiveOnly]);

  // 3. Sort
  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      let av: any = a[sortKey as keyof StockItem];
      let bv: any = b[sortKey as keyof StockItem];
      if (sortKey === 'barcode') {
        av = a.imei;
        bv = b.imei;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === 'asc' ? -1 : 1;
      if (as > bs) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortKey, sortDir]);

  // 4. Pagination (on the filtered+sorted items)
  const total = sortedItems.length;
  const paginatedItems = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedItems.slice(start, start + rowsPerPage);
  }, [sortedItems, page, rowsPerPage]);

  // Fetch ALL items from backend
  const loadReport = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await stockApi.getReport(companyId, {
        page: 1,
        limit: 100000,
        mode,
      });
      if (res.data.success) {
        setAllItems(res.data.data.items);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load stock report');
    } finally {
      setLoading(false);
    }
  }, [companyId, mode]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/stock-report') {
        loadReport();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/stock-report') || window.location.pathname.includes('/report/stock-report')) {
        loadReport();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    window.addEventListener('app:products-updated', onWindowActivated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
      window.removeEventListener('app:products-updated', onWindowActivated);
    };
  }, [loadReport]);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const handleFieldChange = (_: any, value: SearchFieldOption | null) => {
    if (value) {
      setSearchField(value);
      setPage(0);
    }
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMode(e.target.value as ReportMode);
    setPage(0);
  };

  // Summary Totals
  const totalQty = useMemo(() => filteredItems.reduce((s, i) => s + i.qtyAvailable, 0), [filteredItems]);
  const totalStockValue = useMemo(() => filteredItems.reduce((s, i) => s + i.totalPurchaseRate, 0), [filteredItems]);
  const totalGrossValue = useMemo(() => filteredItems.reduce((s, i) => s + (i.grossValue || 0), 0), [filteredItems]);
  const totalSellingValue = useMemo(() => filteredItems.reduce((s, i) => s + (i.sellingPrice * i.qtyAvailable), 0), [filteredItems]);
  const totalRetailValue = useMemo(() => filteredItems.reduce((s, i) => s + (i.retailPrice * i.qtyAvailable), 0), [filteredItems]);
  const totalWholesaleValue = useMemo(() => filteredItems.reduce((s, i) => s + (i.wholesalePrice * i.qtyAvailable), 0), [filteredItems]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const tableMinWidth = useMemo(() => Math.max(1200, visibleColumns.reduce((sum, col) => sum + col.width, 0)), [visibleColumns]);

  const renderStockCell = (item: StockItem, colId: string, idx: number) => {
    const isLowStock = item.qtyAvailable > 0 && item.qtyAvailable <= 5;
    const isOutOfStock = item.qtyAvailable <= 0;
    const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
    const isExpiringSoon =
      item.expiryDate &&
      !isExpired &&
      new Date(item.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    switch (colId) {
      case 'sl':
        return (
          <Typography sx={{ fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
            {page * rowsPerPage + idx + 1}
          </Typography>
        );
      case 'imei':
        return (
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#1e293b' }}>
            {item.imei || '-'}
          </Typography>
        );
      case 'barcode':
        return (
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#1e293b' }}>
            {item.imei || '-'}
          </Typography>
        );
      case 'itemName':
        return (
          <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: '0.78rem' }}>
            {item.itemName}
          </Typography>
        );
      case 'batchNumber':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.batchNumber || '-'}</Typography>;
      case 'expiryDate':
        return item.expiryDate ? (
          <Chip
            label={formatDateDDMMYY(item.expiryDate)}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 22,
              bgcolor: isExpired ? '#fef2f2' : isExpiringSoon ? '#fffbeb' : '#f8fafc',
              color: isExpired ? '#dc2626' : isExpiringSoon ? '#d97706' : '#334155',
              border: `1px solid ${isExpired ? '#fecaca' : isExpiringSoon ? '#fde68a' : '#e2e8f0'}`,
            }}
          />
        ) : (
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>-</Typography>
        );
      case 'qtyAvailable':
        return (
          <Chip
            label={item.qtyAvailable}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.73rem',
              height: 22,
              bgcolor: isOutOfStock ? '#fef2f2' : isLowStock ? '#fffbeb' : '#f0fdf4',
              color: isOutOfStock ? '#dc2626' : isLowStock ? '#d97706' : '#16a34a',
              border: `1px solid ${isOutOfStock ? '#fecaca' : isLowStock ? '#fde68a' : '#bbf7d0'}`,
            }}
          />
        );
      case 'purchaseRate':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {item.purchaseRate.toFixed(2)}
          </Typography>
        );
      case 'totalPurchaseRate':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 600, fontSize: '0.78rem' }}>
            {item.totalPurchaseRate.toFixed(2)}
          </Typography>
        );
      case 'grossValue':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', color: '#0d9488' }}>
            {(item.grossValue || 0).toFixed(2)}
          </Typography>
        );
      case 'sellingPrice':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {item.sellingPrice.toFixed(2)}
          </Typography>
        );
      case 'retailPrice':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {item.retailPrice.toFixed(2)}
          </Typography>
        );
      case 'wholesalePrice':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {item.wholesalePrice.toFixed(2)}
          </Typography>
        );
      case 'specialPrice1':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {item.specialPrice1 ? item.specialPrice1.toFixed(2) : '-'}
          </Typography>
        );
      case 'specialPrice2':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {item.specialPrice2 ? item.specialPrice2.toFixed(2) : '-'}
          </Typography>
        );
      case 'branch':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.branch || '-'}</Typography>;
      case 'sellerName':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.sellerName || '-'}</Typography>;
      case 'itemGroup':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.itemGroup || '-'}</Typography>;
      case 'brand':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.brand || '-'}</Typography>;
      case 'category':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.category || '-'}</Typography>;
      default:
        return null;
    }
  };

  if (!companyId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select a company to view the stock report.</Alert>
      </Box>
    );
  }

  const radioLabelSx = {
    '& .MuiFormControlLabel-label': {
      fontSize: '0.76rem',
      fontWeight: 600,
      color: '#334155',
    },
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 72px)',
        bgcolor: '#eef2f6',
        overflow: 'hidden',
      }}
    >
      {/* TOP: Header Bar */}
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.2,
          mx: 1,
          mt: 1,
          borderRadius: 2,
          bgcolor: 'white',
          border: '1px solid #e0e7ef',
          flexShrink: 0,
        }}
      >
        {/* Row 1: Title + Mode + Filters */}
        <Grid container spacing={1} alignItems="center">
          {/* Entry No style badge */}
          <Grid item>
            <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.5, px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <InventoryIcon sx={{ color: 'white', fontSize: 18 }} />
              <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.85rem' }}>Stock Report</Typography>
            </Box>
          </Grid>

          {/* Radio Buttons */}
          <Grid item>
            <RadioGroup row value={mode} onChange={handleModeChange} sx={{ ml: 0.5 }}>
              <FormControlLabel
                value="batch"
                control={<Radio size="small" sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }} />}
                label="Batch"
                sx={radioLabelSx}
              />
              <FormControlLabel
                value="avg"
                control={<Radio size="small" sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }} />}
                label="Avg. Stock"
                sx={radioLabelSx}
              />
              <FormControlLabel
                value="lastPurchase"
                control={<Radio size="small" sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }} />}
                label="Last Purchase"
                sx={radioLabelSx}
              />
            </RadioGroup>
          </Grid>

          {/* +ve qty checkbox */}
          <Grid item>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={showPositiveOnly}
                  onChange={(e) => { setShowPositiveOnly(e.target.checked); setPage(0); }}
                  sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }}
                />
              }
              label="+ve Qty"
              sx={radioLabelSx}
            />
          </Grid>

          {/* Search Bar with Field Dropdown */}
          <Grid item xs sx={{ minWidth: 260 }}>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Autocomplete
                size="small"
                options={SEARCH_FIELDS}
                getOptionLabel={(o) => o.label}
                value={searchField}
                onChange={handleFieldChange}
                disableClearable
                isOptionEqualToValue={(option, value) => option.id === value.id}
                sx={{
                  width: 140,
                  flexShrink: 0,
                  '& .MuiOutlinedInput-root': {
                    height: 34,
                    fontSize: '0.78rem',
                    bgcolor: '#f8fafc',
                    borderRadius: 1.5,
                  },
                }}
                renderInput={(params) => (
                  <TextField {...params} variant="outlined" placeholder="Field" />
                )}
              />
              <TextField
                size="small"
                placeholder={searchField.id === 'all' ? 'Search all fields...' : `Search by ${searchField.label}...`}
                value={search}
                onChange={handleSearchChange}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#0f766e', fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch('')} sx={{ p: 0.3 }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    height: 34,
                    fontSize: '0.78rem',
                    bgcolor: '#f8fafc',
                    borderRadius: 1.5,
                  },
                }}
              />
            </Box>
          </Grid>

          {/* Refresh Button */}
          <Grid item>
            <Button
              size="small"
              variant="outlined"
              onClick={loadReport}
              startIcon={<RefreshIcon sx={{ fontSize: 17 }} />}
              sx={{
                height: 34,
                borderRadius: 1.5,
                borderColor: '#0f766e',
                color: '#0f766e',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                px: 1.5,
                bgcolor: '#ffffff',
                '&:hover': {
                  borderColor: '#0d5c56',
                  bgcolor: '#f0fdfa',
                },
              }}
            >
              Refresh
            </Button>
          </Grid>

          {/* Stock Movement Window Button */}
          <Grid item>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const selItem = allItems.find((i) => i.rowId === selectedRowId) || null;
                setSelectedMovementItem(selItem);
                setStockMovementOpen(true);
              }}
              startIcon={<CompareArrowsIcon sx={{ fontSize: 17 }} />}
              sx={{
                height: 34,
                borderRadius: 1.5,
                borderColor: '#0f766e',
                color: '#0f766e',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                px: 1.5,
                bgcolor: '#ffffff',
                '&:hover': {
                  borderColor: '#0d5c56',
                  bgcolor: '#f0fdfa',
                },
              }}
              title="View Stock Movement Ledger (F6)"
            >
              Movement
            </Button>
          </Grid>

          {/* Filter Button with Red Badge */}
          <Grid item>
            <Badge
              badgeContent={activeFiltersCount}
              color="error"
              invisible={activeFiltersCount === 0}
              sx={{
                '& .MuiBadge-badge': {
                  bgcolor: '#ef4444',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  minWidth: 18,
                  height: 18,
                },
              }}
            >
              <Button
                size="small"
                variant="contained"
                onClick={handleOpenFilter}
                startIcon={<AddIcon sx={{ fontSize: 17, fontWeight: 700 }} />}
                sx={{
                  height: 34,
                  borderRadius: 1.5,
                  bgcolor: '#0f766e',
                  color: '#ffffff',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  px: 1.8,
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: '#115e59',
                    boxShadow: 'none',
                  },
                }}
                title="Open Advanced Filters"
              >
                ➕ Filter
              </Button>
            </Badge>
          </Grid>
        </Grid>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 1, mt: 0.5, flexShrink: 0, borderRadius: 1.5, '& .MuiAlert-message': { fontSize: '0.85rem' } }}>
          {error}
        </Alert>
      )}

      {/* MIDDLE: Table (fills remaining space) */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', mx: 1, mt: 0.5, mb: 0, borderRadius: '8px 8px 0 0', border: '1px solid #e0e7ef', borderBottom: 'none', bgcolor: 'white' }}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
            <TableHead>
              <TableRow>
                {visibleColumns.map((col, idx) => (
                  <TableCell
                    key={col.id}
                    sx={{
                      ...COL_HEADER_BASE,
                      width: col.width,
                      textAlign: col.align || 'left',
                      borderRight: idx === visibleColumns.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <Typography sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'white' }}>
                        {col.label}
                      </Typography>
                      {col.sortable !== false && (
                        <SortArrows
                          field={col.id as SortKey}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                      )}
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length || 1} align="center" sx={{ py: 8 }}>
                    <CircularProgress size={28} sx={{ color: '#0f766e' }} />
                    <Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>
                      Loading stock data...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length || 1} align="center" sx={{ py: 8 }}>
                    <InventoryIcon sx={{ fontSize: 44, color: '#e2e8f0', mb: 1 }} />
                    <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
                      No stock data found
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                      Products will appear here once purchase entries are made
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item, idx) => {
                  const isOutOfStock = item.qtyAvailable <= 0;
                  const cellSx = {
                    py: 0.5,
                    px: 0.6,
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    color: '#1e293b',
                    borderBottom: '1px solid #f1f5f9',
                  };

                  const isSelected = selectedRowId === item.rowId;

                  return (
                    <TableRow
                      key={item.rowId}
                      onClick={() => setSelectedRowId(isSelected ? null : item.rowId)}
                      onDoubleClick={() => handleRowDoubleClick(item)}
                      title="Double-click to view Multi-Unit details (IMEI, Stock, Prices, Unit)"
                      sx={{
                        bgcolor: isSelected ? '#ecfdf5' : idx % 2 === 0 ? '#fff' : '#f8fafc',
                        '&:hover': { bgcolor: isSelected ? '#d1fae5' : '#f0fdf4' },
                        outline: isSelected ? '2px solid #0f766e' : 'none',
                        outlineOffset: -2,
                        opacity: isOutOfStock ? 0.55 : 1,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {visibleColumns.map((col) => (
                        <TableCell
                          key={col.id}
                          sx={{
                            ...cellSx,
                            textAlign: col.align || 'left',
                            width: col.width,
                          }}
                        >
                          {renderStockCell(item, col.id, idx)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[25, 50, 100, 200]}
          sx={{
            flexShrink: 0,
            borderTop: '1px solid #e0e7ef',
            bgcolor: '#ffffff',
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              fontSize: '0.75rem',
              color: '#64748b',
            },
          }}
        />
      </Box>

      {/* BOTTOM: Summary Totals */}
      <Paper
        elevation={0}
        sx={{
          flexShrink: 0,
          mx: 1,
          mb: 1,
          px: 2,
          py: 1,
          bgcolor: '#0f766e',
          borderRadius: '0 0 8px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', mr: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Totals:
        </Typography>
        {[
          { label: 'Items', value: String(total), color: '#ffffff' },
          { label: 'Total Qty', value: String(totalQty), color: '#ffffff' },
          { label: 'Stock Value Cost', value: totalStockValue.toFixed(2), color: '#a7f3d0' },
          { label: 'Stock Value Gross', value: totalGrossValue.toFixed(2), color: '#86efac' },
          { label: 'Stock Value (Selling)', value: totalSellingValue.toFixed(2), color: '#99f6e4' },
          { label: 'Retail Value', value: totalRetailValue.toFixed(2), color: '#a5f3fc' },
          { label: 'Wholesale Value', value: totalWholesaleValue.toFixed(2), color: '#c4b5fd' },
        ].map((t) => (
          <Box
            key={t.label}
            sx={{
              px: 1.2,
              py: 0.4,
              bgcolor: 'rgba(255,255,255,0.12)',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {t.label}:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: t.color, fontSize: '0.8rem' }}>
              {t.value}
            </Typography>
          </Box>
        ))}
      </Paper>

      {/* Multi-Unit Details Modal Dialog */}
      <Dialog
        open={multiUnitDialogOpen}
        onClose={() => setMultiUnitDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: '#0f766e',
            color: 'white',
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <LayersIcon sx={{ fontSize: 24, color: '#99f6e4' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: 'white' }}>
                Multi-Unit & Pricing Breakdown
              </Typography>
              <Typography variant="caption" sx={{ color: '#ccfbf1', display: 'block', mt: 0.2 }}>
                {selectedStockItem?.itemName} {selectedStockItem?.imei ? `(IMEI: ${selectedStockItem.imei})` : ''}
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setMultiUnitDialogOpen(false)} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 3, bgcolor: '#f8fafc' }}>
          {multiUnitLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
              <CircularProgress size={32} sx={{ color: '#0f766e' }} />
              <Typography variant="body2" sx={{ mt: 1.5, color: '#64748b' }}>
                Loading product multi-unit configuration...
              </Typography>
            </Box>
          ) : multiUnitError ? (
            <Alert severity="error" sx={{ my: 2 }}>{multiUnitError}</Alert>
          ) : multiUnitProduct ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Top Overview Cards */}
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={3}>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Primary Unit</Typography>
                    <Typography variant="h6" sx={{ color: '#0f766e', fontWeight: 700, mt: 0.2 }}>
                      {multiUnitProduct.unit || 'PCS'}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Stock Available</Typography>
                    <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 700, mt: 0.2 }}>
                      {selectedStockItem?.qtyAvailable ?? 0} {multiUnitProduct.unit || 'PCS'}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Batch No</Typography>
                    <Typography variant="body1" sx={{ color: '#0f172a', fontWeight: 600, mt: 0.5 }}>
                      {selectedStockItem?.batchNumber || 'N/A'}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Expiry Date</Typography>
                    <Typography variant="body1" sx={{ color: '#0f172a', fontWeight: 600, mt: 0.5 }}>
                      {formatDateDDMMYY(selectedStockItem?.expiryDate || null)}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Multi-Unit Breakdown Table */}
              <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1.2, bgcolor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155' }}>
                    Configured Units & Conversion Rates
                  </Typography>
                  <Chip
                    label={`${(multiUnitProduct.multiUnits?.length || 0) + 1} Units Available`}
                    size="small"
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#e0f2fe', color: '#0369a1' }}
                  />
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }}>Unit Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="center">Conversion Factor</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="center">Equivalent Stock</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="right">Purchase Rate</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="right">Selling Price</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="right">Retail Price</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="right">Wholesale Price</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="right">Special 1</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#475569' }} align="right">Special 2</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* Primary Base Unit Row */}
                    <TableRow sx={{ bgcolor: '#ffffff' }}>
                      <TableCell sx={{ fontWeight: 600, color: '#0f766e', fontSize: '0.8rem' }}>
                        {multiUnitProduct.unit || 'PCS'}
                        <Chip label="Base Unit" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: '#f0fdf4', color: '#16a34a' }} />
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>1</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem' }}>
                        {selectedStockItem?.qtyAvailable ?? 0} {multiUnitProduct.unit || 'PCS'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{selectedStockItem?.purchaseRate?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{selectedStockItem?.sellingPrice?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{selectedStockItem?.retailPrice?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{selectedStockItem?.wholesalePrice?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{selectedStockItem?.specialPrice1 ? selectedStockItem.specialPrice1.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{selectedStockItem?.specialPrice2 ? selectedStockItem.specialPrice2.toFixed(2) : '-'}</TableCell>
                    </TableRow>

                    {/* Secondary Multi-Units */}
                    {multiUnitProduct.multiUnits && multiUnitProduct.multiUnits.length > 0 ? (
                      multiUnitProduct.multiUnits.map((mu: any, idx: number) => {
                        const factor = mu.conversionFactor || 1;
                        const convertedStock = factor > 0 ? ((selectedStockItem?.qtyAvailable ?? 0) / factor).toFixed(2) : '0';
                        return (
                          <TableRow key={idx} sx={{ bgcolor: idx % 2 === 0 ? '#fafafa' : '#ffffff' }}>
                            <TableCell sx={{ fontWeight: 600, color: '#334155', fontSize: '0.8rem' }}>
                              {mu.unitName || mu.unit || `Unit ${idx + 1}`}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.8rem', color: '#64748b' }}>
                              1 {mu.unitName || mu.unit} = {factor} {multiUnitProduct.unit}
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, color: '#0284c7', fontSize: '0.8rem' }}>
                              {convertedStock} {mu.unitName || mu.unit}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {mu.purchasePrice ? Number(mu.purchasePrice).toFixed(2) : (selectedStockItem ? (selectedStockItem.purchaseRate * factor).toFixed(2) : '-')}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              {mu.salesPrice ? Number(mu.salesPrice).toFixed(2) : (selectedStockItem ? (selectedStockItem.sellingPrice * factor).toFixed(2) : '-')}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {mu.retailPrice ? Number(mu.retailPrice).toFixed(2) : (selectedStockItem ? (selectedStockItem.retailPrice * factor).toFixed(2) : '-')}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {mu.wholesalePrice ? Number(mu.wholesalePrice).toFixed(2) : (selectedStockItem ? (selectedStockItem.wholesalePrice * factor).toFixed(2) : '-')}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {mu.specialPrice1 ? Number(mu.specialPrice1).toFixed(2) : '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {mu.specialPrice2 ? Number(mu.specialPrice2).toFixed(2) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 2.5, color: '#94a3b8' }}>
                          No secondary multi-units configured for this item in Product Master.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Paper>
            </Box>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5, bgcolor: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setMultiUnitDialogOpen(false)} variant="contained" sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, textTransform: 'none', px: 3 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Advanced Stock Filters Window */}
      <Dialog
        open={filterDialogOpen}
        onClose={handleCloseFilter}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            border: '1.5px solid #0f766e',
            boxShadow: '0 20px 35px -5px rgba(15, 118, 110, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          },
        }}
      >
        {/* Header */}
        <DialogTitle
          sx={{
            bgcolor: '#0f766e',
            color: 'white',
            px: 2.5,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsSuggestIcon sx={{ color: 'white', fontSize: 22 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.98rem' }}>
              Advanced Stock Filters
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleCloseFilter} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        {/* Form Fields */}
        <DialogContent sx={{ p: 2.5, bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 1.8 }}>
          {/* Seller Name */}
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
              Seller Name
            </Typography>
            <Autocomplete
              size="small"
              options={sellerOptions}
              value={draftFilters.sellerName}
              onChange={(_, newVal) => setDraftFilters((prev) => ({ ...prev, sellerName: newVal || 'All' }))}
              disableClearable
              popupIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#64748b' }} />}
              sx={{
                bgcolor: 'white',
                borderRadius: 1.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  fontSize: '0.84rem',
                  height: 38,
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0f766e' },
                  py: 0,
                  px: 1,
                },
                '& .MuiOutlinedInput-input': {
                  py: 0.4,
                  fontSize: '0.84rem',
                },
              }}
              renderInput={(params) => <TextField {...params} />}
            />
          </Box>

          {/* Category */}
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
              Category
            </Typography>
            <Autocomplete
              size="small"
              options={categoryOptions}
              value={draftFilters.category}
              onChange={(_, newVal) => setDraftFilters((prev) => ({ ...prev, category: newVal || 'All' }))}
              disableClearable
              popupIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#64748b' }} />}
              sx={{
                bgcolor: 'white',
                borderRadius: 1.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  fontSize: '0.84rem',
                  height: 38,
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0f766e' },
                  py: 0,
                  px: 1,
                },
                '& .MuiOutlinedInput-input': {
                  py: 0.4,
                  fontSize: '0.84rem',
                },
              }}
              renderInput={(params) => <TextField {...params} />}
            />
          </Box>

          {/* Brand */}
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
              Brand
            </Typography>
            <Autocomplete
              size="small"
              options={brandOptions}
              value={draftFilters.brand}
              onChange={(_, newVal) => setDraftFilters((prev) => ({ ...prev, brand: newVal || 'All' }))}
              disableClearable
              popupIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#64748b' }} />}
              sx={{
                bgcolor: 'white',
                borderRadius: 1.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  fontSize: '0.84rem',
                  height: 38,
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0f766e' },
                  py: 0,
                  px: 1,
                },
                '& .MuiOutlinedInput-input': {
                  py: 0.4,
                  fontSize: '0.84rem',
                },
              }}
              renderInput={(params) => <TextField {...params} />}
            />
          </Box>

          {/* Item Name */}
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
              Item Name
            </Typography>
            <Autocomplete
              size="small"
              options={itemNameOptions}
              value={draftFilters.itemName}
              onChange={(_, newVal) => setDraftFilters((prev) => ({ ...prev, itemName: newVal || 'All' }))}
              disableClearable
              popupIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#64748b' }} />}
              sx={{
                bgcolor: 'white',
                borderRadius: 1.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  fontSize: '0.84rem',
                  height: 38,
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0f766e' },
                  py: 0,
                  px: 1,
                },
                '& .MuiOutlinedInput-input': {
                  py: 0.4,
                  fontSize: '0.84rem',
                },
              }}
              renderInput={(params) => <TextField {...params} />}
            />
          </Box>
        </DialogContent>

        {/* Footer Actions */}
        <DialogActions sx={{ p: 2, bgcolor: 'white', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          <Button
            size="small"
            onClick={handleResetFilters}
            sx={{
              bgcolor: '#f8fafc',
              color: '#475569',
              border: '1px solid #cbd5e1',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
              px: 2,
              py: 0.7,
              borderRadius: 1.5,
              '&:hover': {
                bgcolor: '#f1f5f9',
                borderColor: '#94a3b8',
              },
            }}
          >
            Reset Filters
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleApplyFilters}
            sx={{
              bgcolor: '#0f766e',
              color: '#ffffff',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.82rem',
              px: 2.5,
              py: 0.7,
              borderRadius: 1.5,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: '#115e59',
                boxShadow: 'none',
              },
            }}
          >
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>

      {/* Column Manager Drawer (F5) */}
      <ColumnManagerDrawer
        open={columnManagerOpen}
        onClose={() => setColumnManagerOpen(false)}
        columns={columns}
        onColumnsChange={setColumns}
        onResetDefaults={handleResetColumns}
        storageKey={STOCK_REPORT_COLUMNS_KEY}
      />

      {/* Stock Movement Window Modal */}
      {stockMovementOpen && (
        <StockMovementModal
          open={stockMovementOpen}
          onClose={() => setStockMovementOpen(false)}
          companyId={companyId || localStorage.getItem('selectedCompanyId') || ''}
          initialProductId={selectedMovementItem?.productId || undefined}
          initialProductName={selectedMovementItem?.itemName || undefined}
          initialProductImei={selectedMovementItem?.imei || undefined}
        />
      )}
    </Box>
  );
}
