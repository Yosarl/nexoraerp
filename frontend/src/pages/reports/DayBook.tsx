import { useEffect, useState, useRef, useMemo, Fragment, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  CircularProgress,
  InputAdornment,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  TablePagination,
} from '@mui/material';
import {
  Search as SearchIcon,
  CalendarMonth as CalendarMonthIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  ReceiptLong as ReceiptLongIcon,
  Balance as BalanceIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  UnfoldMore as UnfoldMoreIcon,
  UnfoldLess as UnfoldLessIcon,
  Close as CloseIcon,
  Print as PrintIcon,
  FileDownload as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

import { useAppSelector } from '../../store/hooks';
import { ledgerApi } from '../../services/api';

const formatDateDisplay = (dateStr?: string | Date) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
};

function cleanUserNarration(rawNarration?: string, invoiceNo?: string, voucherNo?: string): string {
  if (!rawNarration) return '';
  const trimmed = rawNarration.trim();
  if (!trimmed || trimmed === '-') return '';

  if (/^(B2C|POS)(\s+Sale)?(\s+.*)?$/i.test(trimmed)) return '';
  if (/^Sales(\s+Return)?(\s+.*)?$/i.test(trimmed)) return '';
  if (/^Purchase(\s+Return)?(\s+.*)?$/i.test(trimmed)) return '';
  if (/^(Payment|Receipt)\s+(to|from|via|against)\b/i.test(trimmed)) return '';
  if (/^(Payment|Receipt|Journal|Sales|Purchase|Opening|ChequePayment|ChequeReceipt)\s+Voucher\b/i.test(trimmed)) return '';
  if (/^(Opening\s+(Stock|Balance)|Stock\s+Adjustment|Damage\s*\/?\s*Wastage)\b/i.test(trimmed)) return '';
  if (/^(Rounding\s+Adjustment|Round(\s+Off)?)$/i.test(trimmed)) return '';
  if (/^[A-Z]{1,5}-[0-9]{3,8}$/i.test(trimmed)) return '';

  if (invoiceNo && invoiceNo !== '-') {
    const invLower = invoiceNo.toLowerCase();
    const tLower = trimmed.toLowerCase();
    if (tLower === invLower || tLower === `b2c ${invLower}` || tLower === `pos ${invLower}` || tLower === `purchase ${invLower}`) {
      return '';
    }
  }
  if (voucherNo && voucherNo !== '-' && trimmed.toLowerCase() === voucherNo.toLowerCase()) {
    return '';
  }

  return trimmed;
}

function FormattedDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  return (
    <Box
      onClick={() => dateInputRef.current?.showPicker?.()}
      sx={{
        position: 'relative',
        cursor: 'pointer',
        minWidth: 155,
      }}
    >
      <TextField
        label={label}
        size="small"
        value={formatDateDisplay(value)}
        InputProps={{
          readOnly: true,
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 0.8 }}>
              <CalendarMonthIcon sx={{ fontSize: 18, color: '#64748b' }} />
            </InputAdornment>
          ),
        }}
        sx={{
          width: '100%',
          cursor: 'pointer',
          '& .MuiInputBase-input': { cursor: 'pointer', fontWeight: 500, fontSize: '0.84rem', py: 1.1 },
          '& .MuiOutlinedInput-root': {
            bgcolor: '#ffffff',
            borderRadius: '8px',
            height: 40,
            '& fieldset': { borderColor: '#cbd5e1' },
            '&:hover fieldset': { borderColor: '#94a3b8' },
            '&.Mui-focused fieldset': { borderColor: '#0284c7' },
          },
          '& .MuiInputLabel-root': {
            fontSize: '0.85rem',
            '&.Mui-focused': { color: '#0284c7' },
          },
        }}
      />
      <input
        ref={dateInputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}

interface VoucherLine {
  _id?: string;
  ledgerAccountId?: {
    _id: string;
    name: string;
    code: string;
    type?: string;
  };
  debitAmount: number;
  creditAmount: number;
  narration?: string;
}

interface VoucherItem {
  _id: string;
  voucherNo: string;
  voucherType: string;
  date: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  referenceNo?: string;
  referenceType?: string;
  referenceId?: string;
  narration?: string;
  lines?: VoucherLine[];
  chequeNumber?: string;
  chequeDate?: string;
  createdAt?: string;
}

