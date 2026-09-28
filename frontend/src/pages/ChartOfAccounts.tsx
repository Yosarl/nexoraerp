import React, { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Chip,
  Collapse,
  Stack,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  UnfoldMore as UnfoldMoreIcon,
  UnfoldLess as UnfoldLessIcon,
  AccountTree as AccountTreeIcon,
  ViewList as ViewListIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Receipt as ReceiptIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalanceWallet as WalletIcon,
  CreditCard as CreditCardIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { ledgerAccountApi, ledgerGroupApi } from '../services/api';

type Account = {
  _id: string;
  name: string;
  code: string;
  type: string;
  groupId?: string | { _id: string; name: string; code?: string };
  creditLimit?: number;
  creditDays?: number;
};

type Group = {
  _id: string;
  name: string;
  code: string;
  type: string;
  parentGroupId?: string | { _id: string; name?: string };
};

interface GroupNode {
  id: string;
  code: string;
  name: string;
  type: string;
  subGroups: GroupNode[];
  accounts: Account[];
}

interface TypeCategory {
  key: string;
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
  icon: React.ReactNode;
  groups: GroupNode[];
  directAccounts: Account[];
}

const TYPE_CONFIG: Record<string, { title: string; color: string; bgColor: string; borderColor: string; badgeBg: string; icon: React.ReactNode }> = {
  Asset: {
    title: 'ASSET',
    color: '#059669',
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    badgeBg: '#10b981',
    icon: <WalletIcon fontSize="small" sx={{ color: '#059669' }} />,
  },
  Liability: {
    title: 'LIABILITY',
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    badgeBg: '#ef4444',
    icon: <CreditCardIcon fontSize="small" sx={{ color: '#dc2626' }} />,
  },
  Equity: {
    title: 'EQUITY',
    color: '#2563eb',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    badgeBg: '#3b82f6',
    icon: <AccountBalanceIcon fontSize="small" sx={{ color: '#2563eb' }} />,
  },
  Income: {
    title: 'INCOME',
    color: '#7c3aed',
    bgColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    badgeBg: '#8b5cf6',
    icon: <TrendingUpIcon fontSize="small" sx={{ color: '#7c3aed' }} />,
  },
  Expense: {
    title: 'EXPENSE',
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    badgeBg: '#f59e0b',
    icon: <TrendingDownIcon fontSize="small" sx={{ color: '#d97706' }} />,
  },
  'Duties and Taxes': {
    title: 'DUTIES AND TAXES',
    color: '#0891b2',
    bgColor: '#ecfeff',
    borderColor: '#a5f3fc',
    badgeBg: '#06b6d4',
    icon: <ReceiptIcon fontSize="small" sx={{ color: '#0891b2' }} />,
  },
};

const getAccountTypeColor = (type?: string) => {
  switch (type?.toLowerCase()) {
    case 'customer': return { bg: '#e0f2fe', color: '#0369a1' };
    case 'supplier': return { bg: '#fef3c7', color: '#b45309' };
    case 'bank': return { bg: '#ede9fe', color: '#6d28d9' };
    case 'cash': return { bg: '#dcfce7', color: '#15803d' };
    case 'expense': return { bg: '#fee2e2', color: '#b91c1c' };
    case 'revenue': return { bg: '#f3e8ff', color: '#7e22ce' };
    default: return { bg: '#f1f5f9', color: '#475569' };
  }
};

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const [search, setSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    Promise.all([ledgerAccountApi.list(companyId), ledgerGroupApi.list(companyId)])
      .then(([accRes, grpRes]) => {
        setAccounts((accRes.data.data as Account[]) ?? []);
        setGroups((grpRes.data.data as Group[]) ?? []);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  // Group lookup map
  const groupMap = useMemo(() => {
    return Object.fromEntries(groups.map((g) => [g._id, g.name]));
  }, [groups]);

  const getGroupId = (groupId?: string | { _id: string }): string | undefined => {
    if (!groupId) return undefined;
    return typeof groupId === 'object' ? groupId._id : groupId;
  };

  const getGroupName = (groupId?: string | { _id?: string; name?: string }) => {
    if (!groupId) return '-';
    if (typeof groupId === 'object') {
      return groupId.name || (groupId._id ? groupMap[groupId._id] : '-');
    }
    return groupMap[groupId] || '-';
  };

  // Build tree structure
  const treeData = useMemo(() => {
    const groupNodeMap: Record<string, GroupNode> = {};
    groups.forEach((g) => {
      groupNodeMap[g._id] = {
        id: g._id,
        code: g.code,
        name: g.name,
        type: g.type,
        subGroups: [],
        accounts: [],
      };
    });

    // Link accounts to group nodes
    const unassignedAccounts: Account[] = [];
    accounts.forEach((acc) => {
      const gId = getGroupId(acc.groupId);
      if (gId && groupNodeMap[gId]) {
        groupNodeMap[gId].accounts.push(acc);
      } else {
        unassignedAccounts.push(acc);
      }
    });

    // Link sub-groups to parents
    const topLevelGroups: Record<string, GroupNode[]> = {
      Asset: [],
      Liability: [],
      Equity: [],
      Income: [],
      Expense: [],
      'Duties and Taxes': [],
      Other: [],
    };

    const normalizeTypeKey = (t?: string): string => {
      if (!t) return 'Other';
      const u = t.toUpperCase();
      if (u === 'ASSET') return 'Asset';
      if (u === 'LIABILITY') return 'Liability';
      if (u === 'EQUITY') return 'Equity';
      if (u === 'INCOME') return 'Income';
      if (u === 'EXPENSE') return 'Expense';
      if (u === 'DUTIES AND TAXES' || u === 'DUTIES & TAXES') return 'Duties and Taxes';
      return t;
    };

    groups.forEach((g) => {
      const pId = getGroupId(g.parentGroupId);
      const node = groupNodeMap[g._id];
      if (pId && groupNodeMap[pId]) {
        groupNodeMap[pId].subGroups.push(node);
      } else {
        const norm = normalizeTypeKey(g.type);
        const typeKey = topLevelGroups[norm] ? norm : 'Other';
        topLevelGroups[typeKey].push(node);
      }
    });

    const HEAD_ORDER: Record<string, number> = {
      'fixed asset': 1,
      'current asset': 2,
      'capital': 1,
      'fixed liability': 1,
      'current liability': 2,
      'direct income': 1,
      'indirect income': 2,
      'direct expense': 1,
      'indirect expense': 2,
      'duties and taxes receivable': 1,
      'duties and taxes payable': 2,
    };

    Object.keys(topLevelGroups).forEach((k) => {
      topLevelGroups[k].sort((a, b) => {
        const orderA = HEAD_ORDER[a.name.toLowerCase()] ?? 50;
        const orderB = HEAD_ORDER[b.name.toLowerCase()] ?? 50;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
    });

    const categories: TypeCategory[] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense', 'Duties and Taxes'].map((typeKey) => {
      const config = TYPE_CONFIG[typeKey];
      const directAccs = unassignedAccounts.filter((a) => a.type?.toLowerCase() === typeKey.toLowerCase());
      return {
        key: typeKey,
        title: config.title,
        color: config.color,
        bgColor: config.bgColor,
        borderColor: config.borderColor,
        badgeBg: config.badgeBg,
        icon: config.icon,
        groups: topLevelGroups[typeKey] || [],
        directAccounts: directAccs,
      };
    });

    return categories;
  }, [groups, accounts]);

  // Expand all / Collapse all helpers
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    treeData.forEach((cat) => {
      next[`type-${cat.key}`] = true;
      const collectGroups = (grps: GroupNode[]) => {
        grps.forEach((g) => {
          next[`grp-${g.id}`] = true;
          collectGroups(g.subGroups);
        });
      };
      collectGroups(cat.groups);
    });
    setExpandedNodes(next);
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  // Auto-expand default top levels on initial load
  useEffect(() => {
    if (treeData.length > 0 && Object.keys(expandedNodes).length === 0) {
      const initial: Record<string, boolean> = {};
      treeData.forEach((cat) => {
        initial[`type-${cat.key}`] = true;
        cat.groups.forEach((g) => {
          initial[`grp-${g.id}`] = true;
        });
      });
      setExpandedNodes(initial);
    }
  }, [treeData]);

  // Search filter
  const query = search.trim().toLowerCase();

  const filterAccount = (acc: Account) => {
    if (!query) return true;
    return (
      acc.name.toLowerCase().includes(query) ||
      acc.code.toLowerCase().includes(query) ||
      (acc.type && acc.type.toLowerCase().includes(query))
    );
  };

  const countVisibleAccounts = (node: GroupNode): number => {
    let count = node.accounts.filter(filterAccount).length;
    for (const sub of node.subGroups) {
      count += countVisibleAccounts(sub);
    }
    return count;
  };

  const doesGroupMatch = (node: GroupNode): boolean => {
    if (!query) return true;
    if (node.name.toLowerCase().includes(query) || node.code.toLowerCase().includes(query)) return true;
    if (countVisibleAccounts(node) > 0) return true;
    return false;
  };

  // Recursive Tree Group Renderer
  const renderGroupNode = (node: GroupNode, depth = 1) => {
    if (!doesGroupMatch(node)) return null;

    const isExpanded = query ? true : !!expandedNodes[`grp-${node.id}`];
    const matchingAccounts = node.accounts.filter(filterAccount);
    const totalAccCount = countVisibleAccounts(node);

    return (
      <Box key={node.id} sx={{ ml: depth > 1 ? 3 : 0, mb: 0.5 }}>
        <Box
          onClick={() => toggleNode(`grp-${node.id}`)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.8,
            px: 1.5,
            borderRadius: 1.5,
            bgcolor: isExpanded ? '#f8fafc' : 'transparent',
            '&:hover': { bgcolor: '#f1f5f9', cursor: 'pointer' },
            border: '1px solid',
            borderColor: isExpanded ? '#e2e8f0' : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton size="small" sx={{ p: 0.2, color: '#64748b' }}>
              {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </IconButton>
            {isExpanded ? (
              <FolderOpenIcon fontSize="small" sx={{ color: '#3b82f6' }} />
            ) : (
              <FolderIcon fontSize="small" sx={{ color: '#64748b' }} />
            )}
            <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
              {node.name}
            </Typography>
            <Chip
              label={node.code}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.72rem',
                bgcolor: '#f1f5f9',
                color: '#475569',
                fontWeight: 500,
              }}
            />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              {totalAccCount} {totalAccCount === 1 ? 'account' : 'accounts'}
            </Typography>
          </Stack>
        </Box>

        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <Box sx={{ pl: 2, borderLeft: '2px dashed #e2e8f0', ml: 2, my: 0.5 }}>
            {/* Render Subgroups */}
            {node.subGroups.map((sub) => renderGroupNode(sub, depth + 1))}

            {/* Render Accounts inside this group */}
            {matchingAccounts.map((acc) => {
              const typeStyle = getAccountTypeColor(acc.type);
              return (
                <Box
                  key={acc._id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 0.6,
                    px: 1.5,
                    my: 0.3,
                    borderRadius: 1.2,
                    bgcolor: '#ffffff',
                    border: '1px solid #f1f5f9',
                    '&:hover': {
                      bgcolor: '#f8fafc',
                      borderColor: '#cbd5e1',
                    },
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <ReceiptIcon fontSize="small" sx={{ color: '#94a3b8', fontSize: '1.1rem' }} />
                    <Chip
                      label={acc.code}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        bgcolor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#334155',
                      }}
                    />
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, color: '#0f172a' }}>
                      {acc.name}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center">
                    {acc.type && (
                      <Chip
                        label={acc.type}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          bgcolor: typeStyle.bg,
                          color: typeStyle.color,
                        }}
                      />
                    )}
                    {acc.creditDays !== undefined && acc.creditDays > 0 && (
                      <Chip
                        label={`${acc.creditDays}d`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.68rem', color: '#64748b' }}
                      />
                    )}
                  </Stack>
                </Box>
              );
            })}

            {node.subGroups.length === 0 && matchingAccounts.length === 0 && (
              <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic', pl: 1, py: 0.5, display: 'block' }}>
                No accounts in this group
              </Typography>
            )}
          </Box>
        </Collapse>
      </Box>
    );
  };

  if (!companyId) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
        <Typography color="error" variant="h6">
          Please select a company first.
        </Typography>
      </Paper>
    );
  }

  const filteredFlatAccounts = accounts.filter(filterAccount);

  return (
    <Box sx={{ p: 1 }}>
      {/* Header & Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Chart of Accounts
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Hierarchical view of ledger groups and accounts organized by accounting structure
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <TextField
            size="small"
            placeholder="Search accounts or groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: 280, bgcolor: '#ffffff' }}
          />

          {viewMode === 'tree' && (
            <>
              <Tooltip title="Expand All Groups">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={expandAll}
                  startIcon={<UnfoldMoreIcon />}
                  sx={{ textTransform: 'none', borderRadius: 1.5, borderColor: '#cbd5e1', color: '#475569' }}
                >
                  Expand All
                </Button>
              </Tooltip>
              <Tooltip title="Collapse All Groups">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={collapseAll}
                  startIcon={<UnfoldLessIcon />}
                  sx={{ textTransform: 'none', borderRadius: 1.5, borderColor: '#cbd5e1', color: '#475569' }}
                >
                  Collapse All
                </Button>
              </Tooltip>
            </>
          )}

          <ToggleButtonGroup
            size="small"
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
            sx={{ bgcolor: '#ffffff' }}
          >
            <ToggleButton value="tree">
              <Tooltip title="Tree View">
                <AccountTreeIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="table">
              <Tooltip title="Flat Table View">
                <ViewListIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Box>

      {/* Stats Cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 2.5, overflowX: 'auto', pb: 0.5 }}>
        {treeData.map((cat) => {
          let accCount = cat.directAccounts.length;
          cat.groups.forEach((g) => {
            accCount += countVisibleAccounts(g);
          });
          return (
            <Paper
              key={cat.key}
              elevation={0}
              sx={{
                p: 1.5,
                px: 2,
                minWidth: 160,
                borderRadius: 2,
                bgcolor: cat.bgColor,
                border: '1px solid',
                borderColor: cat.borderColor,
                flex: 1,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: cat.color }}>
                  {cat.title}
                </Typography>
                {cat.icon}
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                {accCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {cat.groups.length} groups
              </Typography>
            </Paper>
          );
        })}
      </Stack>

      {/* Main Content Area */}
      {loading ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <CircularProgress size={36} sx={{ color: '#3b82f6', mb: 1.5 }} />
          <Typography sx={{ color: '#64748b' }}>Loading Chart of Accounts...</Typography>
        </Paper>
      ) : viewMode === 'tree' ? (
        /* TREE VIEW */
        <Stack spacing={2}>
          {treeData.map((cat) => {
            const isCatExpanded = query ? true : !!expandedNodes[`type-${cat.key}`];
            const hasMatchingGroups = cat.groups.some(doesGroupMatch);
            const matchingDirectAccounts = cat.directAccounts.filter(filterAccount);

            if (query && !hasMatchingGroups && matchingDirectAccounts.length === 0) {
              return null;
            }

            return (
              <Paper
                key={cat.key}
                elevation={0}
                sx={{
                  borderRadius: 2.5,
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  bgcolor: '#ffffff',
                }}
              >
                {/* Category Header */}
                <Box
                  onClick={() => toggleNode(`type-${cat.key}`)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    px: 2,
                    bgcolor: cat.bgColor,
                    borderBottom: isCatExpanded ? '1px solid' : 'none',
                    borderColor: cat.borderColor,
                    cursor: 'pointer',
                    '&:hover': { filter: 'brightness(0.98)' },
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <IconButton size="small" sx={{ p: 0.2, color: cat.color }}>
                      {isCatExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                    </IconButton>
                    {cat.icon}
                    <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: cat.color }}>
                      {cat.title}
                    </Typography>
                  </Stack>

                  <Chip
                    label={`${cat.groups.length} Groups`}
                    size="small"
                    sx={{
                      bgcolor: '#ffffff',
                      color: cat.color,
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: cat.borderColor,
                    }}
                  />
                </Box>

                {/* Groups & Accounts Tree */}
                <Collapse in={isCatExpanded} timeout="auto" unmountOnExit>
                  <Box sx={{ p: 2 }}>
                    {cat.groups.length === 0 && matchingDirectAccounts.length === 0 ? (
                      <Typography variant="body2" sx={{ color: '#94a3b8', fontStyle: 'italic', py: 1, pl: 1 }}>
                        No groups or accounts found under {cat.title}
                      </Typography>
                    ) : (
                      <>
                        {cat.groups.map((group) => renderGroupNode(group))}
                        {matchingDirectAccounts.map((acc) => (
                          <Box
                            key={acc._id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              py: 0.6,
                              px: 1.5,
                              my: 0.3,
                              borderRadius: 1.2,
                              bgcolor: '#f8fafc',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <ReceiptIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                              <Chip label={acc.code} size="small" sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }} />
                              <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{acc.name}</Typography>
                            </Stack>
                            <Chip label={acc.type || 'Account'} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                          </Box>
                        ))}
                      </>
                    )}
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        /* FLAT TABLE VIEW */
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Group</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Credit Days</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredFlatAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: '#94a3b8' }}>
                    No ledger accounts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredFlatAccounts.map((a) => {
                  const typeStyle = getAccountTypeColor(a.type);
                  return (
                    <TableRow key={a._id} hover>
                      <TableCell sx={{ fontWeight: 600, color: '#334155' }}>{a.code}</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: '#0f172a' }}>{a.name}</TableCell>
                      <TableCell>
                        {a.type ? (
                          <Chip
                            label={a.type}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              bgcolor: typeStyle.bg,
                              color: typeStyle.color,
                            }}
                          />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell sx={{ color: '#475569' }}>{getGroupName(a.groupId)}</TableCell>
                      <TableCell sx={{ color: '#64748b' }}>{a.creditDays ? `${a.creditDays} days` : '-'}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
