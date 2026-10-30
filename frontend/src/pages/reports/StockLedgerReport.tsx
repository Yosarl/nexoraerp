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
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { stockApi, StockMovementItem } from '../../services/api';
import ColumnManagerDrawer, { ColumnDefinition, mergeReportColumns } from '../../components/reports/ColumnManagerDrawer';
import DateInput, { getCurrentDate } from '../../components/DateInput';

type SortKey = keyof StockMovementItem;
type SortDir = 'asc' | 'desc';

interface AdvancedLedgerFilters {
  category: string;
  brand: string;
  fromDate: string;
  toDate: string;
}

const DEFAULT_FILTERS: AdvancedLedgerFilters = {
  category: 'All',
  brand: 'All',
  fromDate: getCurrentDate(),
  toDate: getCurrentDate(),
};

const DEFAULT_MOVEMENT_COLUMNS: ColumnDefinition[] = [
  { id: 'sl', label: 'SL', defaultLabel: 'SL', width: 45, defaultWidth: 45, visible: true, align: 'center', sortable: true },
  { id: 'itemCode', label: 'Official Med. Code / Item Code', defaultLabel: 'Official Med. Code / Item Code', width: 130, defaultWidth: 130, visible: true, align: 'left', sortable: true },
  { id: 'itemName', label: 'Item Name', defaultLabel: 'Item Name', width: 220, defaultWidth: 220, visible: true, align: 'left', sortable: true },
  { id: 'category', label: 'Category', defaultLabel: 'Category', width: 110, defaultWidth: 110, visible: true, align: 'left', sortable: true },
  { id: 'brand', label: 'Brand', defaultLabel: 'Brand', width: 100, defaultWidth: 100, visible: true, align: 'left', sortable: true },
  { id: 'opening', label: 'Opening', defaultLabel: 'Opening', width: 80, defaultWidth: 80, visible: true, align: 'right', sortable: true },
  { id: 'purchase', label: 'Purchase', defaultLabel: 'Purchase', width: 80, defaultWidth: 80, visible: true, align: 'right', sortable: true },
  { id: 'returnQty', label: 'Return', defaultLabel: 'Return', width: 80, defaultWidth: 80, visible: true, align: 'right', sortable: true },
  { id: 'stockAdjPlus', label: 'SA+', defaultLabel: 'SA+', width: 70, defaultWidth: 70, visible: true, align: 'center', sortable: true },
  { id: 'stockAdjMinus', label: 'SA-', defaultLabel: 'SA-', width: 70, defaultWidth: 70, visible: true, align: 'center', sortable: true },
  { id: 'damage', label: 'Damage', defaultLabel: 'Damage', width: 80, defaultWidth: 80, visible: true, align: 'right', sortable: true },
  { id: 'qty', label: 'Qty', defaultLabel: 'Qty', width: 80, defaultWidth: 80, visible: true, align: 'center', sortable: true },
  { id: 'purchaseRate', label: 'P. Rate', defaultLabel: 'P. Rate', width: 85, defaultWidth: 85, visible: true, align: 'right', sortable: true },
  { id: 'stockValue', label: 'Cost Value', defaultLabel: 'Cost Value', width: 105, defaultWidth: 105, visible: true, align: 'right', sortable: true },
  { id: 'grossValue', label: 'Gross Value', defaultLabel: 'Gross Value', width: 105, defaultWidth: 105, visible: true, align: 'right', sortable: true },
];

const STOCK_MOVEMENT_COLUMNS_KEY = 'stock_movement_report_columns_custom_v3';