export default function DayBook() {
  const navigate = useNavigate();
  const { selectedCompanyId, selectedFinancialYearId } = useAppSelector((state) => state.app);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);
  const [voucherType, setVoucherType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [summary, setSummary] = useState({
    totalTransactions: 0,
    totalDebit: 0,
    totalCredit: 0,
    netMovement: 0,
    typeCounts: {} as Record<string, number>,
    typeTotals: {} as Record<string, { debit: number; credit: number; count: number }>,
  });

  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherItem | null>(null);

  const fetchDayBook = useCallback(async () => {
    if (!selectedCompanyId || !selectedFinancialYearId) return;
    setLoading(true);
    try {
      const res = await ledgerApi.dayBook(selectedCompanyId, selectedFinancialYearId, {
        fromDate,
        toDate,
        voucherType: voucherType === 'ALL' ? undefined : voucherType,
        search: searchTerm.trim() || undefined,
        page: page + 1,
        limit: rowsPerPage,
      });

      if (res.data?.success && res.data?.data) {
        setVouchers(res.data.data.vouchers || []);
        if (res.data.data.summary) {
          setSummary(res.data.data.summary);
        }
      } else {
        setVouchers([]);
      }
    } catch (err) {
      console.error('Failed to load day book', err);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, selectedFinancialYearId, fromDate, toDate, voucherType, searchTerm, page, rowsPerPage]);

  useEffect(() => {
    fetchDayBook();
  }, [fetchDayBook]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/day-book') {
        fetchDayBook();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/day-book') || window.location.pathname.includes('/report/day-book')) {
        fetchDayBook();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [fetchDayBook]);

  const handleExportExcel = async () => {
    if (!selectedCompanyId || !selectedFinancialYearId) return;
    setExporting(true);
    try {
      const res = await ledgerApi.exportDayBook(selectedCompanyId, selectedFinancialYearId, {
        fromDate,
        toDate,
        voucherType: voucherType === 'ALL' ? undefined : voucherType,
        search: searchTerm.trim() || undefined,
      });

      const blob = new Blob([res.data as Blob], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DayBook_${fromDate}_to_${toDate}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Day Book', err);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allExpanded = vouchers.length > 0 && vouchers.every((v) => expandedRows[v._id]);

  const toggleAllRows = () => {
    if (allExpanded) {
      setExpandedRows({});
    } else {
      const all: Record<string, boolean> = {};
      vouchers.forEach((v) => {
        all[v._id] = true;
      });
      setExpandedRows(all);
    }
  };

  const setDatePreset = (preset: 'today' | 'yesterday' | 'this_week' | 'this_month') => {
    const now = new Date();
    if (preset === 'today') {
      const s = now.toISOString().split('T')[0];
      setFromDate(s);
      setToDate(s);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = y.toISOString().split('T')[0];
      setFromDate(s);
      setToDate(s);
    } else if (preset === 'this_week') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      setFromDate(start.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    } else if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(start.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    }
    setPage(0);
  };

  const handleRowDoubleClick = (v: VoucherItem) => {
    const vType = (v.voucherType || '').toLowerCase();
    const vNo = (v.voucherNo || '').toUpperCase();
    const refType = (v.referenceType || '').toLowerCase();
    const targetId = v.referenceId || v._id;
    const invNo = v.referenceNo || v.voucherNo;

    // Sales Return
    if (refType === 'salesreturn' || vType.includes('salesreturn')) {
      navigate('/entry/sales-return', { state: { returnId: targetId, invoiceNo: invNo } });
      return;
    }

    // Sales (POS or B2C or B2B)
    if (vType === 'sales' || vNo.startsWith('B2C') || vNo.startsWith('POS') || refType === 'salesinvoice') {
      if (vNo.startsWith('POS')) {
        navigate('/entry/pos', { state: { invoiceId: targetId, invoiceNo: invNo } });
        return;
      }
      navigate('/entry/sales-b2c', { state: { invoiceId: targetId, invoiceNo: invNo } });
      return;
    }

    // Purchase Return
    if (refType === 'purchasereturn' || vType.includes('purchasereturn')) {
      navigate('/entry/purchase-return', { state: { returnId: targetId, invoiceNo: invNo } });
      return;
    }

    // Purchase
    if (vType === 'purchase' || refType === 'purchaseinvoice' || vNo.startsWith('PUR')) {
      navigate('/entry/purchase', { state: { purchaseId: targetId, invoiceNo: invNo } });
      return;
    }

    // Vouchers (Receipt / Payment / Contra / Journal)
    if (vType === 'payment' || vType === 'chequepayment') {
      navigate('/entry/voucher/payment', { state: { voucherId: v._id } });
      return;
    }
    if (vType === 'receipt' || vType === 'chequereceipt') {
      navigate('/entry/voucher/receipt', { state: { voucherId: v._id } });
      return;
    }
    if (vType === 'contra') {
      navigate('/entry/voucher/contra', { state: { voucherId: v._id } });
      return;
    }
    if (vType === 'journal') {
      navigate('/entry/voucher/journal', { state: { voucherId: v._id } });
      return;
    }
    if (vType === 'opening') {
      navigate('/entry/opening-balance');
      return;
    }

    // Default: open details modal
    setSelectedVoucher(v);
  };

  if (!selectedCompanyId) {
    return <Typography color="error" sx={{ p: 3 }}>Select a company first.</Typography>;
  }
  if (!selectedFinancialYearId) {
    return <Typography color="error" sx={{ p: 3 }}>Select a financial year first.</Typography>;
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .MuiPaper-root { box-shadow: none !important; border: none !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #cbd5e1 !important; padding: 4px 6px !important; font-size: 10px !important; }
        }
      `}</style>

      {/* Header & Breadcrumb (Exact Ledger Report style) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 600, mb: 0.5 }}>
            Accounting / Reports
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', fontSize: '0.85rem' }}>
            Day Book
          </Typography>
        </Box>

        <Box className="no-print" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={fetchDayBook}
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            sx={{
              height: 38,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              color: '#334155',
              borderColor: '#cbd5e1',
              borderRadius: '8px',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            Refresh
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={handlePrint}
            startIcon={<PrintIcon sx={{ fontSize: 16 }} />}
            sx={{
              height: 38,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              color: '#334155',
              borderColor: '#cbd5e1',
              borderRadius: '8px',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            Print
          </Button>

          <Button
            size="small"
            variant="contained"
            onClick={handleExportExcel}
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon sx={{ fontSize: 16 }} />}
            sx={{
              height: 38,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.80rem',
              bgcolor: '#0284c7',
              borderRadius: '8px',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#0369a1', boxShadow: 'none' },
            }}
          >
            Export to Excel
          </Button>
        </Box>
      </Box>

      {/* Filter Bar (Exact Ledger Report style) */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }} className="no-print">
        {/* Date Pickers */}
        <FormattedDatePicker
          label="From Date"
          value={fromDate}
          onChange={(v) => {
            setFromDate(v);
            setPage(0);
          }}
        />

        <FormattedDatePicker
          label="To Date"
          value={toDate}
          onChange={(v) => {
            setToDate(v);
            setPage(0);
          }}
        />

        {/* Quick Date Presets */}
        <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center' }}>
          <Button
            size="small"
            onClick={() => setDatePreset('today')}
            sx={{
              height: 40,
              px: 1.4,
              fontSize: '0.80rem',
              fontWeight: fromDate === todayStr && toDate === todayStr ? 700 : 500,
              textTransform: 'none',
              color: fromDate === todayStr && toDate === todayStr ? '#0284c7' : '#475569',
              bgcolor: fromDate === todayStr && toDate === todayStr ? '#e0f2fe' : '#ffffff',
              border: '1px solid',
              borderColor: fromDate === todayStr && toDate === todayStr ? '#bae6fd' : '#cbd5e1',
              borderRadius: '8px',
              '&:hover': { bgcolor: '#f0f9ff', borderColor: '#7dd3fc' },
            }}
          >
            Today
          </Button>
          <Button
            size="small"
            onClick={() => setDatePreset('yesterday')}
            sx={{
              height: 40,
              px: 1.4,
              fontSize: '0.80rem',
              fontWeight: 500,
              textTransform: 'none',
              color: '#475569',
              bgcolor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            Yesterday
          </Button>
          <Button
            size="small"
            onClick={() => setDatePreset('this_week')}
            sx={{
              height: 40,
              px: 1.4,
              fontSize: '0.80rem',
              fontWeight: 500,
              textTransform: 'none',
              color: '#475569',
              bgcolor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            This Week
          </Button>
          <Button
            size="small"
            onClick={() => setDatePreset('this_month')}
            sx={{
              height: 40,
              px: 1.4,
              fontSize: '0.80rem',
              fontWeight: 500,
              textTransform: 'none',
              color: '#475569',
              bgcolor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
            }}
          >
            This Month
          </Button>
        </Box>

        {/* Search Input */}
        <TextField
          placeholder="Search voucher #, account, notes..."
          size="small"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ pl: 0.5, mr: 0.5 }}>
                <SearchIcon sx={{ color: '#64748b', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            minWidth: 260,
            flex: { xs: '1 1 100%', sm: '1 1 280px' },
            '& .MuiOutlinedInput-root': {
              bgcolor: '#ffffff',
              borderRadius: '8px',
              height: 40,
              fontSize: '0.85rem',
              fontWeight: 500,
              '& fieldset': { borderColor: '#cbd5e1' },
              '&:hover fieldset': { borderColor: '#94a3b8' },
              '&.Mui-focused fieldset': { borderColor: '#0284c7' },
            },
          }}
        />

        {/* Expand / Collapse All Button */}
        {vouchers.length > 0 && (
          <Button
            size="small"
            variant="outlined"
            onClick={toggleAllRows}
            startIcon={allExpanded ? <UnfoldLessIcon sx={{ fontSize: 16 }} /> : <UnfoldMoreIcon sx={{ fontSize: 16 }} />}
            sx={{
              height: 40,
              px: 1.6,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              color: '#00838f',
              borderColor: '#b2ebf2',
              borderRadius: '8px',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f0fdfa', borderColor: '#80deea' },
            }}
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </Button>
        )}
      </Box>

      {/* Voucher Type Category Filters (as clean chips) */}
      {Object.keys(summary.typeCounts).length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }} className="no-print">
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', mr: 0.5 }}>
            Voucher Types:
          </Typography>
          <Chip
            label={`All Types (${summary.totalTransactions})`}
            size="small"
            clickable
            onClick={() => {
              setVoucherType('ALL');
              setPage(0);
            }}
            sx={{
              height: 26,
              fontSize: '0.74rem',
              fontWeight: 700,
              bgcolor: voucherType === 'ALL' ? '#0284c7' : '#ffffff',
              color: voucherType === 'ALL' ? '#ffffff' : '#334155',
              border: '1px solid',
              borderColor: voucherType === 'ALL' ? '#0284c7' : '#cbd5e1',
            }}
          />
          {Object.entries(summary.typeCounts).map(([type, count]) => {
            const isSelected = voucherType === type;
            return (
              <Chip
                key={type}
                label={`${type} (${count})`}
                size="small"
                clickable
                onClick={() => {
                  setVoucherType(isSelected ? 'ALL' : type);
                  setPage(0);
                }}
                sx={{
                  height: 26,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  bgcolor: isSelected ? '#0f766e' : '#f8fafc',
                  color: isSelected ? '#ffffff' : '#334155',
                  border: '1px solid',
                  borderColor: isSelected ? '#0f766e' : '#cbd5e1',
                  '&:hover': {
                    bgcolor: isSelected ? '#0f766e' : '#f1f5f9',
                  },
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Loading state */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#0284c7' }} />
        </Box>
      )}

      {/* Main Transactions Table (Matching Ledger Report structure) */}
      {!loading && (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{
            borderRadius: '9px',
            overflow: 'hidden',
            borderColor: '#e2e8f0',
            bgcolor: '#ffffff',
            boxShadow: 'none',
            mb: 2.8,
          }}
        >
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#e2edf8' }}>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '9%' }}>
                  Date
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '8%' }}>
                  Voucher No
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '9%' }}>
                  Entry Name
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '26%' }}>
                  Particulars / Account
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '8%' }}>
                  Reference
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '9%' }}>
                  Debit (Dr)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '9%' }}>
                  Credit (Cr)
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', width: '22%' }}>
                  Narration
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary', fontSize: '0.78rem', fontWeight: 700 }}>
                    No transactions found for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                vouchers.map((v) => {
                  const isExpanded = !!expandedRows[v._id];
                  const accountNames = v.lines?.map((l) => l.ledgerAccountId?.name).filter(Boolean) || [];
                  const uniqueNames = Array.from(new Set(accountNames));
                  const particularsSummary = uniqueNames.join(', ') || '-';
                  const cleanNarration = cleanUserNarration(v.narration, v.referenceNo, v.voucherNo);

                  return (
                    <Fragment key={v._id}>
                      <TableRow
                        hover
                        onDoubleClick={() => handleRowDoubleClick(v)}
                        onClick={() => toggleRow(v._id)}
                        title="Click to expand lines. Double-click to open transaction."
                        sx={{
                          bgcolor: isExpanded ? '#f8fafc' : '#ffffff',
                          cursor: 'pointer',
                          '&:hover': { bgcolor: isExpanded ? '#f1f5f9' : '#f8fafc' },
                          '& td': { py: 0.7, px: 1.25, fontWeight: 700, borderRight: '1px solid #f1f5f9' },
                          '& td:last-child': { borderRight: 'none' },
                        }}
                      >
                        {/* Date */}
                        <TableCell sx={{ whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 700, fontSize: '0.78rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(v._id);
                              }}
                              sx={{ p: 0.2, color: '#64748b' }}
                            >
                              {isExpanded ? (
                                <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                              ) : (
                                <KeyboardArrowRightIcon sx={{ fontSize: 16 }} />
                              )}
                            </IconButton>
                            {formatDateDisplay(v.date)}
                          </Box>
                        </TableCell>

                        {/* Voucher No */}
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#0284c7', whiteSpace: 'nowrap' }}>
                          {v.voucherNo}
                        </TableCell>

                        {/* Entry Name / Voucher Type */}
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#1e293b' }}>
                          {v.voucherType}
                        </TableCell>

                        {/* Particulars */}
                        <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.78rem', wordBreak: 'break-word' }}>
                          {particularsSummary}
                        </TableCell>

                        {/* Reference */}
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#0f172a', wordBreak: 'break-word' }}>
                          {v.referenceNo || '-'}
                        </TableCell>

                        {/* Debit */}
                        <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: v.totalDebit > 0 ? '#16a34a' : 'inherit' }}>
                          {v.totalDebit > 0 ? v.totalDebit.toFixed(2) : '-'}
                        </TableCell>

                        {/* Credit */}
                        <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: v.totalCredit > 0 ? '#dc2626' : 'inherit' }}>
                          {v.totalCredit > 0 ? v.totalCredit.toFixed(2) : '-'}
                        </TableCell>

                        {/* Narration */}
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.76rem', color: '#475569', fontStyle: cleanNarration ? 'normal' : 'italic' }}>
                          {cleanNarration || '-'}
                        </TableCell>
                      </TableRow>

                      {/* Expandable sub-lines (Double-Entry lines) */}
                      {isExpanded && v.lines && v.lines.length > 0 && (
                        <TableRow sx={{ bgcolor: '#f8fafc' }}>
                          <TableCell colSpan={8} sx={{ py: 1.2, px: 3, borderBottom: '1px solid #e2e8f0' }}>
                            <Box sx={{ bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                              <Table size="small">
                                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', py: 0.6 }}>Code</TableCell>
                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', py: 0.6 }}>Account Name</TableCell>
                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', py: 0.6 }}>Account Type</TableCell>
                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', py: 0.6 }}>Line Narration</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#16a34a', py: 0.6 }}>Debit (AED)</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#dc2626', py: 0.6 }}>Credit (AED)</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {v.lines.map((l, lIdx) => (
                                    <TableRow key={l._id || lIdx} sx={{ '& td': { py: 0.5, px: 1.5, fontSize: '0.74rem' } }}>
                                      <TableCell sx={{ color: '#64748b' }}>{l.ledgerAccountId?.code || '-'}</TableCell>
                                      <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{l.ledgerAccountId?.name || '-'}</TableCell>
                                      <TableCell sx={{ color: '#64748b' }}>{l.ledgerAccountId?.type || '-'}</TableCell>
                                      <TableCell sx={{ color: '#475569', fontStyle: 'italic' }}>{l.narration || '-'}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 700, color: l.debitAmount > 0 ? '#16a34a' : '#94a3b8' }}>
                                        {l.debitAmount > 0 ? l.debitAmount.toFixed(2) : '-'}
                                      </TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 700, color: l.creditAmount > 0 ? '#dc2626' : '#94a3b8' }}>
                                        {l.creditAmount > 0 ? l.creditAmount.toFixed(2) : '-'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}

              {/* Total Balance Row (Matching Ledger Report bottom table summary) */}
              <TableRow sx={{ bgcolor: '#ffffff', borderTop: '2px solid #cbd5e1' }}>
                <TableCell colSpan={5} sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#0f172a', borderRight: '1px solid #f1f5f9' }}>
                  Total Balance ({summary.totalTransactions} Transactions)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#16a34a', borderRight: '1px solid #f1f5f9' }}>
                  {summary.totalDebit.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#dc2626', borderRight: '1px solid #f1f5f9' }}>
                  {summary.totalCredit.toFixed(2)}
                </TableCell>
                <TableCell sx={{ py: 1.0, px: 1.25, fontWeight: 700, color: '#64748b', fontSize: '0.80rem' }}>
                  Net: {Math.abs(summary.netMovement).toFixed(2)}{' '}
                  <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: summary.netMovement >= 0 ? '#16a34a' : '#dc2626' }}>
                    {summary.netMovement >= 0 ? 'Dr' : 'Cr'}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Pagination */}
          <TablePagination
            className="no-print"
            rowsPerPageOptions={[25, 50, 100, 250]}
            component="div"
            count={summary.totalTransactions}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            sx={{ borderTop: '1px solid #e2e8f0' }}
          />
        </TableContainer>
      )}

      {/* Summary Cards at the BOTTOM (Exact Ledger Report design) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.8 }}>
        {/* Card 1: Total Transactions */}
        <Card
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: '#ffffff',
            borderRadius: '9px',
            borderColor: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'none',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                bgcolor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
              }}
            >
              <ReceiptLongIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155' }}>
              Total Entries
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
            {summary.totalTransactions}
          </Typography>
        </Card>

        {/* Card 2: Total Debit */}
        <Card
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: '#f0fdf4',
            borderRadius: '9px',
            borderColor: '#bbf7d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'none',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                bgcolor: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16a34a',
              }}
            >
              <ArrowUpwardIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#166534' }}>
              Total Debit
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#16a34a' }}>
            {summary.totalDebit.toFixed(2)}
          </Typography>
        </Card>

        {/* Card 3: Total Credit */}
        <Card
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: '#fef2f2',
            borderRadius: '9px',
            borderColor: '#fecaca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'none',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                bgcolor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
              }}
            >
              <ArrowDownwardIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#991b1b' }}>
              Total Credit
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#dc2626' }}>
            {summary.totalCredit.toFixed(2)}
          </Typography>
        </Card>

        {/* Card 4: Net Movement */}
        <Card
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: '#ffffff',
            borderRadius: '9px',
            borderColor: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'none',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                bgcolor: '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7',
              }}
            >
              <BalanceIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155' }}>
              Net Movement
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
            {Math.abs(summary.netMovement).toFixed(2)}{' '}
            <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: summary.netMovement >= 0 ? '#16a34a' : '#dc2626' }}>
              {summary.netMovement >= 0 ? 'Dr' : 'Cr'}
            </Typography>
          </Typography>
        </Card>
      </Box>

      {/* Details Dialog */}
      <Dialog
        open={Boolean(selectedVoucher)}
        onClose={() => setSelectedVoucher(null)}
        maxWidth="md"
        fullWidth
      >
        {selectedVoucher && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReceiptLongIcon sx={{ color: '#0284c7' }} />
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Voucher: {selectedVoucher.voucherNo}
                </Typography>
                <Chip
                  label={selectedVoucher.voucherType}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    bgcolor: '#e0f2fe',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                  }}
                />
              </Box>
              <IconButton onClick={() => setSelectedVoucher(null)} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ pt: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatDateDisplay(selectedVoucher.date)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Reference No</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedVoucher.referenceNo || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Debit</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#16a34a' }}>
                    {selectedVoucher.totalDebit.toFixed(2)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Credit</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#dc2626' }}>
                    {selectedVoucher.totalCredit.toFixed(2)}
                  </Typography>
                </Box>
              </Box>

              {selectedVoucher.narration && (
                <Box sx={{ mb: 2, p: 1.2, bgcolor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3 }}>
                    Narration
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#334155', fontStyle: 'italic' }}>
                    {selectedVoucher.narration}
                  </Typography>
                </Box>
              )}

              <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 1, color: '#0f172a' }}>
                Ledger Entries (Journal Lines)
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#e2edf8' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem' }}>Code</TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem' }}>Account Name</TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem' }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem' }}>Line Narration</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#16a34a' }}>Debit</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#dc2626' }}>Credit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedVoucher.lines?.map((line, idx) => (
                      <TableRow key={line._id || idx}>
                        <TableCell sx={{ fontSize: '0.75rem', color: '#64748b' }}>{line.ledgerAccountId?.code || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{line.ledgerAccountId?.name || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: '#64748b' }}>{line.ledgerAccountId?.type || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#475569' }}>{line.narration || '-'}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 800, color: line.debitAmount > 0 ? '#16a34a' : 'inherit' }}>
                          {line.debitAmount > 0 ? line.debitAmount.toFixed(2) : '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 800, color: line.creditAmount > 0 ? '#dc2626' : 'inherit' }}>
                          {line.creditAmount > 0 ? line.creditAmount.toFixed(2) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setSelectedVoucher(null)} size="small" variant="outlined">
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
