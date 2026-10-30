import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  InputAdornment,
  Grid,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { stockApi, StockMovementItem } from '../../services/api';
import DateInput, { getCurrentDate } from '../DateInput';

interface StockMovementModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  initialProductId?: string | null;
  initialProductName?: string | null;
  initialProductImei?: string | null;
}

export default function StockMovementModal({
  open,
  onClose,
  companyId,
  initialProductId,
  initialProductName,
  initialProductImei,
}: StockMovementModalProps) {
  const [items, setItems] = useState<StockMovementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active product filter (can be cleared by user inside modal)
  const [activeProductId, setActiveProductId] = useState<string | null | undefined>(initialProductId);
  const [activeProductName, setActiveProductName] = useState<string | null | undefined>(initialProductName);

  // Sync initial product when opened
  useEffect(() => {
    if (open) {
      setActiveProductId(initialProductId);
      setActiveProductName(initialProductName);
    }
  }, [open, initialProductId, initialProductName]);

  // Filters
  const [fromDate, setFromDate] = useState<string>(getCurrentDate);
  const [toDate, setToDate] = useState<string>(getCurrentDate);
  const [search, setSearch] = useState('');

  const effectiveCompanyId = companyId || localStorage.getItem('selectedCompanyId') || '';

  const fetchMovement = useCallback(async () => {
    if (!effectiveCompanyId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await stockApi.getMovement(effectiveCompanyId, {
        productId: activeProductId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
      });

      if (res.data && res.data.success) {
        setItems(res.data.data.items || []);
      } else {
        setError('Failed to fetch stock movement data');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error fetching stock movement data');
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, open, activeProductId, fromDate, toDate, search]);

  useEffect(() => {
    if (open) {
      fetchMovement();
    }
  }, [open, fetchMovement]);

  // Quick date presets
  const handleSetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setFromDate(today);
    setToDate(today);
  };

  const handleSetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setFromDate(firstDay);
    setToDate(lastDay);
  };

  const handleSetAllTime = () => {
    setFromDate('');
    setToDate('');
  };

  // Filtered items
  const displayItems = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(
      (i) =>
        i.itemName.toLowerCase().includes(s) ||
        i.itemCode.toLowerCase().includes(s) ||
        (i.category && i.category.toLowerCase().includes(s)) ||
        (i.brand && i.brand.toLowerCase().includes(s))
    );
  }, [items, search]);

  // Summary Totals
  const totalOpening = displayItems.reduce((s, i) => s + i.opening, 0);
  const totalPurchase = displayItems.reduce((s, i) => s + i.purchase, 0);
  const totalReturn = displayItems.reduce((s, i) => s + i.returnQty, 0);
  const totalStockAdjPlus = displayItems.reduce((s, i) => s + i.stockAdjPlus, 0);
  const totalStockAdjMinus = displayItems.reduce((s, i) => s + i.stockAdjMinus, 0);
  const totalDamage = displayItems.reduce((s, i) => s + i.damage, 0);
  const totalQty = displayItems.reduce((s, i) => s + i.qty, 0);
  const totalStockValue = displayItems.reduce((s, i) => s + i.stockValue, 0);
  const totalGrossValue = displayItems.reduce((s, i) => s + (i.grossValue || 0), 0);

  // CSV Export
  const handleExportCSV = () => {
    if (displayItems.length === 0) return;
    const headers = [
      'SL',
      'ITEM CODE',
      'ITEM NAME',
      'OPENING',
      'PURCHASE',
      'RETURN',
      'SA+',
      'SA-',
      'DAMAGE',
      'QTY',
      'COST VALUE',
      'GROSS VALUE',
    ];
    const rows = displayItems.map((item, idx) => [
      idx + 1,
      `"${item.itemCode || ''}"`,
      `"${item.itemName || ''}"`,
      item.opening,
      item.purchase,
      item.returnQty,
      item.stockAdjPlus,
      item.stockAdjMinus,
      item.damage,
      item.qty,
      item.stockValue.toFixed(2),
      (item.grossValue || 0).toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Movement_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const headerSx = {
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <Box
            sx={{
              bgcolor: 'rgba(255,255,255,0.2)',
              borderRadius: 1.5,
              p: 0.6,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CompareArrowsIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2 }}>
              Stock Movement Window
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#99f6e4' }}>
                {activeProductName
                  ? `Product: ${activeProductName} ${initialProductImei ? `(${initialProductImei})` : ''}`
                  : 'All Products Stock Movement'}
              </Typography>
              {activeProductId && (
                <Chip
                  label="Show All Products"
                  size="small"
                  onClick={() => {
                    setActiveProductId(null);
                    setActiveProductName(null);
                  }}
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    bgcolor: 'rgba(255,255,255,0.25)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' },
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
        <IconButton onClick={onClose} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Filter Toolbar */}
      <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <Grid container spacing={1.5} alignItems="center">
          {/* Quick Date Presets */}
          <Grid item xs={12} sm={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>
                RANGE:
              </Typography>
              <Chip
                label="Today"
                size="small"
                onClick={handleSetToday}
                sx={{
                  fontSize: '0.72rem',
                  height: 26,
                  cursor: 'pointer',
                  bgcolor: fromDate && fromDate === toDate ? '#0f766e' : '#f0fdfa',
                  color: fromDate && fromDate === toDate ? 'white' : '#0f766e',
                  fontWeight: 600,
                  border: '1px solid #99f6e4',
                }}
              />
              <Chip
                label="This Month"
                size="small"
                onClick={handleSetThisMonth}
                sx={{ fontSize: '0.72rem', height: 26, cursor: 'pointer', bgcolor: '#f0fdfa', color: '#0f766e', fontWeight: 600, border: '1px solid #99f6e4' }}
              />
              <Chip
                label="All Time"
                size="small"
                onClick={handleSetAllTime}
                sx={{
                  fontSize: '0.72rem',
                  height: 26,
                  cursor: 'pointer',
                  bgcolor: !fromDate && !toDate ? '#0f766e' : '#f8fafc',
                  color: !fromDate && !toDate ? 'white' : '#475569',
                  fontWeight: 600,
                  border: '1px solid #cbd5e1',
                }}
              />
            </Box>
          </Grid>

          {/* From Date */}
          <Grid item xs={6} sm={2}>
            <DateInput
              size="small"
              label="From Date"
              value={fromDate}
              onChange={setFromDate}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { height: 34, fontSize: '0.8rem' } }}
              fullWidth
            />
          </Grid>

          {/* To Date */}
          <Grid item xs={6} sm={2}>
            <DateInput
              size="small"
              label="To Date"
              value={toDate}
              onChange={setToDate}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { height: 34, fontSize: '0.8rem' } }}
              fullWidth
            />
          </Grid>

          {/* Keyword Search */}
          <Grid item xs={8} sm={2.5}>
            <TextField
              size="small"
              placeholder="Search item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { height: 34, fontSize: '0.8rem' } }}
              fullWidth
            />
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={4} sm={1.5} sx={{ display: 'flex', gap: 0.8, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={fetchMovement}
              disabled={loading}
              sx={{
                minWidth: 34,
                height: 34,
                p: 0,
                borderColor: '#0f766e',
                color: '#0f766e',
                '&:hover': { bgcolor: '#f0fdfa' },
              }}
              title="Refresh"
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleExportCSV}
              disabled={displayItems.length === 0}
              sx={{
                height: 34,
                bgcolor: '#059669',
                '&:hover': { bgcolor: '#047857' },
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'none',
                px: 1.2,
              }}
              title="Export to Excel / CSV"
            >
              <DownloadIcon sx={{ fontSize: 16, mr: 0.3 }} />
              Excel
            </Button>
          </Grid>
        </Grid>
      </Box>

      {/* Content Table: sl, item code, item name, movement qty, cost value, gross value */}
      <DialogContent sx={{ p: 0, flex: 1, bgcolor: '#f1f5f9' }}>
        {error && (
          <Alert severity="error" sx={{ m: 1.5 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 8 }}>
            <CircularProgress sx={{ color: '#0f766e', mb: 2 }} />
            <Typography sx={{ color: '#64748b', fontSize: '0.9rem' }}>Loading movement data...</Typography>
          </Box>
        ) : displayItems.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CompareArrowsIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
            <Typography sx={{ fontWeight: 600, color: '#64748b', fontSize: '0.95rem' }}>
              No Stock Movement Data Found
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ height: '100%', borderRadius: 0 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headerSx, width: 45, textAlign: 'center' }}>SL</TableCell>
                  <TableCell sx={{ ...headerSx, width: 110 }}>ITEM CODE</TableCell>
                  <TableCell sx={{ ...headerSx, minWidth: 200 }}>ITEM NAME</TableCell>
                  <TableCell sx={{ ...headerSx, width: 85, textAlign: 'right' }}>OPENING</TableCell>
                  <TableCell sx={{ ...headerSx, width: 85, textAlign: 'right' }}>PURCHASE</TableCell>
                  <TableCell sx={{ ...headerSx, width: 85, textAlign: 'right' }}>RETURN</TableCell>
                  <TableCell sx={{ ...headerSx, width: 75, textAlign: 'center' }}>SA+</TableCell>
                  <TableCell sx={{ ...headerSx, width: 75, textAlign: 'center' }}>SA-</TableCell>
                  <TableCell sx={{ ...headerSx, width: 80, textAlign: 'right' }}>DAMAGE</TableCell>
                  <TableCell sx={{ ...headerSx, width: 80, textAlign: 'center' }}>QTY</TableCell>
                  <TableCell sx={{ ...headerSx, width: 110, textAlign: 'right' }}>COST VALUE</TableCell>
                  <TableCell sx={{ ...headerSx, width: 110, textAlign: 'right', borderRight: 'none' }}>GROSS VALUE</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayItems.map((row, index) => {
                  const cellSx = {
                    py: 0.6,
                    px: 0.8,
                    fontSize: '0.78rem',
                    color: '#1e293b',
                    borderBottom: '1px solid #f1f5f9',
                  };

                  return (
                    <TableRow
                      key={row.id || index}
                      hover
                      sx={{
                        bgcolor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                        '&:hover': { bgcolor: '#f0fdf4 !important' },
                      }}
                    >
                      {/* 1. SL */}
                      <TableCell sx={{ ...cellSx, textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                        {index + 1}
                      </TableCell>

                      {/* 2. ITEM CODE */}
                      <TableCell sx={{ ...cellSx, fontFamily: 'monospace', color: '#334155' }}>
                        {row.itemCode || '-'}
                      </TableCell>

                      {/* 3. ITEM NAME */}
                      <TableCell sx={{ ...cellSx, fontWeight: 600, color: '#0f172a' }}>
                        {row.itemName}
                      </TableCell>

                      {/* 4. OPENING */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right', color: '#334155' }}>
                        {row.opening.toLocaleString()}
                      </TableCell>

                      {/* 5. PURCHASE */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                        {row.purchase.toLocaleString()}
                      </TableCell>

                      {/* 6. RETURN */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 600, color: '#d97706' }}>
                        {row.returnQty.toLocaleString()}
                      </TableCell>

                      {/* 7. SA+ */}
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Chip
                          label={row.stockAdjPlus.toLocaleString()}
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
                      </TableCell>

                      {/* 8. SA- */}
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Chip
                          label={row.stockAdjMinus.toLocaleString()}
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
                      </TableCell>

                      {/* 9. DAMAGE */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                        {row.damage.toLocaleString()}
                      </TableCell>

                      {/* 10. QTY */}
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Chip
                          label={row.qty.toLocaleString()}
                          size="small"
                          sx={{
                            bgcolor: row.qty <= 0 ? '#fef2f2' : row.qty <= 5 ? '#fffbeb' : '#f0fdf4',
                            color: row.qty <= 0 ? '#dc2626' : row.qty <= 5 ? '#d97706' : '#16a34a',
                            fontWeight: 800,
                            fontSize: '0.74rem',
                            height: 22,
                            border: `1px solid ${row.qty <= 0 ? '#fecaca' : row.qty <= 5 ? '#fde68a' : '#bbf7d0'}`,
                          }}
                        />
                      </TableCell>

                      {/* 11. COST VALUE */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                        {row.stockValue.toFixed(2)}
                      </TableCell>

                      {/* 12. GROSS VALUE */}
                      <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                        {(row.grossValue || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      {/* Footer Totals */}
      <DialogActions sx={{ px: 2.5, py: 1.2, bgcolor: '#0f766e', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'white' }}>
            TOTALS:
          </Typography>
          <Chip label={`Opening: ${totalOpening.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.72rem', height: 22 }} />
          <Chip label={`Purchase: ${totalPurchase.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#a7f3d0', fontWeight: 600, fontSize: '0.72rem', height: 22 }} />
          <Chip label={`Return: ${totalReturn.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fde68a', fontWeight: 600, fontSize: '0.72rem', height: 22 }} />
          <Chip label={`SA+: ${totalStockAdjPlus.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#a7f3d0', fontWeight: 600, fontSize: '0.72rem', height: 22 }} />
          <Chip label={`SA-: ${totalStockAdjMinus.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fca5a5', fontWeight: 600, fontSize: '0.72rem', height: 22 }} />
          <Chip label={`Damage: ${totalDamage.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fca5a5', fontWeight: 600, fontSize: '0.72rem', height: 22 }} />
          <Chip label={`Qty: ${totalQty.toLocaleString()}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: 'white', fontWeight: 700, fontSize: '0.74rem', height: 22 }} />
          <Chip label={`Stock Value Cost: AED ${totalStockValue.toFixed(2)}`} size="small" sx={{ bgcolor: 'white', color: '#0f766e', fontWeight: 700, fontSize: '0.74rem', height: 22 }} />
          <Chip label={`Stock Value Gross: AED ${totalGrossValue.toFixed(2)}`} size="small" sx={{ bgcolor: '#d1fae5', color: '#047857', fontWeight: 700, fontSize: '0.74rem', height: 22 }} />
        </Box>
        <Button
          onClick={onClose}
          variant="contained"
          size="small"
          sx={{
            bgcolor: 'white',
            color: '#0f766e',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            px: 2,
            '&:hover': { bgcolor: '#f0fdfa' },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
