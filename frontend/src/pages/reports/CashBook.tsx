import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Checkbox,
  FormControlLabel,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  CalendarMonth as CalendarMonthIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  ReceiptLong as ReceiptLongIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  CheckCircle as CheckCircleIcon,
  UnfoldMore as UnfoldMoreIcon,
  UnfoldLess as UnfoldLessIcon,
  Lock as LockIcon,
  Print as PrintIcon,
  FileDownload as DownloadIcon,
  Sync as SyncIcon,
  Clear as ClearIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  WarningAmber as WarningAmberIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../../store/hooks';
import { ledgerApi, ledgerAccountApi } from '../../services/api';

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
  voucherId?: string;
  voucherType?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  invoiceType?: string;
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
  isInvoice?: boolean;
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  chequeNumber?: string;
  voucherId?: string;
  voucherType?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  invoiceType?: string;
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

interface LedgerAccountOption {
  _id: string;
  name: string;
  code: string;
  type?: string;
  groupId?: any;
}

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
        isInvoice: t.isInvoice ?? true,
        chequeStatus: t.chequeStatus,
        chequeNumber: t.chequeNumber,
        voucherId: t.voucherId,
        voucherType: t.voucherType,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        referenceNo: t.referenceNo,
        invoiceType: t.invoiceType,
      });
    }
  }

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
          isInvoice: false,
          chequeStatus: t.chequeStatus,
          chequeNumber: t.chequeNumber,
          voucherId: t.voucherId,
          voucherType: t.voucherType,
          referenceType: t.referenceType,
          referenceId: t.referenceId,
          referenceNo: t.referenceNo,
          invoiceType: t.invoiceType,
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
            isInvoice: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
            voucherId: t.voucherId,
            voucherType: t.voucherType,
            referenceType: t.referenceType,
            referenceId: t.referenceId,
            referenceNo: t.referenceNo,
            invoiceType: t.invoiceType,
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
            isInvoice: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
            voucherId: t.voucherId,
            voucherType: t.voucherType,
            referenceType: t.referenceType,
            referenceId: t.referenceId,
            referenceNo: t.referenceNo,
            invoiceType: t.invoiceType,
          });
        }
      } else {
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
            isInvoice: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
            voucherId: t.voucherId,
            voucherType: t.voucherType,
            referenceType: t.referenceType,
            referenceId: t.referenceId,
            referenceNo: t.referenceNo,
            invoiceType: t.invoiceType,
          });
        } else {
          const onAccountGroup = getOrCreateGroup('__ON_ACCOUNT__', 'On Account / Other Cash Entries', false);
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
            isInvoice: false,
            chequeStatus: t.chequeStatus,
            chequeNumber: t.chequeNumber,
            voucherId: t.voucherId,
            voucherType: t.voucherType,
            referenceType: t.referenceType,
            referenceId: t.referenceId,
            referenceNo: t.referenceNo,
            invoiceType: t.invoiceType,
          });
        }
      }
    }
  }

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

  groupsList.sort((a, b) => {
    if (!a.isInvoiceGroup) return 1;
    if (!b.isInvoiceGroup) return -1;

    const dateA = a.invoiceDate || a.transactions[0]?.date || '';
    const dateB = b.invoiceDate || b.transactions[0]?.date || '';
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  return groupsList;
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

export default function CashBook() {
  const navigate = useNavigate();
  const location = useLocation();

  const [cashAccount, setCashAccount] = useState<LedgerAccountOption | null>(null);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<LedgerReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(true);
  const [groupByAgainstRef, setGroupByAgainstRef] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Load Cash in Hand Account (Permanently fixed, cannot be changed)
  const fetchCashAccount = async () => {
    if (!companyId) return;
    setAccountLoading(true);
    try {
      const res = await ledgerAccountApi.list(companyId);
      const list = (res.data.data as LedgerAccountOption[]) ?? [];

      const cashAcc =
        list.find((a) => a.name?.trim().toUpperCase() === 'CASH IN HAND') ||
        list.find((a) => a.code?.trim().toUpperCase() === 'CASH001') ||
        list.find((a) => a.name?.trim().toUpperCase().includes('CASH IN HAND')) ||
        list.find((a) => (a.type || '').trim().toUpperCase() === 'CASH') ||
        list.find((a) => a.name?.trim().toUpperCase() === 'CASH') ||
        (list.length > 0 ? list[0] : null);

      setCashAccount(cashAcc);
    } catch (err) {
      console.error('Failed to load Cash in Hand ledger account', err);
    } finally {
      setAccountLoading(false);
    }
  };

  useEffect(() => {
    const navState = location.state as { fromDate?: string; toDate?: string } | undefined;
    if (navState?.fromDate) setFromDate(navState.fromDate);
    if (navState?.toDate) setToDate(navState.toDate);
    fetchCashAccount();
  }, [companyId, location.state]);

  // Load report data whenever companyId, financialYearId, cashAccount, fromDate, or toDate changes
  const fetchReport = async () => {
    if (!companyId || !financialYearId || !cashAccount || !fromDate || !toDate) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await ledgerApi.report(companyId, financialYearId, cashAccount._id, fromDate, toDate);
      setData(res.data.data as LedgerReportData);
    } catch (e) {
      console.error('Failed to load cash book report', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [companyId, financialYearId, cashAccount, fromDate, toDate]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/cash-book') {
        fetchReport();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/cash-book') || window.location.pathname.includes('/report/cash-book')) {
        fetchReport();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [companyId, financialYearId, cashAccount, fromDate, toDate]);

  // Date Preset Handlers
  const handlePresetDate = (type: 'today' | 'yesterday' | 'week' | 'month' | 'fy') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (type === 'today') {
      const todayStr = toIso(now);
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = toIso(y);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (type === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
      start.setDate(diff);
      setFromDate(toIso(start));
      setToDate(toIso(now));
    } else if (type === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFromDate(toIso(start));
      setToDate(toIso(end));
    } else if (type === 'fy') {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      setFromDate(toIso(start));
      setToDate(toIso(end));
    }
  };

  // Filtered transactions based on live search
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (!searchQuery.trim()) return data.transactions;

    const q = searchQuery.toLowerCase().trim();
    return data.transactions.filter((t) => {
      return (
        (t.voucherNo || '').toLowerCase().includes(q) ||
        (t.entryName || '').toLowerCase().includes(q) ||
        (t.particulars || '').toLowerCase().includes(q) ||
        (t.reference || '').toLowerCase().includes(q) ||
        (t.narration || '').toLowerCase().includes(q) ||
        (t.chequeNumber || '').toLowerCase().includes(q)
      );
    });
  }, [data?.transactions, searchQuery]);

  // Grouped transactions for Against Ref mode
  const invoiceGroups = useMemo(() => {
    if (!filteredTransactions.length) return [];
    return groupTransactionsByAgainstRef(filteredTransactions);
  }, [filteredTransactions]);

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

  // Double-click row drill-down (identical to LedgerReport)
  const handleRowDoubleClick = (row: LedgerTransaction | GroupedTransactionRow) => {
    const entryName = (row.entryName || '').toLowerCase();
    const vNo = (row.voucherNo || '').toUpperCase();
    const refType = (row.referenceType || '').toLowerCase();
    const vType = (row.voucherType || '').toLowerCase();
    const targetId = row.referenceId || row.voucherId;
    const invNo = row.voucherNo && row.voucherNo !== '-' ? row.voucherNo : (row.referenceNo || row.reference);
    const invoiceType = (row.invoiceType || '').toUpperCase();

    // 1. Sales Return
    if (refType === 'salesreturn' || entryName.includes('sales return') || invoiceType === 'RETURN') {
      navigate('/entry/sales-return', {
        state: { returnId: targetId, invoiceId: targetId, invoiceNo: invNo },
      });
      return;
    }

    // 2. Sales B2B / B2C / POS / Quotation
    const isSales =
      refType === 'salesinvoice' ||
      entryName.includes('sales') ||
      vNo.startsWith('B2C') ||
      vNo.startsWith('B2B') ||
      vNo.startsWith('INV') ||
      vNo.startsWith('POS') ||
      vNo.startsWith('QTN') ||
      row.isInvoice;

    if (isSales) {
      if (invoiceType === 'POS' || vNo.startsWith('POS') || entryName.includes('sales pos')) {
        navigate('/entry/pos', {
          state: { invoiceId: targetId, invoiceNo: invNo },
        });
        return;
      }
      if (invoiceType === 'QUOTATION' || vNo.startsWith('QTN') || entryName.includes('quotation')) {
        navigate('/entry/quotation-sales', {
          state: { invoiceId: targetId, invoiceNo: invNo },
        });
        return;
      }
      if (
        invoiceType === 'B2B' ||
        vNo.startsWith('B2B') ||
        entryName.includes('b2b') ||
        (entryName === 'sales' && !vNo.startsWith('B2C') && !vNo.startsWith('POS'))
      ) {
        navigate('/entry/sales-b2b', {
          state: { invoiceId: targetId, invoiceNo: invNo },
        });
        return;
      }
      navigate('/entry/sales-b2c', {
        state: { invoiceId: targetId, invoiceNo: invNo },
      });
      return;
    }

    // 3. Purchase Return
    if (refType === 'purchasereturn' || entryName.includes('purchase return')) {
      navigate('/entry/purchase-return', {
        state: { returnId: targetId, invoiceId: targetId, invoiceNo: invNo },
      });
      return;
    }

    // 4. Purchase Invoice
    if (refType === 'purchaseinvoice' || entryName.includes('purchase') || vNo.startsWith('PUR')) {
      navigate('/entry/purchase', {
        state: { invoiceId: targetId, invoiceNo: invNo },
      });
      return;
    }

    // 5. Vouchers
    if (vType === 'chequepayment' || entryName.includes('cheque payment') || entryName.includes('bank payment')) {
      navigate('/entry/voucher/cheque-payment', {
        state: { voucherId: row.voucherId || targetId },
      });
      return;
    }

    if (vType === 'chequereceipt' || entryName.includes('cheque receipt') || entryName.includes('bank receipt')) {
      navigate('/entry/voucher/cheque-receipt', {
        state: { voucherId: row.voucherId || targetId },
      });
      return;
    }

    if (vType === 'payment' || entryName.includes('payment voucher') || entryName === 'payment') {
      navigate('/entry/voucher/payment', {
        state: { voucherId: row.voucherId || targetId },
      });
      return;
    }

    if (vType === 'receipt' || entryName.includes('receipt voucher') || entryName === 'receipt') {
      navigate('/entry/voucher/receipt', {
        state: { voucherId: row.voucherId || targetId },
      });
      return;
    }

    if (vType === 'contra' || entryName.includes('contra')) {
      navigate('/entry/voucher/contra', {
        state: { voucherId: row.voucherId || targetId },
      });
      return;
    }

    if (vType === 'journal' || entryName.includes('journal')) {
      navigate('/entry/voucher/journal', {
        state: { voucherId: row.voucherId || targetId },
      });
      return;
    }

    if (vType === 'opening' || entryName.includes('opening')) {
      navigate('/entry/opening-balance');
      return;
    }

    if (entryName.includes('damage') || entryName.includes('wastage')) {
      navigate('/entry/damage-wastage');
      return;
    }

    if (entryName.includes('stock adjustment')) {
      navigate('/entry/stock-adjustment');
      return;
    }

    if (row.voucherId) {
      navigate('/entry/voucher/receipt', {
        state: { voucherId: row.voucherId },
      });
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!data) return;
    const headers = ['Date', 'Voucher No', 'Entry Name', 'Particulars', 'Reference', 'Debit (Inflow)', 'Credit (Outflow)', 'Balance', 'Type', 'Narration'];
    const rows: string[][] = [];

    // Opening row
    rows.push([
      formatDateDisplay(fromDate),
      '-',
      'Opening Balance',
      'Cash in Hand Carryover',
      '-',
      '',
      '',
      data.openingBalance.toFixed(2),
      data.openingIsDebit ? 'Dr' : 'Cr',
      '',
    ]);

    // Transaction rows
    (filteredTransactions || []).forEach((t) => {
      rows.push([
        formatDateDisplay(t.date),
        t.voucherNo || '-',
        t.entryName || '-',
        t.particulars || '-',
        t.reference || '-',
        t.debit > 0 ? t.debit.toFixed(2) : '',
        t.credit > 0 ? t.credit.toFixed(2) : '',
        t.balance.toFixed(2),
        t.balanceIsDebit ? 'Dr' : 'Cr',
        cleanUserNarration(t.narration, t.reference, t.voucherNo),
      ]);
    });

    // Closing row
    rows.push([
      formatDateDisplay(toDate),
      '-',
      'Total / Closing Balance',
      'Closing Cash in Hand',
      '-',
      data.totalDebit.toFixed(2),
      data.totalCredit.toFixed(2),
      data.closingBalance.toFixed(2),
      data.closingIsDebit ? 'Dr' : 'Cr',
      '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['CASH BOOK REPORT - CASH IN HAND', `Period: ${fromDate} to ${toDate}`, '', headers.join(',')]
        .concat(rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')))
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cash-book-${fromDate}-to-${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const netCashFlow = (data?.totalDebit ?? 0) - (data?.totalCredit ?? 0);

  if (!companyId) return <Typography color="error">Select a company first.</Typography>;
  if (!financialYearId) return <Typography color="error">Select a financial year first.</Typography>;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      {/* ── Print Specific Styles ── */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-header {
            display: block !important;
            margin-bottom: 20px;
          }
          .MuiPaper-root {
            border: 1px solid #94a3b8 !important;
            box-shadow: none !important;
          }
        }
        @media screen {
          .print-header {
            display: none;
          }
        }
      `}</style>

      {/* ── Header & Breadcrumbs ── */}
      <Box className="no-print" sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 600, mb: 0.5 }}>
            Accounting / Reports / Cash Book
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', fontSize: '1.25rem' }}>
              Cash Book
            </Typography>
            <Chip
              icon={<LockIcon sx={{ fontSize: '14px !important', color: '#0284c7 !important' }} />}
              label="LOCKED: CASH IN HAND"
              size="small"
              sx={{
                height: 24,
                fontSize: '0.72rem',
                fontWeight: 800,
                bgcolor: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                letterSpacing: '0.04em',
              }}
            />
            <Chip
              icon={<CheckCircleIcon sx={{ fontSize: '14px !important', color: '#16a34a !important' }} />}
              label="Real-time Vault Sync"
              size="small"
              sx={{
                height: 24,
                fontSize: '0.72rem',
                fontWeight: 700,
                bgcolor: '#dcfce7',
                color: '#15803d',
                border: '1px solid #bbf7d0',
              }}
            />
          </Box>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={fetchReport}
            startIcon={<SyncIcon sx={{ fontSize: 16 }} />}
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
            onClick={handleExportCSV}
            disabled={!data || data.transactions.length === 0}
            startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
            sx={{
              height: 38,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.80rem',
              color: '#0284c7',
              borderColor: '#bae6fd',
              borderRadius: '8px',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f0f9ff', borderColor: '#7dd3fc' },
            }}
          >
            Export CSV
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handlePrint}
            disabled={!data}
            startIcon={<PrintIcon sx={{ fontSize: 16 }} />}
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
            Print
          </Button>
        </Box>
      </Box>

      {/* ── Print Header ── */}
      <Box className="print-header">
        <Typography variant="h5" sx={{ fontWeight: 800, textAlign: 'center', color: '#0f172a' }}>
          CASH BOOK
        </Typography>
        <Typography sx={{ fontSize: '0.90rem', textAlign: 'center', fontWeight: 700, color: '#334155', mt: 0.5 }}>
          Ledger: {cashAccount?.code || 'CASH001'} - {cashAccount?.name || 'CASH IN HAND'}
        </Typography>
        <Typography sx={{ fontSize: '0.80rem', textAlign: 'center', color: '#64748b' }}>
          Period: {formatDateDisplay(fromDate)} to {formatDateDisplay(toDate)}
        </Typography>
      </Box>

      {/* ── Filter & Selection Deck ── */}
      <Box className="no-print" sx={{ mb: 3 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: '#ffffff',
            borderRadius: '10px',
            borderColor: '#e2e8f0',
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {/* Row 1: Locked Ledger Indicator, Date Pickers, Quick Presets */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Locked Ledger Card Display */}
            <Tooltip title="The Cash Book report is locked to the Cash in Hand ledger account and cannot be modified." arrow>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.6,
                  py: 0.7,
                  bgcolor: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  height: 40,
                  minWidth: { xs: '100%', sm: 340 },
                  flex: { xs: '1 1 100%', sm: '1 1 360px' },
                  userSelect: 'none',
                  cursor: 'default',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: '#94a3b8',
                    bgcolor: '#f1f5f9',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    bgcolor: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <LockIcon sx={{ fontSize: 16 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {accountLoading ? 'Loading Cash in Hand...' : `${cashAccount?.code || 'CASH001'} - ${cashAccount?.name || 'CASH IN HAND'}`}
                    </Typography>
                    <Chip
                      label="LOCKED"
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        bgcolor: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        letterSpacing: '0.05em',
                      }}
                    />
                  </Box>
                  <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                    Fixed Ledger • Main Store Vault & Till Drawers
                  </Typography>
                </Box>
              </Box>
            </Tooltip>

            {/* Date Pickers */}
            <FormattedDatePicker label="From Date" value={fromDate} onChange={setFromDate} />
            <FormattedDatePicker label="To Date" value={toDate} onChange={setToDate} />

            {/* Quick Date Presets */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
              <Button
                size="small"
                onClick={() => handlePresetDate('today')}
                sx={{
                  height: 32,
                  px: 1.2,
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                Today
              </Button>
              <Button
                size="small"
                onClick={() => handlePresetDate('yesterday')}
                sx={{
                  height: 32,
                  px: 1.2,
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                Yesterday
              </Button>
              <Button
                size="small"
                onClick={() => handlePresetDate('week')}
                sx={{
                  height: 32,
                  px: 1.2,
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                This Week
              </Button>
              <Button
                size="small"
                onClick={() => handlePresetDate('month')}
                sx={{
                  height: 32,
                  px: 1.2,
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                This Month
              </Button>
              <Button
                size="small"
                onClick={() => handlePresetDate('fy')}
                sx={{
                  height: 32,
                  px: 1.2,
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                Full Year
              </Button>
            </Box>
          </Box>

          {/* Row 2: Search Input, Against Ref Toggle, Expand/Collapse */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', pt: 1, borderTop: '1px solid #f1f5f9' }}>
            <TextField
              size="small"
              placeholder="Search by voucher, particulars, reference, or narration..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ pl: 0.5, mr: 0.5 }}>
                    <SearchIcon sx={{ color: '#64748b', fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 340px' },
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#ffffff',
                  borderRadius: '8px',
                  height: 40,
                  fontSize: '0.84rem',
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                },
              }}
            />

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
                  Against Ref (Bill-Wise)
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
            {groupByAgainstRef && invoiceGroups.length > 0 && (
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

            {searchQuery && (
              <Chip
                label={`Filtered: ${filteredTransactions.length} of ${data?.transactions.length || 0}`}
                size="small"
                sx={{ height: 26, fontSize: '0.74rem', fontWeight: 700, bgcolor: '#f1f5f9', color: '#475569' }}
              />
            )}
          </Box>
        </Paper>
      </Box>

      {/* ── Executive Financial KPI Summary Cards ── */}
      {data && (
        <Box sx={{ mb: 2.8, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.8 }}>
          {/* Card 1: Opening Balance */}
          <Card
            variant="outlined"
            sx={{
              p: 1.8,
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
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  bgcolor: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#475569',
                }}
              >
                <ReceiptLongIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
                  Opening Balance
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  As at {formatDateDisplay(fromDate)}
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              {data.openingBalance.toFixed(2)}{' '}
              <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: data.openingIsDebit ? '#16a34a' : '#dc2626' }}>
                {data.openingIsDebit ? 'Dr' : 'Cr'}
              </Typography>
            </Typography>
          </Card>

          {/* Card 2: Total Cash Receipts (Debit Inflow) */}
          <Card
            variant="outlined"
            sx={{
              p: 1.8,
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
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  bgcolor: '#dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#16a34a',
                }}
              >
                <ArrowUpwardIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                  Cash Inflows (Receipts)
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#15803d' }}>
                  Total Debits to Cash
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: '#16a34a' }}>
              {data.totalDebit.toFixed(2)}
            </Typography>
          </Card>

          {/* Card 3: Total Cash Disbursements (Credit Outflow) */}
          <Card
            variant="outlined"
            sx={{
              p: 1.8,
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
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  bgcolor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                }}
              >
                <ArrowDownwardIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b' }}>
                  Cash Outflows (Payments)
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#b91c1c' }}>
                  Total Credits from Cash
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: '#dc2626' }}>
              {data.totalCredit.toFixed(2)}
            </Typography>
          </Card>

          {/* Card 4: Closing Cash in Hand */}
          <Card
            variant="outlined"
            sx={{
              p: 1.8,
              bgcolor: '#eff6ff',
              borderRadius: '9px',
              borderColor: '#bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: 'none',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  bgcolor: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0284c7',
                }}
              >
                <AccountBalanceWalletIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' }}>
                  Closing Cash in Hand
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#0284c7' }}>
                  As at {formatDateDisplay(toDate)}
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              {data.closingBalance.toFixed(2)}{' '}
              <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: data.closingIsDebit ? '#16a34a' : '#dc2626' }}>
                {data.closingIsDebit ? 'Dr' : 'Cr'}
              </Typography>
            </Typography>
          </Card>
        </Box>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress size={34} sx={{ color: '#0284c7' }} />
        </Box>
      )}

      {/* ── Transactions Table ── */}
      {!loading && data && (
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
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '11%' }}>
                  Entry Name
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '23%' }}>
                  Particulars (Opposite Ledger)
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.66rem !important', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '7%' }}>
                  Reference
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '8%' }}>
                  Debit (Inflow)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '8%' }}>
                  Credit (Outflow)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', borderRight: '1px solid #dbeafe', width: '9%' }}>
                  Balance
                </TableCell>
                <TableCell sx={{ fontWeight: 800, py: 0.85, px: 1.25, fontSize: '0.78rem', color: '#0f172a', width: '17%' }}>
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
                  Opening Balance (Cash in Hand)
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
                      No cash transactions found for the selected period.
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
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (group.transactions && group.transactions.length > 0) {
                              handleRowDoubleClick(group.transactions[0]);
                            }
                          }}
                          title="Click to collapse/expand. Double-click to open invoice."
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
                                  {group.isInvoiceGroup ? `Invoice / Bill: ${group.invoiceNo}` : group.invoiceNo}
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
                                    label={`Balance: ${group.netBalance.toFixed(2)} ${group.netIsDebit ? 'Dr' : 'Cr'}`}
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

                            return (
                              <TableRow
                                key={`${group.key}-${rowIdx}`}
                                onDoubleClick={() => handleRowDoubleClick(t)}
                                title="Double-click to open voucher / invoice"
                                sx={{
                                  bgcolor: '#ffffff',
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: '#f8fafc' },
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
                          })}

                        {/* Group Subtotal Row */}
                        {!isCollapsed && (
                          <TableRow sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <TableCell colSpan={5} sx={{ py: 0.6, px: 1.25, fontWeight: 800, fontSize: '0.74rem', color: '#475569', textAlign: 'right' }}>
                              Subtotal for {group.invoiceNo}:
                            </TableCell>
                            <TableCell align="right" sx={{ py: 0.6, px: 1.25, fontWeight: 800, fontSize: '0.76rem', color: '#16a34a' }}>
                              {group.totalDebit > 0 ? group.totalDebit.toFixed(2) : ''}
                            </TableCell>
                            <TableCell align="right" sx={{ py: 0.6, px: 1.25, fontWeight: 800, fontSize: '0.76rem', color: '#dc2626' }}>
                              {group.totalCredit > 0 ? group.totalCredit.toFixed(2) : ''}
                            </TableCell>
                            <TableCell align="right" sx={{ py: 0.6, px: 1.25, fontWeight: 800, fontSize: '0.76rem', color: '#0f172a' }}>
                              {group.netBalance.toFixed(2)} {group.netIsDebit ? 'Dr' : 'Cr'}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )
              ) : (
                // View Mode: Standard Chronological Rows
                filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4.5, color: 'text.secondary', fontSize: '0.78rem', fontWeight: 700 }}>
                      No cash transactions found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((t, idx) => {
                    const isCheque = Boolean(
                      t.entryName?.includes('Cheque') ||
                      (t.chequeNumber && t.chequeNumber !== '-') ||
                      t.chequeStatus === 'BOUNCED' ||
                      (t.chequeStatus === 'PENDING' && !t.isInvoice && !t.entryName?.toLowerCase().includes('sales') && !t.entryName?.toLowerCase().includes('purchase'))
                    );
                    const isPending = isCheque && t.chequeStatus === 'PENDING';
                    const isBounced = isCheque && t.chequeStatus === 'BOUNCED';

                    return (
                      <TableRow
                        key={idx}
                        onDoubleClick={() => handleRowDoubleClick(t)}
                        title="Double-click to open voucher / invoice"
                        sx={{
                          bgcolor: idx % 2 === 1 ? '#fafafa' : '#ffffff',
                          cursor: 'pointer',
                          '&:hover': { bgcolor: '#f0f9ff' },
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
                  Total Balance & Closing Cash
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

      {/* ── Additional Cheque & Variance Alerts (if present) ── */}
      {!loading && data && ((data.totalPendingAmount ?? 0) > 0 || (data.totalBouncedAmount ?? 0) > 0) && (
        <Box sx={{ mb: 2.8, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.8 }}>
          {(data.totalPendingAmount ?? 0) > 0 && (
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
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <WarningAmberIcon sx={{ color: '#b45309', fontSize: 20 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#854d0e' }}>
                    Pending Cheques
                  </Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: '#a16207' }}>
                    Awaiting bank clearance
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#a16207' }}>
                {(data.totalPendingAmount ?? 0).toFixed(2)}
              </Typography>
            </Card>
          )}

          {(data.totalBouncedAmount ?? 0) > 0 && (
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
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <CloseIcon sx={{ color: '#dc2626', fontSize: 20 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#991b1b' }}>
                    Bounced Cheques
                  </Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: '#b91c1c' }}>
                    Excluded from balance
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#dc2626' }}>
                {(data.totalBouncedAmount ?? 0).toFixed(2)}
              </Typography>
            </Card>
          )}
        </Box>
      )}

      {/* ── Executive Audit Dock Banner ── */}
      {!loading && data && (
        <Paper
          className="no-print"
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: '#0f172a',
            borderColor: '#1e293b',
            borderRadius: '10px',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
              <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>
                Cash Book Verified
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.74rem', color: '#94a3b8' }}>|</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Ledger Account: <strong style={{ color: '#ffffff' }}>{cashAccount?.code || 'CASH001'} - {cashAccount?.name || 'CASH IN HAND'}</strong>
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: '#94a3b8' }}>|</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Total Entries: <strong style={{ color: '#ffffff' }}>{data.transactions.length}</strong>
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Net Period Cash Flow
              </Typography>
              <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: netCashFlow >= 0 ? '#4ade80' : '#f87171' }}>
                {netCashFlow >= 0 ? '+' : ''}{netCashFlow.toFixed(2)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', pl: 2, borderLeft: '1px solid #334155' }}>
              <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Closing Cash Balance
              </Typography>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#38bdf8' }}>
                {data.closingBalance.toFixed(2)} {data.closingIsDebit ? 'Dr' : 'Cr'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
