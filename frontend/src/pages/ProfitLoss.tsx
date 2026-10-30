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
  LinearProgress,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  FileDownload as DownloadIcon,
  Print as PrintIcon,
  Search as SearchIcon,
  AccountTree as TreeIcon,
  ViewColumn as SplitViewIcon,
  Refresh as RefreshIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
  BarChart as BarChartIcon,
  NorthEast as TrendingUpIcon,
  SouthEast as TrendingDownIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { ledgerApi, ProfitLossData, ProfitLossGroupNode } from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';

function formatAED(amount: number): string {
  return (amount || 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ProfitLoss() {
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [fromDate, setFromDate] = useState<string>(getCurrentDate);
  const [toDate, setToDate] = useState<string>(getCurrentDate);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'vertical' | 'split'>('vertical');

  // Track expanded groups and sections
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<{ revenue: boolean; expenses: boolean }>({
    revenue: true,
    expenses: true,
  });

  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  const load = () => {
    if (!companyId || !financialYearId) return;
    setLoading(true);
    ledgerApi
      .profitLoss(companyId, financialYearId, fromDate || undefined, toDate || undefined)
      .then((res) => {
        setData(res.data.data);
      })
      .catch((err) => {
        console.error('Failed to load Profit & Loss statement:', err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (companyId && financialYearId) {
      load();
    }
  }, [companyId, financialYearId]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/profit-loss') {
        load();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/profit-loss') || window.location.pathname.includes('/report/profit-loss')) {
        load();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [companyId, financialYearId, fromDate, toDate]);

  const handlePreset = (type: 'thisMonth' | 'lastMonth' | 'quarter' | 'thisFY' | 'all') => {
    const now = new Date();
    if (type === 'thisMonth') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(last.toISOString().slice(0, 10));
    } else if (type === 'lastMonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(last.toISOString().slice(0, 10));
    } else if (type === 'quarter') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), currentQuarter * 3, 1);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
    } else if (type === 'thisFY') {
      const first = new Date(now.getFullYear(), 0, 1);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
    } else if (type === 'all') {
      setFromDate('');
      setToDate('');
    }
  };

  const handleExport = () => {
    if (!companyId || !financialYearId) return;
    setExporting(true);
    ledgerApi
      .exportProfitLoss(companyId, financialYearId, fromDate || undefined, toDate || undefined)
      .then((res) => {
        const blob = new Blob([res.data as unknown as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = toDate || new Date().toISOString().slice(0, 10);
        a.download = `profit-loss-${dateStr}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => console.error('Export error:', err))
      .finally(() => setExporting(false));
  };

  const handlePrint = () => {
    window.print();
  };

  // Normalized tree data
  const normalizedTree = useMemo(() => {
    if (!data) return { income: [] as ProfitLossGroupNode[], expenses: [] as ProfitLossGroupNode[] };

    if (data.tree && (data.tree.income || data.tree.expenses)) {
      return {
        income: data.tree.income || [],
        expenses: data.tree.expenses || [],
      };
    }

    // Fallback if legacy response
    const incMap = new Map<string, ProfitLossGroupNode>();
    const expMap = new Map<string, ProfitLossGroupNode>();

    (data.groups || []).forEach((row: any) => {
      const isInc = String(row.type).toLowerCase() === 'income';
      const map = isInc ? incMap : expMap;
      const groupName = row.groupName || (isInc ? 'Direct Income' : 'Operating Expenses');
      const category = (row.category as 'Direct' | 'Indirect') || 'Direct';

      let node = map.get(groupName);
      if (!node) {
        node = {
          groupId: groupName,
          groupName,
          category,
          type: isInc ? 'Income' : 'Expense',
          totalAmount: 0,
          totalDebit: 0,
          totalCredit: 0,
          accounts: [],
        };
        map.set(groupName, node);
      }
      node.totalAmount += row.amount || 0;
      node.accounts.push({
        id: row.name,
        code: row.code || '',
        name: row.name,
        debit: 0,
        credit: 0,
        amount: row.amount || 0,
      });
    });

    return {
      income: Array.from(incMap.values()),
      expenses: Array.from(expMap.values()),
    };
  }, [data]);

  // Real-time search filter
  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedTree;

    const filterNodes = (nodes: ProfitLossGroupNode[]) => {
      return nodes
        .map((group) => {
          const groupMatches =
            group.groupName.toLowerCase().includes(q) ||
            (group.groupCode && group.groupCode.toLowerCase().includes(q)) ||
            group.category.toLowerCase().includes(q);

          const matchingAccounts = group.accounts.filter(
            (acc) =>
              acc.name.toLowerCase().includes(q) ||
              (acc.code && acc.code.toLowerCase().includes(q))
          );

          if (groupMatches) {
            return group;
          }
          if (matchingAccounts.length > 0) {
            return {
              ...group,
              accounts: matchingAccounts,
            };
          }
          return null;
        })
        .filter(Boolean) as ProfitLossGroupNode[];
    };

    return {
      income: filterNodes(normalizedTree.income),
      expenses: filterNodes(normalizedTree.expenses),
    };
  }, [normalizedTree, search]);

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey],
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    normalizedTree.income.forEach((g) => {
      next[`inc-${g.groupId}`] = true;
    });
    normalizedTree.expenses.forEach((g) => {
      next[`exp-${g.groupId}`] = true;
    });
    setExpandedNodes(next);
    setExpandedSections({ revenue: true, expenses: true });
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  if (!companyId) {
    return (
      <Box p={2}>
        <Paper sx={{ p: 2.5, textAlign: 'center', bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2 }}>
          <Typography variant="body1" color="error" fontWeight={600} fontSize="0.85rem">
            Please select a company first to view the Profit &amp; Loss Statement.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (!financialYearId) {
    return (
      <Box p={2}>
        <Paper sx={{ p: 2.5, textAlign: 'center', bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 2 }}>
          <Typography variant="body1" color="#92400e" fontWeight={600} fontSize="0.85rem">
            Please select a financial year first to view the Profit &amp; Loss Statement.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const isNetProfit = (data?.netProfit ?? 0) >= 0;
  const netProfitValue = data?.netProfit ?? 0;
  const grossProfitValue = data?.grossProfit ?? ((data?.income ?? 0) - (data?.directExpenses ?? (data?.expenses ?? 0)));
  const totalRevenue = data?.income ?? 0;
  const totalExp = data?.expenses ?? 0;
  const netMarginPercent = totalRevenue > 0 ? ((netProfitValue / totalRevenue) * 100).toFixed(1) : '0.0';
  const grossMarginPercent = totalRevenue > 0 ? ((grossProfitValue / totalRevenue) * 100).toFixed(1) : '0.0';

  const totalIncomeAccounts = normalizedTree.income.reduce((sum, g) => sum + g.accounts.length, 0);
  const totalExpenseAccounts = normalizedTree.expenses.reduce((sum, g) => sum + g.accounts.length, 0);

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#f8fafc', p: { xs: 1, md: 1.5 }, fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top Navigation & Brand Header (Reduced 40%) ── */}
      <Paper
        elevation={0}
        sx={{
          p: 1.25,
          mb: 1.5,
          borderRadius: '10px',
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.25,
          }}
        >
          {/* Brand & Context */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #4338ca 0%, #4f46e5 50%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.2)',
              }}
            >
              <BarChartIcon sx={{ fontSize: 17 }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  Profit &amp; Loss Statement
                </Typography>
                <Chip
                  icon={
                    <Box
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        bgcolor: '#10b981',
                        ml: 0.5,
                      }}
                    />
                  }
                  label="Live Ledger"
                  size="small"
                  sx={{
                    bgcolor: '#ecfdf5',
                    color: '#065f46',
                    fontWeight: 700,
                    fontSize: '0.62rem',
                    border: '1px solid #a7f3d0',
                    height: 18,
                  }}
                />
              </Box>
              <Typography sx={{ color: '#64748b', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.2 }}>
                <span>Hierarchical Tree Structure</span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span>Group &amp; Sub-Ledger Analysis</span>
              </Typography>
            </Box>
          </Box>

          {/* Action Controls & Format Switchers */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* View Mode Toggle */}
            <ButtonGroup
              size="small"
              sx={{
                p: '2px',
                bgcolor: '#f1f5f9',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                '& .MuiButton-root': {
                  border: 'none',
                  textTransform: 'none',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  px: 1.25,
                  py: 0.25,
                  borderRadius: '6px !important',
                },
              }}
            >
              <Button
                startIcon={<TreeIcon sx={{ fontSize: 14 }} />}
                onClick={() => setViewMode('vertical')}
                sx={{
                  bgcolor: viewMode === 'vertical' ? '#ffffff !important' : 'transparent',
                  color: viewMode === 'vertical' ? '#4f46e5' : '#64748b',
                  boxShadow: viewMode === 'vertical' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Tree View
              </Button>
              <Button
                startIcon={<SplitViewIcon sx={{ fontSize: 14 }} />}
                onClick={() => setViewMode('split')}
                sx={{
                  bgcolor: viewMode === 'split' ? '#ffffff !important' : 'transparent',
                  color: viewMode === 'split' ? '#4f46e5' : '#64748b',
                  boxShadow: viewMode === 'split' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                T-Format
              </Button>
            </ButtonGroup>

            {/* Expansion Controls */}
            <Button
              size="small"
              variant="outlined"
              startIcon={<ExpandAllIcon sx={{ fontSize: 13, color: '#64748b' }} />}
              onClick={handleExpandAll}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.68rem',
                color: '#334155',
                borderColor: '#cbd5e1',
                bgcolor: '#ffffff',
                borderRadius: '6px',
                py: 0.35,
                px: 1,
                '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
              }}
            >
              Expand All
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CollapseAllIcon sx={{ fontSize: 13, color: '#64748b' }} />}
              onClick={handleCollapseAll}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.68rem',
                color: '#334155',
                borderColor: '#cbd5e1',
                bgcolor: '#ffffff',
                borderRadius: '6px',
                py: 0.35,
                px: 1,
                '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
              }}
            >
              Collapse All
            </Button>

            {/* Export Actions */}
            <Button
              size="small"
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={11} color="inherit" /> : <DownloadIcon sx={{ fontSize: 13 }} />}
              onClick={handleExport}
              disabled={exporting || !data}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.68rem',
                bgcolor: '#ecfdf5',
                color: '#047857',
                borderColor: '#a7f3d0',
                borderRadius: '6px',
                py: 0.35,
                px: 1.25,
                '&:hover': { bgcolor: '#d1fae5', borderColor: '#6ee7b7' },
              }}
            >
              Excel
            </Button>
            <Tooltip title="Print / PDF">
              <IconButton
                size="small"
                onClick={handlePrint}
                sx={{
                  p: 0.5,
                  bgcolor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#475569',
                  '&:hover': { bgcolor: '#f8fafc' },
                }}
              >
                <PrintIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* ── Filter Toolbar (Reduced 40%) ── */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 1.5,
          borderRadius: '10px',
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <Grid container spacing={1.5} alignItems="flex-end">
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem', mb: 0.4 }}>
              Reporting Start Date
            </Typography>
            <DateInput
              label=""
              value={fromDate}
              onChange={setFromDate}
              size="small"
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  fontSize: '0.75rem',
                  height: 30,
                },
                '& .MuiInputBase-input': {
                  py: '3px !important',
                  fontSize: '0.75rem',
                },
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem', mb: 0.4 }}>
              Reporting End Date
            </Typography>
            <DateInput
              label=""
              value={toDate}
              onChange={setToDate}
              size="small"
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  fontSize: '0.75rem',
                  height: 30,
                },
                '& .MuiInputBase-input': {
                  py: '3px !important',
                  fontSize: '0.75rem',
                },
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem', mb: 0.4 }}>
              Quick Filter
            </Typography>
            <TextField
              size="small"
              placeholder="Search group, account or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 14 }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  fontSize: '0.75rem',
                  height: 30,
                },
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Button
              variant="contained"
              onClick={load}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={12} color="inherit" /> : <RefreshIcon sx={{ fontSize: 14 }} />}
              fullWidth
              sx={{
                bgcolor: '#4f46e5',
                '&:hover': { bgcolor: '#4338ca' },
                borderRadius: '6px',
                height: 30,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.72rem',
                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.2)',
              }}
            >
              {loading ? 'Running...' : 'Run Report'}
            </Button>
          </Grid>

          {/* Quick Period Presets */}
          <Grid item xs={12}>
            <Box sx={{ pt: 1, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em', fontSize: '0.6rem', mr: 0.5 }}>
                Presets:
              </Typography>
              <Chip
                label="This Month"
                size="small"
                onClick={() => {
                  handlePreset('thisMonth');
                  setTimeout(load, 50);
                }}
                clickable
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, height: 20, bgcolor: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff' }}
              />
              <Chip
                label="Last Month"
                size="small"
                onClick={() => {
                  handlePreset('lastMonth');
                  setTimeout(load, 50);
                }}
                clickable
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 500, height: 20, bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
              />
              <Chip
                label="Quarter to Date"
                size="small"
                onClick={() => {
                  handlePreset('quarter');
                  setTimeout(load, 50);
                }}
                clickable
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 500, height: 20, bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
              />
              <Chip
                label="FY (To Date)"
                size="small"
                onClick={() => {
                  handlePreset('thisFY');
                  setTimeout(load, 50);
                }}
                clickable
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 500, height: 20, bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
              />
              <Chip
                label="All Records"
                size="small"
                onClick={() => {
                  handlePreset('all');
                  setTimeout(load, 50);
                }}
                clickable
                variant="outlined"
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 500, height: 20, color: '#64748b', borderColor: '#cbd5e1' }}
              />
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* ── KPI Summary Cards (Reduced 40%) ── */}
      {data && (
        <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
          {/* Card 1: Total Revenue */}
          <Grid item xs={12} sm={6} lg={3}>
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: '10px',
                bgcolor: '#ffffff',
                border: '1px solid #e2e8f0',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #10b981 0%, #2dd4bf 100%)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                  Total Revenue
                </Typography>
                <Chip
                  icon={<TrendingUpIcon sx={{ fontSize: '11px !important', color: '#047857' }} />}
                  label="100%"
                  size="small"
                  sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, bgcolor: '#ecfdf5', color: '#047857' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                  {formatAED(totalRevenue)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#047857', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.62rem' }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#10b981' }} />
                  {totalIncomeAccounts} Active Accounts
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem' }}>
                  Gross Receipts
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Card 2: Total Expenses */}
          <Grid item xs={12} sm={6} lg={3}>
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: '10px',
                bgcolor: '#ffffff',
                border: '1px solid #e2e8f0',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #f43f5e 0%, #ec4899 100%)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                  Total Expenses
                </Typography>
                <Chip
                  icon={<TrendingDownIcon sx={{ fontSize: '11px !important', color: '#be123c' }} />}
                  label={`${totalRevenue > 0 ? ((totalExp / totalRevenue) * 100).toFixed(1) : '0.0'}%`}
                  size="small"
                  sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, bgcolor: '#fff1f2', color: '#be123c' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                  {formatAED(totalExp)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.62rem' }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#f43f5e' }} />
                  {totalExpenseAccounts} Active Accounts
                </Typography>
                <Typography sx={{ color: '#059669', fontWeight: 600, fontSize: '0.62rem' }}>
                  Operating Costs
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Card 3: Gross Profit */}
          <Grid item xs={12} sm={6} lg={3}>
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: '10px',
                bgcolor: '#ffffff',
                border: '1px solid #e2e8f0',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #6366f1 0%, #3b82f6 100%)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                  Gross Profit
                </Typography>
                <Chip
                  label={`${grossMarginPercent}%`}
                  size="small"
                  sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, bgcolor: '#eef2ff', color: '#4338ca' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.05rem', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                  {formatAED(grossProfitValue)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#64748b', fontSize: '0.62rem' }}>
                  Direct P&amp;L
                </Typography>
                <Typography sx={{ color: '#4f46e5', fontWeight: 600, fontSize: '0.62rem' }}>
                  Trading Profit
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Card 4: Net Profit */}
          <Grid item xs={12} sm={6} lg={3}>
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: '10px',
                bgcolor: isNetProfit ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${isNetProfit ? '#a7f3d0' : '#fecaca'}`,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  bgcolor: isNetProfit ? '#059669' : '#dc2626',
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: isNetProfit ? '#065f46' : '#991b1b',
                    letterSpacing: '0.04em',
                    fontSize: '0.62rem',
                  }}
                >
                  {isNetProfit ? 'Net Profit' : 'Net Loss'}
                </Typography>
                <Chip
                  icon={
                    isNetProfit ? (
                      <CheckCircleIcon sx={{ fontSize: '11px !important', color: '#047857' }} />
                    ) : (
                      <WarningIcon sx={{ fontSize: '11px !important', color: '#b91c1c' }} />
                    )
                  }
                  label={isNetProfit ? 'Surplus' : 'Deficit'}
                  size="small"
                  sx={{
                    height: 17,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    bgcolor: isNetProfit ? '#d1fae5' : '#fee2e2',
                    color: isNetProfit ? '#065f46' : '#991b1b',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: isNetProfit ? '#059669' : '#dc2626', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 900,
                    color: isNetProfit ? '#065f46' : '#991b1b',
                    fontSize: '1.05rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1.2,
                  }}
                >
                  {formatAED(Math.abs(netProfitValue))}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: `1px solid ${isNetProfit ? '#d1fae5' : '#fee2e2'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: isNetProfit ? '#047857' : '#b91c1c', fontWeight: 600, fontSize: '0.62rem' }}>
                  Net Margin: {netMarginPercent}%
                </Typography>
                <Typography sx={{ color: isNetProfit ? '#059669' : '#dc2626', fontWeight: 600, fontSize: '0.62rem' }}>
                  Audit Verified
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* ── Hierarchical Tree View (Reduced 40%) ── */}
      {data && viewMode === 'vertical' && (
        <Paper
          elevation={0}
          sx={{
            borderRadius: '10px',
            bgcolor: '#ffffff',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            mb: 1.5,
          }}
        >
          {/* Table Header & Column Labels */}
          <Box
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              alignItems: 'center',
            }}
          >
            <Box sx={{ gridColumn: 'span 6' }}>
              <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                Account Structure &amp; Ledger Classification
              </Typography>
            </Box>
            <Box sx={{ gridColumn: 'span 2', textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                Ledger Code
              </Typography>
            </Box>
            <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
              <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                Contribution %
              </Typography>
            </Box>
            <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
              <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                Period Balance (AED)
              </Typography>
            </Box>
          </Box>

          {/* SECTION 1: REVENUE & INCOME */}
          <StitchSectionBlock
            sectionTitle="REVENUE & INCOME"
            sectionColor="#059669"
            sectionBg="rgba(236, 253, 245, 0.4)"
            sectionHoverBg="rgba(236, 253, 245, 0.7)"
            borderAccentColor="#059669"
            totalAmount={totalRevenue}
            groups={filteredTree.income}
            expanded={expandedSections.revenue}
            onToggle={() => setExpandedSections((prev) => ({ ...prev, revenue: !prev.revenue }))}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            nodePrefix="inc"
            percentageLabel="100.0% of Gross Revenue"
            isIncome={true}
            parentTotal={totalRevenue}
            emptyMessage="No income or sales transactions found for this period."
          />

          {/* SECTION 2: EXPENSES & PURCHASES */}
          <StitchSectionBlock
            sectionTitle="EXPENSES & PURCHASES"
            sectionColor="#e11d48"
            sectionBg="rgba(255, 241, 242, 0.4)"
            sectionHoverBg="rgba(255, 241, 242, 0.7)"
            borderAccentColor="#f43f5e"
            totalAmount={totalExp}
            groups={filteredTree.expenses}
            expanded={expandedSections.expenses}
            onToggle={() => setExpandedSections((prev) => ({ ...prev, expenses: !prev.expenses }))}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            nodePrefix="exp"
            percentageLabel={`${totalRevenue > 0 ? ((totalExp / totalRevenue) * 100).toFixed(1) : '0.0'}% of Revenue`}
            isIncome={false}
            parentTotal={totalExp}
            emptyMessage="No expense or purchase transactions found for this period."
          />

          {/* GRAND SUMMARY FOOTER: NET PROFIT (Reduced 40%) */}
          <Box
            sx={{
              p: 1.75,
              background: 'linear-gradient(90deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
              color: '#ffffff',
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  bgcolor: isNetProfit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  border: `1px solid ${isNetProfit ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isNetProfit ? '#34d399' : '#f87171',
                }}
              >
                <WalletIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', letterSpacing: '-0.01em' }}>
                    {isNetProfit ? 'Net Profit (EBITDA Equivalent)' : 'Net Loss (Operating Deficit)'}
                  </Typography>
                  <Chip
                    label={isNetProfit ? `+${netMarginPercent}% Margin` : `${netMarginPercent}% Loss`}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      bgcolor: isNetProfit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: isNetProfit ? '#6ee7b7' : '#fca5a5',
                      border: `1px solid ${isNetProfit ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    }}
                  />
                </Box>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem', mt: 0.1 }}>
                  Net Margin: {netMarginPercent}% • Calculated directly from active ledger postings
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                <Typography sx={{ textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em', fontWeight: 700, fontSize: '0.6rem' }}>
                  Final Net Surplus
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    color: isNetProfit ? '#ffffff' : '#fca5a5',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '1.25rem',
                    lineHeight: 1.1,
                  }}
                >
                  AED {formatAED(Math.abs(netProfitValue))}
                </Typography>
              </Box>

              <Box sx={{ width: '1px', height: 26, bgcolor: '#334155', display: { xs: 'none', md: 'block' } }} />

              <Button
                variant="outlined"
                size="small"
                onClick={handlePrint}
                sx={{
                  color: '#e2e8f0',
                  borderColor: 'rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  px: 1.25,
                  py: 0.35,
                  bgcolor: 'rgba(255,255,255,0.06)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)' },
                }}
              >
                Audit Trail
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── T-Format Split View (Reduced 40%) ── */}
      {data && viewMode === 'split' && (
        <Grid container spacing={1.5}>
          {/* Left Column: Expenses & Purchases */}
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ borderRadius: '10px', bgcolor: '#ffffff', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <StitchSectionBlock
                sectionTitle="EXPENSES & PURCHASES (DEBIT)"
                sectionColor="#e11d48"
                sectionBg="rgba(255, 241, 242, 0.5)"
                sectionHoverBg="rgba(255, 241, 242, 0.8)"
                borderAccentColor="#f43f5e"
                totalAmount={totalExp}
                groups={filteredTree.expenses}
                expanded={expandedSections.expenses}
                onToggle={() => setExpandedSections((prev) => ({ ...prev, expenses: !prev.expenses }))}
                expandedNodes={expandedNodes}
                onToggleNode={toggleNode}
                nodePrefix="exp"
                percentageLabel="Debit Total"
                isIncome={false}
                parentTotal={totalExp}
                emptyMessage="No expenses recorded."
              />
              {isNetProfit && (
                <Box sx={{ p: 1.25, bgcolor: '#f8fafc', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 700, color: '#047857', fontSize: '0.72rem' }}>
                    Net Profit (Transferred to Balance Sheet)
                  </Typography>
                  <Typography sx={{ fontWeight: 800, color: '#047857', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                    AED {formatAED(netProfitValue)}
                  </Typography>
                </Box>
              )}
              <Box sx={{ p: 1.25, bgcolor: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem' }}>
                  Balanced Total
                </Typography>
                <Typography sx={{ fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem' }}>
                  AED {formatAED(Math.max(totalRevenue, totalExp))}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Right Column: Revenue & Income */}
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ borderRadius: '10px', bgcolor: '#ffffff', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <StitchSectionBlock
                sectionTitle="REVENUE & INCOME (CREDIT)"
                sectionColor="#059669"
                sectionBg="rgba(236, 253, 245, 0.5)"
                sectionHoverBg="rgba(236, 253, 245, 0.8)"
                borderAccentColor="#10b981"
                totalAmount={totalRevenue}
                groups={filteredTree.income}
                expanded={expandedSections.revenue}
                onToggle={() => setExpandedSections((prev) => ({ ...prev, revenue: !prev.revenue }))}
                expandedNodes={expandedNodes}
                onToggleNode={toggleNode}
                nodePrefix="inc"
                percentageLabel="Credit Total"
                isIncome={true}
                parentTotal={totalRevenue}
                emptyMessage="No revenue recorded."
              />
              {!isNetProfit && totalExp > 0 && (
                <Box sx={{ p: 1.25, bgcolor: '#f8fafc', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 700, color: '#b91c1c', fontSize: '0.72rem' }}>
                    Net Loss (Transferred to Balance Sheet)
                  </Typography>
                  <Typography sx={{ fontWeight: 800, color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                    AED {formatAED(Math.abs(netProfitValue))}
                  </Typography>
                </Box>
              )}
              <Box sx={{ p: 1.25, bgcolor: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem' }}>
                  Balanced Total
                </Typography>
                <Typography sx={{ fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem' }}>
                  AED {formatAED(Math.max(totalRevenue, totalExp))}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Stitch Section Block (Reduced 40%)
// ─────────────────────────────────────────────────────────────
interface StitchSectionBlockProps {
  sectionTitle: string;
  sectionColor: string;
  sectionBg: string;
  sectionHoverBg: string;
  borderAccentColor: string;
  totalAmount: number;
  groups: ProfitLossGroupNode[];
  expanded: boolean;
  onToggle: () => void;
  expandedNodes: Record<string, boolean>;
  onToggleNode: (key: string) => void;
  nodePrefix: string;
  percentageLabel: string;
  isIncome: boolean;
  parentTotal: number;
  emptyMessage: string;
}

function StitchSectionBlock({
  sectionTitle,
  sectionColor,
  sectionBg,
  sectionHoverBg,
  borderAccentColor,
  totalAmount,
  groups,
  expanded,
  onToggle,
  expandedNodes,
  onToggleNode,
  nodePrefix,
  percentageLabel,
  isIncome,
  parentTotal,
  emptyMessage,
}: StitchSectionBlockProps) {
  const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);

  return (
    <Box sx={{ borderBottom: '1px solid #e2e8f0' }}>
      {/* ── Section Banner Row (Reduced 40%) ── */}
      <Box
        onClick={onToggle}
        sx={{
          px: 2,
          py: 1.25,
          bgcolor: sectionBg,
          borderLeft: `3px solid ${borderAccentColor}`,
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'background 0.2s',
          '&:hover': {
            bgcolor: sectionHoverBg,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            sx={{
              p: 0.25,
              color: sectionColor,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: borderAccentColor }} />
            <Typography sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
              {sectionTitle}
            </Typography>
            <Chip
              label={`${groups.length} Groups • ${totalAccounts} Accounts`}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.85)',
                color: sectionColor,
                fontWeight: 700,
                fontSize: '0.62rem',
                border: '1px solid rgba(0,0,0,0.06)',
                height: 18,
              }}
            />
          </Box>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontWeight: 800, color: '#0f172a', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
            AED {formatAED(totalAmount)}
          </Typography>
          <Typography sx={{ color: '#64748b', display: 'block', fontWeight: 500, fontSize: '0.62rem' }}>
            {percentageLabel}
          </Typography>
        </Box>
      </Box>

      {/* ── Section Groups & Sub-Ledger Tree ── */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        {groups.length === 0 ? (
          <Box sx={{ p: 2.5, textAlign: 'center' }}>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              {emptyMessage}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ divideY: '1px solid #f1f5f9' }}>
            {groups.map((group) => {
              const nodeKey = `${nodePrefix}-${group.groupId}`;
              const isGroupExpanded = !!expandedNodes[nodeKey];

              return (
                <StitchGroupNode
                  key={nodeKey}
                  group={group}
                  isExpanded={isGroupExpanded}
                  onToggle={() => onToggleNode(nodeKey)}
                  isIncome={isIncome}
                  sectionTotal={parentTotal}
                />
              );
            })}
          </Box>
        )}
      </Collapse>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Stitch Group Folder Node (Reduced 40%)
// ─────────────────────────────────────────────────────────────
interface StitchGroupNodeProps {
  group: ProfitLossGroupNode;
  isExpanded: boolean;
  onToggle: () => void;
  isIncome: boolean;
  sectionTotal: number;
}

function StitchGroupNode({ group, isExpanded, onToggle, isIncome, sectionTotal }: StitchGroupNodeProps) {
  const isDirect = group.category === 'Direct';
  const groupContribution =
    sectionTotal > 0 ? ((group.totalAmount / sectionTotal) * 100).toFixed(1) : '0.0';

  return (
    <Box sx={{ borderBottom: '1px solid #f1f5f9' }}>
      {/* ── Group Row (Folder Level) ── */}
      <Box
        onClick={onToggle}
        sx={{
          px: 2,
          py: 1,
          pl: 3.5,
          bgcolor: isExpanded ? '#fafafa' : '#ffffff',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.15s ease',
          '&:hover': {
            bgcolor: '#f8fafc',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Expand Arrow */}
          <IconButton
            size="small"
            sx={{
              p: 0.25,
              color: isExpanded ? '#4f46e5' : '#94a3b8',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 14 }} />
          </IconButton>

          {/* Folder Icon */}
          <Box
            sx={{
              p: '3px',
              borderRadius: '6px',
              bgcolor: isIncome ? '#eef2ff' : '#fffbeb',
              color: isIncome ? '#4f46e5' : '#d97706',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {isExpanded ? <FolderOpenIcon sx={{ fontSize: 14 }} /> : <FolderIcon sx={{ fontSize: 14 }} />}
          </Box>

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.78rem' }}>
                {group.groupName}
              </Typography>
              {group.groupCode && (
                <Typography sx={{ color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem' }}>
                  [{group.groupCode}]
                </Typography>
              )}
              <Chip
                label={group.category}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  bgcolor: isDirect ? '#eff6ff' : '#f5f3ff',
                  color: isDirect ? '#1d4ed8' : '#6d28d9',
                  border: `1px solid ${isDirect ? '#bfdbfe' : '#ddd6fe'}`,
                }}
              />
            </Box>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem' }}>
              {group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'} linked
            </Typography>
          </Box>
        </Box>

        {/* Group Total Numbers */}
        <Box sx={{ textAlign: 'right' }}>
          <Typography
            sx={{
              fontWeight: 800,
              color: '#0f172a',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.78rem',
            }}
          >
            AED {formatAED(group.totalAmount)}
          </Typography>
          <Typography sx={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem' }}>
            {groupContribution}% of section • Group Total
          </Typography>
        </Box>
      </Box>

      {/* ── Leaf Ledger Account Details (Reduced 40%) ── */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ bgcolor: 'rgba(248, 250, 252, 0.6)', borderTop: '1px solid #f1f5f9' }}>
          {group.accounts.map((acc, index) => {
            const isLast = index === group.accounts.length - 1;
            const accountPercent =
              group.totalAmount !== 0
                ? Math.min(100, Math.max(0, (acc.amount / group.totalAmount) * 100))
                : 0;

            return (
              <Box
                key={acc.id || index}
                sx={{
                  px: 2,
                  py: 0.75,
                  pl: 6,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  alignItems: 'center',
                  borderBottom: isLast ? 'none' : '1px solid rgba(241, 245, 249, 0.8)',
                  transition: 'background 0.15s',
                  '&:hover': {
                    bgcolor: '#ffffff',
                  },
                }}
              >
                {/* Account Name with Dot / Branch indicator */}
                <Box sx={{ gridColumn: 'span 6', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      bgcolor: isIncome ? '#10b981' : '#f43f5e',
                    }}
                  />
                  <Typography sx={{ fontWeight: 600, color: '#334155', fontSize: '0.74rem' }}>
                    {acc.name}
                  </Typography>
                </Box>

                {/* Account Code */}
                <Box sx={{ gridColumn: 'span 2', textAlign: 'center' }}>
                  {acc.code ? (
                    <Typography
                      sx={{
                        px: 0.75,
                        py: 0.15,
                        borderRadius: '4px',
                        bgcolor: '#f1f5f9',
                        color: '#475569',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        display: 'inline-block',
                      }}
                    >
                      {acc.code}
                    </Typography>
                  ) : (
                    <Typography sx={{ color: '#cbd5e1', fontSize: '0.65rem' }}>
                      -
                    </Typography>
                  )}
                </Box>

                {/* Contribution % with Micro Visual Progress Bar */}
                <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 600, color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem' }}>
                    {accountPercent.toFixed(1)}%
                  </Typography>
                  <Box sx={{ width: 45, ml: 'auto', mt: 0.25 }}>
                    <LinearProgress
                      variant="determinate"
                      value={accountPercent}
                      sx={{
                        height: 3.5,
                        borderRadius: 2,
                        bgcolor: '#e2e8f0',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          bgcolor: isIncome ? '#10b981' : '#f43f5e',
                        },
                      }}
                    />
                  </Box>
                </Box>

                {/* Period Balance (AED) */}
                <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      color: isIncome ? '#047857' : '#be123c',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.74rem',
                    }}
                  >
                    AED {formatAED(acc.amount)}
                  </Typography>
                  {(acc.debit > 0 || acc.credit > 0) && (
                    <Typography sx={{ color: '#94a3b8', fontSize: '0.58rem', display: 'block' }}>
                      {acc.debit > 0 ? `Dr ${formatAED(acc.debit)}` : `Cr ${formatAED(acc.credit)}`}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
