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
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import InventoryIcon from '@mui/icons-material/Inventory';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import LayersIcon from '@mui/icons-material/Layers';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { stockApi, productApi } from '../../services/api';

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
  sellingPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  specialPrice1: number;
  specialPrice2: number;
  expiryDate: string | null;
  branch: string;
  sellerName: string;
}

type SortKey = keyof StockItem;
type SortDir = 'asc' | 'desc';
type ReportMode = 'batch' | 'avg' | 'lastPurchase';

interface SearchFieldOption {
  id: string;
  label: string;
}

const SEARCH_FIELDS: SearchFieldOption[] = [
  { id: 'all', label: 'All' },
  { id: 'itemName', label: 'Item Name' },
  { id: 'imei', label: 'IMEI / Barcode' },
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
  { id: 'totalPurchaseRate', label: 'Total P. Rate' },
];

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

/** Format ISO date string (yyyy-mm-dd) to dd/mm/yy */
function formatDateDDMMYY(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

// All searchable string fields
const STRING_SEARCH_KEYS: (keyof StockItem)[] = [
  'itemName', 'imei', 'batchNumber', 'itemGroup', 'brand', 'category', 'branch', 'sellerName', 'expiryDate',
];
// All searchable numeric fields
const NUMERIC_SEARCH_KEYS: (keyof StockItem)[] = [
  'qtyAvailable', 'purchaseRate', 'totalPurchaseRate', 'sellingPrice',
  'retailPrice', 'wholesalePrice', 'specialPrice1', 'specialPrice2',
];

/** Filter items by search term across selected field or all fields */
function filterItems(items: StockItem[], search: string, fieldId: string): StockItem[] {
  if (!search) return items;
  const sl = search.toLowerCase();

  if (fieldId !== 'all') {
    // Search in a specific field
    const isNumeric = NUMERIC_SEARCH_KEYS.includes(fieldId as keyof StockItem);
    return items.filter((item) => {
      const val = item[fieldId as keyof StockItem];
      if (val == null) return false;
      if (isNumeric) return String(val).includes(search);
      return String(val).toLowerCase().includes(sl);
    });
  }

  // "All" — search across every field
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
  const [mode, setMode] = useState<ReportMode>('batch');

  // Show only +ve qty filter
  const [showPositiveOnly, setShowPositiveOnly] = useState(false);

  // Selected row
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

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

  // 1. Search filter (across all fields)
  const searchedItems = useMemo(() => {
    return filterItems(allItems, search, searchField.id);
  }, [allItems, search, searchField]);

  // 2. +ve qty filter
  const filteredItems = useMemo(() => {
    return showPositiveOnly ? searchedItems.filter((i) => i.qtyAvailable > 0) : searchedItems;
  }, [searchedItems, showPositiveOnly]);

  // 3. Sort
  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems;
    return [...filteredItems].sort((a, b) => {
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
  }, [filteredItems, sortKey, sortDir]);

  // 4. Pagination (on the filtered+sorted items)
  const total = sortedItems.length;
  const paginatedItems = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedItems.slice(start, start + rowsPerPage);
  }, [sortedItems, page, rowsPerPage]);

  // Fetch ALL items from backend (no search, no pagination — we handle it client-side)
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

  // Reset page when mode changes
  const handleModeChange = (_: React.ChangeEvent<HTMLInputElement>, value: string) => {
    setMode(value as ReportMode);
    setPage(0);
    setSelectedRowId(null);
  };

  // Debounce search
  const [searchDebounce, setSearchDebounce] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchDebounce);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchDebounce]);

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  // Summary calculations (on all filtered items, not just current page)
  const totalStockValue = filteredItems.reduce((s, i) => s + i.totalPurchaseRate, 0);
  const totalSellingValue = filteredItems.reduce((s, i) => s + i.qtyAvailable * i.sellingPrice, 0);
  const totalRetailValue = filteredItems.reduce((s, i) => s + i.qtyAvailable * i.retailPrice, 0);
  const totalWholesaleValue = filteredItems.reduce((s, i) => s + i.qtyAvailable * i.wholesalePrice, 0);
  const totalQty = filteredItems.reduce((s, i) => s + i.qtyAvailable, 0);

  // Helper to render a sortable header
  const SH = ({ label, field, width, align, last }: { label: string; field: SortKey; width: number; align?: string; last?: boolean }) => (
    <TableCell
      sx={{
        ...COL_HEADER_BASE,
        width,
        textAlign: align || 'left',
        ...(last ? { borderRight: 'none' } : {}),
      }}
    >
      {label}
      <SortArrows field={field} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
    </TableCell>
  );

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
                label="Batch Wise"
                sx={radioLabelSx}
              />
              <FormControlLabel
                value="avg"
                control={<Radio size="small" sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }} />}
                label="Avg Stock"
                sx={radioLabelSx}
              />
              <FormControlLabel
                value="lastPurchase"
                control={<Radio size="small" sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }} />}
                label="Last Purchase Rate"
                sx={radioLabelSx}
              />
            </RadioGroup>
          </Grid>

          <Grid item>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={showPositiveOnly}
                  onChange={(e) => setShowPositiveOnly(e.target.checked)}
                  sx={{ p: 0.3, '&.Mui-checked': { color: '#0f766e' } }}
                />
              }
              label="Show +ve Qty"
              sx={{
                ml: 0,
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  color: '#334155',
                },
              }}
            />
          </Grid>

          {/* Spacer */}
          <Grid item sx={{ flex: 1 }} />

          {/* Item count & double-click hint */}
          <Grid item sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`${total} items`}
              size="small"
              sx={{ bgcolor: '#f0fdfa', color: '#0f766e', fontWeight: 700, fontSize: '0.72rem', height: 24, border: '1px solid #99f6e4' }}
            />
            <Tooltip title="Double-click any row in the table to inspect multi-unit packaging, stock breakdown, and prices">
              <Chip
                icon={<LayersIcon sx={{ fontSize: '14px !important', color: '#0f766e !important' }} />}
                label="Double-click row for Multi-Units"
                size="small"
                sx={{
                  bgcolor: '#f8fafc',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  height: 24,
                  border: '1px solid #cbd5e1',
                  cursor: 'help',
                }}
              />
            </Tooltip>
          </Grid>

          {/* Search Field Combobox */}
          <Grid item>
            <Autocomplete
              size="small"
              options={SEARCH_FIELDS}
              getOptionLabel={(opt) => opt.label}
              value={searchField}
              onChange={(_, v) => {
                setSearchField(v || SEARCH_FIELDS[0]);
                setPage(0);
              }}
              disableClearable
              sx={{ width: 160 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search In"
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 1.5, bgcolor: '#f8fafc', height: 34,
                      '& fieldset': { borderColor: '#e2e8f0' },
                    },
                    '& .MuiOutlinedInput-input': { fontSize: '0.78rem', py: 0.3 },
                    '& .MuiInputLabel-root': { fontSize: '0.72rem', fontWeight: 600, color: '#64748b' },
                  }}
                />
              )}
              renderOption={(props, opt) => (
                <li {...props} key={opt.id} style={{ fontSize: '0.8rem', fontWeight: opt.id === 'all' ? 700 : 400, color: opt.id === 'all' ? '#0f766e' : '#334155', padding: '5px 14px' }}>
                  {opt.label}
                </li>
              )}
            />
          </Grid>

          {/* Search Box */}
          <Grid item>
            <TextField
              size="small"
              placeholder={searchField.id === 'all' ? 'Search all fields...' : `Search by ${searchField.label}...`}
              value={searchDebounce}
              onChange={(e) => setSearchDebounce(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                width: 280,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5, bgcolor: '#f8fafc', height: 34,
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#0f766e' },
                  '&.Mui-focused fieldset': { borderColor: '#0f766e' },
                },
                '& .MuiOutlinedInput-input': { fontSize: '0.78rem', py: 0.3 },
              }}
            />
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
          <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 1900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...COL_HEADER_BASE, width: 35, textAlign: 'center' }}>Sl</TableCell>
                <TableCell sx={{ ...COL_HEADER_BASE, width: 100 }}>IMEI</TableCell>
                <SH label="Item Name" field="itemName" width={160} />
                <SH label="Batch No" field="batchNumber" width={100} />
                <SH label="Qty" field="qtyAvailable" width={55} align="center" />
                <SH label="P. Rate" field="purchaseRate" width={72} align="right" />
                <SH label="Total P. Rate" field="totalPurchaseRate" width={85} align="right" />
                <SH label="Selling Price" field="sellingPrice" width={95} align="right" />
                <SH label="Retail Price" field="retailPrice" width={95} align="right" />
                <SH label="Wholesale" field="wholesalePrice" width={75} align="right" />
                <SH label="Sp. Price 1" field="specialPrice1" width={72} align="right" />
                <SH label="Sp. Price 2" field="specialPrice2" width={72} align="right" />
                <SH label="Expiry Date" field="expiryDate" width={85} align="center" />
                <SH label="Branch" field="branch" width={90} />
                <SH label="Seller Name" field="sellerName" width={90} />
                <SH label="Item Group" field="itemGroup" width={90} />
                <SH label="Brand" field="brand" width={85} />
                <SH label="Category" field="category" width={90} last />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={18} align="center" sx={{ py: 8 }}>
                    <CircularProgress size={28} sx={{ color: '#0f766e' }} />
                    <Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>
                      Loading stock data...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={18} align="center" sx={{ py: 8 }}>
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
                  const isLowStock = item.qtyAvailable > 0 && item.qtyAvailable <= 5;
                  const isOutOfStock = item.qtyAvailable <= 0;
                  const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                  const isExpiringSoon =
                    item.expiryDate &&
                    !isExpired &&
                    new Date(item.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
                      <TableCell sx={{ ...cellSx, textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '0.75rem' }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {item.imei || '-'}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 600, color: '#0f172a' }}>
                        {item.itemName}
                      </TableCell>
                      <TableCell sx={{ ...cellSx }}>
                        {item.batchNumber || '-'}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
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
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        {item.purchaseRate.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 600 }}>
                        {item.totalPurchaseRate.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        {item.sellingPrice.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        {item.retailPrice.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        {item.wholesalePrice.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        {item.specialPrice1 ? item.specialPrice1.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                        {item.specialPrice2 ? item.specialPrice2.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        {item.expiryDate ? (
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
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx }}>{item.branch}</TableCell>
                      <TableCell sx={{ ...cellSx }}>{item.sellerName}</TableCell>
                      <TableCell sx={{ ...cellSx }}>{item.itemGroup || '-'}</TableCell>
                      <TableCell sx={{ ...cellSx }}>{item.brand || '-'}</TableCell>
                      <TableCell sx={{ ...cellSx }}>{item.category || '-'}</TableCell>
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
          { label: 'Stock Value (Cost)', value: totalStockValue.toFixed(2), color: '#a7f3d0' },
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
        {/* Header */}
        <DialogTitle
          sx={{
            m: 0,
            py: 1.8,
            px: 3,
            background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LayersIcon sx={{ color: 'white', fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2 }}>
                Multi-Unit Details
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.76rem' }}>
                Unit IMEI, available stock breakdown, and selling rates
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={() => setMultiUnitDialogOpen(false)}
            sx={{
              color: 'white',
              bgcolor: 'rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
              p: 0.8,
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, bgcolor: '#f8fafc' }}>
          {multiUnitLoading ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <CircularProgress size={36} sx={{ color: '#0f766e' }} />
              <Typography variant="body2" sx={{ mt: 1.5, color: '#64748b', fontWeight: 500 }}>
                Loading Multi-Unit information...
              </Typography>
            </Box>
          ) : multiUnitError ? (
            <Box sx={{ p: 3 }}>
              <Alert severity="error">{multiUnitError}</Alert>
            </Box>
          ) : selectedStockItem ? (() => {
            const baseUnitCode = typeof multiUnitProduct?.unitOfMeasureId === 'object' && multiUnitProduct.unitOfMeasureId?.shortCode
              ? multiUnitProduct.unitOfMeasureId.shortCode
              : (typeof multiUnitProduct?.unitOfMeasureId === 'object' && multiUnitProduct.unitOfMeasureId?.name
                ? multiUnitProduct.unitOfMeasureId.name
                : 'PCS');

            const hasMultiUnits = Array.isArray(multiUnitProduct?.multiUnits) && multiUnitProduct.multiUnits.length > 0;
            const currentQty = selectedStockItem.qtyAvailable;

            return (
              <Box sx={{ p: 2.5 }}>
                {/* Product Summary Header Card */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={7}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Product Name
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem', lineHeight: 1.3 }}>
                        {selectedStockItem.itemName}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.8, flexWrap: 'wrap' }}>
                        {multiUnitProduct?.code && (
                          <Chip
                            label={`Code: ${multiUnitProduct.code}`}
                            size="small"
                            sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600, fontSize: '0.72rem', height: 22 }}
                          />
                        )}
                        {selectedStockItem.brand && (
                          <Chip
                            label={`Brand: ${selectedStockItem.brand}`}
                            size="small"
                            sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 500, fontSize: '0.72rem', height: 22 }}
                          />
                        )}
                        {selectedStockItem.category && (
                          <Chip
                            label={`Category: ${selectedStockItem.category}`}
                            size="small"
                            sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 500, fontSize: '0.72rem', height: 22 }}
                          />
                        )}
                      </Box>
                    </Grid>

                    <Grid item xs={12} sm={5}>
                      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: { xs: 'flex-start', sm: 'flex-end' }, flexWrap: 'wrap' }}>
                        <Box sx={{ p: 1.2, bgcolor: '#f0fdfa', borderRadius: 1.5, border: '1px solid #99f6e4', minWidth: 120 }}>
                          <Typography variant="caption" sx={{ color: '#0f766e', fontWeight: 600, display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                            Current Base Stock
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f766e', fontSize: '1.05rem' }}>
                            {currentQty} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{baseUnitCode}</span>
                          </Typography>
                        </Box>
                        {selectedStockItem.batchNumber && (
                          <Box sx={{ p: 1.2, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0', minWidth: 110 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                              Batch Number
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#334155', fontSize: '0.95rem' }}>
                              {selectedStockItem.batchNumber}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Multi-Unit Details Table */}
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 2,
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    bgcolor: '#ffffff',
                  }}
                >
                  <Box sx={{ px: 2, py: 1.2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Units, IMEIs & Rates
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.73rem' }}>
                      Currency: AED
                    </Typography>
                  </Box>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1 }}>Unit</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1 }}>IMEI / Barcode</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1, textAlign: 'center' }}>Pcs Inside</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1, textAlign: 'right' }}>Stock in Unit</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1, textAlign: 'right' }}>Retail Price</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1, textAlign: 'right' }}>Wholesale</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1, textAlign: 'right' }}>Sp. Price 1</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', py: 1, textAlign: 'right' }}>Sp. Price 2</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {/* 1. Base Unit Row */}
                        <TableRow sx={{ bgcolor: '#f0fdfa', '&:hover': { bgcolor: '#ccfbf1' } }}>
                          <TableCell sx={{ py: 1, fontSize: '0.8rem', fontWeight: 700, color: '#0f766e' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{baseUnitCode}</span>
                              <Chip label="Base Unit" size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#0f766e', color: 'white' }} />
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.78rem', fontFamily: 'monospace', color: '#334155' }}>
                            {selectedStockItem.imei || multiUnitProduct?.imei || '—'}
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.78rem', textAlign: 'center', color: '#64748b' }}>
                            1
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.82rem', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                            {currentQty} {baseUnitCode}
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }}>
                            {(multiUnitProduct?.retailPrice ?? selectedStockItem.retailPrice ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', fontWeight: 500 }}>
                            {(multiUnitProduct?.wholesalePrice ?? selectedStockItem.wholesalePrice ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', color: '#64748b' }}>
                            {(multiUnitProduct?.specialPrice ?? selectedStockItem.specialPrice1) ? Number(multiUnitProduct?.specialPrice ?? selectedStockItem.specialPrice1).toFixed(2) : '—'}
                          </TableCell>
                          <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', color: '#64748b' }}>
                            {(multiUnitProduct?.specialPrice2 ?? selectedStockItem.specialPrice2) ? Number(multiUnitProduct?.specialPrice2 ?? selectedStockItem.specialPrice2).toFixed(2) : '—'}
                          </TableCell>
                        </TableRow>

                        {/* 2. Multi-Unit Rows */}
                        {hasMultiUnits && multiUnitProduct.multiUnits.map((mu: any, mIdx: number) => {
                          const unitName = typeof mu.unitId === 'object' && mu.unitId?.shortCode
                            ? mu.unitId.shortCode
                            : (typeof mu.unitId === 'object' && mu.unitId?.name ? mu.unitId.name : 'Unit');
                          const conv = Number(mu.conversion) || 1;
                          const exactStock = conv > 0 ? (currentQty / conv) : 0;
                          const wholeStock = conv > 0 ? Math.floor(currentQty / conv) : 0;
                          const remPcs = conv > 0 ? (currentQty % conv) : 0;

                          return (
                            <TableRow key={mu.multiUnitId || mIdx} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                              <TableCell sx={{ py: 1, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <span>{unitName}</span>
                                  <Chip label="Multi Unit" size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }} />
                                </Box>
                              </TableCell>
                              <TableCell sx={{ py: 1, fontSize: '0.78rem', fontFamily: 'monospace', color: '#1e293b' }}>
                                {mu.imei || '—'}
                              </TableCell>
                              <TableCell sx={{ py: 1, fontSize: '0.78rem', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                                {conv} {baseUnitCode}
                              </TableCell>
                              <TableCell sx={{ py: 1, textAlign: 'right' }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: exactStock > 0 ? '#0f766e' : '#dc2626', fontSize: '0.82rem' }}>
                                  {exactStock.toFixed(2)} {unitName}
                                </Typography>
                                {conv > 1 && currentQty > 0 && (
                                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem', display: 'block' }}>
                                    {wholeStock} {unitName}{remPcs > 0 ? ` + ${remPcs} ${baseUnitCode}` : ''}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }}>
                                {mu.retail != null ? Number(mu.retail).toFixed(2) : '—'}
                              </TableCell>
                              <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', fontWeight: 500 }}>
                                {mu.wholesale != null ? Number(mu.wholesale).toFixed(2) : '—'}
                              </TableCell>
                              <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', color: '#64748b' }}>
                                {mu.specialPrice1 != null ? Number(mu.specialPrice1).toFixed(2) : '—'}
                              </TableCell>
                              <TableCell sx={{ py: 1, fontSize: '0.8rem', textAlign: 'right', color: '#64748b' }}>
                                {mu.specialPrice2 != null ? Number(mu.specialPrice2).toFixed(2) : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {!hasMultiUnits && (
                    <Box sx={{ p: 2, textAlign: 'center', bgcolor: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic' }}>
                        No additional multi-unit packaging defined for this product. The base unit rates apply.
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Box>
            );
          })() : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5, bgcolor: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
          <Button
            variant="contained"
            onClick={() => setMultiUnitDialogOpen(false)}
            autoFocus
            sx={{
              bgcolor: '#0f766e',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              px: 3,
              borderRadius: 1.5,
              '&:hover': { bgcolor: '#115e59' },
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
