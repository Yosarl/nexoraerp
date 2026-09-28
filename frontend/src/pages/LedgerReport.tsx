import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
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
  Autocomplete,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Chip,
  IconButton,
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
  CheckCircle as CheckCircleIcon,
  UnfoldMore as UnfoldMoreIcon,
  UnfoldLess as UnfoldLessIcon,
  WarningAmber as WarningAmberIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { ledgerApi, ledgerAccountApi } from '../services/api';

interface LedgerTransaction {
  date: string;
  voucherNo?: string;
  entryName: string;
  particulars: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  balanceIsDebit: boolean;
  narration?: string;
  isInvoice?: boolean;
  settlements?: Array<{ billNumber: string; amount: number }>;
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  bankDate?: string;
  isReconciled?: boolean;
  chequeNumber?: string;
}

interface GroupedTransactionRow {
  date: string;
  voucherNo?: string;
  entryName: string;
  particulars: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  balanceIsDebit: boolean;
  narration?: string;
  isInvoiceRow?: boolean;
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  chequeNumber?: string;
}

interface InvoiceGroup {
  key: string;
  invoiceNo: string;
  invoiceDate?: string;
  isInvoiceGroup: boolean;
  transactions: GroupedTransactionRow[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  netIsDebit: boolean;
  isSettled: boolean;
}

const formatDateDisplay = (dateStr?: string | Date) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
};

