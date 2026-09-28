import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Chip,
  Divider,
  Tooltip,
  Autocomplete,
  InputAdornment,
  CircularProgress,
  FormControlLabel,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import SaveIcon from '@mui/icons-material/Save';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import dayjs from 'dayjs';
import { useAppSelector } from '../store/hooks';
import { voucherApi, ledgerAccountApi, billReferenceApi, ledgerApi } from '../services/api';

type Account = {
  _id: string;
  name: string;
  code: string;
  type: string;
  againstRef?: boolean;
  openingBalances?: Array<{ financialYearId: string; amount: number; isDebit: boolean }>;
};

interface BillSettlement {
  billNumber: string;
  date: string;
  totalAmount: number;
  outstandingAmount: number;
  settleAmount: number;
  selected: boolean;
  drCr: 'Dr' | 'Cr';
  ledgerAccountId: string;
}

interface VoucherLineEntry {
  ledgerAccountId: string;
  amount: number | '';
  discount: number | '';
  total: number;
  remarks: string;
  refType: 'Against Ref' | 'On Account';
  isCommitted?: boolean;
}

const createEmptyRow = (): VoucherLineEntry => ({
  ledgerAccountId: '',
  amount: '',
  discount: '',
  total: 0,
  remarks: '',
  refType: 'On Account',
  isCommitted: false,
});

interface JournalLineEntry {
  debitAccountId: string;
  creditAccountId: string;
  amount: number | '';
  remarks: string;
  isCommitted?: boolean;
}

const createEmptyJournalRow = (): JournalLineEntry => ({
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
  remarks: '',
  isCommitted: false,
});

export interface ChequeDetailLine {
  id: string;
  bankAccountId: string;
  type: 'CHEQUE' | 'ONLINE' | 'CARD' | 'DD';
  chequeNo: string;
  status: 'PENDING' | 'CLEARED' | 'BOUNCED';
  date: string;
  amount: number | '';
  bankCharge: number | '';
  isCommitted?: boolean;
}

export const createEmptyChequeRow = (defaultDate?: string): ChequeDetailLine => ({
  id: Math.random().toString(36).substring(2, 9),
  bankAccountId: '',
  type: 'CHEQUE',
  chequeNo: '',
  status: 'PENDING',
  date: defaultDate || new Date().toISOString().slice(0, 10),
  amount: '',
  bankCharge: '',
  isCommitted: false,
});

export interface ChequeBillAllocation {
  billNumber: string;
  date: string;
  invoiceNo: string;
  supplierInvoiceNo: string;
  voucherNo: string;
  billAmount: number;
  billBalance: number;
  chequeNo: string;
  allocatedAmount: number;
  remainingBalance: number;
  selected: boolean;
}