function getInitialMovementColumns(): ColumnDefinition[] {
  try {
    const saved =
      localStorage.getItem(STOCK_MOVEMENT_COLUMNS_KEY) ||
      localStorage.getItem('stock_movement_report_columns_custom_v2');
    if (saved) {
      const parsed: ColumnDefinition[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeReportColumns(DEFAULT_MOVEMENT_COLUMNS, parsed);
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_MOVEMENT_COLUMNS;
}

const COL_HEADER_BASE = {
  bgcolor: '#0f766e',
  color: 'white',
  fontWeight: 700,
  fontSize: '0.72rem',
  py: 0.8,
  px: 0.8,
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
        onClick={(e) => {
          e.stopPropagation();
          onSort(field, 'asc');
        }}
        sx={{
          p: 0,
          width: 14,
          height: 12,
          color: isActive && sortDir === 'asc' ? '#ffffff' : 'rgba(255,255,255,0.35)',
          '&:hover': { color: '#ffffff' },
        }}
      >
        <ArrowDropUpIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onSort(field, 'desc');
        }}
        sx={{
          p: 0,
          width: 14,
          height: 12,
          color: isActive && sortDir === 'desc' ? '#ffffff' : 'rgba(255,255,255,0.35)',
          '&:hover': { color: '#ffffff' },
        }}
      >
        <ArrowDropDownIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}

export default function StockLedgerReport() {
  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);

  const [allItems, setAllItems] = useState<StockMovementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Columns & Drawer State
  const [columns, setColumns] = useState<ColumnDefinition[]>(getInitialMovementColumns);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);

  // Search & pagination
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>('sl');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Selected row
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Advanced Filters State
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<AdvancedLedgerFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AdvancedLedgerFilters>(DEFAULT_FILTERS);

  // F5 Keyboard Shortcut listener for Column Manager Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        setColumnManagerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const effectiveCompanyId = companyId || localStorage.getItem('selectedCompanyId') || '';

  // Fetch report data
  const loadLedgerReport = useCallback(async () => {
    if (!effectiveCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await stockApi.getMovement(effectiveCompanyId, {
        category: appliedFilters.category !== 'All' ? appliedFilters.category : undefined,
        brand: appliedFilters.brand !== 'All' ? appliedFilters.brand : undefined,
        fromDate: appliedFilters.fromDate || undefined,
        toDate: appliedFilters.toDate || undefined,
      });

      if (res.data && res.data.success) {
        setAllItems(res.data.data.items || []);
      } else {
        setError('Failed to load stock movement data');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load stock movement report');
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, appliedFilters]);

  useEffect(() => {
    loadLedgerReport();
  }, [loadLedgerReport]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/stock-ledger') {
        loadLedgerReport();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/stock-ledger') || window.location.pathname.includes('/report/stock-ledger')) {
        loadLedgerReport();
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
  }, [loadLedgerReport]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchDebounce);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDebounce]);

  // Handle Sort
  const handleSort = useCallback((key: SortKey, dir: SortDir) => {
    if (sortKey === key && sortDir === dir) {
      setSortKey(null);
      setSortDir('asc');
    } else {
      setSortKey(key);
      setSortDir(dir);
    }
  }, [sortKey, sortDir]);

  const handleResetColumns = () => {
    setColumns(DEFAULT_MOVEMENT_COLUMNS);
    try {
      localStorage.removeItem(STOCK_MOVEMENT_COLUMNS_KEY);
    } catch {}
  };

  // Filter options derived from current items
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const val = (i.category || '').trim();
      if (val) set.add(val);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allItems]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const val = (i.brand || '').trim();
      if (val) set.add(val);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allItems]);

  // Search filtering
  const searchedItems = useMemo(() => {
    if (!search) return allItems;
    const s = search.toLowerCase();
    return allItems.filter(
      (i) =>
        (i.itemName && i.itemName.toLowerCase().includes(s)) ||
        (i.itemCode && i.itemCode.toLowerCase().includes(s)) ||
        (i.category && i.category.toLowerCase().includes(s)) ||
        (i.brand && i.brand.toLowerCase().includes(s))
    );
  }, [allItems, search]);

  // Sort items
  const sortedItems = useMemo(() => {
    if (!sortKey) return searchedItems;
    return [...searchedItems].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
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
  }, [searchedItems, sortKey, sortDir]);

  // Paginated items
  const total = sortedItems.length;
  const paginatedItems = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedItems.slice(start, start + rowsPerPage);
  }, [sortedItems, page, rowsPerPage]);

  // Summary Metrics
  const totalOpening = searchedItems.reduce((s, i) => s + i.opening, 0);
  const totalPurchase = searchedItems.reduce((s, i) => s + i.purchase, 0);
  const totalReturn = searchedItems.reduce((s, i) => s + i.returnQty, 0);
  const totalStockAdjPlus = searchedItems.reduce((s, i) => s + i.stockAdjPlus, 0);
  const totalStockAdjMinus = searchedItems.reduce((s, i) => s + i.stockAdjMinus, 0);
  const totalDamage = searchedItems.reduce((s, i) => s + i.damage, 0);
  const totalQty = searchedItems.reduce((s, i) => s + i.qty, 0);
  const totalStockValue = searchedItems.reduce((s, i) => s + i.stockValue, 0);
  const totalGrossValue = searchedItems.reduce((s, i) => s + (i.grossValue || 0), 0);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (appliedFilters.category && appliedFilters.category !== 'All') count++;
    if (appliedFilters.brand && appliedFilters.brand !== 'All') count++;
    if (appliedFilters.fromDate || appliedFilters.toDate) count++;
    return count;
  }, [appliedFilters]);

  // Quick Date presets
  const handleSetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setAppliedFilters((prev) => ({ ...prev, fromDate: today, toDate: today }));
    setPage(0);
  };

  const handleSetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setAppliedFilters((prev) => ({ ...prev, fromDate: firstDay, toDate: lastDay }));
    setPage(0);
  };

  const handleSetAllTime = () => {
    setAppliedFilters((prev) => ({ ...prev, fromDate: '', toDate: '' }));
    setPage(0);
  };

  // Filter Dialog handlers
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
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPage(0);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (searchedItems.length === 0) return;
    const headers = [
      'SL',
      'ITEM CODE',
      'ITEM NAME',
      'CATEGORY',
      'BRAND',
      'OPENING',
      'PURCHASE',
      'RETURN',
      'SA+',
      'SA-',
      'DAMAGE',
      'QTY',
      'P. RATE',
      'COST VALUE',
      'GROSS VALUE',
    ];
    const rows = searchedItems.map((item, idx) => [
      idx + 1,
      `"${item.itemCode || ''}"`,
      `"${item.itemName || ''}"`,
      `"${item.category || ''}"`,
      `"${item.brand || ''}"`,
      item.opening,
      item.purchase,
      item.returnQty,
      item.stockAdjPlus,
      item.stockAdjMinus,
      item.damage,
      item.qty,
      item.purchaseRate || 0,
      item.stockValue.toFixed(2),
      (item.grossValue || 0).toFixed(2),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Movement_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const tableMinWidth = useMemo(() => Math.max(1100, visibleColumns.reduce((sum, col) => sum + col.width, 0)), [visibleColumns]);

  const renderMovementCell = (item: StockMovementItem, colId: string, idx: number) => {
    switch (colId) {
      case 'sl':
        return (
          <Typography sx={{ fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
            {page * rowsPerPage + idx + 1}
          </Typography>
        );
      case 'itemCode':
        return (
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#334155' }}>
            {item.itemCode || '-'}
          </Typography>
        );
      case 'itemName':
        return (
          <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: '0.78rem' }}>
            {item.itemName}
          </Typography>
        );
      case 'category':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.category || '-'}</Typography>;
      case 'brand':
        return <Typography sx={{ fontSize: '0.78rem' }}>{item.brand || '-'}</Typography>;
      case 'opening':
        return (
          <Typography sx={{ textAlign: 'right', color: '#334155', fontSize: '0.78rem' }}>
            {item.opening.toLocaleString()}
          </Typography>
        );
      case 'purchase':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 600, color: '#059669', fontSize: '0.78rem' }}>
            {item.purchase.toLocaleString()}
          </Typography>
        );
      case 'returnQty':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 600, color: '#d97706', fontSize: '0.78rem' }}>
            {item.returnQty.toLocaleString()}
          </Typography>
        );
      case 'stockAdjPlus':
        return (
          <Chip
            label={item.stockAdjPlus.toLocaleString()}
            size="small"
            sx={{
              bgcolor: '#f0fdf4',
              color: '#16a34a',
              fontWeight: 700,
              fontSize: '0.72rem',
              height: 22,
              border: '1px solid #bbf7d0',
            }}
          />
        );
      case 'stockAdjMinus':
        return (
          <Chip
            label={item.stockAdjMinus.toLocaleString()}
            size="small"
            sx={{
              bgcolor: '#fef2f2',
              color: '#dc2626',
              fontWeight: 700,
              fontSize: '0.72rem',
              height: 22,
              border: '1px solid #fecaca',
            }}
          />
        );
      case 'damage':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 600, color: '#ef4444', fontSize: '0.78rem' }}>
            {item.damage.toLocaleString()}
          </Typography>
        );
      case 'qty':
        return (
          <Chip
            label={item.qty.toLocaleString()}
            size="small"
            sx={{
              bgcolor: item.qty <= 0 ? '#fef2f2' : '#f0fdfa',
              color: item.qty <= 0 ? '#dc2626' : '#0f766e',
              fontWeight: 700,
              fontSize: '0.75rem',
              height: 22,
              border: `1px solid ${item.qty <= 0 ? '#fecaca' : '#ccfbf1'}`,
            }}
          />
        );
      case 'purchaseRate':
        return (
          <Typography sx={{ textAlign: 'right', fontSize: '0.78rem' }}>
            {(item.purchaseRate || 0).toFixed(2)}
          </Typography>
        );
      case 'stockValue':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 700, color: '#0f766e', fontSize: '0.78rem' }}>
            {item.stockValue.toFixed(2)}
          </Typography>
        );
      case 'grossValue':
        return (
          <Typography sx={{ textAlign: 'right', fontWeight: 700, color: '#047857', fontSize: '0.78rem' }}>
            {(item.grossValue || 0).toFixed(2)}
          </Typography>
        );
      default:
        return null;
    }
  };

  if (!companyId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select a company to view the stock movement report.</Alert>
      </Box>
    );
  }

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
      {/* TOP HEADER: Filters & Control Bar */}
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
        <Grid container spacing={1} alignItems="center">
          {/* Title Badge */}
          <Grid item>
            <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.5, px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <CompareArrowsIcon sx={{ color: 'white', fontSize: 20 }} />
              <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.85rem' }}>
                Stock Movement Report
              </Typography>
            </Box>
          </Grid>

          {/* Search Input */}
          <Grid item xs sx={{ minWidth: 220 }}>
            <TextField
              size="small"
              placeholder="Search product code, name, category, brand..."
              value={searchDebounce}
              onChange={(e) => setSearchDebounce(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#0f766e', fontSize: 18 }} />
                  </InputAdornment>
                ),
                endAdornment: searchDebounce ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchDebounce('')} sx={{ p: 0.3 }}>
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
          </Grid>

          {/* Quick Date Presets */}
          <Grid item>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleSetToday}
                sx={{
                  height: 34,
                  borderRadius: 1.5,
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  px: 1.2,
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                Today
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleSetThisMonth}
                sx={{
                  height: 34,
                  borderRadius: 1.5,
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  px: 1.2,
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                This Month
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleSetAllTime}
                sx={{
                  height: 34,
                  borderRadius: 1.5,
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  px: 1.2,
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                All Time
              </Button>
            </Box>
          </Grid>

          {/* Refresh Button */}
          <Grid item>
            <Button
              size="small"
              variant="outlined"
              onClick={loadLedgerReport}
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
                title="Open Stock Movement Filters"
              >
                ➕ Filter
              </Button>
            </Badge>
          </Grid>

          {/* Excel Export Button */}
          <Grid item>
            <Button
              size="small"
              variant="contained"
              onClick={handleExportCSV}
              disabled={searchedItems.length === 0}
              startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
              sx={{
                height: 34,
                borderRadius: 1.5,
                bgcolor: '#059669',
                color: '#ffffff',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                px: 1.8,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#047857',
                  boxShadow: 'none',
                },
              }}
            >
              Excel
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 1, mt: 0.5, flexShrink: 0, borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}

      {/* CENTER: Data Table */}
      <Box
        sx={{
          flex: 1,
          mx: 1,
          my: 0.8,
          bgcolor: 'white',
          borderRadius: 2,
          border: '1px solid #e0e7ef',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
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
                      <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'white' }}>
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
                  <TableCell colSpan={visibleColumns.length || 1} sx={{ textAlign: 'center', py: 8 }}>
                    <CircularProgress sx={{ color: '#0f766e', mb: 1 }} />
                    <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>Loading movement data...</Typography>
                  </TableCell>
                </TableRow>
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length || 1} sx={{ textAlign: 'center', py: 8 }}>
                    <CompareArrowsIcon sx={{ fontSize: 44, color: '#cbd5e1', mb: 1 }} />
                    <Typography sx={{ fontWeight: 600, color: '#64748b', fontSize: '0.92rem' }}>
                      No Stock Movement Data Found
                    </Typography>
                    <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                      Try adjusting the search query or filter options.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item, idx) => {
                  const isSelected = selectedRowId === item.id;
                  const cellSx = {
                    py: 0.6,
                    px: 0.8,
                    fontSize: '0.78rem',
                    color: '#1e293b',
                    borderBottom: '1px solid #f1f5f9',
                  };

                  return (
                    <TableRow
                      key={item.id || idx}
                      onClick={() => setSelectedRowId(isSelected ? null : item.id)}
                      sx={{
                        bgcolor: isSelected ? '#ecfdf5' : idx % 2 === 0 ? '#fff' : '#f8fafc',
                        '&:hover': { bgcolor: isSelected ? '#d1fae5' : '#f0fdf4' },
                        outline: isSelected ? '2px solid #0f766e' : 'none',
                        outlineOffset: -2,
                        cursor: 'pointer',
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
                          {renderMovementCell(item, col.id, idx)}
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
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
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

      {/* BOTTOM SUMMARY FOOTER */}
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
          Summary Totals:
        </Typography>
        {[
          { label: 'Items', value: String(searchedItems.length), color: '#ffffff' },
          { label: 'Opening', value: totalOpening.toLocaleString(), color: '#ffffff' },
          { label: 'Purchase', value: totalPurchase.toLocaleString(), color: '#a7f3d0' },
          { label: 'Return', value: totalReturn.toLocaleString(), color: '#fde68a' },
          { label: 'SA+', value: totalStockAdjPlus.toLocaleString(), color: '#86efac' },
          { label: 'SA-', value: totalStockAdjMinus.toLocaleString(), color: '#fca5a5' },
          { label: 'Damage', value: totalDamage.toLocaleString(), color: '#f87171' },
          { label: 'Closing Qty', value: totalQty.toLocaleString(), color: '#99f6e4' },
          { label: 'Stock Value Cost', value: totalStockValue.toFixed(2), color: '#fef08a' },
          { label: 'Stock Value Gross', value: totalGrossValue.toFixed(2), color: '#86efac' },
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase' }}>
              {t.label}:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: t.color, fontSize: '0.8rem' }}>
              {t.value}
            </Typography>
          </Box>
        ))}
      </Paper>

      {/* Advanced Filter Dialog */}
      <Dialog
        open={filterDialogOpen}
        onClose={handleCloseFilter}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            border: '1.5px solid #0f766e',
            overflow: 'hidden',
          },
        }}
      >
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
              Stock Movement Filters
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleCloseFilter} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 2.5, bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Date Range Section */}
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f766e', mb: 1 }}>
              DATE RANGE
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={6}>
                <DateInput
                  size="small"
                  label="From Date"
                  value={draftFilters.fromDate}
                  onChange={(val) => setDraftFilters((prev) => ({ ...prev, fromDate: val }))}
                  fullWidth
                  sx={{ bgcolor: 'white' }}
                />
              </Grid>
              <Grid item xs={6}>
                <DateInput
                  size="small"
                  label="To Date"
                  value={draftFilters.toDate}
                  onChange={(val) => setDraftFilters((prev) => ({ ...prev, toDate: val }))}
                  fullWidth
                  sx={{ bgcolor: 'white' }}
                />
              </Grid>
            </Grid>
          </Box>

          {/* Category & Brand */}
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
              Category
            </Typography>
            <Autocomplete
              size="small"
              options={categoryOptions}
              value={draftFilters.category}
              onChange={(_, v) => setDraftFilters((prev) => ({ ...prev, category: v || 'All' }))}
              disableClearable
              renderInput={(params) => <TextField {...params} sx={{ bgcolor: 'white' }} />}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
              Brand
            </Typography>
            <Autocomplete
              size="small"
              options={brandOptions}
              value={draftFilters.brand}
              onChange={(_, v) => setDraftFilters((prev) => ({ ...prev, brand: v || 'All' }))}
              disableClearable
              renderInput={(params) => <TextField {...params} sx={{ bgcolor: 'white' }} />}
            />
          </Box>
        </DialogContent>

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
              '&:hover': { bgcolor: '#f1f5f9' },
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
              '&:hover': { bgcolor: '#115e59', boxShadow: 'none' },
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
        storageKey={STOCK_MOVEMENT_COLUMNS_KEY}
      />
    </Box>
  );
}
