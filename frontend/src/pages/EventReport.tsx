import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
  Button,
  IconButton,
  TextField,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  CircularProgress,
  Tooltip,
  Card,
  Grid,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  FilterAlt as FilterAltIcon,
  Refresh as RefreshIcon,
  Print as PrintIcon,
  FileDownload as FileDownloadIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Close as CloseIcon,
  FiberManualRecord as FiberManualRecordIcon,
  Security as SecurityIcon,
  History as HistoryIcon,
  ViewColumn as ViewColumnIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { auditLogApi, userApi, AuditLogItem } from '../services/api';
import DateInput, { formatDateDisplay } from '../components/DateInput';
import ColumnManagerDrawer, { ColumnDefinition } from '../components/reports/ColumnManagerDrawer';

// Helper for currency formatting
const formatAED = (val?: number | null) => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  return (
    'AED ' +
    val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

// Available entry window form options for combobox
export const ENTRY_FORM_OPTIONS = [
  { value: 'ALL', label: 'All Entry Windows (All Forms)' },
  { value: 'Sales Invoice', label: 'Sales Invoice' },
  { value: 'POS Cash Sales', label: 'POS Cash Sales' },
  { value: 'Purchase Entry', label: 'Purchase Entry' },
  { value: 'Sales Return', label: 'Sales Return' },
  { value: 'Purchase Return', label: 'Purchase Return' },
  { value: 'Stock Adjustment', label: 'Stock Adjustment' },
  { value: 'Opening Stock', label: 'Opening Stock' },
  { value: 'Quotation', label: 'Quotation' },
  { value: 'Payment Voucher', label: 'Payment Voucher' },
  { value: 'Receipt Voucher', label: 'Receipt Voucher' },
  { value: 'Journal Entry', label: 'Journal Entry' },
  { value: 'User & Auth', label: 'User & Authentication' },
  { value: 'Backup & Restore', label: 'Backup & Restore' },
];

export const ACTION_OPTIONS = [
  { value: 'ALL', label: 'All Actions' },
  { value: 'Saved', label: 'Saved (Create)' },
  { value: 'Edited', label: 'Edited (Update)' },
  { value: 'Deleted', label: 'Deleted (Remove)' },
];

interface UserOption {
  _id: string;
  username: string;
  fullName?: string;
  role?: string;
}

const DEFAULT_EVENT_COLUMNS: ColumnDefinition[] = [
  { id: 'form', label: 'Form', defaultLabel: 'Form', width: 130, defaultWidth: 130, visible: true, align: 'left', sortable: true },
  { id: 'action', label: 'Action', defaultLabel: 'Action', width: 90, defaultWidth: 90, visible: true, align: 'center', sortable: true },
  { id: 'user', label: 'User', defaultLabel: 'User', width: 110, defaultWidth: 110, visible: true, align: 'left', sortable: true },
  { id: 'details', label: 'Details', defaultLabel: 'Details', width: 220, defaultWidth: 220, visible: true, align: 'left', sortable: true },
  { id: 'entryNo', label: 'Entry No', defaultLabel: 'Entry No', width: 110, defaultWidth: 110, visible: true, align: 'left', sortable: true },
  { id: 'voucherType', label: 'Voucher Type', defaultLabel: 'Voucher Type', width: 115, defaultWidth: 115, visible: true, align: 'left', sortable: true },
  { id: 'editedDate', label: 'Edited Date', defaultLabel: 'Edited Date', width: 100, defaultWidth: 100, visible: true, align: 'center', sortable: true },
  { id: 'editedTime', label: 'Edited Time', defaultLabel: 'Edited Time', width: 95, defaultWidth: 95, visible: true, align: 'center', sortable: true },
  { id: 'eventTime', label: 'Event Time', defaultLabel: 'Event Time', width: 95, defaultWidth: 95, visible: true, align: 'center', sortable: true },
  { id: 'oldAmount', label: 'Old Amount', defaultLabel: 'Old Amount', width: 105, defaultWidth: 105, visible: true, align: 'right', sortable: true },
  { id: 'newAmount', label: 'New Amount', defaultLabel: 'New Amount', width: 105, defaultWidth: 105, visible: true, align: 'right', sortable: true },
  { id: 'systemName', label: 'System Name', defaultLabel: 'System Name', width: 120, defaultWidth: 120, visible: true, align: 'left', sortable: true },
];

const EVENT_REPORT_COLUMNS_KEY = 'event_report_columns_custom_v1';

function getInitialEventColumns(): ColumnDefinition[] {
  try {
    const saved = localStorage.getItem(EVENT_REPORT_COLUMNS_KEY);
    if (saved) {
      const parsed: ColumnDefinition[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged: ColumnDefinition[] = [];
        const seen = new Set<string>();
        for (const col of parsed) {
          // If legacy 'salesType' ID was saved, migrate it to 'voucherType'
          const targetId = col.id === 'salesType' ? 'voucherType' : col.id;
          const def = DEFAULT_EVENT_COLUMNS.find((d) => d.id === targetId);
          if (def) {
            merged.push({
              ...def,
              label: col.id === 'salesType' ? 'Voucher Type' : (col.label || def.defaultLabel),
              width: typeof col.width === 'number' && col.width >= 20 ? col.width : def.defaultWidth,
              visible: typeof col.visible === 'boolean' ? col.visible : def.visible,
            });
            seen.add(targetId);
          }
        }
        for (const def of DEFAULT_EVENT_COLUMNS) {
          if (!seen.has(def.id)) {
            merged.push(def);
          }
        }
        return merged;
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_EVENT_COLUMNS;
}

export default function EventReport() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  // Column Arrangement Window (F5) State
  const [columns, setColumns] = useState<ColumnDefinition[]>(getInitialEventColumns);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);

  // Data states
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);

  // Filter States (Applied) - Defaults to ALL dates so events display immediately
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedForm, setSelectedForm] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter Window Modal States (Draft within dialog)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftFromDate, setDraftFromDate] = useState<string>('');
  const [draftToDate, setDraftToDate] = useState<string>('');
  const [draftForm, setDraftForm] = useState<string>('ALL');
  const [draftUser, setDraftUser] = useState<string>('ALL');
  const [draftAction, setDraftAction] = useState<string>('ALL');
  const [draftSearch, setDraftSearch] = useState<string>('');

  // Infinite Scroll & Progressive Batching
  const BATCH_LIMIT = 50;
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  const handleResetColumns = () => {
    setColumns(DEFAULT_EVENT_COLUMNS);
    try {
      localStorage.removeItem(EVENT_REPORT_COLUMNS_KEY);
    } catch {}
  };

  // Load User List for the User Combobox
  useEffect(() => {
    userApi
      .list(companyId || undefined)
      .then((res) => {
        if (res.data?.data && Array.isArray(res.data.data)) {
          setUsers(res.data.data as UserOption[]);
        }
      })
      .catch((err) => {
        console.error('Failed to load users:', err);
      });
  }, [companyId]);

  // Load Initial Audit Logs (resets list to screen-fit batch when filters change)
  const loadLogs = useCallback(() => {
    setLoading(true);
    loadingMoreRef.current = false;

    auditLogApi
      .list({
        companyId: companyId || undefined,
        form: selectedForm !== 'ALL' ? selectedForm : undefined,
        userId: selectedUser !== 'ALL' ? selectedUser : undefined,
        action: selectedAction !== 'ALL' ? selectedAction : undefined,
        search: searchQuery.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page: 1,
        limit: BATCH_LIMIT,
      })
      .then((res) => {
        const d = res.data?.data;
        setLogs(d?.logs ?? []);
        setTotal(d?.total ?? 0);
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollTop = 0;
        }
      })
      .catch((err) => {
        console.error('Failed to fetch event audit logs:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [companyId, selectedForm, selectedUser, selectedAction, searchQuery, fromDate, toDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Progressive Scroll: loads balance rows on demand as user scrolls down
  const loadMoreLogs = useCallback(() => {
    if (loading || loadingMoreRef.current) return;
    if (logs.length >= total) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const nextPage = Math.floor(logs.length / BATCH_LIMIT) + 1;

    auditLogApi
      .list({
        companyId: companyId || undefined,
        form: selectedForm !== 'ALL' ? selectedForm : undefined,
        userId: selectedUser !== 'ALL' ? selectedUser : undefined,
        action: selectedAction !== 'ALL' ? selectedAction : undefined,
        search: searchQuery.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page: nextPage,
        limit: BATCH_LIMIT,
      })
      .then((res) => {
        const newLogs = res.data?.data?.logs ?? [];
        if (newLogs.length > 0) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l._id));
            const filteredNew = newLogs.filter((l) => !existingIds.has(l._id));
            return [...prev, ...filteredNew];
          });
        }
        if (res.data?.data?.total !== undefined) {
          setTotal(res.data.data.total);
        }
      })
      .catch((err) => {
        console.error('Failed to load more audit logs:', err);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [companyId, loading, logs.length, total, selectedForm, selectedUser, selectedAction, searchQuery, fromDate, toDate]);

  // Progressive Table Scroll Handler
  const handleTableScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;
      if (scrollHeight - scrollTop - clientHeight < 250) {
        loadMoreLogs();
      }
    },
    [loadMoreLogs]
  );

  // Open Filter Dialog: sync drafts with current applied filters
  const handleOpenFilterModal = () => {
    setDraftFromDate(fromDate);
    setDraftToDate(toDate);
    setDraftForm(selectedForm);
    setDraftUser(selectedUser);
    setDraftAction(selectedAction);
    setDraftSearch(searchQuery);
    setIsFilterModalOpen(true);
  };

  // Close without applying
  const handleCloseFilterModal = () => {
    setIsFilterModalOpen(false);
  };

  // Apply filters from modal
  const handleApplyFilters = () => {
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    setSelectedForm(draftForm);
    setSelectedUser(draftUser);
    setSelectedAction(draftAction);
    setSearchQuery(draftSearch);
    setIsFilterModalOpen(false);
  };

  // Reset Draft Filters in modal
  const handleResetDraftFilters = () => {
    setDraftFromDate('');
    setDraftToDate('');
    setDraftForm('ALL');
    setDraftUser('ALL');
    setDraftAction('ALL');
    setDraftSearch('');
  };

  // Quick reset all filters
  const handleResetAllFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedForm('ALL');
    setSelectedUser('ALL');
    setSelectedAction('ALL');
    setSearchQuery('');
  };

  // Quick date presets
  const applyDatePreset = (preset: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'all') => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const cur = toISO(today);
      setFromDate(cur);
      setToDate(cur);
    } else if (preset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const str = toISO(yest);
      setFromDate(str);
      setToDate(str);
    } else if (preset === 'thisWeek') {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      startOfWeek.setDate(today.getDate() - day);
      setFromDate(toISO(startOfWeek));
      setToDate(toISO(today));
    } else if (preset === 'thisMonth') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(toISO(startOfMonth));
      setToDate(toISO(today));
    } else if (preset === 'all') {
      setFromDate('');
      setToDate('');
    }
  };

  // Count active filters (ignoring defaults)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedForm !== 'ALL') count++;
    if (selectedUser !== 'ALL') count++;
    if (selectedAction !== 'ALL') count++;
    if (searchQuery.trim()) count++;
    if (fromDate || toDate) count++;
    return count;
  }, [selectedForm, selectedUser, selectedAction, searchQuery, fromDate, toDate]);

  // Derived KPI metrics
  const summaryMetrics = useMemo(() => {
    let savedCount = 0;
    let editedCount = 0;
    let deletedCount = 0;
    let netDifference = 0;

    logs.forEach((l) => {
      const act = (l.action || '').toLowerCase();
      if (act === 'saved' || act === 'create') savedCount++;
      else if (act === 'edited' || act === 'update') editedCount++;
      else if (act === 'deleted' || act === 'delete') deletedCount++;

      const oldVal = l.oldAmount ?? (l.before?.grandTotal as number) ?? 0;
      const newVal = l.newAmount ?? (l.after?.grandTotal as number) ?? 0;
      if (newVal || oldVal) {
        netDifference += newVal - oldVal;
      }
    });

    return {
      savedCount,
      editedCount,
      deletedCount,
      netDifference,
    };
  }, [logs]);

  // Normalize Action for display & pill styling
  const getActionBadge = (action: string) => {
    const act = (action || '').toLowerCase();
    if (act === 'saved' || act === 'create') {
      return (
        <Chip
          icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#10b981 !important' }} />}
          label="Saved"
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: '0.72rem',
            bgcolor: '#ecfdf5',
            color: '#047857',
            border: '1px solid #a7f3d0',
            height: '24px',
          }}
        />
      );
    }
    if (act === 'edited' || act === 'update') {
      return (
        <Chip
          icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#f59e0b !important' }} />}
          label="Edited"
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: '0.72rem',
            bgcolor: '#fffbeb',
            color: '#b45309',
            border: '1px solid #fde68a',
            height: '24px',
          }}
        />
      );
    }
    if (act === 'deleted' || act === 'delete') {
      return (
        <Chip
          icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#f43f5e !important' }} />}
          label="Deleted"
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: '0.72rem',
            bgcolor: '#fff1f2',
            color: '#be123c',
            border: '1px solid #fecdd3',
            height: '24px',
          }}
        />
      );
    }
    return (
      <Chip
        label={action || 'Event'}
        size="small"
        sx={{
          fontWeight: 600,
          fontSize: '0.72rem',
          bgcolor: '#f1f5f9',
          color: '#475569',
          border: '1px solid #cbd5e1',
          height: '24px',
        }}
      />
    );
  };

  // Helper to extract display values safely from log item
  const getRowValues = (l: AuditLogItem) => {
    // 1. Form
    const form = l.form || l.entityType || 'Sales Invoice';

    // 2. Action (rendered via badge)
    const action = l.action;

    // 3. User
    const userObj = typeof l.userId === 'object' && l.userId ? l.userId : null;
    const userName = userObj?.fullName || userObj?.username || (typeof l.userId === 'string' ? l.userId : 'admin');

    // 4. Details
    const details = l.details || (l.action + ' on ' + (l.form || l.entityType));

    // 5. Entry No
    const entryNo = l.entryNo || l.entityId || '-';

    // 6. Voucher Type (renamed from Sales Type)
    const voucherType =
      l.voucherType ||
      l.salesType ||
      (l.before?.voucherType as string) ||
      (l.after?.voucherType as string) ||
      (l.before?.salesType as string) ||
      (l.after?.salesType as string) ||
      '-';

    // 7. Edited Date
    const timestampDate = l.timestamp ? new Date(l.timestamp) : null;
    const editedDate =
      l.editedDate ||
      (timestampDate && !isNaN(timestampDate.getTime())
        ? formatDateDisplay(timestampDate)
        : '-');

    // 8. Edited Time
    const editedTime =
      l.editedTime ||
      (timestampDate && !isNaN(timestampDate.getTime())
        ? timestampDate.toLocaleTimeString('en-GB')
        : '-');

    // 9. Event Time
    const eventTime =
      l.eventTime ||
      (timestampDate && !isNaN(timestampDate.getTime())
        ? timestampDate.toLocaleTimeString('en-GB')
        : '-');

    // 10. Old Amount
    const oldAmount =
      l.oldAmount ??
      (l.before?.grandTotal as number) ??
      (l.before?.total as number) ??
      (l.before?.amount as number) ??
      null;

    // 11. New Amount
    const newAmount =
      l.newAmount ??
      (l.after?.grandTotal as number) ??
      (l.after?.total as number) ??
      (l.after?.amount as number) ??
      null;

    // 12. System Name
    const systemName = l.systemName || l.ip || 'POS-TERM-01';

    return {
      form,
      action,
      userName,
      details,
      entryNo,
      voucherType,
      editedDate,
      editedTime,
      eventTime,
      oldAmount,
      newAmount,
      systemName,
    };
  };

  // Export to CSV respecting visible columns & custom labels
  const handleExportCSV = async () => {
    let exportLogs = logs;
    if (total > logs.length) {
      try {
        setLoading(true);
        const res = await auditLogApi.list({
          companyId: companyId || undefined,
          form: selectedForm !== 'ALL' ? selectedForm : undefined,
          userId: selectedUser !== 'ALL' ? selectedUser : undefined,
          action: selectedAction !== 'ALL' ? selectedAction : undefined,
          search: searchQuery.trim() || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          page: 1,
          limit: Math.min(total, 5000),
        });
        exportLogs = res.data?.data?.logs ?? logs;
      } catch (err) {
        console.error('Failed to fetch full export logs:', err);
      } finally {
        setLoading(false);
      }
    }

    if (!exportLogs.length) return;

    const visibleCols = columns.filter((c) => c.visible);
    const headers = visibleCols.map((c) => c.label);

    const csvRows = exportLogs.map((l) => {
      const v = getRowValues(l);
      return visibleCols
        .map((col) => {
          let val = '';
          switch (col.id) {
            case 'form':
              val = v.form;
              break;
            case 'action':
              val = v.action;
              break;
            case 'user':
              val = v.userName;
              break;
            case 'details':
              val = v.details;
              break;
            case 'entryNo':
              val = v.entryNo;
              break;
            case 'voucherType':
              val = v.voucherType;
              break;
            case 'editedDate':
              val = v.editedDate;
              break;
            case 'editedTime':
              val = v.editedTime;
              break;
            case 'eventTime':
              val = v.eventTime;
              break;
            case 'oldAmount':
              val = v.oldAmount !== null ? v.oldAmount.toFixed(2) : '';
              break;
            case 'newAmount':
              val = v.newAmount !== null ? v.newAmount.toFixed(2) : '';
              break;
            case 'systemName':
              val = v.systemName;
              break;
            default:
              val = '';
          }
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',');
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Event_Report_AuditLog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const tableMinWidth = useMemo(() => {
    const sum = visibleColumns.reduce((acc, c) => acc + (c.width || 100), 0);
    return Math.max(sum, 1100);
  }, [visibleColumns]);

  // Render individual cells based on column configuration
  const renderCellContent = (
    col: ColumnDefinition,
    row: ReturnType<typeof getRowValues>,
    hasVariance: boolean
  ) => {
    switch (col.id) {
      case 'form':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'left'}
            sx={{ width: col.width, minWidth: col.width, fontWeight: 600, color: '#0f172a' }}
          >
            {row.form}
          </TableCell>
        );

      case 'action':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'center'}
            sx={{ width: col.width, minWidth: col.width, textAlign: col.align || 'center' }}
          >
            {getActionBadge(row.action)}
          </TableCell>
        );

      case 'user':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'left'}
            sx={{ width: col.width, minWidth: col.width, color: '#334155' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  bgcolor: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: '#475569',
                }}
              >
                {row.userName.charAt(0).toUpperCase()}
              </Box>
              <span>{row.userName}</span>
            </Box>
          </TableCell>
        );

      case 'details':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'left'}
            sx={{ width: col.width, minWidth: col.width, color: '#334155', maxWidth: col.width }}
          >
            <Tooltip title={row.details}>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.78rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {row.details}
              </Typography>
            </Tooltip>
          </TableCell>
        );

      case 'entryNo':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'left'}
            sx={{ width: col.width, minWidth: col.width }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600,
                fontSize: '0.74rem',
                bgcolor: '#f1f5f9',
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                color: '#0f172a',
              }}
            >
              {row.entryNo}
            </Typography>
          </TableCell>
        );

      case 'voucherType':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'left'}
            sx={{ width: col.width, minWidth: col.width, color: '#334155' }}
          >
            <Chip
              label={row.voucherType}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 600,
                bgcolor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
              }}
            />
          </TableCell>
        );

      case 'editedDate':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'center'}
            sx={{
              width: col.width,
              minWidth: col.width,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.76rem',
              color: '#334155',
              textAlign: col.align || 'center',
            }}
          >
            {row.editedDate}
          </TableCell>
        );

      case 'editedTime':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'center'}
            sx={{
              width: col.width,
              minWidth: col.width,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.76rem',
              color: '#64748b',
              textAlign: col.align || 'center',
            }}
          >
            {row.editedTime}
          </TableCell>
        );

      case 'eventTime':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'center'}
            sx={{
              width: col.width,
              minWidth: col.width,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.76rem',
              fontWeight: 600,
              color: '#3525cd',
              bgcolor: '#faf8ff',
              textAlign: col.align || 'center',
            }}
          >
            {row.eventTime}
          </TableCell>
        );

      case 'oldAmount':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'right'}
            sx={{
              width: col.width,
              minWidth: col.width,
              textAlign: 'right',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.78rem',
              color: hasVariance ? '#94a3b8' : '#64748b',
              textDecoration: hasVariance ? 'line-through' : 'none',
            }}
          >
            {formatAED(row.oldAmount)}
          </TableCell>
        );

      case 'newAmount':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'right'}
            sx={{
              width: col.width,
              minWidth: col.width,
              textAlign: 'right',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.78rem',
              fontWeight: hasVariance ? 700 : 600,
              color: hasVariance ? '#047857' : '#0f172a',
            }}
          >
            {formatAED(row.newAmount)}
          </TableCell>
        );

      case 'systemName':
        return (
          <TableCell
            key={col.id}
            align={col.align || 'left'}
            sx={{ width: col.width, minWidth: col.width }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.73rem',
                color: '#64748b',
              }}
            >
              {row.systemName}
            </Typography>
          </TableCell>
        );

      default:
        return (
          <TableCell key={col.id} align={col.align || 'left'} sx={{ width: col.width, minWidth: col.width }}>
            -
          </TableCell>
        );
    }
  };

  return (
    <Box
      sx={{
        p: { xs: 1, sm: 1.5 },
        height: 'calc(100vh - 65px)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        maxWidth: '100%',
        mx: 'auto',
      }}
    >
      {/* Top Header & Breadcrumb */}
      <Box sx={{ mb: 1, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: '#64748b', fontSize: '0.72rem', mb: 0.25 }}>
          <span>Reports</span>
          <span>&gt;</span>
          <span>Audit &amp; Security</span>
          <span>&gt;</span>
          <span style={{ color: '#3525cd', fontWeight: 600 }}>Event Report List</span>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', fontSize: '1.12rem' }}>
              Event Report (Audit Log &amp; Activity Tracking)
            </Typography>
            <Chip
              icon={<FiberManualRecordIcon sx={{ fontSize: '9px !important', color: '#10b981 !important' }} />}
              label="Real-time System Audit"
              size="small"
              sx={{
                bgcolor: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0',
                fontWeight: 600,
                fontSize: '0.68rem',
                height: 20,
                display: { xs: 'none', md: 'flex' },
              }}
            />
          </Box>

          {/* Action Toolbar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Tooltip title="Arrange columns width, order & visibility (F5)">
              <Button
                variant="outlined"
                size="small"
                startIcon={<ViewColumnIcon sx={{ fontSize: 16, color: '#3525cd' }} />}
                onClick={() => setColumnManagerOpen(true)}
                sx={{
                  borderColor: '#cbd5e1',
                  color: '#1e293b',
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: '#3525cd', bgcolor: '#f5f3ff' },
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: '6px',
                  py: 0.4,
                  px: 1.25,
                  fontSize: '0.78rem',
                }}
              >
                Columns (F5)
              </Button>
            </Tooltip>

            <Button
              variant="contained"
              size="small"
              startIcon={<FilterAltIcon sx={{ fontSize: 16 }} />}
              onClick={handleOpenFilterModal}
              sx={{
                bgcolor: '#3525cd',
                '&:hover': { bgcolor: '#2a1da6' },
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '6px',
                py: 0.4,
                px: 1.5,
                fontSize: '0.78rem',
                boxShadow: '0 2px 4px rgba(53, 37, 205, 0.2)',
              }}
            >
              Filter Window {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Button>

            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              sx={{
                borderColor: '#cbd5e1',
                color: '#334155',
                bgcolor: '#ffffff',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '6px',
                py: 0.4,
                px: 1.25,
                fontSize: '0.78rem',
              }}
            >
              Export CSV
            </Button>

            <Button
              variant="outlined"
              size="small"
              startIcon={<PrintIcon sx={{ fontSize: 16 }} />}
              onClick={handlePrint}
              disabled={logs.length === 0}
              sx={{
                borderColor: '#cbd5e1',
                color: '#334155',
                bgcolor: '#ffffff',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '6px',
                py: 0.4,
                px: 1.25,
                fontSize: '0.78rem',
              }}
            >
              Print
            </Button>

            <Tooltip title="Refresh event list">
              <IconButton
                size="small"
                onClick={loadLogs}
                disabled={loading}
                sx={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  bgcolor: '#ffffff',
                  color: '#475569',
                  p: '5px',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                <RefreshIcon sx={{ fontSize: 18, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* KPI Cards Row (Ultra-compact screen-fit design) */}
      <Grid container spacing={1} sx={{ mb: 1, flexShrink: 0 }}>
        {/* 1. Total Events */}
        <Grid item xs={6} sm={4} md={2.4}>
          <Card
            elevation={0}
            sx={{
              p: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>
                Total Events
              </Typography>
              <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.2, mt: 0.2 }}>
                {total.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ width: 26, height: 26, borderRadius: '6px', bgcolor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HistoryIcon sx={{ fontSize: 15, color: '#3525cd' }} />
            </Box>
          </Card>
        </Grid>

        {/* 2. Saved (Created) */}
        <Grid item xs={6} sm={4} md={2.4}>
          <Card
            elevation={0}
            sx={{
              p: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #a7f3d0',
              bgcolor: '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>
                Saved (Created)
              </Typography>
              <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#047857', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.2, mt: 0.2 }}>
                {summaryMetrics.savedCount.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ width: 26, height: 26, borderRadius: '6px', bgcolor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FiberManualRecordIcon sx={{ fontSize: 10, color: '#10b981' }} />
            </Box>
          </Card>
        </Grid>

        {/* 3. Edited (Updated) */}
        <Grid item xs={6} sm={4} md={2.4}>
          <Card
            elevation={0}
            sx={{
              p: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #fde68a',
              bgcolor: '#fffdf0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>
                Edited (Updated)
              </Typography>
              <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#b45309', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.2, mt: 0.2 }}>
                {summaryMetrics.editedCount.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ width: 26, height: 26, borderRadius: '6px', bgcolor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FiberManualRecordIcon sx={{ fontSize: 10, color: '#f59e0b' }} />
            </Box>
          </Card>
        </Grid>

        {/* 4. Deleted (Removed) */}
        <Grid item xs={6} sm={4} md={2.4}>
          <Card
            elevation={0}
            sx={{
              p: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #fecdd3',
              bgcolor: '#fff5f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>
                Deleted (Removed)
              </Typography>
              <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#be123c', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.2, mt: 0.2 }}>
                {summaryMetrics.deletedCount.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ width: 26, height: 26, borderRadius: '6px', bgcolor: '#ffe4e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FiberManualRecordIcon sx={{ fontSize: 10, color: '#f43f5e' }} />
            </Box>
          </Card>
        </Grid>

        {/* 5. Net Value Impact */}
        <Grid item xs={12} sm={4} md={2.4}>
          <Card
            elevation={0}
            sx={{
              p: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>
                Net Value Impact
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: summaryMetrics.netDifference >= 0 ? '#0f172a' : '#be123c',
                  fontFamily: 'JetBrains Mono, monospace',
                  lineHeight: 1.2,
                  mt: 0.2,
                }}
              >
                {formatAED(summaryMetrics.netDifference)}
              </Typography>
            </Box>
            <Box sx={{ width: 26, height: 26, borderRadius: '6px', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SecurityIcon sx={{ fontSize: 15, color: '#64748b' }} />
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Search & Date Preset Chips Bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          px: 1.25,
          py: 0.6,
          mb: 1,
          bgcolor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search Entry No, Details, System, Voucher Type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                loadLogs();
              }
            }}
            sx={{
              minWidth: { xs: 200, sm: 280 },
              '& .MuiOutlinedInput-root': {
                borderRadius: '6px',
                bgcolor: '#f8fafc',
                height: '30px',
                fontSize: '0.78rem',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: '#64748b' }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSearchQuery('');
                    }}
                    sx={{ p: '2px' }}
                  >
                    <ClearIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {/* Date presets */}
          <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.5 }}>
            <Button
              size="small"
              onClick={() => applyDatePreset('all')}
              sx={{
                textTransform: 'none',
                borderRadius: '4px',
                fontSize: '0.72rem',
                color: !fromDate && !toDate ? '#3525cd' : '#475569',
                bgcolor: !fromDate && !toDate ? '#e0e7ff' : 'transparent',
                fontWeight: !fromDate && !toDate ? 700 : 500,
                py: 0.2,
                px: 0.8,
                height: 26,
              }}
            >
              All Dates
            </Button>
            <Button
              size="small"
              onClick={() => applyDatePreset('today')}
              sx={{ textTransform: 'none', borderRadius: '4px', fontSize: '0.72rem', color: '#475569', py: 0.2, px: 0.8, height: 26 }}
            >
              Today
            </Button>
            <Button
              size="small"
              onClick={() => applyDatePreset('yesterday')}
              sx={{ textTransform: 'none', borderRadius: '4px', fontSize: '0.72rem', color: '#475569', py: 0.2, px: 0.8, height: 26 }}
            >
              Yesterday
            </Button>
            <Button
              size="small"
              onClick={() => applyDatePreset('thisWeek')}
              sx={{ textTransform: 'none', borderRadius: '4px', fontSize: '0.72rem', color: '#475569', py: 0.2, px: 0.8, height: 26 }}
            >
              This Week
            </Button>
            <Button
              size="small"
              onClick={() => applyDatePreset('thisMonth')}
              sx={{ textTransform: 'none', borderRadius: '4px', fontSize: '0.72rem', color: '#475569', py: 0.2, px: 0.8, height: 26 }}
            >
              This Month
            </Button>
          </Box>
        </Box>

        {/* Active Filters Display */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {selectedForm !== 'ALL' && (
            <Chip
              label={`Form: ${selectedForm}`}
              size="small"
              onDelete={() => setSelectedForm('ALL')}
              sx={{ bgcolor: '#e0e7ff', color: '#3730a3', fontWeight: 600, height: 22, fontSize: '0.7rem' }}
            />
          )}
          {selectedUser !== 'ALL' && (
            <Chip
              label={`User: ${users.find((u) => u._id === selectedUser)?.username || selectedUser}`}
              size="small"
              onDelete={() => setSelectedUser('ALL')}
              sx={{ bgcolor: '#e0e7ff', color: '#3730a3', fontWeight: 600, height: 22, fontSize: '0.7rem' }}
            />
          )}
          {selectedAction !== 'ALL' && (
            <Chip
              label={`Action: ${selectedAction}`}
              size="small"
              onDelete={() => setSelectedAction('ALL')}
              sx={{ bgcolor: '#e0e7ff', color: '#3730a3', fontWeight: 600, height: 22, fontSize: '0.7rem' }}
            />
          )}
          {(fromDate || toDate) && (
            <Chip
              label={`Date: ${fromDate || 'Start'} to ${toDate || 'End'}`}
              size="small"
              onDelete={() => {
                setFromDate('');
                setToDate('');
              }}
              sx={{ bgcolor: '#e0e7ff', color: '#3730a3', fontWeight: 600, height: 22, fontSize: '0.7rem' }}
            />
          )}
          {activeFilterCount > 0 && (
            <Button
              size="small"
              onClick={handleResetAllFilters}
              sx={{ textTransform: 'none', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, py: 0.2, px: 0.8, height: 24 }}
            >
              Reset All
            </Button>
          )}
        </Box>
      </Box>

      {/* Main Table Container: Dynamic Column Manager Integration (F5) */}
      <TableContainer
        ref={tableContainerRef}
        onScroll={handleTableScroll}
        component={Paper}
        elevation={0}
        sx={{
          flex: 1,
          minHeight: 0,
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          overflow: 'auto',
          bgcolor: '#ffffff',
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow
              sx={{
                '& th': {
                  bgcolor: '#f8fafc',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                  color: '#475569',
                  py: 0.9,
                  borderBottom: '1px solid #cbd5e1',
                  borderRight: '1px solid #e2e8f0',
                },
              }}
            >
              {visibleColumns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align || 'left'}
                  sx={{
                    width: col.width,
                    minWidth: col.width,
                    maxWidth: col.width,
                    textAlign: col.align || 'left',
                    ...(col.id === 'eventTime' ? { bgcolor: '#f1f5f9 !important', color: '#1e293b' } : {}),
                  }}
                >
                  {col.id === 'eventTime' ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <span>{col.label}</span>
                      <Tooltip title="High-precision system audit execution time">
                        <FiberManualRecordIcon sx={{ fontSize: 7, color: '#3525cd' }} />
                      </Tooltip>
                    </Box>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {loading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 6 }}>
                  <CircularProgress size={32} sx={{ color: '#3525cd', mb: 1 }} />
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    Loading audit events...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 8 }}>
                  <HistoryIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#475569' }}>
                    No audit log records found
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
                    Try selecting &quot;All Dates&quot; or clearing your filter criteria in the Filter Window.
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleResetAllFilters}
                    sx={{ textTransform: 'none', borderRadius: '6px' }}
                  >
                    Clear Filters
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log, idx) => {
                const row = getRowValues(log);
                const hasVariance =
                  row.oldAmount !== null && row.newAmount !== null && row.oldAmount !== row.newAmount;

                return (
                  <TableRow
                    key={log._id || idx}
                    hover
                    sx={{
                      '&:nth-of-type(even)': { bgcolor: '#fcfcfd' },
                      '& td': { fontSize: '0.78rem', py: 0.65, borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f8fafc' },
                    }}
                  >
                    {visibleColumns.map((col) => renderCellContent(col, row, hasVariance))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Streamlined Footer Status Bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1.25,
          py: 0.5,
          bgcolor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          mt: 0.75,
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155' }}>
            Showing {logs.length.toLocaleString()} of {total.toLocaleString()} audit events
          </Typography>
          {logs.length < total && (
            <Chip
              label={loadingMore ? 'Loading more...' : 'Scroll down to show balance rows'}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.62rem',
                bgcolor: loadingMore ? '#e0e7ff' : '#f1f5f9',
                color: loadingMore ? '#3525cd' : '#64748b',
                fontWeight: 600,
              }}
            />
          )}
          {loadingMore && <CircularProgress size={13} sx={{ color: '#3525cd' }} />}
        </Box>

        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
          {logs.length >= total && total > 0 ? 'All events loaded' : ''}
        </Typography>
      </Box>

      {/* ============================================================ */}
      {/* FILTER WINDOW MODAL DIALOG                                   */}
      {/* ============================================================ */}
      <Dialog
        open={isFilterModalOpen}
        onClose={handleCloseFilterModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15)',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterAltIcon sx={{ color: '#3525cd' }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Filter Event Log
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleCloseFilterModal}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2, pb: 2.5 }}>
          <Grid container spacing={2}>
            {/* 1. COMBOBOX: Select Form (Entry Windows) */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel id="select-form-label" sx={{ fontWeight: 600 }}>
                  Select Form (Entry Window)
                </InputLabel>
                <Select
                  labelId="select-form-label"
                  value={draftForm}
                  label="Select Form (Entry Window)"
                  onChange={(e) => setDraftForm(e.target.value)}
                  sx={{ borderRadius: '8px' }}
                >
                  {ENTRY_FORM_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* 2. COMBOBOX: Select User */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="select-user-label" sx={{ fontWeight: 600 }}>
                  Select User
                </InputLabel>
                <Select
                  labelId="select-user-label"
                  value={draftUser}
                  label="Select User"
                  onChange={(e) => setDraftUser(e.target.value)}
                  sx={{ borderRadius: '8px' }}
                >
                  <MenuItem value="ALL">All Users</MenuItem>
                  {users.map((u) => (
                    <MenuItem key={u._id} value={u._id}>
                      {u.fullName ? `${u.fullName} (${u.username})` : u.username}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* 3. COMBOBOX: Select Action (Saved, Edited, Deleted) */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="select-action-label" sx={{ fontWeight: 600 }}>
                  Select Action
                </InputLabel>
                <Select
                  labelId="select-action-label"
                  value={draftAction}
                  label="Select Action"
                  onChange={(e) => setDraftAction(e.target.value)}
                  sx={{ borderRadius: '8px' }}
                >
                  {ACTION_OPTIONS.map((act) => (
                    <MenuItem key={act.value} value={act.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {act.value === 'Saved' && <FiberManualRecordIcon sx={{ fontSize: 10, color: '#10b981' }} />}
                        {act.value === 'Edited' && <FiberManualRecordIcon sx={{ fontSize: 10, color: '#f59e0b' }} />}
                        {act.value === 'Deleted' && <FiberManualRecordIcon sx={{ fontSize: 10, color: '#f43f5e' }} />}
                        <span>{act.label}</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Date Range: From Date & To Date */}
            <Grid item xs={12} sm={6}>
              <DateInput
                label="From Date"
                value={draftFromDate}
                onChange={setDraftFromDate}
                size="small"
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DateInput
                label="To Date"
                value={draftToDate}
                onChange={setDraftToDate}
                size="small"
                fullWidth
              />
            </Grid>

            {/* Keyword / Entry No Search */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Entry No or Details Keyword"
                placeholder="e.g. INV-2026, milk price, ADJ-..."
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="text"
            onClick={handleResetDraftFilters}
            sx={{ textTransform: 'none', color: '#64748b', fontWeight: 600 }}
          >
            Reset Defaults
          </Button>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={handleCloseFilterModal}
              sx={{ textTransform: 'none', borderRadius: '8px', color: '#475569', borderColor: '#cbd5e1' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleApplyFilters}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                bgcolor: '#3525cd',
                '&:hover': { bgcolor: '#2a1da6' },
                fontWeight: 600,
                px: 2.5,
              }}
            >
              Apply Filter
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/* COLUMN MANAGER DRAWER (F5 SHORTCUT AS IN STOCK REPORT)        */}
      {/* ============================================================ */}
      <ColumnManagerDrawer
        open={columnManagerOpen}
        onClose={() => setColumnManagerOpen(false)}
        columns={columns}
        onColumnsChange={setColumns}
        onResetDefaults={handleResetColumns}
        storageKey={EVENT_REPORT_COLUMNS_KEY}
      />
    </Box>
  );
}
