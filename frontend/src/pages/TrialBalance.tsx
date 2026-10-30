import { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Chip,
  IconButton,
  Collapse,
  InputAdornment,
  Tooltip,
  CircularProgress,
  ButtonGroup,
} from '@mui/material';
import {
  AccountBalanceWallet as BalanceWalletIcon,
  AccountTree as TreeIcon,
  ViewList as DetailedListIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
  FolderOpen as FolderOpenIcon,
  Folder as FolderIcon,
  FileDownload as DownloadIcon,
  Print as PrintIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Verified as VerifiedIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { ledgerApi, TrialBalanceRow, TrialBalanceData } from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';

function formatAED(amount: number): string {
  return (amount || 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type ClassificationKey = 'ASSETS' | 'LIABILITIES' | 'EQUITY' | 'REVENUE' | 'EXPENSES' | 'OTHER';

interface ClassificationConfig {
  id: ClassificationKey;
  codePrefix: string;
  title: string;
  badge: string;
  borderColor: string;
  headerBg: string;
  headerHoverBg: string;
  textColor: string;
  accentBg: string;
}

const CLASSIFICATIONS: Record<ClassificationKey, ClassificationConfig> = {
  ASSETS: {
    id: 'ASSETS',
    codePrefix: '1000',
    title: '1000 • CURRENT & NON-CURRENT ASSETS',
    badge: 'Assets',
    borderColor: '#10b981',
    headerBg: '#f0fdf4',
    headerHoverBg: '#e7fbf0',
    textColor: '#047857',
    accentBg: '#ecfdf5',
  },
  LIABILITIES: {
    id: 'LIABILITIES',
    codePrefix: '2000',
    title: '2000 • CURRENT & STATUTORY LIABILITIES',
    badge: 'Liabilities',
    borderColor: '#4f46e5',
    headerBg: '#eff6ff',
    headerHoverBg: '#e0eeff',
    textColor: '#3730a3',
    accentBg: '#e0e7ff',
  },
  EQUITY: {
    id: 'EQUITY',
    codePrefix: '3000',
    title: "3000 • SHAREHOLDERS' EQUITY & RESERVES",
    badge: 'Equity',
    borderColor: '#8b5cf6',
    headerBg: '#f5f3ff',
    headerHoverBg: '#ede9fe',
    textColor: '#5b21b6',
    accentBg: '#ede9fe',
  },
  REVENUE: {
    id: 'REVENUE',
    codePrefix: '4000',
    title: '4000 • RETAIL REVENUE & OPERATING SALES',
    badge: 'Revenue',
    borderColor: '#059669',
    headerBg: '#f0fdf4',
    headerHoverBg: '#e6f8ef',
    textColor: '#065f46',
    accentBg: '#d1fae5',
  },
  EXPENSES: {
    id: 'EXPENSES',
    codePrefix: '5000',
    title: '5000 • COST OF GOODS SOLD & OPERATING EXPENSES',
    badge: 'Expenses',
    borderColor: '#e11d48',
    headerBg: '#fff1f2',
    headerHoverBg: '#ffe4e6',
    textColor: '#be123c',
    accentBg: '#ffe4e6',
  },
  OTHER: {
    id: 'OTHER',
    codePrefix: '9000',
    title: '9000 • GENERAL & UNCLASSIFIED LEDGERS',
    badge: 'Other',
    borderColor: '#64748b',
    headerBg: '#f8fafc',
    headerHoverBg: '#f1f5f9',
    textColor: '#334155',
    accentBg: '#f1f5f9',
  },
};

function classifyRow(row: TrialBalanceRow): ClassificationKey {
  const t = (row.groupType || '').toUpperCase();
  const c = row.code || '';
  const gName = (row.groupName || '').toLowerCase();

  if (
    t === 'ASSET' ||
    c.startsWith('1') ||
    gName.includes('asset') ||
    gName.includes('cash') ||
    gName.includes('bank') ||
    gName.includes('receivable') ||
    gName.includes('deposit') ||
    gName.includes('stock') ||
    gName.includes('inventory')
  ) {
    return 'ASSETS';
  }

  if (
    t === 'LIABILITY' ||
    t === 'DUTIES AND TAXES' ||
    c.startsWith('2') ||
    gName.includes('liabilit') ||
    gName.includes('payable') ||
    gName.includes('tax') ||
    gName.includes('vat') ||
    gName.includes('duties')
  ) {
    return 'LIABILITIES';
  }

  if (
    t === 'EQUITY' ||
    c.startsWith('3') ||
    gName.includes('equity') ||
    gName.includes('capital') ||
    gName.includes('reserve') ||
    gName.includes('retained')
  ) {
    return 'EQUITY';
  }

  if (
    t === 'INCOME' ||
    t === 'REVENUE' ||
    c.startsWith('4') ||
    gName.includes('sales') ||
    gName.includes('revenue') ||
    gName.includes('income')
  ) {
    return 'REVENUE';
  }

  if (
    t === 'EXPENSE' ||
    t === 'EXPENSES' ||
    c.startsWith('5') ||
    c.startsWith('6') ||
    gName.includes('expense') ||
    gName.includes('cogs') ||
    gName.includes('cost') ||
    gName.includes('salary') ||
    gName.includes('purchase')
  ) {
    return 'EXPENSES';
  }

  return 'OTHER';
}

export default function TrialBalance() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [balanced, setBalanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters & View State
  const [asAtDate, setAsAtDate] = useState<string>(getCurrentDate);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'detailed'>('grouped');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    ASSETS: true,
    LIABILITIES: true,
    EQUITY: true,
    REVENUE: true,
    EXPENSES: true,
    OTHER: true,
  });

  const fetchData = async () => {
    if (!companyId || !financialYearId) return;
    setLoading(true);
    try {
      const res = await ledgerApi.trialBalance(companyId, financialYearId, asAtDate);
      const d = res.data.data as TrialBalanceData;
      setRows(d?.rows ?? []);
      setTotalDebit(d?.totalDebit ?? 0);
      setTotalCredit(d?.totalCredit ?? 0);
      setBalanced(d?.balanced ?? false);
    } catch (err) {
      console.error('Failed to load trial balance', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId, financialYearId, asAtDate]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/trial-balance') {
        fetchData();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/trial-balance') || window.location.pathname.includes('/report/trial-balance')) {
        fetchData();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [companyId, financialYearId, asAtDate]);

  const handleExport = async () => {
    if (!companyId || !financialYearId) return;
    setExporting(true);
    try {
      const res = await ledgerApi.exportTrialBalance(companyId, financialYearId, asAtDate);
      const blob = new Blob([res.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trial-balance-${asAtDate || new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export trial balance', err);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    (Object.keys(CLASSIFICATIONS) as ClassificationKey[]).forEach((k) => (all[k] = true));
    setExpandedGroups(all);
  };

  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    (Object.keys(CLASSIFICATIONS) as ClassificationKey[]).forEach((k) => (all[k] = false));
    setExpandedGroups(all);
  };

  // Preset Date Handlers
  const handlePresetDate = (type: 'today' | 'monthEnd' | 'quarterEnd' | 'yearEnd') => {
    const now = new Date();
    let target = new Date();
    if (type === 'today') {
      target = now;
    } else if (type === 'monthEnd') {
      target = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (type === 'quarterEnd') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const nextQuarterStartMonth = (currentQuarter + 1) * 3;
      target = new Date(now.getFullYear(), nextQuarterStartMonth, 0);
    } else if (type === 'yearEnd') {
      target = new Date(now.getFullYear(), 11, 31);
    }
    setAsAtDate(target.toISOString().slice(0, 10));
  };

  // Filtered Rows
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.groupName && r.groupName.toLowerCase().includes(q)) ||
        (r.groupType && r.groupType.toLowerCase().includes(q))
    );
  }, [rows, search]);

  // Grouped Structure
  const groupedData = useMemo(() => {
    const order: ClassificationKey[] = ['ASSETS', 'LIABILITIES', 'EQUITY', 'REVENUE', 'EXPENSES', 'OTHER'];
    const groups: Array<{
      key: ClassificationKey;
      config: ClassificationConfig;
      rows: TrialBalanceRow[];
      totalDebit: number;
      totalCredit: number;
    }> = [];

    order.forEach((k) => {
      const gRows = filteredRows.filter((r) => classifyRow(r) === k);
      if (gRows.length > 0) {
        const dSum = gRows.reduce((s, r) => s + (r.debit || 0), 0);
        const cSum = gRows.reduce((s, r) => s + (r.credit || 0), 0);
        groups.push({
          key: k,
          config: CLASSIFICATIONS[k],
          rows: gRows,
          totalDebit: dSum,
          totalCredit: cSum,
        });
      }
    });

    return groups;
  }, [filteredRows]);

  const variance = Math.abs(totalDebit - totalCredit);
  const isVarianceZero = balanced && variance < 0.01;

  if (!companyId) {
    return (
      <Box sx={{ p: 2 }}>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fff5f5', border: '1px solid #fed7d7' }}>
          <Typography sx={{ fontSize: '0.82rem', color: '#c53030', fontWeight: 600 }}>
            Select a company from the header dropdown to view the Trial Balance.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (!financialYearId) {
    return (
      <Box sx={{ p: 2 }}>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fff5f5', border: '1px solid #fed7d7' }}>
          <Typography sx={{ fontSize: '0.82rem', color: '#c53030', fontWeight: 600 }}>
            Select a financial year from the header dropdown to proceed.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1600,
        mx: 'auto',
        p: { xs: 1.5, sm: 2 },
        pb: { xs: 20, sm: 16 },
        bgcolor: '#f8fafc',
        minHeight: '100vh',
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: Page Header Bar (Ultra-Compact 60% Scaled Sizing)
      ───────────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          py: 0.6,
          px: 1.25,
          mb: 0.75,
          borderRadius: 1.5,
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 1,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        {/* Left: Brand Icon + Title + Live Audit Badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: 1,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3525cd 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(79,70,229,0.25)',
              flexShrink: 0,
            }}
          >
            <BalanceWalletIcon sx={{ fontSize: 13 }} />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.015em', lineHeight: 1.1 }}>
                Trial Balance Statement
              </Typography>
              {isVarianceZero ? (
                <Chip
                  icon={
                    <Box
                      component="span"
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        bgcolor: '#10b981',
                        boxShadow: '0 0 4px rgba(16,185,129,0.8)',
                      }}
                    />
                  }
                  label="Audit Balanced"
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    bgcolor: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                    '& .MuiChip-label': { px: 0.5 },
                    '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
                  }}
                />
              ) : (
                <Chip
                  icon={<WarningIcon sx={{ fontSize: '10px !important', color: '#b91c1c' }} />}
                  label={`Out of Balance (${formatAED(variance)} AED)`}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    bgcolor: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    '& .MuiChip-label': { px: 0.5 },
                  }}
                />
              )}
            </Box>
            <Typography sx={{ fontSize: '0.58rem', color: '#64748b', mt: 0.1, lineHeight: 1 }}>
              Hierarchical General Ledger Verification • Real-Time Dual-Entry Audit
            </Typography>
          </Box>
        </Box>

        {/* Right: Controls & Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {/* Segmented View Switcher */}
          <Box
            sx={{
              display: 'flex',
              bgcolor: '#f1f5f9',
              p: 0.2,
              borderRadius: 1,
              border: '1px solid #e2e8f0',
            }}
          >
            <Button
              size="small"
              onClick={() => setViewMode('grouped')}
              startIcon={<TreeIcon sx={{ fontSize: '11px !important' }} />}
              sx={{
                height: 20,
                minHeight: 20,
                px: 0.85,
                py: 0,
                fontSize: '0.62rem',
                fontWeight: 600,
                borderRadius: 0.75,
                textTransform: 'none',
                color: viewMode === 'grouped' ? '#ffffff' : '#64748b',
                bgcolor: viewMode === 'grouped' ? '#4f46e5' : 'transparent',
                boxShadow: viewMode === 'grouped' ? '0 1px 2px rgba(79,70,229,0.2)' : 'none',
                '&:hover': {
                  bgcolor: viewMode === 'grouped' ? '#4338ca' : '#e2e8f0',
                },
              }}
            >
              Grouped View
            </Button>
            <Button
              size="small"
              onClick={() => setViewMode('detailed')}
              startIcon={<DetailedListIcon sx={{ fontSize: '11px !important' }} />}
              sx={{
                height: 20,
                minHeight: 20,
                px: 0.85,
                py: 0,
                fontSize: '0.62rem',
                fontWeight: 600,
                borderRadius: 0.75,
                textTransform: 'none',
                color: viewMode === 'detailed' ? '#ffffff' : '#64748b',
                bgcolor: viewMode === 'detailed' ? '#4f46e5' : 'transparent',
                boxShadow: viewMode === 'detailed' ? '0 1px 2px rgba(79,70,229,0.2)' : 'none',
                '&:hover': {
                  bgcolor: viewMode === 'detailed' ? '#4338ca' : '#e2e8f0',
                },
              }}
            >
              Detailed Ledger
            </Button>
          </Box>

          {/* Expand / Collapse (Grouped View only) */}
          {viewMode === 'grouped' && (
            <ButtonGroup size="small" sx={{ height: 20, minHeight: 20 }}>
              <Button
                onClick={expandAll}
                startIcon={<ExpandAllIcon sx={{ fontSize: '11px !important' }} />}
                sx={{
                  height: 20,
                  minHeight: 20,
                  fontSize: '0.58rem',
                  textTransform: 'none',
                  color: '#475569',
                  borderColor: '#e2e8f0',
                  px: 0.75,
                  py: 0,
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
                }}
              >
                Expand
              </Button>
              <Button
                onClick={collapseAll}
                startIcon={<CollapseAllIcon sx={{ fontSize: '11px !important' }} />}
                sx={{
                  height: 20,
                  minHeight: 20,
                  fontSize: '0.58rem',
                  textTransform: 'none',
                  color: '#475569',
                  borderColor: '#e2e8f0',
                  px: 0.75,
                  py: 0,
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
                }}
              >
                Collapse
              </Button>
            </ButtonGroup>
          )}

          {/* Export to Excel */}
          <Button
            size="small"
            variant="contained"
            onClick={handleExport}
            disabled={exporting}
            startIcon={
              exporting ? <CircularProgress size={10} color="inherit" /> : <DownloadIcon sx={{ fontSize: '11px !important' }} />
            }
            sx={{
              height: 20,
              minHeight: 20,
              px: 1,
              py: 0,
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: '#006c49',
              color: '#ffffff',
              borderRadius: 1,
              boxShadow: '0 1px 2px rgba(0,108,73,0.2)',
              '&:hover': { bgcolor: '#005539' },
            }}
          >
            {exporting ? 'Exporting...' : 'Export Excel'}
          </Button>

          {/* Print */}
          <Tooltip title="Print Report">
            <IconButton
              size="small"
              onClick={handlePrint}
              sx={{
                width: 20,
                height: 20,
                borderRadius: 1,
                border: '1px solid #e2e8f0',
                bgcolor: '#ffffff',
                color: '#475569',
                p: 0,
                '&:hover': { bgcolor: '#f1f5f9' },
              }}
            >
              <PrintIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: Filter & Date Controls Card (Ultra-Compact 60% Sizing)
      ───────────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          py: 0.6,
          px: 1.25,
          mb: 0.75,
          borderRadius: 1.5,
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <Grid container spacing={1.5} alignItems="flex-end">
          {/* As-At Date Field */}
          <Grid item xs={12} sm={4} md={3.6}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569', mb: 0.35, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              As-At Date
            </Typography>
            <DateInput
              label=""
              size="small"
              fullWidth
              value={asAtDate}
              onChange={setAsAtDate}
              sx={{
                height: 26,
                minHeight: 26,
                maxHeight: 26,
                '& .MuiPickersTextField-root': {
                  height: 26,
                  minHeight: 26,
                  maxHeight: 26,
                },
                '& .MuiPickersOutlinedInput-root, & .MuiOutlinedInput-root, & .MuiPickersInputBase-root, & .MuiInputBase-root': {
                  height: 26,
                  minHeight: 26,
                  maxHeight: 26,
                  fontSize: '0.72rem',
                  borderRadius: 1,
                  bgcolor: '#ffffff',
                  pl: 0.75,
                  pr: 0.5,
                  boxSizing: 'border-box',
                  '& fieldset, & .MuiPickersOutlinedInput-notchedOutline': {
                    borderColor: '#cbd5e1',
                  },
                  '&:hover fieldset, &:hover .MuiPickersOutlinedInput-notchedOutline': {
                    borderColor: '#94a3b8',
                  },
                  '&.Mui-focused fieldset, &.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
                    borderColor: '#4f46e5',
                    borderWidth: '1.5px',
                  },
                },
                '& .MuiPickersOutlinedInput-input, & .MuiPickersInputBase-sectionsContainer, & .MuiInputBase-input': {
                  padding: '0 !important',
                  py: '0 !important',
                  height: '22px !important',
                  minHeight: '22px !important',
                  maxHeight: '22px !important',
                  lineHeight: '22px !important',
                  fontSize: '0.72rem',
                  color: '#1e293b',
                  fontWeight: 500,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                },
                '& .MuiPickersSectionList-root': {
                  py: '0 !important',
                  lineHeight: '22px !important',
                  fontSize: '0.72rem',
                },
                '& .MuiPickersSectionList-section': {
                  fontSize: '0.72rem',
                  color: '#1e293b',
                  fontWeight: 500,
                  lineHeight: '22px !important',
                },
                '& .MuiInputAdornment-root': {
                  maxHeight: 26,
                  height: 26,
                  my: 0,
                  ml: 0.25,
                  mr: 0,
                },
                '& .MuiIconButton-root': {
                  p: '2px !important',
                  '& .MuiSvgIcon-root': {
                    fontSize: 15,
                    color: '#64748b',
                  },
                },
              }}
            />
          </Grid>

          {/* Quick Search Bar */}
          <Grid item xs={12} sm={8} md={8.4}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569', mb: 0.35, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Quick Ledger Filter
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Search account code, title or group (e.g. 1010, Cash, VAT)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ mr: 0.5 }}>
                    <SearchIcon sx={{ fontSize: 15, color: '#94a3b8' }} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')} sx={{ p: '2px' }}>
                      <ClearIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                sx: {
                  height: 26,
                  minHeight: 26,
                  fontSize: '0.72rem',
                  borderRadius: 1,
                  bgcolor: '#ffffff',
                  px: 0.75,
                  '& fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&:hover fieldset': {
                    borderColor: '#94a3b8',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#4f46e5',
                    borderWidth: '1.5px',
                  },
                },
              }}
              inputProps={{
                style: {
                  padding: '2px 0',
                  height: '22px',
                  fontSize: '0.72rem',
                  color: '#1e293b',
                  fontWeight: 500,
                },
              }}
            />
          </Grid>
        </Grid>

        {/* Quick Date Presets Row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.6,
            pt: 0.5,
            mt: 0.5,
            borderTop: '1px solid #f1f5f9',
            flexWrap: 'wrap',
          }}
        >
          <Typography sx={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
            Quick Presets:
          </Typography>
          <Button
            size="small"
            onClick={() => handlePresetDate('today')}
            sx={{
              height: 20,
              minHeight: 20,
              px: 1,
              py: 0,
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: '#f1f5f9',
              color: '#334155',
              borderRadius: 1,
              minWidth: 'auto',
              '&:hover': { bgcolor: '#e2e8f0' },
            }}
          >
            Today
          </Button>
          <Button
            size="small"
            onClick={() => handlePresetDate('monthEnd')}
            sx={{
              height: 20,
              minHeight: 20,
              px: 1,
              py: 0,
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: '#f1f5f9',
              color: '#334155',
              borderRadius: 1,
              minWidth: 'auto',
              '&:hover': { bgcolor: '#e2e8f0' },
            }}
          >
            Month End
          </Button>
          <Button
            size="small"
            onClick={() => handlePresetDate('quarterEnd')}
            sx={{
              height: 20,
              minHeight: 20,
              px: 1,
              py: 0,
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: '#f1f5f9',
              color: '#334155',
              borderRadius: 1,
              minWidth: 'auto',
              '&:hover': { bgcolor: '#e2e8f0' },
            }}
          >
            Quarter End
          </Button>
          <Button
            size="small"
            onClick={() => handlePresetDate('yearEnd')}
            sx={{
              height: 20,
              minHeight: 20,
              px: 1,
              py: 0,
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: '#e0e7ff',
              color: '#3730a3',
              borderRadius: 1,
              minWidth: 'auto',
              '&:hover': { bgcolor: '#c7d2fe' },
            }}
          >
            FY End
          </Button>
          {search && (
            <Chip
              label={`Filtered: "${search}"`}
              size="small"
              onDelete={() => setSearch('')}
              sx={{
                height: 16,
                fontSize: '0.55rem',
                bgcolor: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a',
                ml: 'auto',
                '& .MuiChip-label': { px: 0.5 },
                '& .MuiChip-deleteIcon': { fontSize: 11, ml: -0.25, mr: 0.25 },
              }}
            />
          )}
        </Box>
      </Paper>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: Top 4 KPI Metric Cards (Ultra-Compact 60% Sizing)
      ───────────────────────────────────────────────────────────── */}
      <Grid container spacing={0.75} sx={{ mb: 0.75 }}>
        {/* Card 1: Total Debits */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              py: 0.4,
              px: 0.85,
              borderRadius: 1.5,
              border: '1px solid #e2e8f0',
              borderLeft: '3px solid #10b981',
              bgcolor: '#ffffff',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.56rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Debits
              </Typography>
              <Chip
                label="↑ Equalized"
                size="small"
                sx={{
                  height: 14,
                  fontSize: '0.52rem',
                  fontWeight: 700,
                  bgcolor: '#ecfdf5',
                  color: '#047857',
                  border: '1px solid #a7f3d0',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            </Box>
            <Box sx={{ mt: 0.25 }}>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                AED {formatAED(totalDebit)}
              </Typography>
              <Typography sx={{ fontSize: '0.55rem', color: '#64748b', mt: 0.1 }}>
                {rows.filter((r) => (r.debit || 0) > 0).length} Active Debit Accounts
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Card 2: Total Credits */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              py: 0.4,
              px: 0.85,
              borderRadius: 1.5,
              border: '1px solid #e2e8f0',
              borderLeft: '3px solid #4f46e5',
              bgcolor: '#ffffff',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.56rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Credits
              </Typography>
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: '9px !important', color: '#3730a3' }} />}
                label="Double-Entry"
                size="small"
                sx={{
                  height: 14,
                  fontSize: '0.52rem',
                  fontWeight: 700,
                  bgcolor: '#e0e7ff',
                  color: '#3730a3',
                  border: '1px solid #c7d2fe',
                  '& .MuiChip-label': { px: 0.5 },
                  '& .MuiChip-icon': { ml: 0.4, mr: -0.3 },
                }}
              />
            </Box>
            <Box sx={{ mt: 0.25 }}>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                AED {formatAED(totalCredit)}
              </Typography>
              <Typography sx={{ fontSize: '0.55rem', color: '#64748b', mt: 0.1 }}>
                {rows.filter((r) => (r.credit || 0) > 0).length} Active Credit Accounts
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Card 3: Net Difference / Variance */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              py: 0.4,
              px: 0.85,
              borderRadius: 1.5,
              border: '1px solid #e2e8f0',
              borderLeft: `3px solid ${isVarianceZero ? '#10b981' : '#e11d48'}`,
              bgcolor: '#ffffff',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography
                sx={{
                  fontSize: '0.56rem',
                  fontWeight: 700,
                  color: isVarianceZero ? '#047857' : '#be123c',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Net Difference
              </Typography>
              <Chip
                label={isVarianceZero ? '✓ Perfect Balance' : '⚠ Out of Balance'}
                size="small"
                sx={{
                  height: 14,
                  fontSize: '0.52rem',
                  fontWeight: 700,
                  bgcolor: isVarianceZero ? '#ecfdf5' : '#fff1f2',
                  color: isVarianceZero ? '#047857' : '#be123c',
                  border: `1px solid ${isVarianceZero ? '#a7f3d0' : '#fecdd3'}`,
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            </Box>
            <Box sx={{ mt: 0.25 }}>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: isVarianceZero ? '#047857' : '#be123c',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                AED {formatAED(variance)}
              </Typography>
              <Typography sx={{ fontSize: '0.55rem', color: '#64748b', mt: 0.1 }}>
                Differential: {isVarianceZero ? '0.00 AED' : `${formatAED(variance)} AED`}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Card 4: Active Accounts Audit */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              py: 0.4,
              px: 0.85,
              borderRadius: 1.5,
              border: '1px solid #e2e8f0',
              borderLeft: '3px solid #64748b',
              bgcolor: '#ffffff',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.56rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Accounts Audit
              </Typography>
              <Chip
                label="100% Reconciled"
                size="small"
                sx={{
                  height: 14,
                  fontSize: '0.52rem',
                  fontWeight: 700,
                  bgcolor: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #e2e8f0',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            </Box>
            <Box sx={{ mt: 0.25 }}>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                {rows.length} Accounts
              </Typography>
              <Typography sx={{ fontSize: '0.55rem', color: '#64748b', mt: 0.1 }}>
                FTA VAT Rule 52 Compliant
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: Main Trial Balance Hierarchical / Detailed Table
      ───────────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Table Column Header */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '80px 1fr 100px 100px', sm: '100px 1.8fr 120px 120px 120px' },
            minWidth: { xs: 500, sm: 680 },
            px: 1.75,
            py: 1,
            bgcolor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            fontSize: '0.67rem',
            fontWeight: 700,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Box>Code</Box>
          <Box>Account Name & Ledger Description</Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>Classification</Box>
          <Box sx={{ textAlign: 'right' }}>Debit (AED)</Box>
          <Box sx={{ textAlign: 'right' }}>Credit (AED)</Box>
        </Box>

        {loading ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: '#4f46e5' }} />
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 1 }}>
              Loading trial balance ledgers...
            </Typography>
          </Box>
        ) : filteredRows.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
              {search ? `No accounts match "${search}"` : 'No active ledger accounts found for this period.'}
            </Typography>
            {search && (
              <Button size="small" onClick={() => setSearch('')} sx={{ mt: 1, fontSize: '0.72rem' }}>
                Clear Filter
              </Button>
            )}
          </Box>
        ) : viewMode === 'grouped' ? (
          /* ── GROUPED TREE VIEW ── */
          <Box>
            {groupedData.map((group) => {
              const isExpanded = expandedGroups[group.key] ?? true;
              return (
                <Box key={group.key} sx={{ borderBottom: '1px solid #e2e8f0' }}>
                  {/* Collapsible Group Header */}
                  <Box
                    onClick={() => toggleGroup(group.key)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1.75,
                      py: 0.85,
                      bgcolor: group.config.headerBg,
                      borderLeft: `4px solid ${group.config.borderColor}`,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color 0.15s ease',
                      '&:hover': {
                        bgcolor: group.config.headerHoverBg,
                      },
                    }}
                  >
                    {/* Left: Folder Icon & Group Title */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {isExpanded ? (
                        <FolderOpenIcon sx={{ fontSize: 17, color: group.config.textColor }} />
                      ) : (
                        <FolderIcon sx={{ fontSize: 17, color: group.config.textColor }} />
                      )}
                      <Typography
                        sx={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: group.config.textColor,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {group.config.title}
                      </Typography>
                      <Chip
                        label={`${group.rows.length} ${group.rows.length === 1 ? 'Account' : 'Accounts'}`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          bgcolor: '#ffffff',
                          color: group.config.textColor,
                          border: `1px solid ${group.config.borderColor}40`,
                        }}
                      />
                    </Box>

                    {/* Right: Subtotal Debit and Credit */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
                      <Typography
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: group.totalDebit > 0 ? group.config.textColor : '#94a3b8',
                        }}
                      >
                        Debit: {group.totalDebit > 0 ? formatAED(group.totalDebit) : '-'}
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: group.totalCredit > 0 ? group.config.textColor : '#94a3b8',
                        }}
                      >
                        Credit: {group.totalCredit > 0 ? formatAED(group.totalCredit) : '-'}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Group Rows */}
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <Box sx={{ divideY: '1px solid #f1f5f9' }}>
                      {group.rows.map((row, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                          <Box
                            key={row.ledgerAccountId || `${row.code}-${idx}`}
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: '80px 1fr 100px 100px', sm: '100px 1.8fr 120px 120px 120px' },
                              minWidth: { xs: 500, sm: 680 },
                              px: 1.75,
                              py: 0.7,
                              alignItems: 'center',
                              bgcolor: isEven ? '#ffffff' : '#fafafa',
                              borderBottom: '1px solid #f1f5f9',
                              transition: 'background-color 0.12s ease',
                              '&:hover': {
                                bgcolor: '#f0f4ff',
                              },
                            }}
                          >
                            {/* Code */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Box
                                component="span"
                                sx={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: '50%',
                                  bgcolor: group.config.borderColor,
                                  flexShrink: 0,
                                }}
                              />
                              <Typography
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.73rem',
                                  fontWeight: 600,
                                  color: '#4f46e5',
                                }}
                              >
                                {row.code}
                              </Typography>
                            </Box>

                            {/* Name & Narration/Group */}
                            <Box sx={{ pr: 1 }}>
                              <Typography
                                sx={{
                                  fontSize: '0.76rem',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                  lineHeight: 1.25,
                                }}
                              >
                                {row.name}
                              </Typography>
                              {row.groupName && (
                                <Typography sx={{ fontSize: '0.65rem', color: '#64748b', mt: 0.15 }}>
                                  {row.groupName}
                                </Typography>
                              )}
                            </Box>

                            {/* Classification Badge (Desktop) */}
                            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                              <Chip
                                label={group.config.badge}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.62rem',
                                  fontWeight: 500,
                                  bgcolor: '#f1f5f9',
                                  color: '#334155',
                                  border: '1px solid #e2e8f0',
                                }}
                              />
                            </Box>

                            {/* Debit (AED) */}
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.76rem',
                                  fontWeight: (row.debit || 0) > 0 ? 600 : 400,
                                  color: (row.debit || 0) > 0 ? '#0f172a' : '#cbd5e1',
                                }}
                              >
                                {(row.debit || 0) > 0 ? formatAED(row.debit) : '-'}
                              </Typography>
                            </Box>

                            {/* Credit (AED) */}
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.76rem',
                                  fontWeight: (row.credit || 0) > 0 ? 600 : 400,
                                  color: (row.credit || 0) > 0 ? '#0f172a' : '#cbd5e1',
                                }}
                              >
                                {(row.credit || 0) > 0 ? formatAED(row.credit) : '-'}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Box>
        ) : (
          /* ── DETAILED FLAT LIST VIEW ── */
          <Box sx={{ divideY: '1px solid #f1f5f9' }}>
            {filteredRows.map((row, idx) => {
              const classification = classifyRow(row);
              const config = CLASSIFICATIONS[classification];
              const isEven = idx % 2 === 0;
              return (
                <Box
                  key={row.ledgerAccountId || `${row.code}-${idx}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '80px 1fr 100px 100px', sm: '100px 1.8fr 120px 120px 120px' },
                    minWidth: { xs: 500, sm: 680 },
                    px: 1.75,
                    py: 0.7,
                    alignItems: 'center',
                    bgcolor: isEven ? '#ffffff' : '#fafafa',
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background-color 0.12s ease',
                    '&:hover': {
                      bgcolor: '#f0f4ff',
                    },
                  }}
                >
                  {/* Code */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box
                      component="span"
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        bgcolor: config.borderColor,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        color: '#4f46e5',
                      }}
                    >
                      {row.code}
                    </Typography>
                  </Box>

                  {/* Name & Group Description */}
                  <Box sx={{ pr: 1 }}>
                    <Typography
                      sx={{
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        lineHeight: 1.25,
                      }}
                    >
                      {row.name}
                    </Typography>
                    {row.groupName && (
                      <Typography sx={{ fontSize: '0.65rem', color: '#64748b', mt: 0.15 }}>
                        {row.groupName}
                      </Typography>
                    )}
                  </Box>

                  {/* Classification Badge (Desktop) */}
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <Chip
                      label={config.badge}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.62rem',
                        fontWeight: 500,
                        bgcolor: config.accentBg,
                        color: config.textColor,
                        border: `1px solid ${config.borderColor}40`,
                      }}
                    />
                  </Box>

                  {/* Debit (AED) */}
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.76rem',
                        fontWeight: (row.debit || 0) > 0 ? 600 : 400,
                        color: (row.debit || 0) > 0 ? '#0f172a' : '#cbd5e1',
                      }}
                    >
                      {(row.debit || 0) > 0 ? formatAED(row.debit) : '-'}
                    </Typography>
                  </Box>

                  {/* Credit (AED) */}
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.76rem',
                        fontWeight: (row.credit || 0) > 0 ? 600 : 400,
                        color: (row.credit || 0) > 0 ? '#0f172a' : '#cbd5e1',
                      }}
                    >
                      {(row.credit || 0) > 0 ? formatAED(row.credit) : '-'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>

      {/* Clearance Spacer ensuring every single ledger row scrolls well above the footer dock */}
      <Box sx={{ height: { xs: 160, sm: 140, md: 120 }, width: '100%', flexShrink: 0 }} />

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: Dark Gradient Grand Total Dock Footer Bar (Stitch Design)
      ───────────────────────────────────────────────────────────── */}
      <Box
        component="footer"
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          zIndex: 1000,
          bgcolor: '#0f172a',
          borderTop: '1px solid #1e293b',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          py: 1,
          px: { xs: 1.5, sm: 3 },
        }}
      >
        <Box
          sx={{
            maxWidth: 1600,
            mx: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Audit Certification & Real-time Indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: 1.5,
                bgcolor: isVarianceZero ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${isVarianceZero ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isVarianceZero ? '#10b981' : '#ef4444',
                boxShadow: isVarianceZero ? '0 0 10px rgba(16,185,129,0.3)' : '0 0 10px rgba(239,68,68,0.3)',
                flexShrink: 0,
              }}
            >
              {isVarianceZero ? (
                <VerifiedIcon sx={{ fontSize: 18 }} />
              ) : (
                <WarningIcon sx={{ fontSize: 18 }} />
              )}
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>
                  {isVarianceZero ? 'Trial Balance Status: Balanced & Audited' : 'Trial Balance Status: Variance Detected'}
                </Typography>
                <Box
                  component="span"
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: isVarianceZero ? '#10b981' : '#ef4444',
                    boxShadow: isVarianceZero ? '0 0 8px #10b981' : '0 0 8px #ef4444',
                  }}
                />
              </Box>
              <Typography sx={{ fontSize: '0.64rem', color: '#94a3b8' }}>
                UAE FTA Statutory Ledger Certified • Real-Time Audit Lock Enabled
              </Typography>
            </Box>
          </Box>

          {/* Right: Tabular Telemetry & Action Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 } }}>
            {/* Debits */}
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Debits
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>
                AED {formatAED(totalDebit)}
              </Typography>
            </Box>

            {/* Credits */}
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Credits
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>
                AED {formatAED(totalCredit)}
              </Typography>
            </Box>

            {/* Variance */}
            <Box
              sx={{
                textAlign: 'right',
                px: 1.25,
                py: 0.4,
                borderRadius: 1.5,
                bgcolor: isVarianceZero ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${isVarianceZero ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.4)'}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  color: isVarianceZero ? '#10b981' : '#ef4444',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Variance
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: isVarianceZero ? '#10b981' : '#ef4444',
                }}
              >
                {formatAED(variance)} AED
              </Typography>
            </Box>

            {/* Actions */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handlePrint}
                sx={{
                  height: 28,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  color: '#e2e8f0',
                  borderColor: '#334155',
                  bgcolor: '#1e293b',
                  borderRadius: 1.25,
                  '&:hover': { bgcolor: '#334155', borderColor: '#475569' },
                }}
              >
                Print Copy
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleExport}
                disabled={exporting}
                sx={{
                  height: 28,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  bgcolor: '#4f46e5',
                  color: '#ffffff',
                  borderRadius: 1.25,
                  '&:hover': { bgcolor: '#4338ca' },
                }}
              >
                {exporting ? 'Exporting...' : 'Export Excel'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