function numberToWordsDirhams(amount: number): string {
  if (!amount || isNaN(amount) || amount === 0) return 'Zero dirhams only';

  const units = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen'
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function convertGroup(n: number): string {
    let groupStr = '';
    if (n >= 100) {
      groupStr += units[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      groupStr += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + units[n % 10] : '') + ' ';
    } else if (n > 0) {
      groupStr += units[n] + ' ';
    }
    return groupStr.trim();
  }

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  let result = '';
  if (integerPart === 0) {
    result = 'zero dirhams';
  } else {
    const millions = Math.floor(integerPart / 1000000);
    const thousands = Math.floor((integerPart % 1000000) / 1000);
    const remainder = integerPart % 1000;

    if (millions > 0) result += convertGroup(millions) + ' million ';
    if (thousands > 0) result += convertGroup(thousands) + ' thousand ';
    if (remainder > 0) result += convertGroup(remainder) + ' ';
    result = result.trim() + ' dirhams';
  }

  if (decimalPart > 0) {
    result += ' and ' + convertGroup(decimalPart) + ' fils';
  }

  result += ' only';
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export default function VoucherEntry({
  defaultVoucherType = 'Receipt',
}: {
  defaultVoucherType?: string;
}) {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Voucher Type & Theme
  const [voucherType, setVoucherType] = useState<string>(defaultVoucherType);
  useEffect(() => {
    setVoucherType(defaultVoucherType);
  }, [defaultVoucherType]);

  const isPayment = voucherType === 'Payment' || voucherType === 'ChequePayment';
  const isReceipt = voucherType === 'Receipt' || voucherType === 'ChequeReceipt';
  const isContra = voucherType === 'Contra';
  const isJournal = voucherType === 'Journal';
  const isChequePayment = voucherType === 'ChequePayment';
  const isChequeReceipt = voucherType === 'ChequeReceipt';
  const isCheque = isChequePayment || isChequeReceipt;

  // Dynamic Theme Colors
  const themeColors = useMemo(() => {
    if (isContra) {
      return {
        isPink: false,
        primary: '#4f46e5', // indigo-600
        primaryHover: '#4338ca', // indigo-700
        primaryLight: '#eef2ff', // indigo-50
        accentBorder: '#c7d2fe', // indigo-200
        badgeBg: '#e0e7ff', // indigo-100
        badgeText: '#3730a3', // indigo-800
        totalText: '#4f46e5',
        headerText: '#1e1b4b',
        inputFocus: '#6366f1',
        navHover: '#e0e7ff',
      };
    }
    if (isCheque) {
      return {
        isPink: false,
        primary: '#0284c7', // sky-600
        primaryHover: '#0369a1', // sky-700
        primaryLight: '#f0f9ff', // sky-50
        accentBorder: '#bae6fd', // sky-200
        badgeBg: '#e0f2fe', // sky-100
        badgeText: '#0369a1', // sky-700
        totalText: '#0284c7',
        headerText: '#0f172a',
        inputFocus: '#0284c7',
        navHover: '#e0f2fe',
      };
    }
    if (isPayment) {
      return {
        isPink: true,
        primary: '#db2777', // pink-600
        primaryHover: '#be185d', // pink-700
        primaryLight: '#fdf2f8', // pink-50
        accentBorder: '#fbcfe8', // pink-200
        badgeBg: '#fce7f3', // pink-100
        badgeText: '#9d174d', // pink-800
        totalText: '#db2777',
        headerText: '#831843',
        inputFocus: '#ec4899',
        navHover: '#fdf2f8',
      };
    }
    return {
      isPink: false,
      primary: '#0d9488', // teal-600
      primaryHover: '#0f766e', // teal-700
      primaryLight: '#f0fdfa', // teal-50
      accentBorder: '#99f6e4', // teal-200
      badgeBg: '#e2e8f0', // slate-200
      badgeText: '#334155', // slate-700
      totalText: '#0d9488',
      headerText: '#0f172a',
      inputFocus: '#0d9488',
      navHover: '#f1f5f9',
    };
  }, [isPayment, isCheque, isContra]);

  // Master Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vouchersList, setVouchersList] = useState<Array<{ _id: string; voucherNo: string; date: string }>>([]);
  const [currentVoucherIndex, setCurrentVoucherIndex] = useState<number>(-1);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);

  // Voucher Form State
  const [voucherNo, setVoucherNo] = useState<string>('1');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [status, setStatus] = useState<'Draft' | 'Posted'>('Draft');
  const [printPreview, setPrintPreview] = useState<boolean>(false);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  // Rows state - default to 1 single row for Payment / Receipt
  const [rows, setRows] = useState<VoucherLineEntry[]>([createEmptyRow()]);
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);

  // Input & Commit Refs for Payment / Receipt
  const accountInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const amountInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const discountInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const remarksInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const rowSnapshotRef = useRef<{ index: number; data: VoucherLineEntry } | null>(null);
  const rowCommittedRef = useRef<boolean>(false);

  // Journal entries state & refs
  const [journalRows, setJournalRows] = useState<JournalLineEntry[]>([createEmptyJournalRow()]);
  const [activeJournalRowIndex, setActiveJournalRowIndex] = useState<number>(0);
  const debitAccountInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const creditAccountInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const journalAmountInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const journalRemarksInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const journalRowSnapshotRef = useRef<{ index: number; data: JournalLineEntry } | null>(null);
  const journalRowCommittedRef = useRef<boolean>(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Cheque / Bank Payment & Receipt State
  const [chequePartyAccountId, setChequePartyAccountId] = useState<string>('');
  const [chequeDiscount, setChequeDiscount] = useState<number | ''>('');
  const [chequeRemarks, setChequeRemarks] = useState<string>('');
  const [chequeRows, setChequeRows] = useState<ChequeDetailLine[]>([
    createEmptyChequeRow(new Date().toISOString().slice(0, 10)),
  ]);
  const [chequeBillAllocations, setChequeBillAllocations] = useState<ChequeBillAllocation[]>([]);
  const [chequePrintOpen, setChequePrintOpen] = useState<boolean>(false);
  const [chequeRefType, setChequeRefType] = useState<'Against Ref' | 'On Account'>('On Account');
  const [chequeSettlements, setChequeSettlements] = useState<BillSettlement[]>([]);
  const chequeSettledCount = useMemo(() => {
    return chequeSettlements.filter((s) => s.selected && s.settleAmount > 0).length;
  }, [chequeSettlements]);

  // Cheque input refs for enter navigation
  const chequeBankRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const chequeTypeRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const chequeNoRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const chequeStatusRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const chequeDateRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const chequeAmountRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const chequeChargeRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  // Settlements mapping: lineIndex -> BillSettlement[]
  const [lineSettlements, setLineSettlements] = useState<Record<number, BillSettlement[]>>({});

  // Active party ledger opening & closing balance
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [openingIsDebit, setOpeningIsDebit] = useState<boolean>(true);
  const [closingBalance, setClosingBalance] = useState<number>(0);
  const [closingIsDebit, setClosingIsDebit] = useState<boolean>(true);

  // Dialogs
  const [refPromptOpen, setRefPromptOpen] = useState(false);
  const [refPromptLineIndex, setRefPromptLineIndex] = useState<number | null>(null);
  const [refPromptAccount, setRefPromptAccount] = useState<Account | null>(null);

  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [billDialogLineIndex, setBillDialogLineIndex] = useState<number | null>(null);
  const [settlements, setSettlements] = useState<BillSettlement[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);

  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load Accounts
  useEffect(() => {
    if (!companyId) return;
    ledgerAccountApi
      .list(companyId)
      .then((res) => {
        const list = (res.data.data as Account[]) ?? [];
        setAccounts(list);
        // Default cash account to first Cash or Bank account if not selected
        const defaultCash = list.find(
          (a) => a.type === 'Cash' || a.type === 'CASH' || a.name.toUpperCase().includes('CASH')
        );
        if (defaultCash && !cashAccountId) {
          setCashAccountId(defaultCash._id);
        }
      })
      .catch((err) => console.error('Failed to load accounts', err));
  }, [companyId]);

  // Load Next Voucher Number and Voucher List
  const loadNextNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await voucherApi.getNextNo(companyId, financialYearId, voucherType);
      const fullNo = res.data?.data?.voucherNo || '1';
      // Clean display e.g. "16" if format RV-00016
      const numMatch = fullNo.match(/(\d+)$/);
      setVoucherNo(numMatch ? parseInt(numMatch[1], 10).toString() : fullNo);
      setStatus('Draft');
      setCurrentVoucherId(null);
      setCurrentVoucherIndex(-1);
    } catch {
      setVoucherNo('1');
    }
  }, [companyId, financialYearId, voucherType]);

  const loadVouchersList = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await voucherApi.list(companyId, financialYearId, { voucherType, limit: 100 });
      const rawList = (res.data?.data?.vouchers as Array<{ _id: string; voucherNo: string; date: string; voucherType?: string; referenceType?: string; narration?: string }>) || [];
      const filtered = rawList.filter((v) => {
        if (v.voucherType && v.voucherType !== voucherType) return false;
        if (v.referenceType === 'SalesInvoice' || v.referenceType === 'PurchaseInvoice') return false;
        const n = (v.narration || '').toLowerCase();
        if (n.startsWith('pos sale') || n.startsWith('b2c sale') || n.startsWith('purchase ')) return false;
        return true;
      });
      setVouchersList(filtered);
    } catch (e) {
      console.error('Failed to list vouchers', e);
    }
  }, [companyId, financialYearId, voucherType]);

  useEffect(() => {
    loadNextNo();
    loadVouchersList();
  }, [loadNextNo, loadVouchersList]);

  // Cash / Bank accounts list
  const cashBankAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.type === 'Cash' ||
        a.type === 'Bank' ||
        a.type === 'CASH' ||
        a.type === 'BANK' ||
        a.name.toUpperCase().includes('CASH') ||
        a.name.toUpperCase().includes('BANK')
    );
  }, [accounts]);

  // Grid account options:
  // For Contra: strictly allow ONLY Bank Ledgers and Cash Ledgers (excluding the selected header account).
  // For Payment/Receipt: allow all accounts except the top selected Cash Account.
  const gridAccountOptions = useMemo(() => {
    if (isContra) {
      return cashBankAccounts.filter((a) => a._id !== cashAccountId);
    }
    return accounts.filter((a) => a._id !== cashAccountId);
  }, [accounts, cashAccountId, isContra, cashBankAccounts]);

  const handleCashAccountChange = (newCashId: string) => {
    const conflict = rows.find((r) => r.ledgerAccountId === newCashId);
    if (conflict) {
      setErrorMessage(
        'This account is already selected in the voucher grid. Please remove or change it from the grid first.'
      );
      setErrorDialogOpen(true);
      return;
    }
    setCashAccountId(newCashId);
  };

  // Calculate Totals
  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [rows]);

  const totalDiscount = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.discount) || 0), 0);
  }, [rows]);

  const totalNet = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  }, [rows]);

  const totalJournalAmount = useMemo(() => {
    return journalRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [journalRows]);

  // Target account for balance display: currently active row's account, or first account in rows
  const activeAcctId =
    (activeRowIndex !== null && rows[activeRowIndex]?.ledgerAccountId)
      ? rows[activeRowIndex].ledgerAccountId
      : rows.find((r) => r.ledgerAccountId)?.ledgerAccountId;

  const activeAccount = useMemo(() => {
    return accounts.find((a) => a._id === activeAcctId) || null;
  }, [accounts, activeAcctId]);

  // Fetch balances when target account changes
  useEffect(() => {
    if (!activeAcctId || !companyId || !financialYearId) {
      setOpeningBalance(0);
      setOpeningIsDebit(true);
      setClosingBalance(0);
      setClosingIsDebit(true);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    ledgerApi
      .report(companyId, financialYearId, activeAcctId, '2000-01-01', today)
      .then((res) => {
        const data = res.data?.data as {
          openingBalance?: number;
          openingIsDebit?: boolean;
          closingBalance?: number;
          closingIsDebit?: boolean;
        };
        if (data) {
          setOpeningBalance(data.openingBalance || 0);
          setOpeningIsDebit(data.openingIsDebit ?? true);
          setClosingBalance(data.closingBalance || 0);
          setClosingIsDebit(data.closingIsDebit ?? true);
        }
      })
      .catch(() => {
        setOpeningBalance(0);
        setOpeningIsDebit(true);
        setClosingBalance(0);
        setClosingIsDebit(true);
      });
  }, [activeAcctId, companyId, financialYearId]);

  // Cheque / Bank Master & Totals Calculations
  const bankAccounts = useMemo(() => {
    const list = accounts.filter(
      (a) =>
        a.type === 'Bank' ||
        a.type === 'BANK' ||
        a.name.toUpperCase().includes('BANK')
    );
    return list.length > 0 ? list : cashBankAccounts;
  }, [accounts, cashBankAccounts]);

  const chequePartyOptions = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.type !== 'Bank' &&
        a.type !== 'BANK' &&
        !a.name.toUpperCase().includes('BANK') &&
        a.type !== 'Cash' &&
        a.type !== 'CASH' &&
        !a.name.toUpperCase().includes('CASH')
    );
  }, [accounts]);

  const chequeTotalAmount = useMemo(() => {
    return chequeRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [chequeRows]);

  const chequeTotalBankCharge = useMemo(() => {
    return chequeRows.reduce((sum, r) => sum + (Number(r.bankCharge) || 0), 0);
  }, [chequeRows]);

  const chequeGrandTotal = useMemo(() => {
    return Math.max(0, chequeTotalAmount + chequeTotalBankCharge - (Number(chequeDiscount) || 0));
  }, [chequeTotalAmount, chequeTotalBankCharge, chequeDiscount]);

  const partyClosingBalance = useMemo(() => {
    const openVal = openingIsDebit ? openingBalance : -openingBalance;
    let closing = openVal;
    if (isChequePayment) {
      closing = openVal - chequeTotalAmount;
    } else if (isChequeReceipt) {
      closing = openVal + chequeTotalAmount;
    }
    return {
      amount: Math.abs(closing),
      isDebit: closing >= 0,
    };
  }, [openingBalance, openingIsDebit, chequeTotalAmount, isChequePayment, isChequeReceipt]);

  // Fetch balances and outstanding bills when Cheque Party changes
  useEffect(() => {
    if (!isCheque || !chequePartyAccountId || !companyId || !financialYearId) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    ledgerApi
      .report(companyId, financialYearId, chequePartyAccountId, '2000-01-01', today)
      .then((res) => {
        const data = res.data?.data as {
          openingBalance?: number;
          openingIsDebit?: boolean;
          closingBalance?: number;
          closingIsDebit?: boolean;
        };
        if (data) {
          setOpeningBalance(data.openingBalance || 0);
          setOpeningIsDebit(data.openingIsDebit ?? true);
        }
      })
      .catch(() => {});

    billReferenceApi
      .getOutstanding(companyId, chequePartyAccountId)
      .then((res) => {
        const bills = (res.data?.data || []) as Array<{
          billNumber: string;
          date: string;
          totalAmount: number;
          outstandingAmount: number;
          drCr: 'Dr' | 'Cr';
          voucherNo?: string;
          supplierInvoiceNo?: string;
        }>;
        const mapped: ChequeBillAllocation[] = bills.map((b) => ({
          billNumber: b.billNumber,
          date: b.date ? b.date.slice(0, 10) : '',
          invoiceNo: b.billNumber,
          supplierInvoiceNo: b.supplierInvoiceNo || b.billNumber,
          voucherNo: b.voucherNo || '',
          billAmount: b.totalAmount,
          billBalance: b.outstandingAmount,
          chequeNo: '',
          allocatedAmount: 0,
          remainingBalance: b.outstandingAmount,
          selected: false,
        }));
        setChequeBillAllocations(mapped);
      })
      .catch(() => {
        setChequeBillAllocations([]);
      });
  }, [chequePartyAccountId, isCheque, companyId, financialYearId]);

  const handleChequeRowChange = (
    index: number,
    field: keyof ChequeDetailLine,
    value: unknown
  ) => {
    setChequeRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddChequeRow = () => {
    setChequeRows((prev) => [...prev, createEmptyChequeRow(date)]);
  };

  const handleRemoveChequeRow = (index: number) => {
    if (chequeRows.length <= 1) {
      setChequeRows([createEmptyChequeRow(date)]);
      return;
    }
    setChequeRows((prev) => prev.filter((_, i) => i !== index));
  };


  // Handle row changes
  const handleRowChange = (
    index: number,
    field: keyof VoucherLineEntry,
    value: unknown
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      // Compute line total: Amount - Discount
      const amt = Number(row.amount) || 0;
      const disc = Number(row.discount) || 0;
      row.total = Math.max(0, parseFloat((amt - disc).toFixed(2)));

      updated[index] = row;
      return updated;
    });
  };

  // Revert uncommitted row edits back to snapshot
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setRows((prev) =>
        prev.map((r, i) => (i === snapshot.index ? { ...snapshot.data } : r))
      );
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  // Enter a row for editing: snapshot if committed
  const enterRow = useCallback((index: number, line?: VoucherLineEntry) => {
    if (rowSnapshotRef.current && rowSnapshotRef.current.index === index) return;
    revertUncommittedRow();
    const target = line ?? rows[index];
    if (target?.isCommitted) {
      rowSnapshotRef.current = {
        index,
        data: { ...target },
      };
      rowCommittedRef.current = false;
    }
  }, [revertUncommittedRow, rows]);

  // Commit row edits (accepted permanently)
  const commitRowEdits = useCallback((index: number) => {
    rowCommittedRef.current = true;
    rowSnapshotRef.current = null;
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, isCommitted: true } : r))
    );
  }, []);

  // Handle Enter key on Narration field
  const handleNarrationEnter = useCallback((index: number) => {
    const currentRow = rows[index];
    if (!currentRow) return;

    const amt = Number(currentRow.amount);
    const hasAccount = !!currentRow.ledgerAccountId;
    const hasValidAmount = !isNaN(amt) && amt > 0;

    // Check if appropriate contents are in the other fields
    if (!hasAccount) {
      setTimeout(() => {
        accountInputRefs.current[index]?.focus();
      }, 50);
      return;
    }

    if (!hasValidAmount) {
      setTimeout(() => {
        amountInputRefs.current[index]?.focus();
        amountInputRefs.current[index]?.select();
      }, 50);
      return;
    }

    // Row is valid! Commit edits permanently
    rowCommittedRef.current = true;
    rowSnapshotRef.current = null;

    if (index === rows.length - 1) {
      // Last row: atomically commit current row and add a new row
      const newRow = createEmptyRow();
      setRows((prev) => {
        const committedPrev = prev.map((r, i) => (i === index ? { ...r, isCommitted: true } : r));
        const next = [...committedPrev, newRow];
        const newIdx = next.length - 1;
        setActiveRowIndex(newIdx);
        setTimeout(() => {
          enterRow(newIdx, newRow);
          accountInputRefs.current[newIdx]?.focus();
        }, 60);
        return next;
      });
    } else {
      // Not last row: commit current row and move to next row's Account field
      commitRowEdits(index);
      const nextIdx = index + 1;
      const nextRow = rows[nextIdx];
      setActiveRowIndex(nextIdx);
      enterRow(nextIdx, nextRow);
      setTimeout(() => {
        accountInputRefs.current[nextIdx]?.focus();
      }, 50);
    }
  }, [rows, commitRowEdits, enterRow]);

  // ── Journal Voucher Row Logic & Enter Flow ──
  const handleJournalRowChange = (
    index: number,
    field: keyof JournalLineEntry,
    value: unknown
  ) => {
    setJournalRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const revertUncommittedJournalRow = useCallback(() => {
    if (journalRowSnapshotRef.current && !journalRowCommittedRef.current) {
      const snapshot = journalRowSnapshotRef.current;
      setJournalRows((prev) =>
        prev.map((r, i) => (i === snapshot.index ? { ...snapshot.data } : r))
      );
    }
    journalRowSnapshotRef.current = null;
    journalRowCommittedRef.current = false;
  }, []);

  const enterJournalRow = useCallback((index: number, line?: JournalLineEntry) => {
    if (journalRowSnapshotRef.current && journalRowSnapshotRef.current.index === index) return;
    revertUncommittedJournalRow();
    const target = line ?? journalRows[index];
    if (target?.isCommitted) {
      journalRowSnapshotRef.current = {
        index,
        data: { ...target },
      };
      journalRowCommittedRef.current = false;
    }
  }, [revertUncommittedJournalRow, journalRows]);

  const commitJournalRowEdits = useCallback((index: number) => {
    journalRowCommittedRef.current = true;
    journalRowSnapshotRef.current = null;
    setJournalRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, isCommitted: true } : r))
    );
  }, []);

  const handleJournalRemarksEnter = useCallback((index: number) => {
    const currentRow = journalRows[index];
    if (!currentRow) return;

    const amt = Number(currentRow.amount);
    const hasDebit = !!currentRow.debitAccountId;
    const hasCredit = !!currentRow.creditAccountId;
    const hasValidAmount = !isNaN(amt) && amt > 0;

    if (!hasDebit) {
      setTimeout(() => {
        debitAccountInputRefs.current[index]?.focus();
      }, 50);
      return;
    }

    if (!hasCredit) {
      setTimeout(() => {
        creditAccountInputRefs.current[index]?.focus();
      }, 50);
      return;
    }

    if (currentRow.debitAccountId === currentRow.creditAccountId) {
      setErrorMessage('Debit account and Credit account cannot be the same.');
      setErrorDialogOpen(true);
      setTimeout(() => {
        creditAccountInputRefs.current[index]?.focus();
      }, 50);
      return;
    }

    if (!hasValidAmount) {
      setTimeout(() => {
        journalAmountInputRefs.current[index]?.focus();
        journalAmountInputRefs.current[index]?.select();
      }, 50);
      return;
    }

    // Row is valid! Commit edits permanently
    commitJournalRowEdits(index);

    if (index === journalRows.length - 1) {
      // Last row: add a new row
      const newRow = createEmptyJournalRow();
      const newIdx = journalRows.length;
      setJournalRows((prev) => [...prev, newRow]);
      setActiveJournalRowIndex(newIdx);
      setTimeout(() => {
        enterJournalRow(newIdx, newRow);
        debitAccountInputRefs.current[newIdx]?.focus();
      }, 80);
    } else {
      // Not last row: move to next row's Debit Account field
      const nextIdx = index + 1;
      const nextRow = journalRows[nextIdx];
      setActiveJournalRowIndex(nextIdx);
      enterJournalRow(nextIdx, nextRow);
      setTimeout(() => {
        debitAccountInputRefs.current[nextIdx]?.focus();
      }, 50);
    }
  }, [journalRows, commitJournalRowEdits, enterJournalRow]);

  const handleDebitAccountSelect = (index: number, account: Account | null) => {
    if (!account) {
      setJournalRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], debitAccountId: '' };
        return next;
      });
      return;
    }

    const currentCredit = journalRows[index]?.creditAccountId;
    if (currentCredit && account._id === currentCredit) {
      setErrorMessage('Debit account cannot be the same as Credit account.');
      setErrorDialogOpen(true);
      return;
    }

    setJournalRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], debitAccountId: account._id };
      return next;
    });

    // Advance focus to Credit Account
    setTimeout(() => {
      creditAccountInputRefs.current[index]?.focus();
    }, 80);
  };

  const handleCreditAccountSelect = (index: number, account: Account | null) => {
    if (!account) {
      setJournalRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], creditAccountId: '' };
        return next;
      });
      return;
    }

    const currentDebit = journalRows[index]?.debitAccountId;
    if (currentDebit && account._id === currentDebit) {
      setErrorMessage('Credit account cannot be the same as Debit account.');
      setErrorDialogOpen(true);
      return;
    }

    setJournalRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], creditAccountId: account._id };
      return next;
    });

    // Advance focus to Amount
    setTimeout(() => {
      journalAmountInputRefs.current[index]?.focus();
      journalAmountInputRefs.current[index]?.select();
    }, 80);
  };

  const handleDeleteJournalRow = (index: number) => {
    if (journalRows.length <= 1) {
      setJournalRows([createEmptyJournalRow()]);
      setActiveJournalRowIndex(0);
      journalRowSnapshotRef.current = null;
      journalRowCommittedRef.current = false;
      return;
    }
    setJournalRows((prev) => prev.filter((_, i) => i !== index));
    setActiveJournalRowIndex((prev) => Math.max(0, Math.min(prev, journalRows.length - 2)));
    journalRowSnapshotRef.current = null;
    journalRowCommittedRef.current = false;
  };

  // When account is chosen in a row
  const handleAccountSelect = (index: number, account: Account | null) => {
    if (!account) {
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ledgerAccountId: '', refType: 'On Account' };
        return next;
      });
      return;
    }

    if (account._id === cashAccountId) {
      setErrorMessage(
        'You cannot select the same Cash/Bank account in the grid that is selected as the Voucher Cash Account.'
      );
      setErrorDialogOpen(true);
      return;
    }

    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ledgerAccountId: account._id };
      return next;
    });

    // Check againstRef from ledger registration:
    if (account.againstRef === true) {
      setRefPromptLineIndex(index);
      setRefPromptAccount(account);
      setRefPromptOpen(true);
    } else {
      // Default to "On Account" and advance to Amount
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], refType: 'On Account' };
        return next;
      });
      setTimeout(() => {
        amountInputRefs.current[index]?.focus();
        amountInputRefs.current[index]?.select();
      }, 80);
    }
  };

  // Open Against Ref Bill Settlement Dialog
  const openAgainstRefDialog = async (lineIndex: number, acctId?: string) => {
    const targetAccountId = acctId || rows[lineIndex]?.ledgerAccountId;
    if (!targetAccountId || !companyId) return;

    setBillDialogLineIndex(lineIndex);
    setLoadingBills(true);
    setBillDialogOpen(true);

    try {
      const res = await billReferenceApi.getOutstanding(companyId, targetAccountId);
      const bills = res.data?.data || [];

      // Existing settlements for this line if any
      const existing = lineSettlements[lineIndex] || [];
      const existingMap = new Map(existing.map((s) => [s.billNumber, s]));

      const newSettlements: BillSettlement[] = bills.map((bill) => {
        const prev = existingMap.get(bill.billNumber);
        return {
          billNumber: bill.billNumber,
          date: bill.date,
          totalAmount: bill.totalAmount,
          outstandingAmount: bill.outstandingAmount,
          settleAmount: prev?.settleAmount ?? (bills.length === 1 ? bill.outstandingAmount : 0),
          selected: prev?.selected ?? (bills.length === 1),
          drCr: bill.drCr,
          ledgerAccountId: targetAccountId,
        };
      });
      setSettlements(newSettlements);
    } catch {
      setSettlements([]);
    } finally {
      setLoadingBills(false);
    }
  };

  // Toggle bill selection
  const toggleBillSelection = (billIdx: number) => {
    setSettlements((prev) =>
      prev.map((s, i) => {
        if (i !== billIdx) return s;
        const newSelected = !s.selected;
        return {
          ...s,
          selected: newSelected,
          settleAmount: newSelected ? s.outstandingAmount : 0,
        };
      })
    );
  };

  // Update settle amount for a specific bill
  const updateBillSettleAmount = (billIdx: number, amount: number) => {
    setSettlements((prev) =>
      prev.map((s, i) => {
        if (i !== billIdx) return s;
        const clamped = Math.max(0, Math.min(amount, s.outstandingAmount));
        return {
          ...s,
          settleAmount: clamped,
          selected: clamped > 0,
        };
      })
    );
  };

  // Open Against Ref Bill Settlement Dialog for Cheque Payment/Receipt
  const openChequeAgainstRefDialog = async (acctId?: string) => {
    const targetAccountId = acctId || chequePartyAccountId;
    if (!targetAccountId || !companyId) return;

    setLoadingBills(true);
    setBillDialogOpen(true);

    try {
      const res = await billReferenceApi.getOutstanding(companyId, targetAccountId);
      const bills = res.data?.data || [];

      // Existing settlements for cheque if any
      const existingMap = new Map(chequeSettlements.map((s) => [s.billNumber, s]));

      const newSettlements: BillSettlement[] = bills.map((bill) => {
        const prev = existingMap.get(bill.billNumber);
        return {
          billNumber: bill.billNumber,
          date: bill.date,
          totalAmount: bill.totalAmount,
          outstandingAmount: bill.outstandingAmount,
          settleAmount: prev?.settleAmount ?? (bills.length === 1 ? bill.outstandingAmount : 0),
          selected: prev?.selected ?? (bills.length === 1),
          drCr: bill.drCr,
          ledgerAccountId: targetAccountId,
        };
      });
      setSettlements(newSettlements);
    } catch {
      setSettlements([]);
    } finally {
      setLoadingBills(false);
    }
  };

  // Handle party selection for Cheque Payment / Cheque Receipt
  const handleChequePartySelect = (account: Account | null) => {
    if (!account) {
      setChequePartyAccountId('');
      setChequeRefType('On Account');
      setChequeSettlements([]);
      return;
    }

    setChequePartyAccountId(account._id);

    if (account.againstRef === true) {
      setRefPromptAccount(account);
      setRefPromptOpen(true);
    } else {
      setChequeRefType('On Account');
      setChequeSettlements([]);
    }
  };

  // Confirm Against Ref Bill Settlements
  const confirmSettlements = () => {
    const selected = settlements.filter((s) => s.selected && s.settleAmount > 0);
    const totalSettled = selected.reduce((sum, s) => sum + s.settleAmount, 0);

    if (isCheque) {
      setChequeSettlements(selected);
      setChequeRefType('Against Ref');
      if (totalSettled > 0) {
        setChequeRows((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            next[0] = { ...next[0], amount: totalSettled };
          }
          return next;
        });
      }
      setBillDialogOpen(false);
      return;
    }

    if (billDialogLineIndex === null) return;

    setLineSettlements((prev) => ({
      ...prev,
      [billDialogLineIndex]: selected,
    }));

    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[billDialogLineIndex] };
      row.refType = 'Against Ref';
      if (totalSettled > 0) {
        row.amount = totalSettled;
        const disc = Number(row.discount) || 0;
        row.total = Math.max(0, totalSettled - disc);
      }
      next[billDialogLineIndex] = row;
      return next;
    });

    setBillDialogOpen(false);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) {
      setRows([createEmptyRow()]);
      setActiveRowIndex(0);
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
    setActiveRowIndex((prev) => Math.max(0, Math.min(prev, rows.length - 2)));
    setLineSettlements((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  };

  // Reset / Clear to fresh draft - default to 1 row
  const handleClear = () => {
    loadNextNo();
    setDate(new Date().toISOString().slice(0, 10));
    if (isJournal) {
      setJournalRows([createEmptyJournalRow()]);
      setActiveJournalRowIndex(0);
      journalRowSnapshotRef.current = null;
      journalRowCommittedRef.current = false;
    } else if (isCheque) {
      setChequePartyAccountId('');
      setChequeDiscount('');
      setChequeRemarks('');
      setChequeRefType('On Account');
      setChequeSettlements([]);
      setChequeRows([
        createEmptyChequeRow(new Date().toISOString().slice(0, 10)),
      ]);
      setChequeBillAllocations([]);
    } else {
      setRows([createEmptyRow()]);
      setActiveRowIndex(0);
      setLineSettlements({});
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    setStatus('Draft');
    setCurrentVoucherId(null);
  };

  // Load existing voucher by ID
  const loadVoucherData = async (id: string) => {
    try {
      const res = await voucherApi.getById(id);
      const v = res.data?.data as {
        _id: string;
        voucherNo: string;
        date: string;
        status: string;
        lines: Array<{
          ledgerAccountId: { _id: string; name: string; code: string } | string;
          debitAmount: number;
          creditAmount: number;
          narration?: string;
          chequeNo?: string;
        }>;
      };

      if (!v) return;
      setCurrentVoucherId(v._id);
      const numMatch = v.voucherNo.match(/(\d+)$/);
      setVoucherNo(numMatch ? parseInt(numMatch[1], 10).toString() : v.voucherNo);
      setDate(v.date ? v.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setStatus((v.status as 'Draft' | 'Posted') || 'Posted');

      if (isJournal) {
        const debits = v.lines.filter((l) => (l.debitAmount || 0) > 0);
        const credits = v.lines.filter((l) => (l.creditAmount || 0) > 0);
        const count = Math.max(debits.length, credits.length);
        const loadedRows: JournalLineEntry[] = [];
        for (let i = 0; i < count; i++) {
          const d = debits[i];
          const c = credits[i];
          const dAcct = typeof d?.ledgerAccountId === 'object' ? d.ledgerAccountId._id : d?.ledgerAccountId || '';
          const cAcct = typeof c?.ledgerAccountId === 'object' ? c.ledgerAccountId._id : c?.ledgerAccountId || '';
          const amt = d?.debitAmount || c?.creditAmount || 0;
          const rem = d?.narration || c?.narration || '';
          loadedRows.push({
            debitAccountId: dAcct,
            creditAccountId: cAcct,
            amount: amt,
            remarks: rem,
            isCommitted: true,
          });
        }
        setJournalRows(loadedRows.length > 0 ? loadedRows : [createEmptyJournalRow()]);
        setActiveJournalRowIndex(0);
        journalRowSnapshotRef.current = null;
        journalRowCommittedRef.current = false;
      } else if (isCheque) {
        const bankAcctIds = new Set(bankAccounts.map((a) => a._id));
        let partyId = '';
        const loadedChequeRows: ChequeDetailLine[] = [];
        let loadedRemarks = '';

        v.lines.forEach((l) => {
          const acctId = typeof l.ledgerAccountId === 'object' ? l.ledgerAccountId._id : l.ledgerAccountId;
          const isBankLine = bankAcctIds.has(acctId);
          if (l.narration && !loadedRemarks) {
            loadedRemarks = l.narration;
          }
          if (isChequePayment) {
            if (isBankLine || (l.creditAmount || 0) > 0) {
              if (partyId !== acctId) {
                loadedChequeRows.push({
                  id: Math.random().toString(36).substring(2, 9),
                  bankAccountId: acctId,
                  type: 'CHEQUE',
                  chequeNo: (v as any).chequeNumber || (l as { chequeNo?: string }).chequeNo || '',
                  status: ((v as any).chequeStatus as 'PENDING' | 'CLEARED' | 'BOUNCED') || ((v as any).isReconciled ? 'CLEARED' : 'PENDING'),
                  date: (v as any).chequeDate ? (v as any).chequeDate.slice(0, 10) : ((v as any).bankDate ? (v as any).bankDate.slice(0, 10) : (v.date ? v.date.slice(0, 10) : new Date().toISOString().slice(0, 10))),
                  amount: l.creditAmount || 0,
                  bankCharge: 0,
                  isCommitted: true,
                });
              }
            } else if (!partyId && (l.debitAmount || 0) > 0) {
              partyId = acctId;
            }
          } else {
            // Cheque Receipt
            if (isBankLine || (l.debitAmount || 0) > 0) {
              if (partyId !== acctId) {
                loadedChequeRows.push({
                  id: Math.random().toString(36).substring(2, 9),
                  bankAccountId: acctId,
                  type: 'CHEQUE',
                  chequeNo: (v as any).chequeNumber || (l as { chequeNo?: string }).chequeNo || '',
                  status: ((v as any).chequeStatus as 'PENDING' | 'CLEARED' | 'BOUNCED') || ((v as any).isReconciled ? 'CLEARED' : 'PENDING'),
                  date: (v as any).chequeDate ? (v as any).chequeDate.slice(0, 10) : ((v as any).bankDate ? (v as any).bankDate.slice(0, 10) : (v.date ? v.date.slice(0, 10) : new Date().toISOString().slice(0, 10))),
                  amount: l.debitAmount || 0,
                  bankCharge: 0,
                  isCommitted: true,
                });
              }
            } else if (!partyId && (l.creditAmount || 0) > 0) {
              partyId = acctId;
            }
          }
        });

        if (partyId) {
          setChequePartyAccountId(partyId);
        }
        setChequeRefType('On Account');
        setChequeSettlements([]);
        while (loadedChequeRows.length < 5) {
          loadedChequeRows.push(createEmptyChequeRow(v.date ? v.date.slice(0, 10) : undefined));
        }
        setChequeRows(loadedChequeRows);
        setChequeRemarks(loadedRemarks);
      } else {
        // Separate cash line from party lines
        const cashAcctIds = new Set(cashBankAccounts.map((a) => a._id));
        let headerCashId = cashAccountId;
        const lineEntries: VoucherLineEntry[] = [];

        v.lines.forEach((l) => {
          const acctId = typeof l.ledgerAccountId === 'object' ? l.ledgerAccountId._id : l.ledgerAccountId;
          // If it's the cash account matching payment/receipt side
          if (isReceipt && l.debitAmount > 0 && cashAcctIds.has(acctId) && !lineEntries.length) {
            headerCashId = acctId;
          } else if ((isPayment || isContra) && l.creditAmount > 0 && cashAcctIds.has(acctId) && !lineEntries.length) {
            headerCashId = acctId;
          } else {
            const amt = isReceipt ? l.creditAmount : l.debitAmount;
            lineEntries.push({
              ledgerAccountId: acctId,
              amount: amt || 0,
              discount: 0,
              total: amt || 0,
              remarks: l.narration || '',
              refType: 'On Account',
              isCommitted: true,
            });
          }
        });

        setCashAccountId(headerCashId);
        setRows(
          lineEntries.length > 0
            ? lineEntries
            : [createEmptyRow()]
        );
        setActiveRowIndex(0);
        rowSnapshotRef.current = null;
        rowCommittedRef.current = false;
      }
    } catch (e) {
      console.error('Failed to load voucher', e);
    }
  };

  // Voucher Navigation
  const handleNav = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (vouchersList.length === 0) return;
    let targetIndex = currentVoucherIndex;

    if (direction === 'first') {
      targetIndex = vouchersList.length - 1; // oldest
    } else if (direction === 'last') {
      targetIndex = 0; // newest
    } else if (direction === 'prev') {
      targetIndex = targetIndex === -1 ? 0 : Math.min(targetIndex + 1, vouchersList.length - 1);
    } else if (direction === 'next') {
      targetIndex = targetIndex <= 0 ? -1 : targetIndex - 1;
    }

    if (targetIndex === -1) {
      handleClear();
    } else {
      setCurrentVoucherIndex(targetIndex);
      loadVoucherData(vouchersList[targetIndex]._id);
    }
  };

  // Save Voucher
  const handleSave = async () => {
    if (!companyId || !financialYearId) {
      setErrorMessage('Please select a company and financial year.');
      setErrorDialogOpen(true);
      return;
    }

    if (isJournal) {
      const validJournalRows = journalRows.filter(
        (r) => r.debitAccountId && r.creditAccountId && Number(r.amount) > 0
      );

      if (validJournalRows.length === 0) {
        setErrorMessage('Please add at least one entry with Debit Account, Credit Account, and Amount greater than 0.');
        setErrorDialogOpen(true);
        return;
      }

      setSaving(true);
      try {
        const voucherLines: Array<{
          ledgerAccountId: string;
          debitAmount: number;
          creditAmount: number;
          narration?: string;
        }> = [];

        validJournalRows.forEach((r) => {
          const amt = parseFloat(Number(r.amount).toFixed(2));
          voucherLines.push({
            ledgerAccountId: r.debitAccountId,
            debitAmount: amt,
            creditAmount: 0,
            narration: r.remarks || '',
          });
          voucherLines.push({
            ledgerAccountId: r.creditAccountId,
            debitAmount: 0,
            creditAmount: amt,
            narration: r.remarks || '',
          });
        });

        await voucherApi.create({
          companyId,
          financialYearId,
          voucherType,
          date,
          narration: '',
          lines: voucherLines,
        });

        setStatus('Posted');
        setSuccessMessage('Journal Voucher saved successfully!');
        setSuccessDialogOpen(true);
        loadVouchersList();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        setErrorMessage(e?.response?.data?.message || 'Failed to save Journal Voucher.');
        setErrorDialogOpen(true);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (isCheque) {
      if (!chequePartyAccountId) {
        setErrorMessage(`Please select a ${isChequePayment ? 'Paid To' : 'Received From'} Party Account.`);
        setErrorDialogOpen(true);
        return;
      }

      const validChequeRows = chequeRows.filter(
        (r) => r.bankAccountId && Number(r.amount) > 0
      );

      if (validChequeRows.length === 0) {
        setErrorMessage('Please add at least one Cheque/Bank entry with Bank Name and Amount greater than 0.');
        setErrorDialogOpen(true);
        return;
      }

      setSaving(true);
      try {
        const voucherLines: Array<{
          ledgerAccountId: string;
          debitAmount: number;
          creditAmount: number;
          narration?: string;
        }> = [];

        if (isChequePayment) {
          // Cheque Payment: Debit Party for chequeTotalAmount
          voucherLines.push({
            ledgerAccountId: chequePartyAccountId,
            debitAmount: parseFloat(chequeTotalAmount.toFixed(2)),
            creditAmount: 0,
            narration: chequeRemarks || `Payment to ${accounts.find((a) => a._id === chequePartyAccountId)?.name || 'Party'}`,
          });

          // Credit each Bank
          validChequeRows.forEach((r) => {
            const amt = parseFloat((Number(r.amount) || 0).toFixed(2));
            const chqInfo = r.chequeNo ? ` Chq# ${r.chequeNo}` : '';
            voucherLines.push({
              ledgerAccountId: r.bankAccountId,
              debitAmount: 0,
              creditAmount: amt,
              narration: `${chequeRemarks ? chequeRemarks + ' - ' : ''}${r.type}${chqInfo}`.trim(),
            });
          });
        } else {
          // Cheque Receipt:
          // Debit each Bank
          validChequeRows.forEach((r) => {
            const amt = parseFloat((Number(r.amount) || 0).toFixed(2));
            const chqInfo = r.chequeNo ? ` Chq# ${r.chequeNo}` : '';
            voucherLines.push({
              ledgerAccountId: r.bankAccountId,
              debitAmount: amt,
              creditAmount: 0,
              narration: `${chequeRemarks ? chequeRemarks + ' - ' : ''}${r.type}${chqInfo}`.trim(),
            });
          });

          // Credit Party
          voucherLines.push({
            ledgerAccountId: chequePartyAccountId,
            debitAmount: 0,
            creditAmount: parseFloat(chequeTotalAmount.toFixed(2)),
            narration: chequeRemarks || `Receipt from ${accounts.find((a) => a._id === chequePartyAccountId)?.name || 'Party'}`,
          });
        }

        const firstCheque = validChequeRows[0];
        const res = await voucherApi.create({
          companyId,
          financialYearId,
          voucherType,
          date,
          narration: chequeRemarks || '',
          lines: voucherLines,
          chequeNumber: firstCheque?.chequeNo || undefined,
          chequeDate: firstCheque?.date || undefined,
          bankLedgerId: firstCheque?.bankAccountId || undefined,
          chequeStatus: firstCheque?.status || 'PENDING',
        });

        const newVoucher = res.data?.data as { _id: string; voucherNo?: string };
        const newVoucherId = newVoucher?._id;

        // Settle Allocated Bills (Against Ref) if any
        if (newVoucherId) {
          const activeSettlements =
            chequeRefType === 'Against Ref' && chequeSettlements.length > 0
              ? chequeSettlements.filter((s) => s.selected && s.settleAmount > 0)
              : chequeBillAllocations
                  .filter((b) => b.selected && b.allocatedAmount > 0)
                  .map((b) => ({
                    billNumber: b.billNumber,
                    settleAmount: b.allocatedAmount,
                    chequeNo: b.chequeNo,
                  }));

          if (activeSettlements.length > 0) {
            const settlementsPayload = activeSettlements.map((b) => ({
              ledgerAccountId: chequePartyAccountId,
              billNumber: b.billNumber,
              amount: b.settleAmount,
              drCr: isChequeReceipt ? ('Cr' as const) : ('Dr' as const),
              narration: 'chequeNo' in b && b.chequeNo ? `Cheque #${b.chequeNo}` : (b.billNumber ? `Agst Ref ${b.billNumber}` : ''),
            }));

            try {
              await billReferenceApi.settle({
                companyId,
                financialYearId,
                voucherId: newVoucherId,
                date,
                settlements: settlementsPayload,
              });
            } catch (settleErr) {
              console.error('Cheque bill settlement error:', settleErr);
            }
          }
        }

        setStatus('Posted');
        setSuccessMessage(`${isChequePayment ? 'Bank Payment' : 'Bank Receipt'} Voucher saved successfully!`);
        setSuccessDialogOpen(true);
        loadVouchersList();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        setErrorMessage(e?.response?.data?.message || 'Failed to save Cheque Voucher.');
        setErrorDialogOpen(true);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!cashAccountId) {
      setErrorMessage('Please select a Cash Account.');
      setErrorDialogOpen(true);
      return;
    }

    const validRows = rows.filter(
      (r) => r.ledgerAccountId && Number(r.amount) > 0
    );

    if (validRows.length === 0) {
      setErrorMessage('Please add at least one account entry with an amount greater than 0.');
      setErrorDialogOpen(true);
      return;
    }

    setSaving(true);
    try {
      // Build balanced double-entry lines for backend
      // Receipt Voucher:
      // Cash Account -> DEBIT totalNet
      // Line Accounts -> CREDIT line.total
      // Payment Voucher:
      // Line Accounts -> DEBIT line.total
      // Cash Account -> CREDIT totalNet
      const voucherLines: Array<{
        ledgerAccountId: string;
        debitAmount: number;
        creditAmount: number;
        narration?: string;
      }> = [];

      if (isReceipt) {
        // Debit Cash
        voucherLines.push({
          ledgerAccountId: cashAccountId,
          debitAmount: parseFloat(totalNet.toFixed(2)),
          creditAmount: 0,
          narration: '',
        });

        // Credit Parties
        validRows.forEach((r) => {
          voucherLines.push({
            ledgerAccountId: r.ledgerAccountId,
            debitAmount: 0,
            creditAmount: parseFloat(r.total.toFixed(2)),
            narration: r.remarks || '',
          });
        });
      } else {
        // Payment Voucher: Debit Parties
        validRows.forEach((r) => {
          voucherLines.push({
            ledgerAccountId: r.ledgerAccountId,
            debitAmount: parseFloat(r.total.toFixed(2)),
            creditAmount: 0,
            narration: r.remarks || '',
          });
        });

        // Credit Cash
        voucherLines.push({
          ledgerAccountId: cashAccountId,
          debitAmount: 0,
          creditAmount: parseFloat(totalNet.toFixed(2)),
          narration: '',
        });
      }

      const res = await voucherApi.create({
        companyId,
        financialYearId,
        voucherType,
        date,
        narration: '',
        lines: voucherLines,
      });

      const newVoucher = res.data?.data as { _id: string; voucherNo?: string };
      const newVoucherId = newVoucher?._id;

      // Settle Against Reference Bills if any
      if (newVoucherId) {
        const allSettlements: Array<{
          ledgerAccountId: string;
          billNumber: string;
          amount: number;
          drCr: 'Dr' | 'Cr';
          narration?: string;
        }> = [];

        Object.entries(lineSettlements).forEach(([, bills]) => {
          bills.forEach((bill) => {
            if (bill.selected && bill.settleAmount > 0) {
              allSettlements.push({
                ledgerAccountId: bill.ledgerAccountId,
                billNumber: bill.billNumber,
                amount: bill.settleAmount,
                // Agst Ref is opposite of New Ref:
                // Receipt settles receivable (New Ref Dr -> Agst Ref Cr)
                // Payment settles payable (New Ref Cr -> Agst Ref Dr)
                drCr: isReceipt ? 'Cr' : 'Dr',
                narration: '',
              });
            }
          });
        });

        if (allSettlements.length > 0) {
          try {
            await billReferenceApi.settle({
              companyId,
              financialYearId,
              voucherId: newVoucherId,
              date,
              settlements: allSettlements,
            });
          } catch (settleErr) {
            console.error('Settlement error:', settleErr);
          }
        }
      }

      setStatus('Posted');
      setSuccessMessage(`${voucherType} Voucher saved successfully!`);
      setSuccessDialogOpen(true);
      loadVouchersList();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setErrorMessage(e?.response?.data?.message || 'Failed to save voucher. Debits must equal credits.');
      setErrorDialogOpen(true);
    } finally {
      setSaving(false);
    }
  };

  // Delete Voucher
  const handleDeleteVoucher = async () => {
    if (!currentVoucherId) return;
    try {
      await voucherApi.delete(currentVoucherId);
      setDeleteConfirmOpen(false);
      setSuccessMessage('Voucher deleted successfully.');
      setSuccessDialogOpen(true);
      loadVouchersList();
      handleClear();
    } catch {
      setErrorMessage('Failed to delete voucher.');
      setErrorDialogOpen(true);
    }
  };

  // Print voucher
  const handlePrint = () => {
    window.print();
  };

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      } else if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Box
      sx={{
        p: { xs: 1, md: 1.5 },
        bgcolor: '#f8fafc',
        minHeight: '100vh',
        fontFamily: "'Inter', sans-serif",
        '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
          WebkitAppearance: 'none',
          margin: 0,
        },
        '& input[type=number]': {
          MozAppearance: 'textfield',
        },
      }}
    >
      {isCheque ? (
        <Box sx={{ maxWidth: '100%' }}>
          {/* ── Top Bar: Breadcrumb, Title, Branch, User, Navigation ── */}
          <Box sx={{ mb: 0.8 }}>
            <Typography
              variant="body2"
              sx={{ color: '#64748b', fontSize: '0.78rem', mb: 0.2, fontWeight: 500 }}
            >
              Accounting &nbsp;/&nbsp; Vouchers
            </Typography>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1.0,
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  color: '#002b49',
                  letterSpacing: '-0.02em',
                  fontSize: { xs: '1.10rem', md: '1.30rem' },
                  lineHeight: 1.2,
                }}
              >
                {isChequePayment ? 'Bank Payment' : 'Bank Receipt'}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.0, flexWrap: 'wrap' }}>
                {/* Branch selector */}
                <TextField
                  select
                  size="small"
                  value="Main Branch"
                  sx={{
                    width: 135,
                    bgcolor: '#ffffff',
                    '& .MuiOutlinedInput-root': {
                      height: 28,
                      borderRadius: '6px',
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      '& .MuiSelect-select': {
                        py: '2px !important',
                        px: '8px !important',
                        color: '#0f172a !important',
                        fontWeight: '700 !important',
                        lineHeight: '22px !important',
                        display: 'flex',
                        alignItems: 'center',
                      },
                      '& .MuiSvgIcon-root': { color: '#0f172a', fontSize: 18 },
                      '& fieldset': { borderColor: '#cbd5e1' },
                      '&:hover fieldset': { borderColor: '#94a3b8' },
                      '& legend': { display: 'none' },
                    },
                  }}
                >
                  <MenuItem value="Main Branch" sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                    Main Branch
                  </MenuItem>
                </TextField>

                {/* User badge */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.9,
                    py: 0.2,
                    height: 28,
                    boxSizing: 'border-box',
                    borderRadius: '6px',
                    bgcolor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                  }}
                >
                  <PersonOutlineIcon sx={{ fontSize: 16, color: '#0f172a' }} />
                  ADMIN
                </Box>

                {/* Voucher Navigation - Crisp & Modern ERP Toolbar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  <Tooltip title="First Voucher">
                    <IconButton
                      size="small"
                      onClick={() => handleNav('first')}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '5px',
                        border: '1px solid #cbd5e1',
                        bgcolor: '#ffffff',
                        color: '#0f172a',
                        p: 0,
                        '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7', color: '#0284c7' },
                      }}
                    >
                      <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Previous Voucher">
                    <IconButton
                      size="small"
                      onClick={() => handleNav('prev')}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '5px',
                        border: '1px solid #cbd5e1',
                        bgcolor: '#ffffff',
                        color: '#0f172a',
                        p: 0,
                        '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7', color: '#0284c7' },
                      }}
                    >
                      <KeyboardArrowLeftIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.6,
                      px: 0.9,
                      height: 28,
                      border: '1px solid #cbd5e1',
                      borderRadius: '5px',
                      bgcolor: '#ffffff',
                    }}
                  >
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
                      Voucher No.
                    </Typography>
                    <TextField
                      size="small"
                      value={voucherNo}
                      onChange={(e) => setVoucherNo(e.target.value)}
                      sx={{
                        width: 48,
                        '& .MuiOutlinedInput-root': {
                          bgcolor: '#f1f5f9',
                          height: 22,
                          borderRadius: '4px',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          color: '#0f172a',
                          '& input': { textAlign: 'center', p: '0px !important', color: '#0f172a !important', fontWeight: '800 !important' },
                          '& fieldset': { borderColor: '#cbd5e1' },
                          '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                        },
                      }}
                    />
                  </Box>

                  <Tooltip title="Next Voucher">
                    <IconButton
                      size="small"
                      onClick={() => handleNav('next')}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '5px',
                        border: '1px solid #cbd5e1',
                        bgcolor: '#ffffff',
                        color: '#0f172a',
                        p: 0,
                        '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7', color: '#0284c7' },
                      }}
                    >
                      <KeyboardArrowRightIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Last Voucher">
                    <IconButton
                      size="small"
                      onClick={() => handleNav('last')}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '5px',
                        border: '1px solid #cbd5e1',
                        bgcolor: '#ffffff',
                        color: '#0f172a',
                        p: 0,
                        '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7', color: '#0284c7' },
                      }}
                    >
                      <KeyboardDoubleArrowRightIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* ── Card 1: Party Details, Balances & Amounts (Clean & Symmetrical Windows) ── */}
          <Paper
            elevation={0}
            sx={{
              py: 1.0,
              px: 1.5,
              mb: 1.0,
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              bgcolor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.0,
            }}
          >
            {/* Row 1: Paid To * (Left, Flex 1) & Date * (Right Aligned, 280px) */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 320, mr: 2 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', width: 115, minWidth: 115 }}>
                  {isChequePayment ? 'Paid To' : 'Received From'}{' '}
                  <span style={{ color: '#ef4444' }}>*</span>
                </Typography>
                <Autocomplete
                  size="small"
                  fullWidth
                  options={chequePartyOptions}
                  getOptionLabel={(opt) => `${opt.name}${opt.code ? ` (${opt.code})` : ''}`}
                  value={chequePartyOptions.find((a) => a._id === chequePartyAccountId) || null}
                  onChange={(_, newVal) => handleChequePartySelect(newVal)}
                  isOptionEqualToValue={(opt, val) => opt._id === val._id}
                  renderOption={(props, option) => (
                    <li {...props} key={option._id}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', py: 0.2 }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.80rem' }}>
                            {option.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.70rem' }}>
                            Code: {option.code}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Chip
                            label={option.type}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 18 }}
                          />
                          {option.againstRef && (
                            <Typography
                              variant="caption"
                              sx={{ display: 'block', color: '#0284c7', fontSize: '0.68rem', fontWeight: 700 }}
                            >
                              Against Ref
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Select party account..."
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {chequePartyAccountId && (
                              <Tooltip title="Click to change Reference Type / Settle Bills">
                                <Chip
                                  size="small"
                                  label={
                                    chequeRefType === 'Against Ref' && chequeSettledCount > 0
                                      ? `Agst Ref (${chequeSettledCount})`
                                      : (chequeRefType || 'On Account')
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const selected = accounts.find((a) => a._id === chequePartyAccountId);
                                    if (selected?.againstRef) {
                                      setRefPromptAccount(selected);
                                      setRefPromptOpen(true);
                                    } else {
                                      openChequeAgainstRefDialog();
                                    }
                                  }}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    mr: 0.3,
                                    bgcolor:
                                      chequeRefType === 'Against Ref'
                                        ? '#e0f2fe'
                                        : '#f1f5f9',
                                    color:
                                      chequeRefType === 'Against Ref'
                                        ? '#0369a1'
                                        : '#475569',
                                    border: `1px solid ${
                                      chequeRefType === 'Against Ref'
                                        ? '#bae6fd'
                                        : '#cbd5e1'
                                    }`,
                                    '&:hover': { opacity: 0.85 },
                                  }}
                                />
                              </Tooltip>
                            )}
                            {params.InputProps.endAdornment}
                          </Box>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: '#f8fafc',
                          borderRadius: '6px',
                          height: 28,
                          fontSize: '0.80rem',
                          fontWeight: 700,
                          '& input': { py: '2px !important', px: '8px !important', color: '#0f172a !important', fontWeight: '700 !important' },
                          '& fieldset': { borderColor: '#cbd5e1' },
                          '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                        },
                      }}
                    />
                  )}
                />
                <IconButton
                  size="small"
                  onClick={() => setSearchDialogOpen(true)}
                  sx={{
                    ml: 0.6,
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    width: 28,
                    height: 28,
                    p: 0.3,
                    bgcolor: '#f8fafc',
                    color: '#0f172a',
                    '&:hover': { bgcolor: '#f1f5f9' },
                  }}
                >
                  <SearchIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>

              {/* Date Box: Exactly 280px wide, right aligned */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 280, justifyContent: 'flex-end', ml: 'auto' }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', whiteSpace: 'nowrap', mr: 1 }}>
                  Date <span style={{ color: '#ef4444' }}>*</span>
                </Typography>
                <Box
                  onClick={() => dateInputRef.current?.showPicker?.()}
                  sx={{ position: 'relative', cursor: 'pointer', width: 150 }}
                >
                  <TextField
                    size="small"
                    fullWidth
                    value={date ? dayjs(date).format('DD MMM YYYY') : ''}
                    InputProps={{
                      readOnly: true,
                      endAdornment: (
                        <InputAdornment position="end" sx={{ mr: -0.5 }}>
                          <CalendarMonthIcon sx={{ fontSize: 16, color: '#475569' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      cursor: 'pointer',
                      '& .MuiOutlinedInput-root': {
                        bgcolor: '#ffffff',
                        borderRadius: '6px',
                        height: 28,
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        '& input': { py: '2px !important', px: '6px !important', color: '#0f172a !important', fontWeight: '700 !important', cursor: 'pointer' },
                        '& fieldset': { borderColor: '#cbd5e1' },
                        '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                      },
                    }}
                  />
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
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
            </Box>

            {/* Row 2: Opening Balance (Col 1) | Amount (Col 2) | Bank Charge (Col 3, Right Aligned) */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {/* Col 1: Opening Balance (width: 265px) */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 265 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', width: 115, minWidth: 115 }}>
                  Opening Balance
                </Typography>
                <Box
                  sx={{
                    width: 150,
                    height: 28,
                    px: 1,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    bgcolor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                    boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.02)',
                  }}
                >
                  {`AED ${openingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${openingBalance > 0 ? (openingIsDebit ? 'Dr' : 'Cr') : ''}`}
                </Box>
              </Box>

              {/* Vertical Divider between Balances and Amounts */}
              <Divider orientation="vertical" flexItem sx={{ borderColor: '#e2e8f0', mx: 2, height: 20, alignSelf: 'center' }} />

              {/* Col 2: Amount (AED) (width: 250px) */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 250 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', width: 105, minWidth: 105 }}>
                  Amount (AED)
                </Typography>
                <TextField
                  size="small"
                  value={chequeTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  InputProps={{ readOnly: true }}
                  sx={{
                    width: 145,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#f8fafc',
                      borderRadius: '6px',
                      height: 28,
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.02)',
                      '& input': { textAlign: 'right', py: '2px !important', px: '8px !important', color: '#0f172a !important', fontWeight: '700 !important' },
                      '& fieldset': { borderColor: '#cbd5e1' },
                    },
                  }}
                />
              </Box>

              {/* Col 3: Bank Charge (AED) (width: 280px, Right Aligned) */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 280, justifyContent: 'flex-end', ml: 'auto' }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', whiteSpace: 'nowrap', mr: 1 }}>
                  Bank Charge (AED)
                </Typography>
                <TextField
                  size="small"
                  value={chequeTotalBankCharge.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  InputProps={{ readOnly: true }}
                  sx={{
                    width: 150,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#f8fafc',
                      borderRadius: '6px',
                      height: 28,
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.02)',
                      '& input': { textAlign: 'right', py: '2px !important', px: '8px !important', color: '#0f172a !important', fontWeight: '700 !important' },
                      '& fieldset': { borderColor: '#cbd5e1' },
                    },
                  }}
                />
              </Box>
            </Box>

            {/* Row 3: Closing Balance (Col 1) | Discount (Col 2) | Total Amount (Col 3, Right Aligned) */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {/* Col 1: Closing Balance (width: 265px) */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 265 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', width: 115, minWidth: 115 }}>
                  Closing Balance
                </Typography>
                <Box
                  sx={{
                    width: 150,
                    height: 28,
                    px: 1,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    bgcolor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                    boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.02)',
                  }}
                >
                  {`AED ${partyClosingBalance.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${partyClosingBalance.amount > 0 ? (partyClosingBalance.isDebit ? 'Dr' : 'Cr') : ''}`}
                </Box>
              </Box>

              {/* Vertical Divider matching Row 2 */}
              <Divider orientation="vertical" flexItem sx={{ borderColor: '#e2e8f0', mx: 2, height: 20, alignSelf: 'center' }} />

              {/* Col 2: Discount (AED) (width: 250px) */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 250 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.80rem', width: 105, minWidth: 105 }}>
                  Discount (AED)
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  value={chequeDiscount}
                  onChange={(e) => setChequeDiscount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  sx={{
                    width: 145,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#ffffff',
                      borderRadius: '6px',
                      height: 28,
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      '& input': {
                        textAlign: 'right',
                        py: '2px !important',
                        px: '8px !important',
                        color: '#0f172a !important',
                        fontWeight: '700 !important',
                        MozAppearance: 'textfield',
                      },
                      '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                        WebkitAppearance: 'none',
                        margin: 0,
                      },
                      '& fieldset': { borderColor: '#cbd5e1' },
                      '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                    },
                  }}
                />
              </Box>

              {/* Col 3: Highlighted Total Amount (AED) Box (width: 280px, Right Aligned) */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: 280, justifyContent: 'flex-end', ml: 'auto' }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: 280,
                    height: 28,
                    bgcolor: '#e0f2fe',
                    px: 1.2,
                    borderRadius: '6px',
                    border: '1px solid #7dd3fc',
                    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.08)',
                    boxSizing: 'border-box',
                  }}
                >
                  <Typography sx={{ fontWeight: 700, color: '#0369a1', fontSize: '0.80rem', whiteSpace: 'nowrap' }}>
                    Total Amount (AED)
                  </Typography>
                  <Typography sx={{ fontWeight: 900, color: '#0369a1', fontSize: '1.05rem', letterSpacing: '-0.02em', ml: 1 }}>
                    {chequeGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>

          {/* ── Card 2: Payment details Grid (Extended Height, Crisp Styling) ── */}
          <Paper
            elevation={0}
            sx={{
              py: 0.8,
              px: 1.2,
              mb: 1.0,
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              bgcolor: '#ffffff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                {isChequePayment ? 'Payment details' : 'Receipt details'}
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={handleAddChequeRow}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  color: '#0284c7',
                  py: 0,
                  px: 0.8,
                  '&:hover': { bgcolor: '#f0f9ff' },
                }}
              >
                + Add Row
              </Button>
            </Box>

            <TableContainer
              sx={{
                border: '1px solid #cbd5e1',
                borderBottom: 'none',
                borderRadius: '6px 6px 0 0',
                overflowY: 'auto',
                height: 380,
                minHeight: 300,
                mb: 0,
                bgcolor: '#fafbfc',
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  '& .MuiTableCell-root': { fontSize: '0.80rem', borderBottom: '1px solid #cbd5e1' },
                }}
              >
                <colgroup>
                  <col style={{ width: 38 }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 115 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 38 }} />
                </colgroup>
                <TableHead
                  sx={{
                    '& th': {
                      height: '18px !important',
                      minHeight: '18px !important',
                      py: '2px !important',
                      lineHeight: '1.2 !important',
                      fontSize: '0.65rem !important',
                    },
                  }}
                >
                  <TableRow sx={{ bgcolor: '#f8fafc', height: 18, minHeight: 18 }}>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 38,
                        textAlign: 'center',
                        py: '2px !important',
                        px: 0.5,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      No.
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Bank name
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 105,
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Type
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 115,
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Cheque / DD No.
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 105,
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Status
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 120,
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Date
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 120,
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Amount (AED)
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        width: 120,
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Bank charge (AED)
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 38,
                        textAlign: 'center',
                        py: '2px !important',
                        px: 0.2,
                        bgcolor: '#f8fafc',
                        borderBottom: '2px solid #0284c7',
                      }}
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {chequeRows.map((row, idx) => {
                    const selectedBank = bankAccounts.find((a) => a._id === row.bankAccountId) || null;
                    return (
                      <TableRow
                        key={row.id || idx}
                        sx={{
                          '&:hover': { bgcolor: '#f1f5f9' },
                          '& td': {
                            borderBottom: '1px solid #cbd5e1',
                            borderRight: '1px solid #e2e8f0',
                            py: 0.35,
                          },
                          '& td:last-child': {
                            borderRight: 'none',
                          },
                        }}
                      >
                        <TableCell sx={{ textAlign: 'center', color: '#475569', fontWeight: 700, fontSize: '0.78rem', py: 0.35 }}>
                          {idx + 1}
                        </TableCell>

                        {/* Bank Name */}
                        <TableCell sx={{ py: 0.35 }}>
                          <Autocomplete
                            size="small"
                            options={bankAccounts}
                            getOptionLabel={(opt) => opt.name}
                            value={selectedBank}
                            onChange={(_, newVal) => {
                              handleChequeRowChange(idx, 'bankAccountId', newVal ? newVal._id : '');
                              if (newVal) {
                                setTimeout(() => chequeNoRefs.current[idx]?.focus(), 50);
                              }
                            }}
                            isOptionEqualToValue={(opt, val) => opt._id === val._id}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                inputRef={(el) => { chequeBankRefs.current[idx] = el; }}
                                placeholder="Search bank..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    chequeNoRefs.current[idx]?.focus();
                                  }
                                }}
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    bgcolor: '#ffffff',
                                    borderRadius: '5px',
                                    height: 26,
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    '& input': { py: '2px !important', px: '6px !important', color: '#0f172a !important', fontWeight: '700 !important' },
                                    '& fieldset': { borderColor: '#cbd5e1' },
                                    '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                                  },
                                }}
                              />
                            )}
                          />
                        </TableCell>

                        {/* Type - Clean TextField select without notched outline line artifact */}
                        <TableCell sx={{ py: 0.35 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={row.type}
                            inputRef={(el) => { chequeTypeRefs.current[idx] = el; }}
                            onChange={(e) => handleChequeRowChange(idx, 'type', e.target.value)}
                            SelectProps={{
                              MenuProps: { PaperProps: { sx: { maxHeight: 200 } } },
                            }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                '& .MuiSelect-select': {
                                  py: '2px !important',
                                  px: '6px !important',
                                  color: '#0f172a !important',
                                  fontWeight: '700 !important',
                                  lineHeight: '20px !important',
                                  display: 'flex',
                                  alignItems: 'center',
                                },
                                '& .MuiSvgIcon-root': { color: '#475569', fontSize: 16 },
                                '& fieldset': { borderColor: '#cbd5e1' },
                                '&:hover fieldset': { borderColor: '#94a3b8' },
                                '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                                '& legend': { display: 'none' },
                              },
                            }}
                          >
                            <MenuItem value="CHEQUE" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>CHEQUE</MenuItem>
                            <MenuItem value="ONLINE" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>ONLINE</MenuItem>
                            <MenuItem value="CARD" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>CARD</MenuItem>
                            <MenuItem value="DD" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>DD</MenuItem>
                          </TextField>
                        </TableCell>

                        {/* Cheque / DD No */}
                        <TableCell sx={{ py: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            inputRef={(el) => { chequeNoRefs.current[idx] = el; }}
                            value={row.chequeNo}
                            onChange={(e) => handleChequeRowChange(idx, 'chequeNo', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                chequeAmountRefs.current[idx]?.focus();
                                chequeAmountRefs.current[idx]?.select();
                              }
                            }}
                            placeholder=""
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                '& input': { py: '2px !important', px: '6px !important', color: '#0f172a !important', fontWeight: '700 !important' },
                                '& fieldset': { borderColor: '#cbd5e1' },
                                '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                              },
                            }}
                          />
                        </TableCell>

                        {/* Status - Clean TextField select without notched outline line artifact */}
                        <TableCell sx={{ py: 0.35 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={row.status}
                            inputRef={(el) => { chequeStatusRefs.current[idx] = el; }}
                            onChange={(e) => handleChequeRowChange(idx, 'status', e.target.value)}
                            SelectProps={{
                              MenuProps: { PaperProps: { sx: { maxHeight: 200 } } },
                            }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                '& .MuiSelect-select': {
                                  py: '2px !important',
                                  px: '6px !important',
                                  color: '#0f172a !important',
                                  fontWeight: '700 !important',
                                  lineHeight: '20px !important',
                                  display: 'flex',
                                  alignItems: 'center',
                                },
                                '& .MuiSvgIcon-root': { color: '#475569', fontSize: 16 },
                                '& fieldset': { borderColor: '#cbd5e1' },
                                '&:hover fieldset': { borderColor: '#94a3b8' },
                                '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                                '& legend': { display: 'none' },
                              },
                            }}
                          >
                            <MenuItem value="PENDING" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#d97706' }}>PENDING</MenuItem>
                            <MenuItem value="CLEARED" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#16a34a' }}>CLEARED</MenuItem>
                            <MenuItem value="BOUNCED" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc2626' }}>BOUNCED</MenuItem>
                          </TextField>
                        </TableCell>

                        {/* Date */}
                        <TableCell sx={{ py: 0.35 }}>
                          <Box
                            onClick={() => {
                              const el = document.getElementById(`cheque-row-date-${idx}`) as HTMLInputElement;
                              el?.showPicker?.();
                            }}
                            sx={{ position: 'relative', cursor: 'pointer' }}
                          >
                            <TextField
                              size="small"
                              fullWidth
                              value={row.date ? dayjs(row.date).format('DD MMM YYYY') : ''}
                              InputProps={{
                                readOnly: true,
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <CalendarMonthIcon sx={{ fontSize: 14, color: '#475569' }} />
                                  </InputAdornment>
                                ),
                              }}
                              sx={{
                                cursor: 'pointer',
                                '& .MuiOutlinedInput-root': {
                                  bgcolor: '#ffffff',
                                  borderRadius: '5px',
                                  height: 26,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  '& input': { py: '2px !important', px: '6px !important', color: '#0f172a !important', fontWeight: '700 !important', cursor: 'pointer' },
                                  '& fieldset': { borderColor: '#cbd5e1' },
                                  '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                                },
                              }}
                            />
                            <input
                              id={`cheque-row-date-${idx}`}
                              ref={(el) => { chequeDateRefs.current[idx] = el; }}
                              type="date"
                              value={row.date}
                              onChange={(e) => handleChequeRowChange(idx, 'date', e.target.value)}
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

                        {/* Amount */}
                        <TableCell align="right" sx={{ py: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            type="number"
                            inputRef={(el) => { chequeAmountRefs.current[idx] = el; }}
                            value={row.amount}
                            onChange={(e) =>
                              handleChequeRowChange(idx, 'amount', e.target.value === '' ? '' : parseFloat(e.target.value))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                chequeChargeRefs.current[idx]?.focus();
                                chequeChargeRefs.current[idx]?.select();
                              }
                            }}
                            placeholder="0.00"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                '& input': { py: '2px !important', px: '6px !important', textAlign: 'right', color: '#0f172a !important', fontWeight: '700 !important' },
                                '& fieldset': { borderColor: '#cbd5e1' },
                                '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                              },
                            }}
                          />
                        </TableCell>

                        {/* Bank Charge */}
                        <TableCell align="right" sx={{ py: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            type="number"
                            inputRef={(el) => { chequeChargeRefs.current[idx] = el; }}
                            value={row.bankCharge}
                            onChange={(e) =>
                              handleChequeRowChange(idx, 'bankCharge', e.target.value === '' ? '' : parseFloat(e.target.value))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (idx === chequeRows.length - 1 && (Number(row.amount) > 0 || row.bankAccountId)) {
                                  handleAddChequeRow();
                                  setTimeout(() => chequeBankRefs.current[idx + 1]?.focus(), 50);
                                } else if (idx < chequeRows.length - 1) {
                                  chequeBankRefs.current[idx + 1]?.focus();
                                } else {
                                  saveButtonRef.current?.focus();
                                }
                              }
                            }}
                            placeholder="0.00"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                '& input': { py: '2px !important', px: '6px !important', textAlign: 'right', color: '#0f172a !important', fontWeight: '700 !important' },
                                '& fieldset': { borderColor: '#cbd5e1' },
                                '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                              },
                            }}
                          />
                        </TableCell>

                        {/* Delete Icon */}
                        <TableCell sx={{ textAlign: 'center', py: 0.35 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveChequeRow(idx)}
                            sx={{
                              color: '#ef4444',
                              p: 0.2,
                              '&:hover': { bgcolor: '#fef2f2' },
                            }}
                          >
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Empty filler rows to complete the grid (matching Journal Entry) */}
                  {Array.from({ length: Math.max(0, 8 - chequeRows.length) }).map((_, i) => (
                    <TableRow
                      key={`cheque-empty-${i}`}
                      sx={{
                        height: 33,
                        '& td': {
                          borderBottom: '1px solid #cbd5e1',
                          borderRight: '1px solid #e2e8f0',
                          py: 0.35,
                        },
                        '& td:last-child': { borderRight: 'none' },
                      }}
                    >
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pinned Total row below the grid - Matching Journal Voucher */}
            <Box
              sx={{
                border: '1px solid #cbd5e1',
                borderTop: '2px solid #0284c7',
                bgcolor: '#f8fafc',
                borderRadius: '0 0 6px 6px',
                mb: 0.8,
                boxShadow: '0 -2px 4px rgba(0,0,0,0.03)',
                zIndex: 2,
              }}
            >
              <Table size="small" sx={{ minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                <colgroup>
                  <col style={{ width: 38 }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 115 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 38 }} />
                </colgroup>
                <TableBody>
                  <TableRow sx={{ '& td': { py: 0.4, border: 'none', fontWeight: 700, fontSize: '0.80rem' } }}>
                    <TableCell colSpan={6} sx={{ textAlign: 'right', color: '#0f172a', fontWeight: 800, pr: 1.5 }}>
                      Total
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.35, pr: 0.8 }}>
                      <Box
                        sx={{
                          px: 0.8,
                          py: 0.2,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          bgcolor: '#f0f9ff',
                          borderRadius: '5px',
                          border: '1px solid #7dd3fc',
                          fontWeight: 800,
                          color: '#0284c7',
                          fontSize: '0.82rem',
                        }}
                      >
                        {chequeTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.35, pr: 0.8 }}>
                      <Box
                        sx={{
                          px: 0.8,
                          py: 0.2,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          bgcolor: '#f0f9ff',
                          borderRadius: '5px',
                          border: '1px solid #7dd3fc',
                          fontWeight: 800,
                          color: '#0284c7',
                          fontSize: '0.82rem',
                        }}
                      >
                        {chequeTotalBankCharge.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ width: 38 }} />
                  </TableRow>
                </TableBody>
              </Table>
            </Box>

            {/* Remarks and Amount in Words */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flex: '1 1 320px' }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.78rem', minWidth: 55 }}>
                  Remarks
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  value={chequeRemarks}
                  onChange={(e) => setChequeRemarks(e.target.value)}
                  placeholder=""
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#ffffff',
                      borderRadius: '5px',
                      height: 26,
                      fontSize: '0.80rem',
                      fontWeight: 600,
                      '& input': { py: '2px !important', px: '6px !important', color: '#0f172a !important', fontWeight: '600 !important' },
                      '& fieldset': { borderColor: '#cbd5e1' },
                      '&.Mui-focused fieldset': { borderColor: '#0284c7' },
                    },
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flex: '1.4 1 400px' }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.78rem', minWidth: 105 }}>
                  Amount in words
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    px: 1,
                    py: 0.2,
                    height: 26,
                    minHeight: 26,
                    bgcolor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {numberToWordsDirhams(chequeGrandTotal)}
                </Box>
              </Box>
            </Box>
          </Paper>

          {/* ── Card 4: Action Buttons (Compact, directly under Card 2) ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.0, flexWrap: 'wrap', mb: 1.5 }}>
            <Button
              ref={saveButtonRef}
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon sx={{ fontSize: 16 }} />}
              onClick={handleSave}
              disabled={saving}
              sx={{
                bgcolor: '#0d9488',
                '&:hover': { bgcolor: '#0f766e' },
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 2.0,
                boxShadow: 'none',
              }}
            >
              Save
            </Button>

            <Button
              variant="outlined"
              startIcon={<PrintIcon sx={{ fontSize: 16 }} />}
              onClick={handlePrint}
              sx={{
                borderColor: '#bae6fd',
                color: '#0284c7',
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 1.5,
                '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7' },
              }}
            >
              Print
            </Button>

            <Button
              variant="outlined"
              startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
              onClick={handleClear}
              sx={{
                borderColor: '#bae6fd',
                color: '#0284c7',
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 1.5,
                '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7' },
              }}
            >
              Clear
            </Button>

            <Button
              variant="outlined"
              startIcon={<EditIcon sx={{ fontSize: 16 }} />}
              onClick={() => setSearchDialogOpen(true)}
              sx={{
                borderColor: '#bae6fd',
                color: '#0284c7',
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 1.5,
                '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7' },
              }}
            >
              Edit
            </Button>

            <Button
              variant="outlined"
              startIcon={<SearchIcon sx={{ fontSize: 16 }} />}
              onClick={() => setSearchDialogOpen(true)}
              sx={{
                borderColor: '#bae6fd',
                color: '#0284c7',
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 1.5,
                '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7' },
              }}
            >
              Search
            </Button>

            <Button
              variant="outlined"
              startIcon={<ReceiptLongIcon sx={{ fontSize: 16 }} />}
              onClick={() => setChequePrintOpen(true)}
              sx={{
                borderColor: '#bae6fd',
                color: '#0284c7',
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 1.5,
                '&:hover': { bgcolor: '#f0f9ff', borderColor: '#0284c7' },
              }}
            >
              Cheque Print
            </Button>

            <Button
              variant="outlined"
              startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={!currentVoucherId}
              sx={{
                borderColor: '#fca5a5',
                color: '#ef4444',
                borderRadius: '5px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                height: 30,
                px: 1.5,
                bgcolor: '#fef2f2',
                '&:hover': { bgcolor: '#fee2e2', borderColor: '#ef4444' },
                '&.Mui-disabled': { borderColor: '#f1f5f9', color: '#cbd5e1', bgcolor: 'transparent' },
              }}
            >
              Delete
            </Button>
          </Box>
        </Box>
      ) : (
        <>
          {/* ── Top Bar: Breadcrumb, Title, Draft Chip, Navigation ── */}
      <Box sx={{ mb: 1.0 }}>
        {/* Breadcrumb */}
        <Typography
          variant="body2"
          sx={{ color: '#64748b', fontSize: '0.80rem', mb: 0.4, fontWeight: 500 }}
        >
          Accounting &nbsp;/&nbsp; Vouchers
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: isJournal ? 1 : 1.5 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                color: themeColors.headerText,
                letterSpacing: '-0.02em',
                fontSize: isJournal
                  ? { xs: '0.75rem', md: '0.88rem' }
                  : { xs: '1.20rem', md: '1.45rem' },
                lineHeight: 1.2,
              }}
            >
              {isContra ? 'Contra Voucher' : isJournal ? 'Journal Voucher' : isPayment ? 'Payment Voucher' : 'Receipt Voucher'}
            </Typography>
            <Chip
              label={status}
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: isJournal ? '0.68rem' : '0.74rem',
                height: isJournal ? 20 : 24,
                bgcolor: status === 'Posted' ? '#dcfce7' : themeColors.badgeBg,
                color: status === 'Posted' ? '#166534' : themeColors.badgeText,
                borderRadius: '12px',
                px: 0.5,
              }}
            />
          </Box>

          {/* Voucher Navigation - Matches Mockup Style */}
          <Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center' }}>
            <Tooltip title="First Voucher">
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleNav('first')}
                sx={{
                  py: 0.2,
                  px: 0.6,
                  height: 28,
                  minWidth: 32,
                  borderRadius: 1.2,
                  borderColor: '#e2e8f0',
                  color: '#334155',
                  bgcolor: '#ffffff',
                  '&:hover': {
                    bgcolor: themeColors.navHover,
                    borderColor: themeColors.accentBorder,
                    color: themeColors.primary,
                  },
                  boxShadow: 'none',
                  '& .MuiSvgIcon-root': { fontSize: 16 },
                }}
              >
                <KeyboardDoubleArrowLeftIcon />
              </Button>
            </Tooltip>
            <Tooltip title="Previous Voucher">
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleNav('prev')}
                sx={{
                  py: 0.2,
                  px: 0.6,
                  height: 28,
                  minWidth: 32,
                  borderRadius: 1.2,
                  borderColor: '#e2e8f0',
                  color: '#334155',
                  bgcolor: '#ffffff',
                  '&:hover': {
                    bgcolor: themeColors.navHover,
                    borderColor: themeColors.accentBorder,
                    color: themeColors.primary,
                  },
                  boxShadow: 'none',
                  '& .MuiSvgIcon-root': { fontSize: 16 },
                }}
              >
                <KeyboardArrowLeftIcon />
              </Button>
            </Tooltip>

            <Box
              sx={{
                px: 1.5,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #e2e8f0',
                borderRadius: 1.2,
                bgcolor: '#ffffff',
                fontSize: '0.80rem',
                color: '#475569',
                fontWeight: 600,
                gap: 0.6,
              }}
            >
              <span>Voucher</span>
              <span style={{ color: themeColors.primary, fontWeight: 700 }}>
                {voucherNo}
              </span>
            </Box>

            <Tooltip title="Next Voucher">
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleNav('next')}
                sx={{
                  py: 0.2,
                  px: 0.6,
                  height: 28,
                  minWidth: 32,
                  borderRadius: 1.2,
                  borderColor: '#e2e8f0',
                  color: '#334155',
                  bgcolor: '#ffffff',
                  '&:hover': {
                    bgcolor: themeColors.navHover,
                    borderColor: themeColors.accentBorder,
                    color: themeColors.primary,
                  },
                  boxShadow: 'none',
                  '& .MuiSvgIcon-root': { fontSize: 16 },
                }}
              >
                <KeyboardArrowRightIcon />
              </Button>
            </Tooltip>
            <Tooltip title="Last Voucher">
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleNav('last')}
                sx={{
                  py: 0.2,
                  px: 0.6,
                  height: 28,
                  minWidth: 32,
                  borderRadius: 1.2,
                  borderColor: '#e2e8f0',
                  color: '#334155',
                  bgcolor: '#ffffff',
                  '&:hover': {
                    bgcolor: themeColors.navHover,
                    borderColor: themeColors.accentBorder,
                    color: themeColors.primary,
                  },
                  boxShadow: 'none',
                  '& .MuiSvgIcon-root': { fontSize: 16 },
                }}
              >
                <KeyboardDoubleArrowRightIcon />
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* ── Top Header Form: Improved by 20% more ── */}
      {isJournal ? (
        <Paper
          elevation={0}
          sx={{
            py: 0.7,
            px: 1.2,
            mb: 1.0,
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            bgcolor: '#ffffff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            {/* Voucher No. (reduced 30% from 182 to 128) */}
            <Box sx={{ width: { xs: '100%', sm: 128 } }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: '#334155', fontSize: '0.78rem', mb: 0.3, display: 'block' }}
              >
                Voucher No.
              </Typography>
              <TextField
                size="small"
                fullWidth
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#f8fafc',
                    borderRadius: '6px',
                    height: 28,
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    '& input': { py: '2px !important', px: '8px !important' },
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&.Mui-focused fieldset': { borderColor: '#db2777' },
                  },
                }}
              />
            </Box>

            {/* Date (reduced 30% from 182 to 128) */}
            <Box sx={{ width: { xs: '100%', sm: 128 } }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: '#334155', fontSize: '0.78rem', mb: 0.3, display: 'block' }}
              >
                Date
              </Typography>
              <Box
                onClick={() => dateInputRef.current?.showPicker?.()}
                sx={{ position: 'relative', cursor: 'pointer' }}
              >
                <TextField
                  size="small"
                  fullWidth
                  value={date ? dayjs(date).format('DD MMM YYYY') : ''}
                  InputProps={{
                    readOnly: true,
                    startAdornment: (
                      <InputAdornment position="start" sx={{ mr: 0.4 }}>
                        <CalendarMonthIcon sx={{ fontSize: 16, color: '#64748b' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    cursor: 'pointer',
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#ffffff',
                      borderRadius: '6px',
                      height: 28,
                      fontWeight: 500,
                      fontSize: '0.80rem',
                      letterSpacing: '-0.2px',
                      cursor: 'pointer',
                      '& input': { py: '2px !important', px: '4px !important', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' },
                      '& fieldset': { borderColor: '#e2e8f0' },
                      '&.Mui-focused fieldset': { borderColor: '#db2777' },
                    },
                  }}
                />
                <input
                  ref={dateInputRef}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
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
          </Box>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={{
            py: 0.7,
            px: 1.2,
            mb: 1.0,
            borderRadius: '7px',
            border: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
            bgcolor: '#ffffff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: '1fr 1.1fr',
                md: '1fr 1.3fr 2.5fr',
              },
              gap: 1.5,
              alignItems: 'center',
            }}
          >
            {/* Voucher No. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: '#475569', fontSize: '0.80rem', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
              >
                Voucher No:
              </Typography>
              <TextField
                size="small"
                fullWidth
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#f8fafc',
                    borderRadius: '6px',
                    height: 28,
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    '& input': { py: '2px !important', px: '8px !important' },
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                  },
                }}
              />
            </Box>

            {/* Date */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: '#475569', fontSize: '0.80rem', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
              >
                Date:
              </Typography>
              <TextField
                size="small"
                type="date"
                fullWidth
                value={date}
                onChange={(e) => setDate(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: 0.4 }}>
                      <CalendarMonthIcon sx={{ fontSize: 16, color: '#64748b' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#ffffff',
                    borderRadius: '6px',
                    height: 28,
                    fontWeight: 500,
                    fontSize: '0.80rem',
                    '& input': { py: '2px !important', px: '6px !important' },
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                  },
                }}
              />
            </Box>

            {/* Cash Account */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: '#475569', fontSize: '0.80rem', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
              >
                {isContra ? 'Paid From (Bank / Cash):' : 'Cash Account:'}
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={cashAccountId}
                onChange={(e) => handleCashAccountChange(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#ffffff',
                    borderRadius: '6px',
                    height: 28,
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    '& .MuiSelect-select': { py: '2px !important', px: '8px !important', display: 'flex', alignItems: 'center' },
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                  },
                }}
              >
                {cashBankAccounts.map((acct) => (
                  <MenuItem key={acct._id} value={acct._id} sx={{ fontSize: '0.84rem', py: 0.5 }}>
                    <span style={{ fontWeight: 600 }}>{acct.name}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: '0.74rem' }}>
                      ({acct.code})
                    </span>
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── Table Card: Account entries (Grid Size Increased 30% from 350 to 455) ── */}
      {isJournal ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', mb: 1.0 }}
          >
            Journal entries
          </Typography>

          <Paper
            elevation={0}
            sx={{
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              overflow: 'hidden',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              height: 455,
            }}
          >
            <TableContainer
              sx={{
                flex: 1,
                overflowY: 'auto',
                width: '100%',
                bgcolor: '#ffffff',
              }}
              onBlurCapture={(e) => {
                const container = e.currentTarget;
                setTimeout(() => {
                  const active = document.activeElement;
                  if (!active) return;
                  const inPopper = active.closest(
                    '.MuiAutocomplete-popper, .MuiAutocomplete-listbox, .MuiPopper-root, .MuiDialog-root'
                  );
                  if (inPopper) return;
                  if (!container.contains(active)) {
                    revertUncommittedJournalRow();
                  }
                }, 120);
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  '& .MuiTableCell-root': { fontSize: '0.80rem', borderBottom: '1px solid #cbd5e1' },
                  '& .MuiInputBase-input': { fontSize: '0.80rem' },
                  '& .MuiAutocomplete-input': { fontSize: '0.80rem' },
                }}
              >
                <colgroup>
                  <col style={{ width: 42 }} />
                  <col style={{ width: '27%' }} />
                  <col style={{ width: '27%' }} />
                  <col style={{ width: 125 }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: 42 }} />
                </colgroup>
                <TableHead
                  sx={{
                    '& th': {
                      height: '18px !important',
                      minHeight: '18px !important',
                      py: '2px !important',
                      lineHeight: '1.2 !important',
                      fontSize: '0.65rem !important',
                    },
                  }}
                >
                  <TableRow sx={{ bgcolor: '#f8fafc', height: 18, minHeight: 18 }}>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        textAlign: 'center',
                        py: '2px !important',
                        px: 0.5,
                        bgcolor: '#f8fafc',
                        borderBottom: `2px solid ${themeColors.primary}`,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      No.
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: `2px solid ${themeColors.primary}`,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Debit account
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: `2px solid ${themeColors.primary}`,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Credit account
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: `2px solid ${themeColors.primary}`,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Amount (AED)
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: '#475569',
                        fontSize: '0.65rem !important',
                        py: '2px !important',
                        px: 0.8,
                        bgcolor: '#f8fafc',
                        borderBottom: `2px solid ${themeColors.primary}`,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Remarks
                    </TableCell>
                    <TableCell
                      sx={{
                        textAlign: 'center',
                        py: '2px !important',
                        px: 0.5,
                        bgcolor: '#f8fafc',
                        borderBottom: `2px solid ${themeColors.primary}`,
                      }}
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {journalRows.map((row, idx) => {
                    const selectedDebit = accounts.find((a) => a._id === row.debitAccountId) || null;
                    const selectedCredit = accounts.find((a) => a._id === row.creditAccountId) || null;

                    return (
                      <TableRow
                        key={idx}
                        onClick={() => {
                          enterJournalRow(idx, row);
                          setActiveJournalRowIndex(idx);
                        }}
                        onFocusCapture={() => {
                          enterJournalRow(idx, row);
                          setActiveJournalRowIndex(idx);
                        }}
                        sx={{
                          bgcolor: activeJournalRowIndex === idx ? '#f0fdfa' : '#ffffff',
                          '&:hover': { bgcolor: '#e6fffa' },
                          '& td': {
                            borderBottom: '1px solid #cbd5e1',
                            borderRight: '1px solid #e2e8f0',
                            py: 0.35,
                          },
                          '& td:last-child': { borderRight: 'none' },
                        }}
                      >
                        {/* Row No. */}
                        <TableCell sx={{ textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: '0.80rem', py: 0.35 }}>
                          {idx + 1}
                        </TableCell>

                        {/* Debit Account */}
                        <TableCell sx={{ py: 0.35 }}>
                          <Autocomplete
                            size="small"
                            options={accounts.filter((a) => a._id !== row.creditAccountId)}
                            getOptionLabel={(option) => `${option.code} - ${option.name}`}
                            value={selectedDebit}
                            onChange={(_, newVal) => handleDebitAccountSelect(idx, newVal)}
                            isOptionEqualToValue={(opt, val) => opt._id === val._id}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                inputRef={(el) => { debitAccountInputRefs.current[idx] = el; }}
                                onFocus={() => {
                                  enterJournalRow(idx, row);
                                  setActiveJournalRowIndex(idx);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && row.debitAccountId) {
                                    e.preventDefault();
                                    setTimeout(() => {
                                      creditAccountInputRefs.current[idx]?.focus();
                                    }, 50);
                                  }
                                }}
                                placeholder="Type to search ledger..."
                                InputProps={{
                                  ...params.InputProps,
                                  startAdornment: (
                                    <InputAdornment position="start" sx={{ mr: 0.2 }}>
                                      <SearchIcon sx={{ fontSize: 15, color: '#94a3b8' }} />
                                    </InputAdornment>
                                  ),
                                }}
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: '5px',
                                    height: 26,
                                    fontSize: '0.80rem',
                                    bgcolor: '#ffffff',
                                    '& input': { py: '2px !important', px: '4px !important' },
                                    '& fieldset': { borderColor: '#e2e8f0' },
                                    '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                                  },
                                }}
                              />
                            )}
                            renderOption={(props, option) => (
                              <li {...props} key={option._id}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', py: 0.2 }}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.80rem' }}>
                                      {option.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.70rem' }}>
                                      Code: {option.code}
                                    </Typography>
                                  </Box>
                                  <Chip label={option.type} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                                </Box>
                              </li>
                            )}
                          />
                        </TableCell>

                        {/* Credit Account */}
                        <TableCell sx={{ py: 0.35 }}>
                          <Autocomplete
                            size="small"
                            options={accounts.filter((a) => a._id !== row.debitAccountId)}
                            getOptionLabel={(option) => `${option.code} - ${option.name}`}
                            value={selectedCredit}
                            onChange={(_, newVal) => handleCreditAccountSelect(idx, newVal)}
                            isOptionEqualToValue={(opt, val) => opt._id === val._id}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                inputRef={(el) => { creditAccountInputRefs.current[idx] = el; }}
                                onFocus={() => {
                                  enterJournalRow(idx, row);
                                  setActiveJournalRowIndex(idx);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && row.creditAccountId) {
                                    e.preventDefault();
                                    setTimeout(() => {
                                      journalAmountInputRefs.current[idx]?.focus();
                                      journalAmountInputRefs.current[idx]?.select();
                                    }, 50);
                                  }
                                }}
                                placeholder="Type to search ledger..."
                                InputProps={{
                                  ...params.InputProps,
                                  startAdornment: (
                                    <InputAdornment position="start" sx={{ mr: 0.2 }}>
                                      <SearchIcon sx={{ fontSize: 15, color: '#94a3b8' }} />
                                    </InputAdornment>
                                  ),
                                }}
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: '5px',
                                    height: 26,
                                    fontSize: '0.80rem',
                                    bgcolor: '#ffffff',
                                    '& input': { py: '2px !important', px: '4px !important' },
                                    '& fieldset': { borderColor: '#e2e8f0' },
                                    '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                                  },
                                }}
                              />
                            )}
                            renderOption={(props, option) => (
                              <li {...props} key={option._id}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', py: 0.2 }}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.80rem' }}>
                                      {option.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.70rem' }}>
                                      Code: {option.code}
                                    </Typography>
                                  </Box>
                                  <Chip label={option.type} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                                </Box>
                              </li>
                            )}
                          />
                        </TableCell>

                        {/* Amount (AED) */}
                        <TableCell align="right" sx={{ py: 0.35 }}>
                          <TextField
                            size="small"
                            type="number"
                            inputRef={(el) => { journalAmountInputRefs.current[idx] = el; }}
                            value={row.amount}
                            onFocus={() => {
                              enterJournalRow(idx, row);
                              setActiveJournalRowIndex(idx);
                            }}
                            onChange={(e) =>
                              handleJournalRowChange(idx, 'amount', e.target.value === '' ? '' : parseFloat(e.target.value))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                journalRemarksInputRefs.current[idx]?.focus();
                              }
                            }}
                            placeholder="0.00"
                            inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                            sx={{
                              width: '100%',
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontWeight: 600,
                                fontSize: '0.80rem',
                                '& input': {
                                  py: '2px !important',
                                  px: '6px !important',
                                  MozAppearance: 'textfield',
                                },
                                '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                  WebkitAppearance: 'none',
                                  margin: 0,
                                },
                                '& fieldset': { borderColor: '#e2e8f0' },
                                '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                              },
                            }}
                          />
                        </TableCell>

                        {/* Remarks */}
                        <TableCell sx={{ py: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            inputRef={(el) => { journalRemarksInputRefs.current[idx] = el; }}
                            value={row.remarks}
                            onFocus={() => {
                              enterJournalRow(idx, row);
                              setActiveJournalRowIndex(idx);
                            }}
                            onChange={(e) => handleJournalRowChange(idx, 'remarks', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleJournalRemarksEnter(idx);
                              }
                            }}
                            placeholder="Add a remark"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: '#ffffff',
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.80rem',
                                '& input': { py: '2px !important', px: '6px !important' },
                                '& fieldset': { borderColor: '#e2e8f0' },
                                '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                              },
                            }}
                          />
                        </TableCell>

                        {/* Delete Action */}
                        <TableCell sx={{ textAlign: 'center', py: 0.35 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteJournalRow(idx)}
                            sx={{
                              p: 0.3,
                              color: '#94a3b8',
                              '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' },
                            }}
                          >
                            <DeleteOutlineIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Empty filler rows to complete the grid */}
                  {Array.from({ length: Math.max(0, 8 - journalRows.length) }).map((_, i) => (
                    <TableRow
                      key={`journal-empty-${i}`}
                      sx={{
                        height: 33,
                        '& td': {
                          borderBottom: '1px solid #cbd5e1',
                          borderRight: '1px solid #e2e8f0',
                          py: 0.35,
                        },
                        '& td:last-child': { borderRight: 'none' },
                      }}
                    >
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pinned Total row */}
            <Box
              sx={{
                borderTop: `2px solid ${themeColors.primary}`,
                bgcolor: '#f8fafc',
                boxShadow: '0 -2px 4px rgba(0,0,0,0.03)',
                zIndex: 3,
              }}
            >
              <Table size="small" sx={{ minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                <colgroup>
                  <col style={{ width: 42 }} />
                  <col style={{ width: '27%' }} />
                  <col style={{ width: '27%' }} />
                  <col style={{ width: 125 }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: 42 }} />
                </colgroup>
                <TableBody>
                  <TableRow sx={{ '& td': { py: 0.5, border: 'none', fontWeight: 700, fontSize: '0.82rem' } }}>
                    <TableCell sx={{ color: '#0f172a', pl: 1.5 }} colSpan={3}>
                      Total
                    </TableCell>
                    <TableCell align="right" sx={{ color: themeColors.totalText, fontWeight: 800, fontSize: '0.92rem' }}>
                      {totalJournalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Box>
      ) : (
      <Paper
        elevation={0}
        sx={{
          borderRadius: '8px',
          border: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
          bgcolor: '#ffffff',
          overflow: 'hidden',
          mb: 1.2,
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          height: 455,
        }}
      >

        <TableContainer
          sx={{
            flex: 1,
            overflowY: 'auto',
            width: '100%',
            bgcolor: '#fafbfc',
          }}
          onBlurCapture={(e) => {
            const container = e.currentTarget;
            setTimeout(() => {
              const active = document.activeElement;
              if (!active) return;
              const inPopper = active.closest('.MuiAutocomplete-popper, .MuiAutocomplete-listbox, .MuiPopper-root, .MuiDialog-root');
              if (inPopper) return;
              if (!container.contains(active)) {
                revertUncommittedRow();
              }
            }, 120);
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0,
              '& .MuiTableCell-root': { fontSize: '0.80rem', borderBottom: '1px solid #cbd5e1' },
              '& .MuiInputBase-input': { fontSize: '0.80rem' },
              '& .MuiAutocomplete-input': { fontSize: '0.80rem' },
            }}
          >
            <colgroup>
              <col style={{ width: 38 }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <TableHead
              sx={{
                '& th': {
                  height: '18px !important',
                  minHeight: '18px !important',
                  py: '2px !important',
                  lineHeight: '1.2 !important',
                  fontSize: '0.65rem !important',
                },
              }}
            >
              <TableRow
                sx={{
                  bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                  height: 18,
                  minHeight: 18,
                }}
              >
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.65rem !important',
                    textAlign: 'center',
                    py: '2px !important',
                    px: 0.5,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                    borderRight: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
                  }}
                >
                  No.
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.65rem !important',
                    py: '2px !important',
                    px: 0.8,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                    borderRight: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
                  }}
                >
                  Account
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.65rem !important',
                    py: '2px !important',
                    px: 0.8,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                    borderRight: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
                  }}
                >
                  Amount (AED)
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.65rem !important',
                    py: '2px !important',
                    px: 0.8,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                    borderRight: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
                  }}
                >
                  Discount (AED)
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.65rem !important',
                    py: '2px !important',
                    px: 0.8,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                    borderRight: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
                  }}
                >
                  Total (AED)
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: '0.65rem !important',
                    py: '2px !important',
                    px: 0.8,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                    borderRight: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
                  }}
                >
                  Narration
                </TableCell>
                <TableCell
                  sx={{
                    textAlign: 'center',
                    py: '2px !important',
                    px: 0.5,
                    height: '18px !important',
                    lineHeight: '1.2 !important',
                    bgcolor: themeColors.isPink ? '#fdf2f8' : '#f1f5f9',
                    borderBottom: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
                  }}
                />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => {
                const selectedAccount = accounts.find((a) => a._id === row.ledgerAccountId) || null;
                const settledBills = lineSettlements[idx] || [];
                const settledCount = settledBills.filter((b) => b.selected && b.settleAmount > 0).length;

                return (
                  <TableRow
                    key={idx}
                    onClick={() => {
                      enterRow(idx, row);
                      setActiveRowIndex(idx);
                    }}
                    onFocusCapture={() => {
                      enterRow(idx, row);
                      setActiveRowIndex(idx);
                    }}
                    sx={{
                      bgcolor: activeRowIndex === idx
                        ? (themeColors.isPink ? '#fff5f7' : '#f0fdfa')
                        : '#ffffff',
                      '&:hover': {
                        bgcolor: themeColors.isPink ? '#fff0f5' : '#e6fffa',
                      },
                      '& td': {
                        borderBottom: '1px solid #cbd5e1',
                        borderRight: '1px solid #e2e8f0',
                        py: 0.35,
                      },
                      '& td:last-child': {
                        borderRight: 'none',
                      },
                    }}
                  >
                    {/* Row No. */}
                    <TableCell sx={{ textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: '0.80rem', py: 0.35 }}>
                      {idx + 1}
                    </TableCell>

                    {/* Account Field: Compact with On Account inside right side */}
                    <TableCell sx={{ py: 0.35 }}>
                      <Autocomplete
                        size="small"
                        options={gridAccountOptions}
                        getOptionLabel={(option) => `${option.code} - ${option.name}`}
                        value={selectedAccount}
                        onChange={(_, newVal) => {
                          handleAccountSelect(idx, newVal);
                          if (newVal && !newVal.againstRef) {
                            setTimeout(() => {
                              amountInputRefs.current[idx]?.focus();
                              amountInputRefs.current[idx]?.select();
                            }, 80);
                          }
                        }}
                        isOptionEqualToValue={(opt, val) => opt._id === val._id}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            inputRef={(el) => { accountInputRefs.current[idx] = el; }}
                            onFocus={() => {
                              enterRow(idx, row);
                              setActiveRowIndex(idx);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (row.ledgerAccountId) {
                                  e.preventDefault();
                                  setTimeout(() => {
                                    amountInputRefs.current[idx]?.focus();
                                    amountInputRefs.current[idx]?.select();
                                  }, 50);
                                } else if (idx > 0 || rows.filter((r) => r.ledgerAccountId && Number(r.amount) > 0).length > 0) {
                                  e.preventDefault();
                                  saveButtonRef.current?.focus();
                                }
                              }
                            }}
                            placeholder="Type to search ledger..."
                            InputProps={{
                              ...params.InputProps,
                              startAdornment: (
                                <InputAdornment position="start" sx={{ mr: 0.2 }}>
                                  <SearchIcon sx={{ fontSize: 15, color: '#94a3b8' }} />
                                </InputAdornment>
                              ),
                              endAdornment: (
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  {!isContra && selectedAccount && (
                                    <Tooltip title="Click to change Reference Type">
                                      <Chip
                                        size="small"
                                        label={
                                          row.refType === 'Against Ref' && settledCount > 0
                                            ? `Agst Ref (${settledCount})`
                                            : (row.refType || 'On Account')
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (selectedAccount.againstRef) {
                                            setRefPromptLineIndex(idx);
                                            setRefPromptAccount(selectedAccount);
                                            setRefPromptOpen(true);
                                          } else {
                                            openAgainstRefDialog(idx);
                                          }
                                        }}
                                        sx={{
                                          height: 18,
                                          fontSize: '0.65rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          mr: 0.3,
                                          bgcolor:
                                            row.refType === 'Against Ref'
                                              ? themeColors.isPink
                                                ? '#fce7f3'
                                                : '#ccfbf1'
                                              : '#f1f5f9',
                                          color:
                                            row.refType === 'Against Ref'
                                              ? themeColors.isPink
                                                ? '#9d174d'
                                                : '#0f766e'
                                              : '#475569',
                                          border: `1px solid ${
                                            row.refType === 'Against Ref'
                                              ? themeColors.isPink
                                                ? '#fbcfe8'
                                                : '#99f6e4'
                                              : '#e2e8f0'
                                          }`,
                                          '&:hover': { opacity: 0.85 },
                                        }}
                                      />
                                    </Tooltip>
                                  )}
                                  {params.InputProps.endAdornment}
                                </Box>
                              ),
                            }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                borderRadius: '5px',
                                height: 26,
                                fontSize: '0.80rem',
                                bgcolor: '#ffffff',
                                '& input': { py: '2px !important', px: '4px !important' },
                                '& fieldset': { borderColor: '#e2e8f0' },
                                '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                              },
                            }}
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props} key={option._id}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', py: 0.2 }}>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.80rem' }}>
                                  {option.name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.70rem' }}>
                                  Code: {option.code}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Chip
                                  label={option.type}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.65rem', height: 18 }}
                                />
                                {option.againstRef && (
                                  <Typography
                                    variant="caption"
                                    sx={{ display: 'block', color: themeColors.primary, fontSize: '0.68rem' }}
                                  >
                                    Against Ref
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </li>
                        )}
                      />
                    </TableCell>

                    {/* Amount Field */}
                    <TableCell align="right" sx={{ py: 0.35 }}>
                      <TextField
                        size="small"
                        type="number"
                        inputRef={(el) => { amountInputRefs.current[idx] = el; }}
                        value={row.amount}
                        onFocus={() => {
                          enterRow(idx, row);
                          setActiveRowIndex(idx);
                        }}
                        onChange={(e) =>
                          handleRowChange(idx, 'amount', e.target.value === '' ? '' : parseFloat(e.target.value))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            discountInputRefs.current[idx]?.focus();
                            discountInputRefs.current[idx]?.select();
                          }
                        }}
                        placeholder="0.00"
                        inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                        sx={{
                          width: '100%',
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#ffffff',
                            borderRadius: '5px',
                            height: 26,
                            fontWeight: 600,
                            fontSize: '0.80rem',
                            '& input': {
                              py: '2px !important',
                              px: '6px !important',
                              MozAppearance: 'textfield',
                            },
                            '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                              WebkitAppearance: 'none',
                              margin: 0,
                            },
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                          },
                        }}
                      />
                    </TableCell>

                    {/* Discount Field */}
                    <TableCell align="right" sx={{ py: 0.35 }}>
                      <TextField
                        size="small"
                        type="number"
                        inputRef={(el) => { discountInputRefs.current[idx] = el; }}
                        value={row.discount}
                        onFocus={() => {
                          enterRow(idx, row);
                          setActiveRowIndex(idx);
                        }}
                        onChange={(e) =>
                          handleRowChange(idx, 'discount', e.target.value === '' ? '' : parseFloat(e.target.value))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            remarksInputRefs.current[idx]?.focus();
                          }
                        }}
                        placeholder="0.00"
                        inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                        sx={{
                          width: '100%',
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#ffffff',
                            borderRadius: '5px',
                            height: 26,
                            fontSize: '0.80rem',
                            '& input': {
                              py: '2px !important',
                              px: '6px !important',
                              MozAppearance: 'textfield',
                            },
                            '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                              WebkitAppearance: 'none',
                              margin: 0,
                            },
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                          },
                        }}
                      />
                    </TableCell>

                    {/* Total (Readonly: Amount - Discount) */}
                    <TableCell align="right" sx={{ py: 0.35 }}>
                      <TextField
                        size="small"
                        disabled
                        value={row.total > 0 ? row.total.toFixed(2) : '0.00'}
                        inputProps={{ style: { textAlign: 'right', fontWeight: 700 } }}
                        sx={{
                          width: '100%',
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#f8fafc',
                            borderRadius: '5px',
                            height: 26,
                            fontSize: '0.80rem',
                            '& input': {
                              py: '2px !important',
                              px: '6px !important',
                              MozAppearance: 'textfield',
                            },
                            '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                              WebkitAppearance: 'none',
                              margin: 0,
                            },
                            '& fieldset': { borderColor: '#e2e8f0' },
                          },
                        }}
                      />
                    </TableCell>

                    {/* Remarks / Narration Field: Reduced Size */}
                    <TableCell sx={{ py: 0.35 }}>
                      <TextField
                        size="small"
                        fullWidth
                        inputRef={(el) => { remarksInputRefs.current[idx] = el; }}
                        value={row.remarks}
                        onFocus={() => {
                          enterRow(idx, row);
                          setActiveRowIndex(idx);
                        }}
                        onChange={(e) => handleRowChange(idx, 'remarks', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleNarrationEnter(idx);
                          }
                        }}
                        placeholder="Add a remark"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#ffffff',
                            borderRadius: '5px',
                            height: 26,
                            fontSize: '0.80rem',
                            '& input': { py: '2px !important', px: '6px !important' },
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&.Mui-focused fieldset': { borderColor: themeColors.primary },
                          },
                        }}
                      />
                    </TableCell>

                    {/* Delete Action */}
                    <TableCell sx={{ textAlign: 'center', py: 0.35 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteRow(idx)}
                        sx={{
                          p: 0.3,
                          color: '#94a3b8',
                          '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' },
                        }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pinned Total row: ALWAYS at the bottom of the grid frame */}
        <Box
          sx={{
            borderTop: `2px solid ${themeColors.isPink ? '#be185d' : themeColors.primary}`,
            bgcolor: '#f8fafc',
            boxShadow: '0 -2px 4px rgba(0,0,0,0.03)',
            zIndex: 3,
          }}
        >
          <Table size="small" sx={{ minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: 38 }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <TableBody>
              <TableRow sx={{ '& td': { py: 0.5, border: 'none', fontWeight: 700, fontSize: '0.82rem' } }}>
                <TableCell sx={{ color: '#0f172a', pl: 1 }} colSpan={2}>
                  Total
                </TableCell>
                <TableCell align="right" sx={{ color: '#0f172a' }}>
                  {totalAmount.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ color: '#0f172a' }}>
                  {totalDiscount.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ color: themeColors.totalText, fontWeight: 800, fontSize: '0.92rem' }}>
                  {totalNet.toFixed(2)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </Paper>
      )}

      {/* ── Bottom Section: Amount in words & Balances / Total (Half Size) ── */}
      {!isJournal && (
      <Paper
        elevation={0}
        sx={{
          p: 1.2,
          mb: 1.5,
          borderRadius: '8px',
          border: `1px solid ${themeColors.isPink ? '#fbcfe8' : '#e2e8f0'}`,
          bgcolor: '#ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
            gap: 2,
            alignItems: 'center',
          }}
        >
          {/* Amount in words */}
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: '#334155', mb: 0.3, display: 'block', fontSize: '0.72rem' }}
            >
              Amount in words
            </Typography>
            <Box
              sx={{
                px: 1.2,
                py: 0.4,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                height: 28,
                display: 'flex',
                alignItems: 'center',
                color: '#1e293b',
                fontWeight: 600,
                fontSize: '0.8rem',
              }}
            >
              {numberToWordsDirhams(totalNet)}
            </Box>
          </Box>

          {/* Right side balances & Total Receipt / Payment */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {activeAccount && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.74rem' }}>
                <span style={{ fontWeight: 600 }}>Party:</span>
                <span style={{ fontWeight: 700, color: themeColors.primary }}>
                  {activeAccount.name} ({activeAccount.code})
                </span>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem' }}>
              <span>Opening balance</span>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                AED {openingBalance.toFixed(2)}{' '}
                {openingBalance > 0 && (
                  <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: openingIsDebit ? '#166534' : '#991b1b' }}>
                    {openingIsDebit ? 'Dr' : 'Cr'}
                  </Typography>
                )}
              </span>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.78rem' }}>
              <span>Closing balance</span>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                AED {closingBalance.toFixed(2)}{' '}
                {closingBalance > 0 && (
                  <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: closingIsDebit ? '#166534' : '#991b1b' }}>
                    {closingIsDebit ? 'Dr' : 'Cr'}
                  </Typography>
                )}
              </span>
            </Box>
            <Divider sx={{ my: 0.3 }} />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                {isContra ? 'Total contra' : isPayment ? 'Total payment' : 'Total receipt'}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 900,
                  color: themeColors.totalText,
                  fontSize: '1.15rem',
                  letterSpacing: '-0.02em',
                }}
              >
                AED {totalNet.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>
      )}

      {/* ── Action Buttons Bar (Enlarged 100%) ── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.2,
          mt: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
          {/* Save Button */}
          <Button
            ref={saveButtonRef}
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon sx={{ fontSize: 20 }} />}
            onClick={handleSave}
            disabled={saving}
            sx={{
              bgcolor: themeColors.primary,
              '&:hover': { bgcolor: themeColors.primaryHover },
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.96rem',
              height: 44,
              px: 3.5,
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
            }}
          >
            Save
          </Button>

          {/* Print Button */}
          <Button
            variant="outlined"
            startIcon={<PrintIcon sx={{ fontSize: 20 }} />}
            onClick={handlePrint}
            sx={{
              borderColor: '#cbd5e1',
              color: '#334155',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.92rem',
              height: 44,
              px: 2.2,
              '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
            }}
          >
            Print
          </Button>

          {/* Print preview checkbox */}
          <FormControlLabel
            control={
              <Checkbox
                checked={printPreview}
                onChange={(e) => setPrintPreview(e.target.checked)}
                size="medium"
                sx={{
                  color: '#94a3b8',
                  '&.Mui-checked': { color: themeColors.primary },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600, fontSize: '0.88rem' }}>
                Print preview
              </Typography>
            }
            sx={{ ml: 0.5 }}
          />

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 28 }} />

          {/* Clear Button */}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 20 }} />}
            onClick={handleClear}
            sx={{
              borderColor: '#cbd5e1',
              color: '#334155',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.92rem',
              height: 44,
              px: 2.2,
              '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
            }}
          >
            Clear
          </Button>

          {/* Edit Button */}
          <Button
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 20 }} />}
            onClick={() => setSearchDialogOpen(true)}
            sx={{
              borderColor: '#cbd5e1',
              color: '#334155',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.92rem',
              height: 44,
              px: 2.2,
              '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
            }}
          >
            Edit
          </Button>

          {/* Search Button */}
          <Button
            variant="outlined"
            startIcon={<SearchIcon sx={{ fontSize: 20 }} />}
            onClick={() => setSearchDialogOpen(true)}
            sx={{
              borderColor: '#cbd5e1',
              color: '#334155',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.92rem',
              height: 44,
              px: 2.2,
              '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
            }}
          >
            Search
          </Button>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 28 }} />

          {/* Delete Button */}
          <Button
            variant="outlined"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 20 }} />}
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={!currentVoucherId}
            sx={{
              borderColor: '#fca5a5',
              color: '#dc2626',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.92rem',
              height: 44,
              px: 2.2,
              '&:hover': { borderColor: '#ef4444', bgcolor: '#fef2f2' },
              '&.Mui-disabled': { borderColor: '#f1f5f9', color: '#cbd5e1' },
            }}
          >
            Delete
          </Button>
        </Box>

        {/* Keyboard shortcuts */}
        <Box>
          <Button
            variant="outlined"
            startIcon={<KeyboardIcon sx={{ fontSize: 18 }} />}
            onClick={() => setShortcutsOpen(true)}
            sx={{
              borderColor: '#e2e8f0',
              color: '#64748b',
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              height: 38,
              px: 1.8,
              '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' },
            }}
          >
            Keyboard shortcuts
          </Button>
        </Box>
      </Box>
        </>
      )}

      {/* ── Dialog: Reference Type Prompt (Against Ref vs On Account) ── */}
      <Dialog
        open={refPromptOpen}
        onClose={() => setRefPromptOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pb: 1 }}>
          Select Reference Type
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            Account{' '}
            <strong style={{ color: '#0f172a' }}>{refPromptAccount?.name}</strong> has{' '}
            <strong style={{ color: themeColors.primary }}>Against Ref</strong> enabled in ledger registration. How
            would you like to enter this transaction?
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<ReceiptLongIcon />}
              onClick={() => {
                setRefPromptOpen(false);
                if (isCheque) {
                  setChequeRefType('Against Ref');
                  openChequeAgainstRefDialog(refPromptAccount?._id);
                } else if (refPromptLineIndex !== null) {
                  setRows((prev) => {
                    const next = [...prev];
                    next[refPromptLineIndex].refType = 'Against Ref';
                    return next;
                  });
                  openAgainstRefDialog(refPromptLineIndex, refPromptAccount?._id);
                }
              }}
              sx={{
                bgcolor: themeColors.primary,
                '&:hover': { bgcolor: themeColors.primaryHover },
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 700,
                py: 1.2,
                justifyContent: 'flex-start',
                px: 2,
              }}
            >
              Against Reference (Agst Ref) — Settle Bills
            </Button>

            <Button
              variant="outlined"
              onClick={() => {
                setRefPromptOpen(false);
                if (isCheque) {
                  setChequeRefType('On Account');
                  setChequeSettlements([]);
                } else if (refPromptLineIndex !== null) {
                  setRows((prev) => {
                    const next = [...prev];
                    next[refPromptLineIndex].refType = 'On Account';
                    return next;
                  });
                }
              }}
              sx={{
                borderColor: '#cbd5e1',
                color: '#334155',
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 600,
                py: 1.2,
                justifyContent: 'flex-start',
                px: 2,
                '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
              }}
            >
              On Account — General Entry
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setRefPromptOpen(false);
              if (isCheque && chequeRefType !== 'Against Ref') {
                setChequeRefType('On Account');
                setChequeSettlements([]);
              }
            }}
            sx={{ textTransform: 'none', color: '#64748b' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Bill-wise Settlement (Against Reference) ── */}
      <Dialog
        open={billDialogOpen}
        onClose={() => setBillDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', overflow: 'hidden' } }}
      >
        <DialogTitle
          sx={{
            bgcolor: themeColors.isPink ? '#831843' : isCheque ? '#0369a1' : '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 2,
            px: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReceiptLongIcon />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
              Bill-wise Settlement (Against Reference)
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setBillDialogOpen(false)} sx={{ color: '#ffffff' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {loadingBills ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <CircularProgress size={32} sx={{ color: themeColors.primary }} />
              <Typography sx={{ mt: 1.5, color: '#64748b', fontSize: '0.9rem' }}>
                Loading pending bills...
              </Typography>
            </Box>
          ) : settlements.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#64748b', fontSize: '0.95rem' }}>
                No outstanding bills found for this account.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => {
                  if (isCheque) {
                    setChequeRefType('On Account');
                    setChequeSettlements([]);
                  } else if (billDialogLineIndex !== null) {
                    setRows((prev) => {
                      const next = [...prev];
                      next[billDialogLineIndex].refType = 'On Account';
                      return next;
                    });
                  }
                  setBillDialogOpen(false);
                }}
                sx={{
                  mt: 2,
                  textTransform: 'none',
                  borderRadius: '8px',
                  color: themeColors.primary,
                  borderColor: themeColors.primary,
                }}
              >
                Set as On Account instead
              </Button>
            </Box>
          ) : (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell padding="checkbox" sx={{ pl: 2 }} />
                    <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Bill No.</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#334155' }}>
                      Total
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#334155' }}>
                      Outstanding
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#334155', width: 140 }}>
                      Settle Amount
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#334155', pr: 2 }}>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {settlements.map((s, bIdx) => (
                    <TableRow
                      key={s.billNumber}
                      sx={{
                        bgcolor: s.selected ? (themeColors.isPink ? '#fdf2f8' : '#f0fdfa') : undefined,
                        '&:hover': { bgcolor: '#f8fafc' },
                      }}
                    >
                      <TableCell padding="checkbox" sx={{ pl: 2 }}>
                        <Checkbox
                          checked={s.selected}
                          onChange={() => toggleBillSelection(bIdx)}
                          size="small"
                          sx={{ '&.Mui-checked': { color: themeColors.primary } }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{s.billNumber}</TableCell>
                      <TableCell sx={{ color: '#475569' }}>{s.date}</TableCell>
                      <TableCell align="right" sx={{ color: '#475569' }}>
                        {s.totalAmount.toFixed(2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#dc2626' }}>
                        {s.outstandingAmount.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={s.settleAmount || ''}
                          onChange={(e) =>
                            updateBillSettleAmount(bIdx, parseFloat(e.target.value) || 0)
                          }
                          disabled={!s.selected}
                          inputProps={{
                            min: 0,
                            max: s.outstandingAmount,
                            step: 0.01,
                            style: { textAlign: 'right' },
                          }}
                          sx={{
                            width: 120,
                            '& .MuiOutlinedInput-root': {
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              '& input': {
                                MozAppearance: 'textfield !important',
                                appearance: 'textfield !important',
                              },
                              '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                WebkitAppearance: 'none !important',
                                margin: '0 !important',
                              },
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ pr: 2 }}>
                        <Chip
                          label={s.drCr === 'Dr' ? 'Receivable' : 'Payable'}
                          size="small"
                          variant="outlined"
                          color={s.drCr === 'Dr' ? 'success' : 'error'}
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box
                sx={{
                  p: 2,
                  px: 3,
                  bgcolor: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  {settlements.filter((s) => s.selected).length} bill(s) selected
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>
                  Total Settlement:{' '}
                  <span style={{ color: themeColors.primary }}>
                    AED{' '}
                    {settlements
                      .filter((s) => s.selected)
                      .reduce((sum, s) => sum + s.settleAmount, 0)
                      .toFixed(2)}
                  </span>
                </Typography>
              </Box>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setBillDialogOpen(false)}
            sx={{ textTransform: 'none', color: '#64748b' }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmSettlements}
            variant="contained"
            disabled={settlements.filter((s) => s.selected).length === 0}
            sx={{
              bgcolor: themeColors.primary,
              '&:hover': { bgcolor: themeColors.primaryHover },
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 700,
              px: 3,
            }}
          >
            Confirm Settlement
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Search Past Vouchers ── */}
      <Dialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Search {voucherType} Vouchers
        </DialogTitle>
        <DialogContent>
          <TextField
            size="small"
            fullWidth
            placeholder="Search by voucher number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2, mt: 1 }}
          />
          <Box sx={{ maxHeight: 350, overflowY: 'auto' }}>
            {vouchersList
              .filter((v) =>
                v.voucherNo.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((v, i) => (
                <Box
                  key={v._id}
                  onClick={() => {
                    setCurrentVoucherIndex(i);
                    loadVoucherData(v._id);
                    setSearchDialogOpen(false);
                  }}
                  sx={{
                    p: 1.5,
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    '&:hover': { bgcolor: themeColors.primaryLight },
                  }}
                >
                  <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {v.voucherNo}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    {v.date?.slice(0, 10)}
                  </Typography>
                </Box>
              ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSearchDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Keyboard Shortcuts ── */}
      <Dialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Keyboard Shortcuts
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 600 }}>Save Voucher</Typography>
              <Chip label="Ctrl + S / Alt + S" size="small" />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 600 }}>Clear / New</Typography>
              <Chip label="Alt + C" size="small" />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 600 }}>Print</Typography>
              <Chip label="Alt + P" size="small" />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShortcutsOpen(false)} sx={{ textTransform: 'none' }}>
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#dc2626' }}>
          Delete Voucher
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            Are you sure you want to delete Voucher #{voucherNo}? This will delete all corresponding
            ledger entries and revert any bill reference settlements.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteVoucher}
            variant="contained"
            sx={{
              bgcolor: '#dc2626',
              '&:hover': { bgcolor: '#b91c1c' },
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Success Dialog ── */}
      <Dialog
        open={successDialogOpen}
        onClose={() => setSuccessDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon />
          Success
        </DialogTitle>
        <DialogContent>
          <Typography>{successMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setSuccessDialogOpen(false)}
            variant="contained"
            sx={{
              bgcolor: '#16a34a',
              '&:hover': { bgcolor: '#15803d' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Error Dialog ── */}
      <Dialog
        open={errorDialogOpen}
        onClose={() => setErrorDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ color: '#dc2626' }}>Notice</DialogTitle>
        <DialogContent>
          <Typography>{errorMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setErrorDialogOpen(false)}
            variant="contained"
            sx={{
              bgcolor: '#dc2626',
              '&:hover': { bgcolor: '#b91c1c' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Cheque Print Preview ── */}
      <Dialog
        open={chequePrintOpen}
        onClose={() => setChequePrintOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Cheque Print Preview
          <IconButton size="small" onClick={() => setChequePrintOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              p: 3,
              border: '2px dashed #0284c7',
              borderRadius: '8px',
              bgcolor: '#f0fdfa',
              minHeight: 220,
              position: 'relative',
              fontFamily: "'Courier New', monospace",
            }}
          >
            {/* Cross Lines */}
            <Box
              sx={{
                position: 'absolute',
                top: 15,
                left: 15,
                borderLeft: '2px solid #0f172a',
                borderRight: '2px solid #0f172a',
                height: 45,
                width: 70,
                transform: 'rotate(-25deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography sx={{ fontSize: '0.55rem', fontWeight: 800, textAlign: 'center', letterSpacing: -0.5 }}>
                A/C PAYEE ONLY
              </Typography>
            </Box>

            {/* Bank Header */}
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>
                {accounts.find((a) => a._id === chequeRows[0]?.bankAccountId)?.name || 'BANK'}
              </Typography>
            </Box>

            {/* Date Box */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                Date: {date ? dayjs(date).format('DD / MM / YYYY') : '__ / __ / ____'}
              </Typography>
            </Box>

            {/* Payee */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Pay:</Typography>
              <Typography
                sx={{
                  flex: 1,
                  borderBottom: '1px dotted #0f172a',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: '#0f172a',
                  pb: 0.2,
                }}
              >
                {accounts.find((a) => a._id === chequePartyAccountId)?.name || '__________________________'}
              </Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Or Bearer</Typography>
            </Box>

            {/* Amount In Words */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>AED (in words):</Typography>
              <Typography
                sx={{
                  flex: 1,
                  borderBottom: '1px dotted #0f172a',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: '#0f172a',
                  pb: 0.2,
                }}
              >
                {numberToWordsDirhams(chequeGrandTotal)}
              </Typography>
            </Box>

            {/* Amount In Figures & Signatory */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mt: 3 }}>
              <Box
                sx={{
                  border: '2px solid #0f172a',
                  px: 2,
                  py: 0.8,
                  borderRadius: '4px',
                  bgcolor: '#ffffff',
                  fontWeight: 900,
                  fontSize: '1.15rem',
                  color: '#0f172a',
                }}
              >
                AED *** {chequeGrandTotal.toFixed(2)} ***
              </Box>

              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ borderBottom: '1px solid #0f172a', width: 160, mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                  Authorised Signatory
                </Typography>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setChequePrintOpen(false)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          <Button
            onClick={() => window.print()}
            variant="contained"
            startIcon={<PrintIcon />}
            sx={{
              bgcolor: '#0284c7',
              '&:hover': { bgcolor: '#0369a1' },
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Print Cheque
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
