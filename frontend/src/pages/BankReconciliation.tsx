import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
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
  Autocomplete,
  TextField,
  InputAdornment,
  Checkbox,
  Chip,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  CalendarMonth as CalendarMonthIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Print as PrintIcon,
  FileDownload as FileDownloadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAppSelector } from '../store/hooks';
import {
  ledgerAccountApi,
  bankReconciliationApi,
  BankReconciliationData,
} from '../services/api';

interface EditableRowState {
  bankDate: string;
  isBounced: boolean;
  isDirty?: boolean;
}

const formatDateDisplay = (dateStr?: string | Date) => {
  if (!dateStr) return '';
  const d = dayjs(dateStr);
  if (!d.isValid()) return String(dateStr);
  return d.format('DD-MM-YYYY');
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function BankReconciliation() {
  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Filter States
  const [bankAccounts, setBankAccounts] = useState<Array<{ _id: string; name: string; code: string; type?: string }>>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>(() => dayjs().format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState<string>(() => dayjs().format('YYYY-MM-DD'));

  // Data States
  const [data, setData] = useState<BankReconciliationData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'unreconciled' | 'bounced' | 'reconciled' | 'all'>('unreconciled');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Editable row values: keyed by voucherId
  const [rowEdits, setRowEdits] = useState<Record<string, EditableRowState>>({});

  // Notification
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Native date input refs
  const fromDateRef = useRef<HTMLInputElement | null>(null);
  const toDateRef = useRef<HTMLInputElement | null>(null);

  // Load Bank Accounts
  useEffect(() => {
    if (!companyId) return;
    ledgerAccountApi.list(companyId).then((res) => {
      const all = (res.data.data as Array<{ _id: string; name: string; code: string; type?: string; reconciliation?: boolean }>) || [];
      const banks = all.filter(
        (a) =>
          (a.type === 'Bank' ||
          a.type === 'BANK' ||
          a.name.toUpperCase().includes('BANK')) &&
          a.reconciliation !== false
      );
      setBankAccounts(banks);
      if (banks.length > 0 && (!selectedBankId || !banks.some((b) => b._id === selectedBankId))) {
        setSelectedBankId(banks[0]._id);
      } else if (banks.length === 0) {
        setSelectedBankId('');
      }
    });
  }, [companyId]);

  // Load Reconciliation Data
  const loadData = () => {
    if (!companyId || !financialYearId || !selectedBankId || !fromDate || !toDate) return;
    setLoading(true);
    bankReconciliationApi
      .get(companyId, financialYearId, selectedBankId, fromDate, toDate, activeTab)
      .then((res) => {
        const d = res.data.data;
        setData(d);
        // Initialize row edit states
        const initialEdits: Record<string, EditableRowState> = {};
        d.items.forEach((item) => {
          initialEdits[item.voucherId] = {
            bankDate: item.bankDate || '',
            isBounced: item.isBounced || item.chequeStatus === 'BOUNCED',
            isDirty: false,
          };
        });
        setRowEdits(initialEdits);
      })
      .catch((err) => {
        console.error('Failed to load bank reconciliation data', err);
        setSnackbar({
          open: true,
          message: err?.response?.data?.message || 'Failed to load bank reconciliation data.',
          severity: 'error',
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [companyId, financialYearId, selectedBankId, fromDate, toDate, activeTab]);

  // Handle cell edit
  const handleBankDateChange = (voucherId: string, newDate: string) => {
    if (activeTab === 'reconciled' || activeTab === 'all') return;
    setRowEdits((prev) => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { isBounced: false }),
        bankDate: newDate,
        isBounced: newDate ? false : prev[voucherId]?.isBounced || false,
        isDirty: true,
      },
    }));
  };

  const handleBouncedToggle = (voucherId: string, checked: boolean) => {
    if (activeTab === 'reconciled' || activeTab === 'all') return;
    setRowEdits((prev) => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { bankDate: '' }),
        isBounced: checked,
        bankDate: checked ? '' : prev[voucherId]?.bankDate || '',
        isDirty: true,
      },
    }));
  };

  // Save Reconciliation
  const handleSave = async () => {
    if (activeTab === 'reconciled' || activeTab === 'all') return;
    if (!companyId || !financialYearId || !selectedBankId) return;

    const dirtyItems = Object.entries(rowEdits)
      .filter(([_, edit]) => edit.isDirty || edit.bankDate || edit.isBounced)
      .map(([voucherId, edit]) => ({
        voucherId,
        bankDate: edit.bankDate || null,
        isBounced: edit.isBounced,
      }));

    if (dirtyItems.length === 0) {
      setSnackbar({
        open: true,
        message: 'No modified transactions to save. Select a Bank Date or mark Bounced.',
        severity: 'info',
      });
      return;
    }

    setSaving(true);
    try {
      await bankReconciliationApi.save({
        companyId,
        financialYearId,
        bankAccountId: selectedBankId,
        items: dirtyItems,
      });

      setSnackbar({
        open: true,
        message: 'Reconciliation saved successfully! Cleared cheques updated.',
        severity: 'success',
      });

      loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || 'Failed to save reconciliation.',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // Filtered rows for search term & active tab
  const displayedItems = useMemo(() => {
    if (!data?.items) return [];
    let items = data.items;
    if (activeTab === 'bounced') {
      items = items.filter((item) => {
        const isCheque =
          item.voucherType === 'ChequePayment' ||
          item.voucherType === 'ChequeReceipt';
        return isCheque && !item.isReconciled;
      });
    }
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.voucherNo.toLowerCase().includes(q) ||
        item.particulars.toLowerCase().includes(q) ||
        item.chequeNumber.toLowerCase().includes(q) ||
        item.withdrawals.toString().includes(q) ||
        item.deposits.toString().includes(q) ||
        formatDateDisplay(item.bookDate).toLowerCase().includes(q)
    );
  }, [data?.items, activeTab, searchTerm]);

  // Minimum row placeholders for consistent UI grid (extended 40% from 6 to 10 rows)
  const emptyRowsCount = Math.max(0, 10 - displayedItems.length);

  // Export to CSV
  const handleExportCSV = () => {
    if (!data || displayedItems.length === 0) return;
    const headers = ['Sl No', 'Book Date', 'Voucher No', 'Particulars', 'Cheque / Ref', 'Withdrawals (AED)', 'Deposits (AED)', 'Bank Date', 'Status'];
    const rows = displayedItems.map((item, idx) => {
      const edit = rowEdits[item.voucherId] || { bankDate: item.bankDate, isBounced: item.isBounced };
      const status = edit.isBounced ? 'BOUNCED' : (edit.bankDate ? 'CLEARED' : 'PENDING');
      return [
        idx + 1,
        formatDateDisplay(item.bookDate),
        item.voucherNo,
        `"${item.particulars.replace(/"/g, '""')}"`,
        item.chequeNumber,
        item.withdrawals > 0 ? item.withdrawals.toFixed(2) : '',
        item.deposits > 0 ? item.deposits.toFixed(2) : '',
        edit.bankDate ? formatDateDisplay(edit.bankDate) : '',
        status,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bank_Reconciliation_${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedAccountObj = bankAccounts.find((a) => a._id === selectedBankId);

  return (
    <Box sx={{ pt: { xs: 0.8, md: 1.0 }, pb: { xs: 1.5, md: 2.5 }, px: { xs: 1.5, md: 2.5 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Top Breadcrumb & Header */}
      <Box sx={{ mb: 0.9 }}>
        <Typography sx={{ fontSize: '0.70rem', color: '#0284c7', fontWeight: 600, mb: 0.1 }}>
          Accounting &nbsp;/&nbsp; Banking
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.05rem', md: '1.25rem' },
              color: '#003580',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}
          >
            Bank Reconciliation
          </Typography>
          <Chip
            label="Sample data"
            size="small"
            sx={{
              height: 18,
              fontSize: '0.52rem',
              fontWeight: 700,
              bgcolor: '#e0f2fe',
              color: '#0284c7',
              borderRadius: '5px',
            }}
          />
        </Box>
      </Box>

      {/* Filter Card - 30% reduced field size & moved closer to top */}
      <Card
        variant="outlined"
        sx={{
          py: 0.7,
          px: 1.2,
          mb: 1.0,
          borderRadius: '8px',
          borderColor: '#e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.8fr 1.1fr 1.1fr auto' },
            gap: 1.5,
            alignItems: 'center',
          }}
        >
          {/* Bank Account Selection */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
              Bank Account <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <Autocomplete
              size="small"
              options={bankAccounts}
              getOptionLabel={(opt) => `${opt.name} (${opt.code})`}
              value={selectedAccountObj || null}
              onChange={(_, newVal) => {
                if (newVal) setSelectedBankId(newVal._id);
              }}
              isOptionEqualToValue={(opt, val) => opt._id === val._id}
              sx={{ flex: 1 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select bank account..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      height: 28,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      bgcolor: '#ffffff',
                      borderRadius: '6px',
                      '& input': { py: '2px !important', px: '6px !important', fontSize: '0.75rem', fontWeight: 600 },
                      '& fieldset': { borderColor: '#cbd5e1' },
                      '&:hover fieldset': { borderColor: '#94a3b8' },
                      '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                    },
                    '& .MuiSvgIcon-root': { fontSize: 16 },
                    '& .MuiIconButton-root': { p: 0.2 },
                  }}
                />
              )}
            />
            <IconButton
              size="small"
              onClick={loadData}
              sx={{
                bgcolor: '#f1f5f9',
                borderRadius: '6px',
                height: 28,
                width: 28,
                border: '1px solid #cbd5e1',
                color: '#475569',
                '&:hover': { bgcolor: '#e2e8f0' },
              }}
            >
              <SearchIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>

          {/* From Date */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
              From Date <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <Box
              onClick={() => fromDateRef.current?.showPicker?.()}
              sx={{ position: 'relative', flex: 1, cursor: 'pointer' }}
            >
              <TextField
                size="small"
                fullWidth
                value={formatDateDisplay(fromDate)}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end" sx={{ mr: -0.2 }}>
                      <CalendarMonthIcon sx={{ fontSize: 15, color: '#64748b' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  cursor: 'pointer',
                  '& .MuiOutlinedInput-root': {
                    height: 28,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    bgcolor: '#ffffff',
                    borderRadius: '6px',
                    '& input': { py: '2px !important', px: '6px !important', cursor: 'pointer', color: '#0f172a', fontSize: '0.75rem', fontWeight: 600 },
                    '& fieldset': { borderColor: '#cbd5e1' },
                    '&:hover fieldset': { borderColor: '#94a3b8' },
                    '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                  },
                }}
              />
              <input
                ref={fromDateRef}
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
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
          </Box>

          {/* To Date */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
              To Date <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <Box
              onClick={() => toDateRef.current?.showPicker?.()}
              sx={{ position: 'relative', flex: 1, cursor: 'pointer' }}
            >
              <TextField
                size="small"
                fullWidth
                value={formatDateDisplay(toDate)}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end" sx={{ mr: -0.2 }}>
                      <CalendarMonthIcon sx={{ fontSize: 15, color: '#64748b' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  cursor: 'pointer',
                  '& .MuiOutlinedInput-root': {
                    height: 28,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    bgcolor: '#ffffff',
                    borderRadius: '6px',
                    '& input': { py: '2px !important', px: '6px !important', cursor: 'pointer', color: '#0f172a', fontSize: '0.75rem', fontWeight: 600 },
                    '& fieldset': { borderColor: '#cbd5e1' },
                    '&:hover fieldset': { borderColor: '#94a3b8' },
                    '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                  },
                }}
              />
              <input
                ref={toDateRef}
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
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
          </Box>

          {/* Statement Through Info */}
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: '0.70rem', color: '#0284c7', fontWeight: 700 }}>
              Statement through {formatDateDisplay(toDate)}
            </Typography>
          </Box>
        </Box>
      </Card>

      {/* Tabs Header & Search in Table */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          position: 'relative',
        }}
      >
        {/* Tabs: Unreconciled / Reconciled / All */}
        <Box sx={{ display: 'flex', gap: 3, mx: 'auto' }}>
          <Box
            onClick={() => setActiveTab('unreconciled')}
            sx={{
              cursor: 'pointer',
              pb: 0.6,
              borderBottom: activeTab === 'unreconciled' ? '3px solid #00838f' : '3px solid transparent',
              color: activeTab === 'unreconciled' ? '#00838f' : '#64748b',
              fontWeight: 800,
              fontSize: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              transition: 'all 0.15s ease',
            }}
          >
            <span>Unreconciled</span>
            {data && (
              <Chip
                label={data.unreconciledCount}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  bgcolor: activeTab === 'unreconciled' ? '#e0f2fe' : '#f1f5f9',
                  color: activeTab === 'unreconciled' ? '#0369a1' : '#64748b',
                }}
              />
            )}
          </Box>

          {/* Bounced Check Tab */}
          <Box
            onClick={() => setActiveTab('bounced')}
            sx={{
              cursor: 'pointer',
              pb: 0.6,
              borderBottom: activeTab === 'bounced' ? '3px solid #dc2626' : '3px solid transparent',
              color: activeTab === 'bounced' ? '#dc2626' : '#64748b',
              fontWeight: 800,
              fontSize: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              transition: 'all 0.15s ease',
            }}
          >
            <span>Bounced Check</span>
            {data && (
              <Chip
                label={data.pendingChequesCount ?? data.bouncedCount}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  bgcolor: activeTab === 'bounced' ? '#fee2e2' : '#f1f5f9',
                  color: activeTab === 'bounced' ? '#b91c1c' : '#64748b',
                }}
              />
            )}
          </Box>

          <Box
            onClick={() => setActiveTab('reconciled')}
            sx={{
              cursor: 'pointer',
              pb: 0.6,
              borderBottom: activeTab === 'reconciled' ? '3px solid #00838f' : '3px solid transparent',
              color: activeTab === 'reconciled' ? '#00838f' : '#64748b',
              fontWeight: 800,
              fontSize: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              transition: 'all 0.15s ease',
            }}
          >
            <span>Reconciled</span>
            {data && (
              <Chip
                label={data.reconciledCount}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  bgcolor: activeTab === 'reconciled' ? '#dcfce7' : '#f1f5f9',
                  color: activeTab === 'reconciled' ? '#166534' : '#64748b',
                }}
              />
            )}
          </Box>

          <Box
            onClick={() => setActiveTab('all')}
            sx={{
              cursor: 'pointer',
              pb: 0.6,
              borderBottom: activeTab === 'all' ? '3px solid #00838f' : '3px solid transparent',
              color: activeTab === 'all' ? '#00838f' : '#64748b',
              fontWeight: 800,
              fontSize: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              transition: 'all 0.15s ease',
            }}
          >
            <span>All</span>
          </Box>
        </Box>

        {/* Search in table */}
        <Box sx={{ position: 'absolute', right: 0 }}>
          <TextField
            size="small"
            placeholder="Search in table..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: '#0284c7' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              width: 210,
              '& .MuiOutlinedInput-root': {
                height: 34,
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '7px',
                bgcolor: '#ffffff',
                '& fieldset': { borderColor: '#cbd5e1' },
                '&:hover fieldset': { borderColor: '#94a3b8' },
                '&.Mui-focused fieldset': { borderColor: '#0284c7' },
              },
            }}
          />
        </Box>
      </Box>

      {/* Table Container - Grid extended 40% */}
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          borderRadius: '9px',
          borderColor: '#e2e8f0',
          overflow: 'auto',
          minHeight: 460,
          maxHeight: 680,
          bgcolor: '#ffffff',
          boxShadow: 'none',
          mb: 1.5,
        }}
      >
        <Table stickyHeader size="small" sx={{ minWidth: 1380, tableLayout: 'fixed' }}>
          <TableHead
            sx={{
              '& th': {
                height: '20px !important',
                minHeight: '20px !important',
                py: '2px !important',
                px: '6px !important',
                lineHeight: '1.2 !important',
                fontSize: '0.58rem !important',
                bgcolor: '#e2edf8 !important',
              },
            }}
          >
            <TableRow sx={{ bgcolor: '#e2edf8', height: 20, minHeight: 20 }}>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 55, textAlign: 'center', bgcolor: '#e2edf8' }}>
                Sl No.
              </TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 125, bgcolor: '#e2edf8' }}>
                Book Date
              </TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 125, bgcolor: '#e2edf8' }}>
                Voucher No.
              </TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 420, bgcolor: '#e2edf8' }}>
                Particulars
              </TableCell>
              <TableCell sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 135, bgcolor: '#e2edf8' }}>
                Cheque / Ref.
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 145, bgcolor: '#e2edf8' }}>
                Withdrawals (AED)
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 145, bgcolor: '#e2edf8' }}>
                Deposits (AED)
              </TableCell>
              {activeTab !== 'bounced' ? (
                <TableCell sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: 165, bgcolor: '#e2edf8' }}>
                  Bank Date
                </TableCell>
              ) : (
                <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#dc2626', width: 115, borderRight: '1px solid #dbeafe', bgcolor: '#e2edf8' }}>
                  Bounced
                </TableCell>
              )}
              <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.58rem !important', color: '#0f172a', width: 110, bgcolor: '#e2edf8' }}>
                Status
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={28} sx={{ color: '#00838f' }} />
                  <Typography sx={{ mt: 1, fontSize: '0.80rem', color: '#64748b' }}>
                    Loading bank transactions...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : displayedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4, color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
                  No transactions found for the selected period and bank account.
                </TableCell>
              </TableRow>
            ) : (
              displayedItems.map((item, idx) => {
                const edit = rowEdits[item.voucherId] || {
                  bankDate: item.bankDate,
                  isBounced: item.isBounced,
                };

                const isBounced = edit.isBounced;
                const isCleared = !isBounced && Boolean(edit.bankDate);

                // Visual row background tint
                let rowBg = '#ffffff';
                if (isBounced) rowBg = '#fff1f2';
                else if (isCleared) rowBg = '#f0fdf4';

                return (
                  <TableRow
                    key={item.voucherId}
                    hover
                    sx={{
                      bgcolor: rowBg,
                      height: 24,
                      minHeight: 24,
                      '&:hover': { bgcolor: isBounced ? '#ffe4e6' : isCleared ? '#dcfce7' : '#f8fafc' },
                      '& td': {
                        py: '2px !important',
                        px: 1.0,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        borderBottom: '1px solid #e2e8f0',
                        borderRight: '1px solid #f1f5f9',
                        lineHeight: 1.2,
                      },
                      '& td:last-child': { borderRight: 'none' },
                    }}
                  >
                    {/* Sl No */}
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.60rem !important', color: '#0f172a' }}>
                      {idx + 1}
                    </TableCell>

                    {/* Book Date */}
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.65rem !important', color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {formatDateDisplay(item.bookDate)}
                    </TableCell>

                    {/* Voucher No */}
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.60rem !important', color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {item.voucherNo}
                    </TableCell>

                    {/* Particulars */}
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.65rem !important', color: '#0f172a', wordBreak: 'break-word' }}>
                      {item.particulars}
                    </TableCell>

                    {/* Cheque / Ref */}
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.60rem !important', color: '#0f172a', wordBreak: 'break-word' }}>
                      {item.chequeNumber || '-'}
                    </TableCell>

                    {/* Withdrawals (AED) */}
                    <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.65rem !important', color: item.withdrawals > 0 ? '#0f172a' : '#94a3b8' }}>
                      {item.withdrawals > 0 ? formatCurrency(item.withdrawals) : '-'}
                    </TableCell>

                    {/* Deposits (AED) */}
                    <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.65rem !important', color: item.deposits > 0 ? '#0f172a' : '#94a3b8' }}>
                      {item.deposits > 0 ? formatCurrency(item.deposits) : '-'}
                    </TableCell>

                    {/* Column 8: Bank Date (Editable only in unreconciled; read-only in reconciled and all) OR Bounced checkbox in bounced tab */}
                    {activeTab === 'bounced' ? (
                      <TableCell align="center" sx={{ py: '1px !important', px: 0.3 }}>
                        <Checkbox
                          size="small"
                          checked={Boolean(edit.isBounced)}
                          onChange={(e) => handleBouncedToggle(item.voucherId, e.target.checked)}
                          sx={{
                            p: 0,
                            color: '#f87171',
                            '&.Mui-checked': { color: '#dc2626' },
                            '& .MuiSvgIcon-root': { fontSize: 15 },
                          }}
                        />
                      </TableCell>
                    ) : activeTab === 'unreconciled' ? (
                      <TableCell sx={{ py: '1px !important', px: 0.8 }}>
                        <Box
                          onClick={() => {
                            const el = document.getElementById(`bank-date-${item.voucherId}`) as HTMLInputElement;
                            el?.showPicker?.();
                          }}
                          sx={{ position: 'relative', cursor: 'pointer' }}
                        >
                          <TextField
                            size="small"
                            fullWidth
                            disabled={isBounced}
                            placeholder="Select date"
                            value={edit.bankDate ? formatDateDisplay(edit.bankDate) : ''}
                            InputProps={{
                              readOnly: true,
                              endAdornment: (
                                <InputAdornment position="end" sx={{ mr: -0.5 }}>
                                  <CalendarMonthIcon sx={{ fontSize: 12, color: '#0284c7' }} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              cursor: 'pointer',
                              '& .MuiOutlinedInput-root': {
                                height: 20,
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                bgcolor: '#ffffff',
                                borderRadius: '3px',
                                '& input': { py: '0px !important', px: '4px !important', cursor: 'pointer', fontSize: '0.62rem', color: '#0f172a', fontWeight: 700 },
                                '& fieldset': { borderColor: edit.bankDate ? '#0284c7' : '#cbd5e1' },
                              },
                            }}
                          />
                          <input
                            id={`bank-date-${item.voucherId}`}
                            type="date"
                            disabled={isBounced}
                            value={edit.bankDate || ''}
                            onChange={(e) => handleBankDateChange(item.voucherId, e.target.value)}
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
                      </TableCell>
                    ) : (
                      /* Read-only Bank Date for Reconciled and All tabs */
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.65rem !important', color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {formatDateDisplay(edit.bankDate || item.bankDate) || '-'}
                      </TableCell>
                    )}

                    {/* Status Chip */}
                    <TableCell align="center" sx={{ py: '1px !important', px: 0.3 }}>
                      {isBounced ? (
                        <Chip
                          label="BOUNCED"
                          size="small"
                          sx={{
                            height: 15,
                            fontSize: '0.52rem',
                            fontWeight: 800,
                            bgcolor: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            px: 0.2,
                          }}
                        />
                      ) : isCleared ? (
                        <Chip
                          label="CLEARED"
                          size="small"
                          sx={{
                            height: 15,
                            fontSize: '0.52rem',
                            fontWeight: 800,
                            bgcolor: '#dcfce7',
                            color: '#15803d',
                            border: '1px solid #86efac',
                            px: 0.2,
                          }}
                        />
                      ) : (
                        <Chip
                          label="PENDING"
                          size="small"
                          sx={{
                            height: 15,
                            fontSize: '0.52rem',
                            fontWeight: 800,
                            bgcolor: '#fef9c3',
                            color: '#a16207',
                            border: '1px solid #fde047',
                            px: 0.2,
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}

            {/* Empty grid placeholders to maintain sleek UI form */}
            {!loading &&
              Array.from({ length: emptyRowsCount }).map((_, i) => (
                <TableRow key={`empty-${i}`} sx={{ height: 24 }}>
                  {Array.from({ length: 9 }).map((_, colIdx) => (
                    <TableCell
                      key={`empty-col-${colIdx}`}
                      sx={{
                        borderBottom: '1px solid #f1f5f9',
                        borderRight: colIdx === 8 ? 'none' : '1px solid #f8fafc',
                      }}
                    />
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Footer Area Below Grid: Info on Left, Summary on Bottom-Right */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'flex-start' },
          gap: 2,
          mb: 2,
        }}
      >
        {/* Left Side: Status & Counts */}
        <Box sx={{ pt: 0.5 }}>
          <Typography sx={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 700, mb: 0.4 }}>
            {activeTab === 'bounced'
              ? `${data?.bouncedCount ?? 0} bounced cheques`
              : activeTab === 'reconciled'
              ? `${data?.reconciledCount ?? 0} reconciled transactions`
              : activeTab === 'all'
              ? `${displayedItems.length} total transactions`
              : `${data?.unreconciledCount ?? 0} unreconciled transactions`}
          </Typography>
          <Typography sx={{ fontSize: '0.74rem', color: '#0284c7', fontWeight: 600 }}>
            {activeTab === 'bounced'
              ? 'Tick the checkbox to mark a cheque as bounced, then click Save Reconciliation.'
              : activeTab === 'reconciled'
              ? 'Transactions cleared with verified bank dates.'
              : activeTab === 'all'
              ? 'All transactions including unreconciled, bounced, and cleared.'
              : data?.unreconciledCount && data.unreconciledCount > 0
              ? `${data.unreconciledCount} items still require reconciliation.`
              : 'All transactions for this period are reconciled.'}
          </Typography>
        </Box>

        {/* Right Side: Reconciliation Summary (Shifted to Bottom Right of Grid) */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            width: { xs: '100%', sm: 'auto' },
            ml: { xs: 0, sm: 'auto' },
          }}
        >
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '0.84rem',
              color: '#003580',
              mb: 0.8,
              textAlign: { xs: 'left', sm: 'right' },
              width: '100%',
            }}
          >
            Reconciliation Summary
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              width: { xs: '100%', sm: 640 },
              gap: 1.0,
            }}
          >
            {/* Card 1: Expected bank balance */}
            <Card
              variant="outlined"
              sx={{
                py: 0.7,
                px: 1.2,
                borderRadius: '7px',
                bgcolor: '#f0f7ff',
                borderColor: '#d0e2f5',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'none',
                minHeight: 48,
              }}
            >
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#034b8c', lineHeight: 1.2 }}>
                Expected bank balance (AED)
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', mt: 0.3 }}>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                  {data ? formatCurrency(data.expectedBankBalance) : '0.00'}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284c7', ml: 0.4 }}>
                  {data?.expectedIsDebit ? 'Dr' : 'Cr'}
                </Typography>
              </Box>
            </Card>

            {/* Card 2: Statement balance */}
            <Card
              variant="outlined"
              sx={{
                py: 0.7,
                px: 1.2,
                borderRadius: '7px',
                bgcolor: '#f0f7ff',
                borderColor: '#d0e2f5',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'none',
                minHeight: 48,
              }}
            >
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#034b8c', lineHeight: 1.2 }}>
                Statement balance (AED)
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', mt: 0.3 }}>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                  {data ? formatCurrency(data.statementBalance) : '0.00'}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284c7', ml: 0.4 }}>
                  {data?.statementIsDebit ? 'Dr' : 'Cr'}
                </Typography>
              </Box>
            </Card>

            {/* Card 3: Unreconciled Amount */}
            <Card
              variant="outlined"
              sx={{
                py: 0.7,
                px: 1.2,
                borderRadius: '7px',
                bgcolor: '#f0f9ff',
                borderColor: '#bae6fd',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'none',
                minHeight: 48,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', lineHeight: 1.2 }}>
                  Unreconciled Amount (AED)
                </Typography>
                <Typography sx={{ fontSize: '0.60rem', color: '#0284c7', fontWeight: 600, lineHeight: 1 }}>
                  Total unmatched amounts
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', mt: 0.3 }}>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: '#0284c7', lineHeight: 1.2 }}>
                  {data ? formatCurrency(data.unreconciledAmount) : '0.00'}
                </Typography>
              </Box>
            </Card>
          </Box>
        </Box>
      </Box>

      {/* Action Buttons Bar */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.2,
          alignItems: 'center',
          pt: 1,
          borderTop: '1px solid #e2e8f0',
        }}
      >
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || activeTab === 'reconciled' || activeTab === 'all'}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          sx={{
            bgcolor: '#00838f',
            color: '#ffffff',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '7px',
            px: 2.2,
            py: 0.8,
            boxShadow: 'none',
            '&:hover': { bgcolor: '#006064', boxShadow: 'none' },
            '&.Mui-disabled': {
              bgcolor: '#e2e8f0',
              color: '#94a3b8',
            },
          }}
        >
          {saving
            ? 'Saving...'
            : activeTab === 'reconciled' || activeTab === 'all'
            ? 'View Only'
            : 'Save Reconciliation'}
        </Button>

        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={loadData}
          sx={{
            borderColor: '#93c5fd',
            color: '#0284c7',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '7px',
            px: 2,
            py: 0.8,
            '&:hover': { bgcolor: '#eff6ff', borderColor: '#60a5fa' },
          }}
        >
          Edit
        </Button>

        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={loadData}
          sx={{
            borderColor: '#93c5fd',
            color: '#0284c7',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '7px',
            px: 2,
            py: 0.8,
            '&:hover': { bgcolor: '#eff6ff', borderColor: '#60a5fa' },
          }}
        >
          Search
        </Button>

        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          sx={{
            borderColor: '#93c5fd',
            color: '#0284c7',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '7px',
            px: 2,
            py: 0.8,
            '&:hover': { bgcolor: '#eff6ff', borderColor: '#60a5fa' },
          }}
        >
          Print
        </Button>

        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleExportCSV}
          sx={{
            borderColor: '#93c5fd',
            color: '#0284c7',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '7px',
            px: 2,
            py: 0.8,
            '&:hover': { bgcolor: '#eff6ff', borderColor: '#60a5fa' },
          }}
        >
          Export
        </Button>

        <Button
          variant="outlined"
          startIcon={<CloseIcon />}
          onClick={() => navigate('/')}
          sx={{
            borderColor: '#93c5fd',
            color: '#0284c7',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '7px',
            px: 2,
            py: 0.8,
            '&:hover': { bgcolor: '#eff6ff', borderColor: '#60a5fa' },
          }}
        >
          Close
        </Button>
      </Box>

      {/* Snackbar alerts */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%', fontWeight: 700 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