function cleanUserNarration(rawNarration?: string, invoiceNo?: string, voucherNo?: string): string {
  if (!rawNarration) return '';
  const trimmed = rawNarration.trim();
  if (!trimmed || trimmed === '-') return '';

  // 1. Sales & POS patterns (e.g. B2C-..., POS ..., B2C Sale ..., B2C ... - Sale, etc.)
  if (/^(B2C|POS)(\s+Sale)?(\s+.*)?$/i.test(trimmed)) return '';
  if (/^Sales(\s+Return)?(\s+.*)?$/i.test(trimmed)) return '';

  // 2. Purchase patterns (e.g. Purchase ..., Purchase Return ...)
  if (/^Purchase(\s+Return)?(\s+.*)?$/i.test(trimmed)) return '';

  // 3. Voucher system patterns (e.g. Payment to ..., Receipt from ..., Payment via ..., Payment against ...)
  if (/^(Payment|Receipt)\s+(to|from|via|against)\b/i.test(trimmed)) return '';
  if (/^(Payment|Receipt|Journal|Sales|Purchase|Opening|ChequePayment|ChequeReceipt)\s+Voucher\b/i.test(trimmed)) return '';

  // 4. Stock, inventory, opening, and rounding
  if (/^(Opening\s+(Stock|Balance)|Stock\s+Adjustment|Damage\s*\/?\s*Wastage)\b/i.test(trimmed)) return '';
  if (/^(Rounding\s+Adjustment|Round(\s+Off)?)$/i.test(trimmed)) return '';

  // 5. Code / invoice / voucher number patterns (e.g. B2C-000003, PV-00001, etc.)
  if (/^[A-Z]{1,5}-[0-9]{3,8}$/i.test(trimmed)) return '';

  // 6. Match specific context numbers
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

function groupTransactionsByAgainstRef(transactions: LedgerTransaction[]): InvoiceGroup[] {
  const groupsMap = new Map<string, InvoiceGroup>();

  const getOrCreateGroup = (
    key: string,
    invoiceNo: string,
    isInvoiceGroup: boolean,
    invoiceDate?: string
  ): InvoiceGroup => {
    const cleanKey = key.toUpperCase().trim();
    let group = groupsMap.get(cleanKey);
    if (!group) {
      group = {
        key: cleanKey,
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        isInvoiceGroup,
        transactions: [],
        totalDebit: 0,
        totalCredit: 0,
        netBalance: 0,
        netIsDebit: true,
        isSettled: false,
      };
      groupsMap.set(cleanKey, group);
    } else if (invoiceDate && !group.invoiceDate) {
      group.invoiceDate = invoiceDate;
    }
    return group;
  };

  const isInvoiceTx = (t: LedgerTransaction): boolean => {
    if (t.isInvoice === true) return true;
    const entry = (t.entryName || '').toLowerCase();
    if (entry === 'sales' || entry.startsWith('sales ') || entry === 'purchase' || entry.startsWith('purchase ')) {
      return true;
    }
    const vNo = (t.voucherNo || '').toUpperCase();
    if (/^(B2C|INV|PUR|PURV|POS)-\d+/i.test(vNo)) {
      return true;
    }
    return false;
  };

  // 1. Group primary invoices
  for (const t of transactions) {
    if (isInvoiceTx(t)) {
      const invNo = t.voucherNo || t.reference || 'INVOICE';
      const group = getOrCreateGroup(invNo, invNo, true, t.date);
      group.transactions.push({
        date: t.date,
        voucherNo: t.voucherNo,
        entryName: t.entryName,
        particulars: t.particulars,
        reference: t.reference && t.reference !== '-' ? t.reference : '-',
        debit: t.debit,
        credit: t.credit,
        balance: 0,
        balanceIsDebit: true,
        narration: t.narration,
        isInvoiceRow: true,
        chequeStatus: t.chequeStatus,
        chequeNumber: t.chequeNumber,
      });
    }
  }

  // 2. Group payments / receipts / settlements
  for (const t of transactions) {
    if (isInvoiceTx(t)) continue;

    if (t.settlements && t.settlements.length > 0) {
      for (const s of t.settlements) {
        const group = getOrCreateGroup(s.billNumber, s.billNumber, true);
        const isDr = t.debit > 0;
        group.transactions.push({
          date: t.date,
          voucherNo: t.voucherNo,
          entryName: t.entryName,
          particulars: t.particulars,
          reference: s.billNumber,
          debit: isDr ? s.amount : 0,
          credit: !isDr ? s.amount : 0,
          balance: 0,
          balanceIsDebit: true,
          narration: t.narration,
          isInvoiceRow: false,
          chequeStatus: t.chequeStatus,
          chequeNumber: t.chequeNumber,
        });
      }
    } else {
      const rawRef = (t.reference || '').trim();
      const hasRef = rawRef && rawRef !== '-';

      if (hasRef) {
        const refs = rawRef.split(',').map((r) => r.trim()).filter(Boolean);
        if (refs.length === 1) {
          const group = getOrCreateGroup(refs[0], refs[0], true);
          group.transactions.push({
            date: t.date,
            voucherNo: t.voucherNo,
            entryName: t.entryName,
            particulars: t.particulars,
            reference: refs[0],
            debit: t.debit,
            credit: t.credit,
            balance: 0,
            balanceIsDebit: true,
            narration: t.narration,
            isInvoiceRow: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
          });
        } else {
          const matchedGroup = refs.map((r) => groupsMap.get(r.toUpperCase())).find(Boolean);
          const targetKey = matchedGroup ? matchedGroup.key : refs[0];
          const group = getOrCreateGroup(targetKey, targetKey, true);
          group.transactions.push({
            date: t.date,
            voucherNo: t.voucherNo,
            entryName: t.entryName,
            particulars: t.particulars,
            reference: rawRef,
            debit: t.debit,
            credit: t.credit,
            balance: 0,
            balanceIsDebit: true,
            narration: t.narration,
            isInvoiceRow: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
          });
        }
      } else {
        // Check if narration mentions an existing invoice key
        const narrationText = (t.narration || '').toUpperCase();
        let matchedKey: string | undefined;
        for (const [key] of groupsMap.entries()) {
          if (key !== '__ON_ACCOUNT__' && narrationText.includes(key)) {
            matchedKey = key;
            break;
          }
        }

        if (matchedKey) {
          const group = groupsMap.get(matchedKey)!;
          group.transactions.push({
            date: t.date,
            voucherNo: t.voucherNo,
            entryName: t.entryName,
            particulars: t.particulars,
            reference: group.invoiceNo,
            debit: t.debit,
            credit: t.credit,
            balance: 0,
            balanceIsDebit: true,
            narration: t.narration,
            isInvoiceRow: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
          });
        } else {
          const onAccountGroup = getOrCreateGroup('__ON_ACCOUNT__', 'On Account / Other', false);
          onAccountGroup.transactions.push({
            date: t.date,
            voucherNo: t.voucherNo,
            entryName: t.entryName,
            particulars: t.particulars,
            reference: '-',
            debit: t.debit,
            credit: t.credit,
            balance: 0,
            balanceIsDebit: true,
            narration: t.narration,
            isInvoiceRow: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
          });
        }
      }
    }
  }

  // 3. Compute running balances and subtotals within each group
  const groupsList = Array.from(groupsMap.values());

  for (const group of groupsList) {
    group.transactions.sort((a, b) => {
      if (a.isInvoiceRow && !b.isInvoiceRow) return -1;
      if (!a.isInvoiceRow && b.isInvoiceRow) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    let running = 0;
    let sumDebit = 0;
    let sumCredit = 0;

    for (const row of group.transactions) {
      sumDebit += row.debit;
      sumCredit += row.credit;
      const isCheque = Boolean(
        row.entryName?.includes('Cheque') ||
        (row.chequeNumber && row.chequeNumber !== '-') ||
        row.chequeStatus === 'BOUNCED' ||
        (row.chequeStatus === 'PENDING' && !row.isInvoiceRow && !row.entryName?.toLowerCase().includes('sales') && !row.entryName?.toLowerCase().includes('purchase'))
      );
      const isPending = isCheque && row.chequeStatus === 'PENDING';
      const isBounced = isCheque && row.chequeStatus === 'BOUNCED';
      if (!isPending && !isBounced) {
        running += row.debit - row.credit;
      }
      row.balance = Math.abs(running);
      row.balanceIsDebit = running >= 0;
    }

    group.totalDebit = sumDebit;
    group.totalCredit = sumCredit;
    group.netBalance = Math.abs(running);
    group.netIsDebit = running >= 0;
    group.isSettled = Math.abs(running) < 0.005;
  }

  // 4. Sort groups: invoices first (by invoiceDate / first transaction), On Account at end
  groupsList.sort((a, b) => {
    if (!a.isInvoiceGroup) return 1;
    if (!b.isInvoiceGroup) return -1;

    const dateA = a.invoiceDate || a.transactions[0]?.date || '';
    const dateB = b.invoiceDate || b.transactions[0]?.date || '';
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  return groupsList;
}

interface LedgerReportData {
  openingBalance: number;
  openingIsDebit: boolean;
  transactions: LedgerTransaction[];
  closingBalance: number;
  closingIsDebit: boolean;
  totalDebit: number;
  totalCredit: number;
  totalPendingAmount?: number;
  totalBouncedAmount?: number;
  reconciledBalance?: number;
  reconciledIsDebit?: boolean;
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

interface LedgerAccountOption {
  _id: string;
  name: string;
  code: string;
  type?: string;
  groupId?: any;
}

export default function LedgerReport() {
  const [accounts, setAccounts] = useState<LedgerAccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<LedgerAccountOption | null>(null);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<LedgerReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupByAgainstRef, setGroupByAgainstRef] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  const isBankAccount = useMemo(() => {
    if (!selectedAccount) return false;
    const typeUpper = (selectedAccount.type || '').toUpperCase();
    if (typeUpper === 'BANK') return true;
    const nameUpper = (selectedAccount.name || '').toUpperCase();
    if (nameUpper.includes('BANK')) return true;
    const group = selectedAccount.groupId as any;
    const groupName = typeof group === 'object' ? (group?.name || '').toUpperCase() : '';
    const groupType = typeof group === 'object' ? (group?.type || '').toUpperCase() : '';
    if (groupName.includes('BANK') || groupType === 'BANK') return true;
    return false;
  }, [selectedAccount]);

  useEffect(() => {
    if (!companyId) return;
    ledgerAccountApi.list(companyId).then((res) => {
      const list = (res.data.data as LedgerAccountOption[]) ?? [];
      setAccounts(list);
    });
  }, [companyId]);

  const loadReport = () => {
    if (!companyId || !financialYearId || !selectedAccount || !fromDate || !toDate) return;
    setLoading(true);
    ledgerApi
      .report(companyId, financialYearId, selectedAccount._id, fromDate, toDate)
      .then((res) => setData(res.data.data as LedgerReportData))
      .catch((e) => console.error('Failed to load ledger report', e))
      .finally(() => setLoading(false));
  };

  const invoiceGroups = useMemo(() => {
    if (!data?.transactions) return [];
    return groupTransactionsByAgainstRef(data.transactions);
  }, [data?.transactions]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allCollapsed = invoiceGroups.length > 0 && invoiceGroups.every((g) => collapsedGroups[g.key]);

  const toggleAllGroups = () => {
    if (allCollapsed) {
      setCollapsedGroups({});
    } else {
      const next: Record<string, boolean> = {};
      invoiceGroups.forEach((g) => {
        next[g.key] = true;
      });
      setCollapsedGroups(next);
    }
  };

  if (!companyId) return <Typography color="error">Select a company first.</Typography>;
  if (!financialYearId) return <Typography color="error">Select a financial year first.</Typography>;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      {/* Header & Breadcrumb */}
      <Box sx={{ mb: 2.5 }}>
        <Typography sx={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 600, mb: 0.5 }}>
          Accounting / Reports
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', fontSize: '0.85rem' }}>
          Ledger Report
        </Typography>
      </Box>

      {/* Filter Bar */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <Autocomplete
          options={accounts}
          getOptionLabel={(opt) => `${opt.code} - ${opt.name}`}
          value={selectedAccount}
          onChange={(_, val) => setSelectedAccount(val)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select Ledger Account"
              size="small"
              placeholder="Search account..."
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <>
                    <InputAdornment position="start" sx={{ pl: 0.5, mr: 0.5 }}>
                      <SearchIcon sx={{ color: '#64748b', fontSize: 20 }} />
                    </InputAdornment>
                    {params.InputProps.startAdornment}
                  </>
                ),
              }}
              sx={{
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
                '& .MuiInputLabel-root': {
                  fontSize: '0.85rem',
                  '&.Mui-focused': { color: '#0284c7' },
                },
              }}
            />
          )}
          sx={{ minWidth: 320, flex: { xs: '1 1 100%', sm: '1 1 360px' } }}
        />

        <FormattedDatePicker
          label="From Date"
          value={fromDate}
          onChange={setFromDate}
        />

        <FormattedDatePicker
          label="To Date"
          value={toDate}
          onChange={setToDate}
        />

        <Button
          variant="contained"
          onClick={loadReport}
          disabled={loading || !selectedAccount}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon sx={{ fontSize: 19 }} />}
          sx={{
            height: 40,
            px: 2.5,
            bgcolor: '#0097a7',
            '&:hover': { bgcolor: '#00838f' },
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.88rem',
            boxShadow: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Load Report
        </Button>

        {/* Against Ref Checkbox Toggle */}
        <FormControlLabel
          control={
            <Checkbox
              checked={groupByAgainstRef}
              onChange={(e) => setGroupByAgainstRef(e.target.checked)}
              size="small"
              sx={{
                p: 0.5,
                color: '#0097a7',
                '&.Mui-checked': { color: '#0097a7' },
              }}
            />
          }
          label={
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: groupByAgainstRef ? '#006064' : '#334155' }}>
              Against Ref
            </Typography>
          }
          sx={{
            m: 0,
            px: 1.4,
            height: 40,
            border: '1px solid',
            borderColor: groupByAgainstRef ? '#0097a7' : '#cbd5e1',
            bgcolor: groupByAgainstRef ? '#e0f7fa' : '#ffffff',
            borderRadius: '8px',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.15s ease',
            '&:hover': {
              borderColor: '#0097a7',
              bgcolor: groupByAgainstRef ? '#b2ebf2' : '#f8fafc',
            },
          }}
        />

        {/* Expand / Collapse All Button for Against Ref View */}
        {groupByAgainstRef && data && data.transactions.length > 0 && (
          <Button
            size="small"
            variant="outlined"
            onClick={toggleAllGroups}
            startIcon={allCollapsed ? <UnfoldMoreIcon sx={{ fontSize: 16 }} /> : <UnfoldLessIcon sx={{ fontSize: 16 }} />}
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
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </Button>
        )}
      </Box>

      {/* Transactions Table */}
      {data && (
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
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '7%' }}>
                  Voucher
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '11%' }}>
                  Entry Name
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '23.5%' }}>
                  Particulars
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '6.5%' }}>
                  Reference
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '7.5%' }}>
                  Debit
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '7.5%' }}>
                  Credit
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '9%' }}>
                  Balance
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', width: '18.5%' }}>
                  Narration
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Opening Balance Row */}
              <TableRow sx={{ bgcolor: '#ffffff' }}>
                <TableCell sx={{ borderRight: '1px solid #f1f5f9' }} />
                <TableCell sx={{ borderRight: '1px solid #f1f5f9' }} />
                <TableCell sx={{ borderRight: '1px solid #f1f5f9' }} />
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #f1f5f9' }}>
                  Opening Balance
                </TableCell>
                <TableCell sx={{ borderRight: '1px solid #f1f5f9' }} />
                <TableCell sx={{ borderRight: '1px solid #f1f5f9' }} />
                <TableCell sx={{ borderRight: '1px solid #f1f5f9' }} />
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #f1f5f9' }}>
                  {data.openingBalance.toFixed(2)}{' '}
                  <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, color: data.openingIsDebit ? '#16a34a' : '#dc2626' }}>
                    {data.openingIsDebit ? 'Dr' : 'Cr'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 0.85, px: 1.25 }} />
              </TableRow>

              {/* View Mode: Against Ref (Bill-wise) */}
              {groupByAgainstRef ? (
                invoiceGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4.5, color: 'text.secondary', fontSize: '0.78rem', fontWeight: 700 }}>
                      No transactions found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoiceGroups.map((group) => {
                    const isCollapsed = Boolean(collapsedGroups[group.key]);

                    return (
                      <Fragment key={group.key}>
                        {/* Group Header Row */}
                        <TableRow
                          onClick={() => toggleGroup(group.key)}
                          sx={{
                            bgcolor: '#f8fafc',
                            cursor: 'pointer',
                            userSelect: 'none',
                            borderTop: '2px solid #e2e8f0',
                            '&:hover': { bgcolor: '#f1f5f9' },
                          }}
                        >
                          <TableCell
                            colSpan={9}
                            sx={{
                              py: 0.9,
                              px: 1.2,
                              borderLeft: group.isSettled
                                ? '4px solid #16a34a'
                                : group.isInvoiceGroup
                                ? '4px solid #0284c7'
                                : '4px solid #64748b',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <IconButton size="small" sx={{ p: 0.2, color: '#64748b' }}>
                                  {isCollapsed ? (
                                    <KeyboardArrowRightIcon sx={{ fontSize: 18 }} />
                                  ) : (
                                    <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
                                  )}
                                </IconButton>
                                <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
                                  {group.isInvoiceGroup ? `Invoice: ${group.invoiceNo}` : group.invoiceNo}
                                </Typography>
                                {group.invoiceDate && (
                                  <Typography sx={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                                    ({formatDateDisplay(group.invoiceDate)})
                                  </Typography>
                                )}
                                <Chip
                                  label={`${group.transactions.length} ${group.transactions.length === 1 ? 'entry' : 'entries'}`}
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600, bgcolor: '#e2e8f0', color: '#334155' }}
                                />
                              </Box>

                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                {group.isSettled ? (
                                  <Chip
                                    icon={<CheckCircleIcon sx={{ fontSize: '14px !important', color: '#16a34a !important' }} />}
                                    label="Fully Settled (0.00)"
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      bgcolor: '#dcfce7',
                                      color: '#15803d',
                                      border: '1px solid #bbf7d0',
                                    }}
                                  />
                                ) : (
                                  <Chip
                                    label={`Invoice Balance: ${group.netBalance.toFixed(2)} ${group.netIsDebit ? 'Dr' : 'Cr'}`}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      bgcolor: group.netIsDebit ? '#eff6ff' : '#fef2f2',
                                      color: group.netIsDebit ? '#1d4ed8' : '#b91c1c',
                                      border: `1px solid ${group.netIsDebit ? '#bfdbfe' : '#fecaca'}`,
                                    }}
                                  />
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                        </TableRow>

                        {/* Transaction Rows inside this group */}
                        {!isCollapsed &&
                          group.transactions.map((t, rowIdx) => {
                            const isCheque = Boolean(
                              t.entryName?.includes('Cheque') ||
                              (t.chequeNumber && t.chequeNumber !== '-') ||
                              t.chequeStatus === 'BOUNCED' ||
                              (t.chequeStatus === 'PENDING' && !t.isInvoiceRow && !t.entryName?.toLowerCase().includes('sales') && !t.entryName?.toLowerCase().includes('purchase'))
                            );
                            const isPending = isCheque && t.chequeStatus === 'PENDING';
                            const isBounced = isCheque && t.chequeStatus === 'BOUNCED';
                            let rowBg = '#ffffff';
                            let hoverBg = '#f8fafc';
                            if (isPending) {
                              rowBg = '#fffbeb';
                              hoverBg = '#fef9c3';
                            } else if (isBounced) {
                              rowBg = '#fef2f2';
                              hoverBg = '#fee2e2';
                            }

                            return (
                              <TableRow
                                key={`${group.key}-${rowIdx}`}
                                hover
                                sx={{
                                  bgcolor: rowBg,
                                  '&:hover': { bgcolor: hoverBg },
                                  '& td': { py: 0.7, px: 1.25, fontWeight: 700, borderRight: '1px solid #f1f5f9' },
                                  '& td:last-child': { borderRight: 'none' },
                                }}
                              >
                                <TableCell sx={{ whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 700, fontSize: '0.78rem', pl: 3.5 }}>
                                  {formatDateDisplay(t.date)}
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#0f172a', whiteSpace: 'nowrap' }}>
                                  {t.voucherNo || '-'}
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#1e293b' }}>
                                  {t.entryName || '-'}
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.78rem', wordBreak: 'break-word' }}>
                                  {t.particulars || '-'}
                                  {t.chequeNumber && t.chequeNumber !== '-' && (
                                    <Typography component="span" sx={{ fontSize: '0.70rem', color: '#64748b', ml: 0.6, fontWeight: 700 }}>
                                      (Chq: {t.chequeNumber})
                                    </Typography>
                                  )}
                                  {isPending && (
                                    <Chip
                                      label="PENDING CHEQUE"
                                      size="small"
                                      sx={{
                                        height: 18,
                                        fontSize: '0.62rem',
                                        fontWeight: 800,
                                        bgcolor: '#fef08a',
                                        color: '#854d0e',
                                        ml: 0.8,
                                        border: '1px solid #fde047',
                                      }}
                                    />
                                  )}
                                  {isBounced && (
                                    <Chip
                                      label="BOUNCED CHEQUE"
                                      size="small"
                                      sx={{
                                        height: 18,
                                        fontSize: '0.62rem',
                                        fontWeight: 800,
                                        bgcolor: '#fecaca',
                                        color: '#991b1b',
                                        ml: 0.8,
                                        border: '1px solid #f87171',
                                      }}
                                    />
                                  )}
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#0f172a', wordBreak: 'break-word' }}>
                                  {t.reference || '-'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: t.debit > 0 ? '#16a34a' : 'inherit' }}>
                                  {t.debit > 0 ? t.debit.toFixed(2) : ''}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: t.credit > 0 ? '#dc2626' : 'inherit' }}>
                                  {t.credit > 0 ? t.credit.toFixed(2) : ''}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#0f172a' }}>
                                  {t.balance.toFixed(2)}{' '}
                                  <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, color: t.balanceIsDebit ? '#16a34a' : '#dc2626' }}>
                                    {t.balanceIsDebit ? 'Dr' : 'Cr'}
                                  </Typography>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#334155' }}>
                                  {cleanUserNarration(t.narration, t.reference, t.voucherNo)}
                                </TableCell>
                              </TableRow>
                            );
                          })}

                        {/* Invoice Balance Subtotal Row */}
                        {!isCollapsed && (
                          <TableRow sx={{ bgcolor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                            <TableCell
                              colSpan={5}
                              sx={{
                                py: 0.75,
                                px: 1.25,
                                pl: 3.5,
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                color: '#1e293b',
                                borderRight: '1px solid #e2e8f0',
                              }}
                            >
                              {group.isInvoiceGroup ? `Invoice Balance (${group.invoiceNo})` : 'Subtotal (On Account)'}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                py: 0.75,
                                px: 1.25,
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                color: '#16a34a',
                                borderRight: '1px solid #e2e8f0',
                              }}
                            >
                              {group.totalDebit > 0 ? group.totalDebit.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                py: 0.75,
                                px: 1.25,
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                color: '#dc2626',
                                borderRight: '1px solid #e2e8f0',
                              }}
                            >
                              {group.totalCredit > 0 ? group.totalCredit.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                py: 0.75,
                                px: 1.25,
                                fontWeight: 800,
                                fontSize: '0.80rem',
                                color: group.isSettled ? '#16a34a' : '#0f172a',
                                borderRight: '1px solid #e2e8f0',
                              }}
                            >
                              {group.isSettled ? (
                                <span style={{ color: '#16a34a' }}>0.00</span>
                              ) : (
                                <>
                                  {group.netBalance.toFixed(2)}{' '}
                                  <Typography
                                    component="span"
                                    sx={{
                                      fontSize: '0.75rem',
                                      fontWeight: 800,
                                      color: group.netIsDebit ? '#16a34a' : '#dc2626',
                                    }}
                                  >
                                    {group.netIsDebit ? 'Dr' : 'Cr'}
                                  </Typography>
                                </>
                              )}
                            </TableCell>
                            <TableCell sx={{ py: 0.75, px: 1.25 }} />
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )
              ) : (
                /* View Mode: Chronological (Standard) */
                data.transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4.5, color: 'text.secondary', fontSize: '0.78rem', fontWeight: 700 }}>
                      No transactions found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.transactions.map((t, i) => {
                    const isCheque = Boolean(
                      t.entryName?.includes('Cheque') ||
                      (t.chequeNumber && t.chequeNumber !== '-') ||
                      t.chequeStatus === 'BOUNCED' ||
                      (t.chequeStatus === 'PENDING' && !t.isInvoice && !t.entryName?.toLowerCase().includes('sales') && !t.entryName?.toLowerCase().includes('purchase'))
                    );
                    const isPending = isCheque && t.chequeStatus === 'PENDING';
                    const isBounced = isCheque && t.chequeStatus === 'BOUNCED';
                    let rowBg = '#ffffff';
                    let hoverBg = '#f8fafc';
                    if (isPending) {
                      rowBg = '#fffbeb';
                      hoverBg = '#fef9c3';
                    } else if (isBounced) {
                      rowBg = '#fef2f2';
                      hoverBg = '#fee2e2';
                    }

                    return (
                      <TableRow
                        key={i}
                        hover
                        sx={{
                          bgcolor: rowBg,
                          '&:hover': { bgcolor: hoverBg },
                          '& td': { py: 0.75, px: 1.25, fontWeight: 700, borderRight: '1px solid #f1f5f9' },
                          '& td:last-child': { borderRight: 'none' },
                        }}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 700, fontSize: '0.78rem' }}>
                          {formatDateDisplay(t.date)}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {t.voucherNo || '-'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#1e293b' }}>
                          {t.entryName || '-'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.78rem', wordBreak: 'break-word' }}>
                          {t.particulars || '-'}
                          {t.chequeNumber && t.chequeNumber !== '-' && (
                            <Typography component="span" sx={{ fontSize: '0.70rem', color: '#64748b', ml: 0.6, fontWeight: 700 }}>
                              (Chq: {t.chequeNumber})
                            </Typography>
                          )}
                          {isPending && (
                            <Chip
                              label="PENDING CHEQUE"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                bgcolor: '#fef08a',
                                color: '#854d0e',
                                ml: 0.8,
                                border: '1px solid #fde047',
                              }}
                            />
                          )}
                          {isBounced && (
                            <Chip
                              label="BOUNCED CHEQUE"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                bgcolor: '#fecaca',
                                color: '#991b1b',
                                ml: 0.8,
                                border: '1px solid #f87171',
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.66rem !important', color: '#0f172a', wordBreak: 'break-word' }}>
                          {t.reference || '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: t.debit > 0 ? '#16a34a' : 'inherit' }}>
                          {t.debit > 0 ? t.debit.toFixed(2) : ''}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: t.credit > 0 ? '#dc2626' : 'inherit' }}>
                          {t.credit > 0 ? t.credit.toFixed(2) : ''}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#0f172a' }}>
                          {t.balance.toFixed(2)}{' '}
                          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, color: t.balanceIsDebit ? '#16a34a' : '#dc2626' }}>
                            {t.balanceIsDebit ? 'Dr' : 'Cr'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#334155' }}>
                          {cleanUserNarration(t.narration, t.reference, t.voucherNo)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )
              )}

              {/* Total Balance & Closing Balance Row */}
              <TableRow sx={{ bgcolor: '#ffffff', borderTop: '2px solid #cbd5e1' }}>
                <TableCell colSpan={5} sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#0f172a', borderRight: '1px solid #f1f5f9' }}>
                  Total Balance
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#16a34a', borderRight: '1px solid #f1f5f9' }}>
                  {data.totalDebit.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#dc2626', borderRight: '1px solid #f1f5f9' }}>
                  {data.totalCredit.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 1.0, px: 1.25, fontSize: '0.96rem', color: '#0f172a', borderRight: '1px solid #f1f5f9' }}>
                  {data.closingBalance.toFixed(2)}{' '}
                  <Typography component="span" sx={{ fontSize: '0.82rem', fontWeight: 800, color: data.closingIsDebit ? '#16a34a' : '#dc2626' }}>
                    {data.closingIsDebit ? 'Dr' : 'Cr'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 1.0, px: 1.25 }} />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Summary Cards (at the BOTTOM) */}
      {data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.8 }}>
          {/* Card 1: Opening Balance */}
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
                Opening Balance
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
              {data.openingBalance.toFixed(2)}{' '}
              <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: data.openingIsDebit ? '#16a34a' : '#dc2626' }}>
                {data.openingIsDebit ? 'Dr' : 'Cr'}
              </Typography>
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
              {data.totalDebit.toFixed(2)}
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
              {data.totalCredit.toFixed(2)}
            </Typography>
          </Card>

          {/* Card 4: Closing Balance */}
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
                Closing Balance
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
              {data.closingBalance.toFixed(2)}{' '}
              <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: data.closingIsDebit ? '#16a34a' : '#dc2626' }}>
                {data.closingIsDebit ? 'Dr' : 'Cr'}
              </Typography>
            </Typography>
          </Card>
        </Box>
      )}

      {/* Cheque & Reconciliation Summary Cards */}
      {data && (
        <Box
          sx={{
            mt: 1.8,
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: isBankAccount ? '1fr 1fr' : 'repeat(2, 1fr)',
              md: isBankAccount ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
            },
            gap: 1.8,
          }}
        >
          {/* Card: Pending Cheque Amounts */}
          <Card
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: '#fefce8',
              borderRadius: '9px',
              borderColor: '#fef08a',
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
                  bgcolor: '#fef9c3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#b45309',
                }}
              >
                <WarningAmberIcon sx={{ fontSize: 18 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#854d0e' }}>
                  Pending Cheques
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#a16207', fontWeight: 600 }}>
                  Not added to balance
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#a16207' }}>
              {(data.totalPendingAmount ?? 0).toFixed(2)}
            </Typography>
          </Card>

          {/* Card: Bounced Cheque Amounts */}
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
                <CloseIcon sx={{ fontSize: 18 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#991b1b' }}>
                  Bounced Cheques
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#b91c1c', fontWeight: 600 }}>
                  Excluded from balance
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#dc2626' }}>
              {(data.totalBouncedAmount ?? 0).toFixed(2)}
            </Typography>
          </Card>

          {/* Card: Balanced Reconciled Amount - Only shown for Bank Accounts */}
          {isBankAccount && (
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
                  <BalanceIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#166534' }}>
                    Balanced Reconciled Amount
                  </Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 600 }}>
                    Cleared balance
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                {(data.reconciledBalance ?? data.closingBalance).toFixed(2)}{' '}
                <Typography
                  component="span"
                  sx={{
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: (data.reconciledIsDebit ?? data.closingIsDebit) ? '#16a34a' : '#dc2626',
                  }}
                >
                  {(data.reconciledIsDebit ?? data.closingIsDebit) ? 'Dr' : 'Cr'}
                </Typography>
              </Typography>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
}
