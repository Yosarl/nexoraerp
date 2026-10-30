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
  CircularProgress,
  ButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  Print as PrintIcon,
  Search as SearchIcon,
  AccountTree as TreeIcon,
  ViewList as ViewListIcon,
  Refresh as RefreshIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
  NorthEast as TrendingUpIcon,
  SouthEast as TrendingDownIcon,
  AccountBalanceWallet as WalletIcon,
  AccountBalance as BankIcon,
  FileDownload as DownloadIcon,
  Layers as LayersIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import {
  ledgerApi,
  BalanceSheetData,
  BalanceSheetGroupNode,
  BalanceSheetParentNode,
} from '../services/api';
import DateInput, { getCurrentDate } from '../components/DateInput';

function formatAED(amount: number): string {
  return (amount || 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BalanceSheet() {
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [asAtDate, setAsAtDate] = useState<string>(getCurrentDate);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'collapsed'>('tree');

  // Track expanded groups and sections
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<{
    assets: boolean;
    liabilities: boolean;
    equity: boolean;
  }>({
    assets: true,
    liabilities: true,
    equity: true,
  });

  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  const load = () => {
    if (!companyId || !financialYearId) return;
    setLoading(true);
    ledgerApi
      .balanceSheet(companyId, financialYearId, asAtDate || undefined)
      .then((res) => {
        setData(res.data.data);
      })
      .catch((err) => {
        console.error('Failed to load Balance Sheet:', err);
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
      if (p === '/report/balance-sheet') {
        load();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/balance-sheet') || window.location.pathname.includes('/report/balance-sheet')) {
        load();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [companyId, financialYearId, asAtDate]);

  const handlePreset = (type: 'today' | 'monthEnd' | 'quarterEnd' | 'thisFY' | 'all') => {
    const now = new Date();
    if (type === 'today') {
      setAsAtDate(now.toISOString().slice(0, 10));
    } else if (type === 'monthEnd') {
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setAsAtDate(last.toISOString().slice(0, 10));
    } else if (type === 'quarterEnd') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const last = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      setAsAtDate(last.toISOString().slice(0, 10));
    } else if (type === 'thisFY') {
      setAsAtDate(now.toISOString().slice(0, 10));
    } else if (type === 'all') {
      setAsAtDate('');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!data) return;
    const rows = [
      ['Parent Name', 'Account Name', 'Group', 'Type', 'Amount (AED)'],
      ...(data.groups || []).map((g) => [
        `"${g.parentName || g.groupName || ''}"`,
        `"${g.name}"`,
        `"${g.groupName || ''}"`,
        `"${g.type}"`,
        (g.amount || 0).toFixed(2),
      ]),
      ['', '', '', 'Total Assets', (data.assets || 0).toFixed(2)],
      ['', '', '', 'Total Liabilities', (data.liabilities || 0).toFixed(2)],
      ['', '', '', 'Total Equity', (data.equity || 0).toFixed(2)],
      ['', '', '', 'Total Liabilities & Equity', ((data.liabilities || 0) + (data.equity || 0)).toFixed(2)],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `balance-sheet-${asAtDate || 'current'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Normalized tree data with fallbacks for 3-level tree: Parent -> Group -> Ledger
  const normalizedTree = useMemo(() => {
    if (!data) {
      return {
        assets: [] as BalanceSheetParentNode[],
        liabilities: [] as BalanceSheetParentNode[],
        equity: [] as BalanceSheetParentNode[],
      };
    }

    const normalizeSection = (
      nodes: any[],
      secType: 'Asset' | 'Liability' | 'Equity'
    ): BalanceSheetParentNode[] => {
      if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return [];

      const hasParentStructure = nodes.some((n) => n && Array.isArray(n.groups));

      if (hasParentStructure) {
        return nodes.map((p) => {
          const parentName = p?.parentName || (secType === 'Asset' ? 'Current Asset' : secType === 'Liability' ? 'Current Liability' : 'Capital');
          return {
            parentId: p?.parentId || parentName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            parentName,
            parentCode: p?.parentCode,
            type: p?.type || secType,
            totalAmount: Number(p?.totalAmount) || 0,
            totalDebit: Number(p?.totalDebit) || 0,
            totalCredit: Number(p?.totalCredit) || 0,
            groups: Array.isArray(p?.groups)
              ? p.groups.map((g: any) => ({
                  groupId: g?.groupId || g?._id?.toString() || g?.groupName || 'grp',
                  groupName: g?.groupName || 'General',
                  groupCode: g?.groupCode,
                  parentName: g?.parentName || parentName,
                  type: g?.type || secType,
                  totalAmount: Number(g?.totalAmount) || 0,
                  totalDebit: Number(g?.totalDebit) || 0,
                  totalCredit: Number(g?.totalCredit) || 0,
                  accounts: Array.isArray(g?.accounts) ? g.accounts : [],
                }))
              : [],
          };
        });
      }

      // If BalanceSheetGroupNode (has `accounts`), group by parentName
      const parentMap = new Map<string, BalanceSheetParentNode>();
      for (const grp of nodes) {
        if (!grp) continue;
        const pName = grp.parentName || (secType === 'Asset' ? 'Current Asset' : secType === 'Liability' ? 'Current Liability' : 'Capital');
        let pNode = parentMap.get(pName);
        if (!pNode) {
          pNode = {
            parentId: pName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            parentName: pName,
            parentCode: grp.parentCode,
            type: secType,
            totalAmount: 0,
            totalDebit: 0,
            totalCredit: 0,
            groups: [],
          };
          parentMap.set(pName, pNode);
        }
        pNode.totalAmount += Number(grp.totalAmount) || 0;
        pNode.totalDebit += Number(grp.totalDebit) || 0;
        pNode.totalCredit += Number(grp.totalCredit) || 0;
        pNode.groups.push({
          groupId: grp.groupId || grp._id?.toString() || grp.groupName || 'grp',
          groupName: grp.groupName || 'General',
          groupCode: grp.groupCode,
          parentName: pName,
          type: grp.type || secType,
          totalAmount: Number(grp.totalAmount) || 0,
          totalDebit: Number(grp.totalDebit) || 0,
          totalCredit: Number(grp.totalCredit) || 0,
          accounts: Array.isArray(grp.accounts) ? grp.accounts : [],
        });
      }
      return Array.from(parentMap.values());
    };

    if (data.tree && (data.tree.assets || data.tree.liabilities || data.tree.equity)) {
      return {
        assets: normalizeSection(data.tree.assets || [], 'Asset'),
        liabilities: normalizeSection(data.tree.liabilities || [], 'Liability'),
        equity: normalizeSection(data.tree.equity || [], 'Equity'),
      };
    }

    // Fallback if legacy response format
    const parentMapBySec: Record<'Asset' | 'Liability' | 'Equity', Map<string, BalanceSheetParentNode>> = {
      Asset: new Map<string, BalanceSheetParentNode>(),
      Liability: new Map<string, BalanceSheetParentNode>(),
      Equity: new Map<string, BalanceSheetParentNode>(),
    };

    (data.groups || []).forEach((row: any) => {
      const type = (row?.type || 'Asset').toLowerCase();
      let secType: 'Asset' | 'Liability' | 'Equity' = 'Asset';
      if (type.includes('liab')) {
        secType = 'Liability';
      } else if (type.includes('equity')) {
        secType = 'Equity';
      }

      const parentName = row?.parentName || (secType === 'Asset' ? 'Current Asset' : secType === 'Liability' ? 'Current Liability' : 'Capital');
      const groupName = row?.groupName || parentName;
      const pMap = parentMapBySec[secType];

      let pNode = pMap.get(parentName);
      if (!pNode) {
        pNode = {
          parentId: parentName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          parentName,
          type: secType,
          totalAmount: 0,
          totalDebit: 0,
          totalCredit: 0,
          groups: [],
        };
        pMap.set(parentName, pNode);
      }
      pNode.totalAmount += Number(row?.amount) || 0;

      let gNode = pNode.groups.find((g) => g.groupName === groupName);
      if (!gNode) {
        gNode = {
          groupId: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          groupName,
          groupCode: row?.groupCode,
          parentName,
          type: secType,
          totalAmount: 0,
          totalDebit: 0,
          totalCredit: 0,
          accounts: [],
        };
        pNode.groups.push(gNode);
      }
      gNode.totalAmount += Number(row?.amount) || 0;
      gNode.accounts.push({
        id: row?.id || row?.name || 'acc',
        code: row?.code || '',
        name: row?.name || 'Account',
        debit: 0,
        credit: 0,
        amount: Number(row?.amount) || 0,
        groupName,
        parentName,
      });
    });

    return {
      assets: Array.from(parentMapBySec.Asset.values()),
      liabilities: Array.from(parentMapBySec.Liability.values()),
      equity: Array.from(parentMapBySec.Equity.values()),
    };
  }, [data]);

  // Real-time search filter for 3-level Tree (Parent -> Group -> Ledger)
  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedTree;

    const filterParents = (parents: BalanceSheetParentNode[]) => {
      return (parents || [])
        .map((parent) => {
          const pName = (parent?.parentName || '').toLowerCase();
          const pCode = (parent?.parentCode || '').toLowerCase();
          const pType = (parent?.type || '').toLowerCase();
          const parentMatches = pName.includes(q) || pCode.includes(q) || pType.includes(q);

          if (parentMatches) {
            return parent;
          }

          const matchingGroups = (parent?.groups || [])
            .map((group) => {
              const gName = (group?.groupName || '').toLowerCase();
              const gCode = (group?.groupCode || '').toLowerCase();
              const groupMatches = gName.includes(q) || gCode.includes(q);

              if (groupMatches) {
                return group;
              }

              const matchingAccounts = (group?.accounts || []).filter((acc) => {
                const aName = (acc?.name || '').toLowerCase();
                const aCode = (acc?.code || '').toLowerCase();
                const aParent = (acc?.parentName || '').toLowerCase();
                return aName.includes(q) || aCode.includes(q) || aParent.includes(q);
              });

              if (matchingAccounts.length > 0) {
                return {
                  ...group,
                  accounts: matchingAccounts,
                };
              }
              return null;
            })
            .filter(Boolean) as BalanceSheetGroupNode[];

          if (matchingGroups.length > 0) {
            return {
              ...parent,
              groups: matchingGroups,
            };
          }
          return null;
        })
        .filter(Boolean) as BalanceSheetParentNode[];
    };

    return {
      assets: filterParents(normalizedTree?.assets || []),
      liabilities: filterParents(normalizedTree?.liabilities || []),
      equity: filterParents(normalizedTree?.equity || []),
    };
  }, [normalizedTree, search]);

  // Filtered flat ledgers for Collapsed / Flat View
  const filteredFlatLedgers = useMemo(() => {
    if (!data?.groups) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter(
      (g) =>
        (g?.name || '').toLowerCase().includes(q) ||
        (g?.parentName || '').toLowerCase().includes(q) ||
        (g?.groupName || '').toLowerCase().includes(q) ||
        (g?.type || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey],
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    const expandSection = (parents: BalanceSheetParentNode[], prefix: string) => {
      (parents || []).forEach((p) => {
        if (!p) return;
        next[`p-${prefix}-${p.parentId}`] = true;
        (p.groups || []).forEach((g) => {
          if (!g) return;
          next[`g-${prefix}-${g.groupId}`] = true;
        });
      });
    };
    expandSection(normalizedTree?.assets || [], 'ast');
    expandSection(normalizedTree?.liabilities || [], 'lib');
    expandSection(normalizedTree?.equity || [], 'eqt');
    setExpandedNodes(next);
    setExpandedSections({ assets: true, liabilities: true, equity: true });
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  if (!companyId) {
    return (
      <Box p={2}>
        <Paper sx={{ p: 2.5, textAlign: 'center', bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2 }}>
          <Typography variant="body1" color="error" fontWeight={600} fontSize="0.85rem">
            Please select a company first to view the Balance Sheet.
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
            Please select a financial year first to view the Balance Sheet.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const totalAssets = data?.assets ?? 0;
  const totalLiabilities = data?.liabilities ?? 0;
  const totalEquity = data?.equity ?? 0;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const discrepancy = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = data?.balanced ?? (discrepancy < 0.02);
  const netProfit = data?.netProfit ?? 0;

  const totalAssetAccounts = (normalizedTree?.assets || []).reduce(
    (sum, p) => sum + (p?.groups || []).reduce((gSum, g) => gSum + (g?.accounts || []).length, 0),
    0
  );
  const totalLiabilityAccounts = (normalizedTree?.liabilities || []).reduce(
    (sum, p) => sum + (p?.groups || []).reduce((gSum, g) => gSum + (g?.accounts || []).length, 0),
    0
  );
  const totalEquityAccounts = (normalizedTree?.equity || []).reduce(
    (sum, p) => sum + (p?.groups || []).reduce((gSum, g) => gSum + (g?.accounts || []).length, 0),
    0
  );

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#f8fafc', p: { xs: 1, md: 1.5 }, fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top Navigation & Brand Header ── */}
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
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: 1,
          }}
        >
          {/* Title & Badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '8px',
                bgcolor: '#4f46e5',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
              }}
            >
              <BankIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                  Balance Sheet Statement
                </Typography>
                {data && (
                  <Chip
                    icon={isBalanced ? <CheckCircleIcon sx={{ fontSize: '13px !important' }} /> : <WarningIcon sx={{ fontSize: '13px !important' }} />}
                    label={isBalanced ? 'Balanced & Equalized' : `Variance: AED ${discrepancy.toFixed(2)}`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      bgcolor: isBalanced ? '#ecfdf5' : '#fff1f2',
                      color: isBalanced ? '#047857' : '#be123c',
                      border: `1px solid ${isBalanced ? '#a7f3d0' : '#fecdd3'}`,
                    }}
                  />
                )}
              </Box>
              <Typography sx={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 500 }}>
                Hierarchical Statement of Financial Position • UAE FTA Compliant &amp; Real-Time Statutory Audit
              </Typography>
            </Box>
          </Box>

          {/* Action Bar: View Switcher, Expand/Collapse & Export */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* View Mode Toggle: Tree View vs Collapsed View */}
            <ButtonGroup size="small" sx={{ height: 28 }}>
              <Button
                variant={viewMode === 'tree' ? 'contained' : 'outlined'}
                onClick={() => setViewMode('tree')}
                startIcon={<TreeIcon sx={{ fontSize: 13 }} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  bgcolor: viewMode === 'tree' ? '#4f46e5' : 'transparent',
                  color: viewMode === 'tree' ? '#ffffff' : '#475569',
                  borderColor: '#cbd5e1',
                  '&:hover': {
                    bgcolor: viewMode === 'tree' ? '#4338ca' : '#f8fafc',
                    borderColor: '#94a3b8',
                  },
                }}
              >
                Tree View
              </Button>
              <Button
                variant={viewMode === 'collapsed' ? 'contained' : 'outlined'}
                onClick={() => setViewMode('collapsed')}
                startIcon={<ViewListIcon sx={{ fontSize: 13 }} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  bgcolor: viewMode === 'collapsed' ? '#4f46e5' : 'transparent',
                  color: viewMode === 'collapsed' ? '#ffffff' : '#475569',
                  borderColor: '#cbd5e1',
                  '&:hover': {
                    bgcolor: viewMode === 'collapsed' ? '#4338ca' : '#f8fafc',
                    borderColor: '#94a3b8',
                  },
                }}
              >
                Collapsed View
              </Button>
            </ButtonGroup>

            {viewMode === 'tree' && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleExpandAll}
                  startIcon={<ExpandAllIcon sx={{ fontSize: 13 }} />}
                  sx={{
                    height: 28,
                    borderRadius: '6px',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
                  }}
                >
                  Expand All
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleCollapseAll}
                  startIcon={<CollapseAllIcon sx={{ fontSize: 13 }} />}
                  sx={{
                    height: 28,
                    borderRadius: '6px',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
                  }}
                >
                  Collapse All
                </Button>
              </>
            )}

            <Button
              size="small"
              variant="outlined"
              onClick={handleExportCSV}
              disabled={!data}
              startIcon={<DownloadIcon sx={{ fontSize: 13 }} />}
              sx={{
                height: 28,
                borderRadius: '6px',
                borderColor: '#cbd5e1',
                color: '#475569',
                fontSize: '0.68rem',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              }}
            >
              Export CSV
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={handlePrint}
              startIcon={<PrintIcon sx={{ fontSize: 13 }} />}
              sx={{
                height: 28,
                borderRadius: '6px',
                borderColor: '#cbd5e1',
                color: '#475569',
                fontSize: '0.68rem',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              }}
            >
              Print
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ── Filters & Period Selection Toolbar ── */}
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
        <Grid container spacing={1.25} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem', mb: 0.25 }}>
              As of Date
            </Typography>
            <DateInput
              label=""
              size="small"
              value={asAtDate}
              onChange={setAsAtDate}
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

          <Grid item xs={12} sm={6} md={6}>
            <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem', mb: 0.25 }}>
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

          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ display: { xs: 'none', md: 'block' }, opacity: 0, fontSize: '0.62rem', mb: 0.25 }}>
              Action
            </Typography>
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
              {loading ? 'Running...' : 'Generate Statement'}
            </Button>
          </Grid>

          {/* Quick Period Presets */}
          <Grid item xs={12}>
            <Box sx={{ pt: 1, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.04em', fontSize: '0.6rem', mr: 0.5 }}>
                Presets:
              </Typography>
              <Chip
                label="Today"
                size="small"
                onClick={() => {
                  handlePreset('today');
                  setTimeout(load, 50);
                }}
                clickable
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, height: 20, bgcolor: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff' }}
              />
              <Chip
                label="Month End"
                size="small"
                onClick={() => {
                  handlePreset('monthEnd');
                  setTimeout(load, 50);
                }}
                clickable
                sx={{ borderRadius: '4px', fontSize: '0.65rem', fontWeight: 500, height: 20, bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
              />
              <Chip
                label="Quarter End"
                size="small"
                onClick={() => {
                  handlePreset('quarterEnd');
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

      {/* ── Executive KPI Summary Cards ── */}
      {data && (
        <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
          {/* Card 1: Total Assets */}
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
                  Total Assets
                </Typography>
                <Chip
                  icon={<TrendingUpIcon sx={{ fontSize: '11px !important', color: '#047857' }} />}
                  label="Resources"
                  size="small"
                  sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, bgcolor: '#ecfdf5', color: '#047857' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                  {formatAED(totalAssets)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#047857', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.62rem' }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#10b981' }} />
                  {totalAssetAccounts} Active Accounts
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem' }}>
                  Current &amp; Fixed
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Card 2: Total Liabilities */}
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
                  Total Liabilities
                </Typography>
                <Chip
                  icon={<TrendingDownIcon sx={{ fontSize: '11px !important', color: '#be123c' }} />}
                  label="Obligations"
                  size="small"
                  sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, bgcolor: '#fff1f2', color: '#be123c' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                  {formatAED(totalLiabilities)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.62rem' }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#f43f5e' }} />
                  {totalLiabilityAccounts} Active Accounts
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.62rem' }}>
                  Payables &amp; VAT
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Card 3: Total Equity & Reserves */}
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
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #4f46e5 0%, #818cf8 100%)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                  Total Equity
                </Typography>
                <Chip
                  label={netProfit >= 0 ? '+ Net Profit' : '- Net Loss'}
                  size="small"
                  sx={{
                    height: 17,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    bgcolor: netProfit >= 0 ? '#eef2ff' : '#fff1f2',
                    color: netProfit >= 0 ? '#4338ca' : '#be123c',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.65rem' }}>
                  AED
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                  {formatAED(totalEquity)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#4338ca', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.62rem' }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#4f46e5' }} />
                  {totalEquityAccounts} Accounts
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.62rem' }}>
                  P&amp;L AED {formatAED(netProfit)}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Card 4: Audit Status / Balance Check */}
          <Grid item xs={12} sm={6} lg={3}>
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: '10px',
                bgcolor: isBalanced ? '#f0fdf4' : '#fff1f2',
                border: `1px solid ${isBalanced ? '#bbf7d0' : '#fecdd3'}`,
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
                  background: isBalanced ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: isBalanced ? '#166534' : '#991b1b', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                  Balance Check
                </Typography>
                <Chip
                  icon={isBalanced ? <CheckCircleIcon sx={{ fontSize: '11px !important', color: '#166534' }} /> : <WarningIcon sx={{ fontSize: '11px !important', color: '#991b1b' }} />}
                  label={isBalanced ? 'Balanced' : 'Discrepancy'}
                  size="small"
                  sx={{
                    height: 17,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    bgcolor: isBalanced ? '#dcfce7' : '#fee2e2',
                    color: isBalanced ? '#166534' : '#991b1b',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 0.25 }}>
                <Typography sx={{ fontWeight: 700, color: isBalanced ? '#059669' : '#dc2626', fontSize: '0.65rem' }}>
                  DIFF
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 900,
                    color: isBalanced ? '#065f46' : '#991b1b',
                    fontSize: '1.05rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1.2,
                  }}
                >
                  AED {formatAED(discrepancy)}
                </Typography>
              </Box>
              <Box sx={{ pt: 0.75, mt: 0.5, borderTop: `1px solid ${isBalanced ? '#dcfce7' : '#fee2e2'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: isBalanced ? '#166534' : '#991b1b', fontWeight: 600, fontSize: '0.62rem' }}>
                  {isBalanced ? 'Assets = Liab. + Equity' : 'Check postings'}
                </Typography>
                <Typography sx={{ color: isBalanced ? '#059669' : '#dc2626', fontWeight: 600, fontSize: '0.62rem' }}>
                  {isBalanced ? '100% Reconciled' : 'Unbalanced'}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* ── VIEW 1: HIERARCHICAL TREE VIEW ── */}
      {data && viewMode === 'tree' && (
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
            <Box sx={{ gridColumn: 'span 8' }}>
              <Typography sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                Account Classification &amp; Ledger Group Hierarchy
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

          {/* SECTION 1: ASSETS */}
          <BalanceSheetSectionBlock
            sectionTitle="ASSETS & RESOURCES"
            sectionColor="#059669"
            sectionBg="rgba(236, 253, 245, 0.4)"
            sectionHoverBg="rgba(236, 253, 245, 0.7)"
            borderAccentColor="#059669"
            totalAmount={totalAssets}
            parents={filteredTree.assets}
            expanded={expandedSections.assets}
            onToggle={() => setExpandedSections((prev) => ({ ...prev, assets: !prev.assets }))}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            nodePrefix="ast"
            percentageLabel="100.0% of Total Assets"
            parentTotal={totalAssets}
            emptyMessage="No asset accounts or transactions found for this date."
          />

          {/* SECTION 2: LIABILITIES */}
          <BalanceSheetSectionBlock
            sectionTitle="LIABILITIES & OBLIGATIONS"
            sectionColor="#e11d48"
            sectionBg="rgba(255, 241, 242, 0.4)"
            sectionHoverBg="rgba(255, 241, 242, 0.7)"
            borderAccentColor="#f43f5e"
            totalAmount={totalLiabilities}
            parents={filteredTree.liabilities}
            expanded={expandedSections.liabilities}
            onToggle={() => setExpandedSections((prev) => ({ ...prev, liabilities: !prev.liabilities }))}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            nodePrefix="lib"
            percentageLabel={`${totalLiabilitiesAndEquity > 0 ? ((totalLiabilities / totalLiabilitiesAndEquity) * 100).toFixed(1) : '0.0'}% of Capital & Liab.`}
            parentTotal={totalLiabilities}
            emptyMessage="No liability accounts or payables found for this date."
          />

          {/* SECTION 3: EQUITY */}
          <BalanceSheetSectionBlock
            sectionTitle="SHAREHOLDERS' EQUITY & RESERVES"
            sectionColor="#4f46e5"
            sectionBg="rgba(238, 242, 255, 0.4)"
            sectionHoverBg="rgba(238, 242, 255, 0.7)"
            borderAccentColor="#4f46e5"
            totalAmount={totalEquity}
            parents={filteredTree.equity}
            expanded={expandedSections.equity}
            onToggle={() => setExpandedSections((prev) => ({ ...prev, equity: !prev.equity }))}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            nodePrefix="eqt"
            percentageLabel={`${totalLiabilitiesAndEquity > 0 ? ((totalEquity / totalLiabilitiesAndEquity) * 100).toFixed(1) : '0.0'}% of Capital & Liab.`}
            parentTotal={totalEquity}
            emptyMessage="No equity accounts or capital reserves found."
          />

          {/* GRAND SUMMARY FOOTER */}
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
                  bgcolor: isBalanced ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  border: `1px solid ${isBalanced ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isBalanced ? '#34d399' : '#f87171',
                }}
              >
                <WalletIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', letterSpacing: '-0.01em' }}>
                    Accounting Equation: Total Assets = Total Liabilities + Equity
                  </Typography>
                  <Chip
                    label={isBalanced ? 'Equalized (0.00 Variance)' : `Unbalanced: ${discrepancy.toFixed(2)} AED`}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      bgcolor: isBalanced ? '#065f46' : '#991b1b',
                      color: '#ffffff',
                    }}
                  />
                </Box>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                  Assets: AED {formatAED(totalAssets)} | Liabilities + Equity: AED {formatAED(totalLiabilitiesAndEquity)}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Total Liabilities &amp; Equity
              </Typography>
              <Typography
                sx={{
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isBalanced ? '#34d399' : '#f87171',
                  lineHeight: 1.2,
                }}
              >
                AED {formatAED(totalLiabilitiesAndEquity)}
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── VIEW 2: COLLAPSED / FLAT LEDGER VIEW ── */}
      {data && viewMode === 'collapsed' && (
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
          <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '0.85rem' }}>
                Collapsed Individual Ledgers List
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '0.68rem' }}>
                Direct detailed table showing all individual ledger balances across Asset, Liability, and Equity types
              </Typography>
            </Box>
            <Chip
              label={`${filteredFlatLedgers.length} Ledgers Found`}
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#eef2ff', color: '#4f46e5' }}
            />
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Parent Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Account Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Group Classification
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Type
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Amount (AED)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredFlatLedgers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3, color: '#94a3b8', fontSize: '0.75rem' }}>
                      No matching ledger accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFlatLedgers.map((r, i) => {
                    const isPnL = r.name.startsWith('Profit & Loss');
                    const isAst = r.type === 'Asset';
                    const isLib = r.type === 'Liability';
                    return (
                      <TableRow
                        key={i}
                        hover
                        sx={{
                          bgcolor: isPnL ? 'rgba(79, 70, 229, 0.04)' : undefined,
                          '&:hover': { bgcolor: '#f8fafc' },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.72rem', color: '#475569', fontWeight: 500 }}>
                          {r.parentName || r.groupName || '—'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: isPnL ? 700 : 500, fontSize: '0.75rem', color: isPnL ? '#4338ca' : '#1e293b' }}>
                          {r.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {r.groupName || 'General'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={r.type}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              bgcolor: isAst ? '#ecfdf5' : isLib ? '#fff1f2' : '#eef2ff',
                              color: isAst ? '#047857' : isLib ? '#be123c' : '#4338ca',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '0.75rem', color: '#0f172a' }}>
                          {formatAED(r.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}

                {/* Subtotals & Grand Totals */}
                <TableRow sx={{ bgcolor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <TableCell colSpan={4}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#047857' }}>
                      Total Assets
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: '0.8rem', color: '#047857' }}>
                    AED {formatAED(totalAssets)}
                  </TableCell>
                </TableRow>

                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell colSpan={4}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#be123c' }}>
                      Total Liabilities
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: '0.8rem', color: '#be123c' }}>
                    AED {formatAED(totalLiabilities)}
                  </TableCell>
                </TableRow>

                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell colSpan={4}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#4338ca' }}>
                      Total Equity {netProfit !== 0 ? `(including Net Profit AED ${formatAED(netProfit)})` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: '0.8rem', color: '#4338ca' }}>
                    AED {formatAED(totalEquity)}
                  </TableCell>
                </TableRow>

                <TableRow sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#0f172a', color: '#ffffff' }}>
                  <TableCell colSpan={4} sx={{ color: '#ffffff' }}>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: '#ffffff' }}>
                      Total Liabilities &amp; Equity
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 900, fontSize: '0.85rem', color: isBalanced ? '#34d399' : '#f87171' }}>
                    AED {formatAED(totalLiabilitiesAndEquity)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Balance Sheet Section Component (Assets, Liabilities, Equity)
// ─────────────────────────────────────────────────────────────
interface BalanceSheetSectionBlockProps {
  sectionTitle: string;
  sectionColor: string;
  sectionBg: string;
  sectionHoverBg: string;
  borderAccentColor: string;
  totalAmount: number;
  parents: BalanceSheetParentNode[];
  expanded: boolean;
  onToggle: () => void;
  expandedNodes: Record<string, boolean>;
  onToggleNode: (key: string) => void;
  nodePrefix: string;
  percentageLabel: string;
  parentTotal: number;
  emptyMessage: string;
}

function BalanceSheetSectionBlock({
  sectionTitle,
  sectionColor,
  sectionBg,
  sectionHoverBg,
  borderAccentColor,
  totalAmount,
  parents,
  expanded,
  onToggle,
  expandedNodes,
  onToggleNode,
  nodePrefix,
  percentageLabel,
  parentTotal,
  emptyMessage,
}: BalanceSheetSectionBlockProps) {
  const safeParents = Array.isArray(parents) ? parents : [];
  const totalGroups = safeParents.reduce((sum, p) => sum + (Array.isArray(p?.groups) ? p.groups.length : 0), 0);
  const totalAccounts = safeParents.reduce(
    (sum, p) =>
      sum +
      (Array.isArray(p?.groups)
        ? p.groups.reduce((gSum, g) => gSum + (Array.isArray(g?.accounts) ? g.accounts.length : 0), 0)
        : 0),
    0
  );

  return (
    <Box sx={{ borderBottom: '1px solid #e2e8f0' }}>
      {/* ── Section Header Row (Level 0) ── */}
      <Box
        onClick={onToggle}
        sx={{
          px: 2,
          py: 1.25,
          bgcolor: sectionBg,
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.15s ease',
          borderLeft: `4px solid ${borderAccentColor}`,
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
              transition: 'transform 0.15s ease',
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 800, color: sectionColor, fontSize: '0.82rem', letterSpacing: '0.02em' }}>
              {sectionTitle}
            </Typography>
            <Chip
              label={`${safeParents.length} Parents · ${totalGroups} Groups · ${totalAccounts} Accounts`}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.62rem',
                fontWeight: 700,
                bgcolor: 'rgba(255,255,255,0.7)',
                color: sectionColor,
                border: `1px solid ${sectionColor}33`,
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

      {/* ── Parents Tree (Level 1) ── */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        {safeParents.length === 0 ? (
          <Box sx={{ p: 2.5, textAlign: 'center' }}>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              {emptyMessage}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ divideY: '1px solid #f1f5f9' }}>
            {safeParents.map((parent) => {
              const parentKey = `p-${nodePrefix}-${parent?.parentId || 'p'}`;
              const isParentExpanded = !!expandedNodes[parentKey];

              return (
                <BalanceSheetParentNodeItem
                  key={parentKey}
                  parent={parent}
                  isExpanded={isParentExpanded}
                  onToggle={() => onToggleNode(parentKey)}
                  sectionTotal={parentTotal}
                  nodePrefix={nodePrefix}
                  expandedNodes={expandedNodes}
                  onToggleNode={onToggleNode}
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
// Balance Sheet Parent Node (Level 1: Current Asset, Capital, etc.)
// ─────────────────────────────────────────────────────────────
interface BalanceSheetParentNodeItemProps {
  parent: BalanceSheetParentNode;
  isExpanded: boolean;
  onToggle: () => void;
  sectionTotal: number;
  nodePrefix: string;
  expandedNodes: Record<string, boolean>;
  onToggleNode: (key: string) => void;
}

function BalanceSheetParentNodeItem({
  parent,
  isExpanded,
  onToggle,
  sectionTotal,
  nodePrefix,
  expandedNodes,
  onToggleNode,
}: BalanceSheetParentNodeItemProps) {
  const pTotal = Number(parent?.totalAmount) || 0;
  const parentContribution =
    sectionTotal > 0 ? ((pTotal / sectionTotal) * 100).toFixed(1) : '0.0';
  const isAsset = parent?.type === 'Asset';
  const isLiability = parent?.type === 'Liability';
  const safeGroups = Array.isArray(parent?.groups) ? parent.groups : [];
  const totalAccounts = safeGroups.reduce(
    (sum, g) => sum + (Array.isArray(g?.accounts) ? g.accounts.length : 0),
    0
  );

  return (
    <Box sx={{ borderBottom: '1px solid #e2e8f0' }}>
      {/* ── Parent Row (Level 1) ── */}
      <Box
        onClick={onToggle}
        sx={{
          px: 2,
          py: 1.1,
          pl: 2.5,
          bgcolor: isExpanded ? '#f8fafc' : '#ffffff',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          alignItems: 'center',
          transition: 'all 0.15s ease',
          '&:hover': {
            bgcolor: '#f1f5f9',
          },
        }}
      >
        <Box sx={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            sx={{
              p: 0.25,
              color: isExpanded ? '#0284c7' : '#64748b',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 15 }} />
          </IconButton>

          {/* Parent Badge Icon */}
          <Box
            sx={{
              p: '4px',
              borderRadius: '6px',
              bgcolor: isAsset ? '#ecfdf5' : isLiability ? '#fff1f2' : '#eef2ff',
              color: isAsset ? '#047857' : isLiability ? '#be123c' : '#4f46e5',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LayersIcon sx={{ fontSize: 15 }} />
          </Box>

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem' }}>
                {parent?.parentName || 'Parent Head'}
              </Typography>
              {parent?.parentCode && (
                <Typography sx={{ color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.66rem' }}>
                  [{parent.parentCode}]
                </Typography>
              )}
            </Box>
            <Typography sx={{ color: '#64748b', fontSize: '0.62rem' }}>
              {safeGroups.length} {safeGroups.length === 1 ? 'group' : 'groups'} · {totalAccounts} accounts
            </Typography>
          </Box>
        </Box>

        {/* Parent Contribution % */}
        <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
          <Typography sx={{ color: '#475569', fontSize: '0.68rem', fontWeight: 700 }}>
            {parentContribution}%
          </Typography>
        </Box>

        {/* Parent Total Amount */}
        <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
          <Typography
            sx={{
              fontWeight: 800,
              color: '#0f172a',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.82rem',
            }}
          >
            AED {formatAED(pTotal)}
          </Typography>
        </Box>
      </Box>

      {/* ── Groups Tree Expansion (Level 2) ── */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ bgcolor: '#fafafa', borderTop: '1px solid #f1f5f9' }}>
          {safeGroups.map((group) => {
            const groupKey = `g-${nodePrefix}-${group?.groupId || 'grp'}`;
            const isGroupExpanded = !!expandedNodes[groupKey];

            return (
              <BalanceSheetGroupNodeItem
                key={groupKey}
                group={group}
                parentName={parent?.parentName || ''}
                isExpanded={isGroupExpanded}
                onToggle={() => onToggleNode(groupKey)}
                parentTotal={pTotal}
              />
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Balance Sheet Group Folder Node (Level 2: Group e.g. BANK, CUSTOMERS)
// ─────────────────────────────────────────────────────────────
interface BalanceSheetGroupNodeItemProps {
  group: BalanceSheetGroupNode;
  parentName?: string;
  isExpanded: boolean;
  onToggle: () => void;
  parentTotal: number;
}

function BalanceSheetGroupNodeItem({
  group,
  isExpanded,
  onToggle,
  parentTotal,
}: BalanceSheetGroupNodeItemProps) {
  const gTotal = Number(group?.totalAmount) || 0;
  const groupContribution =
    parentTotal !== 0 ? ((gTotal / parentTotal) * 100).toFixed(1) : '0.0';
  const isAsset = group?.type === 'Asset';
  const isLiability = group?.type === 'Liability';
  const safeAccounts = Array.isArray(group?.accounts) ? group.accounts : [];

  return (
    <Box sx={{ borderBottom: '1px solid #f1f5f9' }}>
      {/* ── Group Row (Level 2) ── */}
      <Box
        onClick={onToggle}
        sx={{
          px: 2,
          py: 0.9,
          pl: 5.5,
          bgcolor: isExpanded ? '#ffffff' : 'transparent',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          alignItems: 'center',
          transition: 'all 0.15s ease',
          '&:hover': {
            bgcolor: '#ffffff',
          },
        }}
      >
        <Box sx={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 1 }}>
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
              borderRadius: '5px',
              bgcolor: isAsset ? '#ecfdf5' : isLiability ? '#fff1f2' : '#eef2ff',
              color: isAsset ? '#047857' : isLiability ? '#be123c' : '#4f46e5',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {isExpanded ? <FolderOpenIcon sx={{ fontSize: 14 }} /> : <FolderIcon sx={{ fontSize: 14 }} />}
          </Box>

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.76rem' }}>
                {group?.groupName || 'Group'}
              </Typography>
              {group?.groupCode && (
                <Typography sx={{ color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.66rem' }}>
                  [{group.groupCode}]
                </Typography>
              )}
            </Box>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.60rem' }}>
              {safeAccounts.length} {safeAccounts.length === 1 ? 'account' : 'accounts'}
            </Typography>
          </Box>
        </Box>

        {/* Group Contribution % */}
        <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
          <Typography sx={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>
            {groupContribution}%
          </Typography>
        </Box>

        {/* Group Total Numbers */}
        <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
          <Typography
            sx={{
              fontWeight: 750,
              color: '#1e293b',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.78rem',
            }}
          >
            AED {formatAED(gTotal)}
          </Typography>
        </Box>
      </Box>

      {/* ── Sub-Ledger Accounts Tree Expansion (Level 3: Ledger Accounts) ── */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ bgcolor: '#ffffff', py: 0.35 }}>
          {safeAccounts.map((acc) => {
            const accAmount = Number(acc?.amount) || 0;
            const accContribution =
              gTotal !== 0 ? ((accAmount / gTotal) * 100).toFixed(1) : '0.0';
            const isPnL = (acc?.name || '').startsWith('Profit & Loss');

            return (
              <Box
                key={acc?.id || acc?.name || Math.random().toString()}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  alignItems: 'center',
                  px: 2,
                  py: 0.65,
                  pl: 9,
                  borderBottom: '1px solid #f8fafc',
                  bgcolor: isPnL ? 'rgba(79, 70, 229, 0.04)' : 'transparent',
                  '&:hover': {
                    bgcolor: '#f8fafc',
                  },
                }}
              >
                <Box sx={{ gridColumn: 'span 8', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      bgcolor: isPnL ? '#4f46e5' : '#64748b',
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: '0.74rem',
                      color: isPnL ? '#4338ca' : '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    {acc?.name || 'Account'}
                  </Typography>
                  {acc?.code && (
                    <Typography sx={{ color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.64rem' }}>
                      [{acc.code}]
                    </Typography>
                  )}
                  {isPnL && (
                    <Chip
                      label="P&L Synced"
                      size="small"
                      sx={{ height: 16, fontSize: '0.58rem', fontWeight: 800, bgcolor: '#e0e7ff', color: '#4338ca' }}
                    />
                  )}
                </Box>

                <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                    {accContribution}%
                  </Typography>
                </Box>

                <Box sx={{ gridColumn: 'span 2', textAlign: 'right' }}>
                  <Typography
                    sx={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: isPnL ? 800 : 600,
                      fontSize: '0.74rem',
                      color: '#0f172a',
                    }}
                  >
                    AED {formatAED(accAmount)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
