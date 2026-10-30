import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  IconButton,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  MenuItem,
  Badge,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  InputAdornment,
  Checkbox,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Save as SaveIcon,
  Print as PrintIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
  PauseCircleOutline as HoldIcon,
  PlaylistAdd as HoldListIcon,
  RestorePage as RestoreIcon,
  WarningAmber as WarningIcon,
  Send as SendIcon,
  LocalPharmacy as LocalPharmacyIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  EditOutlined as EditOutlinedIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { salesApi, productApi, ledgerAccountApi, purchaseApi, stockApi, B2CLineItem, B2CInvoiceInput } from '../services/api';
import DateInput, { getCurrentDate, formatDateDisplay } from '../components/DateInput';
import { setDrawerOpen } from '../store/slices/appSlice';
import {
  commonButtonStyles,
  createRowCommitRefs,
  commitRowEdits,
  handleItemNameBlurWithRevert,
  calculateProfit,
  formatStockDisplay,
} from '../utils/salesDesignPatterns';

export interface DoctorItem {
  _id?: string;
  name: string;
  licenseNumber: string;
  licensingAuthority?: string;
  phone?: string;
  specialty?: string;
}

export interface PatientItem {
  _id?: string;
  emiratesId: string;
  firstName: string;
  familyName: string;
  fullName: string;
  dob?: string;
  gender?: 'Female' | 'Male' | 'Unknown';
  mrn?: string;
  phone?: string;
  language?: string;
  emirate?: string;
  city?: string;
  street?: string;
  country?: string;
}

interface UnitOption {
  id: string;
  name: string;
  isMultiUnit: boolean;
  multiUnitId?: string;
  imei?: string;
  price?: number;
  conversion?: number;
  retail?: number;
  wholesale?: number;
  specialPrice1?: number;
  specialPrice2?: number;
}

interface LineItem {
  id: string;
  productId: string;
  productCode: string;
  imei: string;
  name: string;
  isRx?: boolean;
  dosageInstructions?: {
    duration: string;
    durationUnit: string;
    timing: string;
    frequency: string;
    summary: string;
  };
  duration?: string;
  timing?: string;
  frequency?: string;
  unitId: string;
  unitName: string;
  availableUnits: UnitOption[];
  quantity: number;
  /** Total available stock for this product in BASE UNIT pieces (not multi-unit qty) */
  baseStockPieces: number;
  /** When set, user can only enter up to this many pieces (selected batch qty); caps quantity to this batch */
  batchMaxPieces?: number;
  /** Batch number selected for this line (used for cross-row batch cap checks) */
  batchNumber?: string;
  expiryDate?: string;
  price: number;
  purchasePrice: number;
  gross: number;
  discPercent: number;
  discAmount: number;
  vatAmount: number;
  total: number;
  isCommitted: boolean;
}

interface MultiUnit {
  multiUnitId: string;
  imei?: string;
  conversion?: number;
  price?: number;
  totalPrice?: number;
  retail?: number;
  wholesale?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  unitId?: { _id: string; name?: string; shortCode?: string } | string;
}

interface Product {
  _id: string;
  code?: string;
  name: string;
  imei?: string;
  retailPrice?: number;
  wholesalePrice?: number;
  purchasePrice?: number;
  allowBatches?: boolean;
  unitOfMeasureId?: { _id: string; name?: string; shortCode?: string } | string;
  multiUnits?: MultiUnit[];
}

interface Customer {
  _id: string;
  code?: string;
  name: string;
  address?: string;
  phone?: string;
  type?: string;
}

interface CashAccount {
  _id: string;
  code?: string;
  name: string;
}

interface HeldInvoice {
  id: string;
  heldAt: string;
  customerName: string;
  itemCount: number;
  total: number;
  invoiceNo: string;
  date: string;
  vatType: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  paymentType: 'Cash' | 'Credit';
  rateType: 'Retail' | 'WSale' | 'Special1' | 'Special2';
  customerId: string | null;
  customerAddress: string;
  billingAddress: string;
  billingPhone: string;
  billingNarration: string;
  shippingName: string;
  shippingAddress: string;
  shippingPhone: string;
  shippingContactPerson: string;
  cashAccountId: string | null;
  cardAccountId: string | null;
  cardAmount: number;
  cardReference?: string;
  lines: LineItem[];
  cashReceived: number;
  oldBalance: number;
  otherDiscPercent: number;
  otherDiscount: number;
  otherCharges: number;
  freightCharge: number;
  lendAddLess: number;
  roundOff: number;
  autoRoundOff?: boolean;
  narration: string;
  emiratesId?: string;
  patientName?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  isRiayati?: boolean;
}

const HOLD_STORAGE_KEY = 'salesB2C_heldInvoices';

function loadHeldInvoices(): HeldInvoice[] {
  try {
    const data = localStorage.getItem(HOLD_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHeldInvoices(invoices: HeldInvoice[]): void {
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(invoices));
}

const emptyLine = (): LineItem => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
  productId: '',
  productCode: '',
  imei: '',
  name: '',
  isRx: false,
  unitId: '',
  unitName: '',
  availableUnits: [],
  quantity: 0,
  baseStockPieces: 0,
  price: 0,
  purchasePrice: 0,
  gross: 0,
  discPercent: 0,
  discAmount: 0,
  vatAmount: 0,
  total: 0,
  isCommitted: false,
});

export default function SalesB2C() {
  // Filter for product Autocomplete — match anywhere in the name, no result limit
  const productFilterOptions = useMemo(
    () => (options: Product[], state: { inputValue: string }) => {
      const q = (state.inputValue || '').trim().toLowerCase();
      const name = (p: Product) => (p.name || '').toLowerCase();
      const sortByName = (arr: Product[]) =>
        arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      if (!q) return options;
      const startsWith = options.filter((p) => name(p).startsWith(q));
      const containsOnly = options.filter((p) => name(p).includes(q) && !name(p).startsWith(q));
      return [...sortByName(startsWith), ...sortByName(containsOnly)];
    },
    []
  );

  const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);
  const financialYearId = useSelector((s: RootState) => s.app.selectedFinancialYearId);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const isB2BMode = routeLocation.pathname === '/entry/sales-b2b';
  const isQuotationMode = routeLocation.pathname === '/entry/quotation-sales';
  const invoiceType = isQuotationMode ? 'Quotation' : (isB2BMode ? 'B2B' : 'B2C');

  // Hide menu when clicking on any field
  const handlePageClick = useCallback(() => {
    dispatch(setDrawerOpen(false));
  }, [dispatch]);

  // Header state
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [date, setDate] = useState(getCurrentDate);
  const [vatType, setVatType] = useState<'Vat' | 'NonVat'>('Vat');
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>(isB2BMode ? 'Credit' : 'Cash');
  const [rateType, setRateType] = useState<'Retail' | 'WSale' | 'Special1' | 'Special2'>('WSale');
  const [location, setLocation] = useState('MAIN BRANCH');

  // Customer
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(isB2BMode ? '' : 'CASH IN HAND');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pendingCustomerName, setPendingCustomerName] = useState<string | null>(null);
  const [customerAcListboxOpen, setCustomerAcListboxOpen] = useState(false);
  const [createCustomerConfirmOpen, setCreateCustomerConfirmOpen] = useState(false);
  const [createCustomerConfirmName, setCreateCustomerConfirmName] = useState<string | null>(null);
  const [createProductConfirmOpen, setCreateProductConfirmOpen] = useState(false);
  const [createProductConfirmName, setCreateProductConfirmName] = useState<string | null>(null);
  const pendingProductLineIdRef = useRef<string | null>(null);
  const [pendingProductName, setPendingProductName] = useState<string | null>(null);
  const [pendingProductLineId, setPendingProductLineId] = useState<string | null>(null);
  const handledProductReturnRef = useRef(false);
  const customerAcRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const customerInitializedRef = useRef(false);
  const shouldFocusCustomerAcRef = useRef(false);
  const rateTypeRef = useRef<HTMLInputElement>(null);

  // Collapse duplicate mount/activation loads and skip refetches of just-loaded data
  type LoadKey = 'products' | 'customers' | 'cash' | 'invoiceIds' | 'doctors' | 'patients' | 'nextInvoiceNo';
  const loadGuardsRef = useRef<Record<LoadKey, { promise: Promise<void> | null; loadedAt: number }>>({
    products: { promise: null, loadedAt: 0 },
    customers: { promise: null, loadedAt: 0 },
    cash: { promise: null, loadedAt: 0 },
    invoiceIds: { promise: null, loadedAt: 0 },
    doctors: { promise: null, loadedAt: 0 },
    patients: { promise: null, loadedAt: 0 },
    nextInvoiceNo: { promise: null, loadedAt: 0 },
  });
  const runGuardedLoad = useCallback((key: LoadKey, task: () => Promise<void>, force = false): Promise<void> => {
    const guard = loadGuardsRef.current[key];
    if (guard.promise) return guard.promise;
    if (!force && Date.now() - guard.loadedAt < 5000) return Promise.resolve();
    const promise = task()
      .catch(() => {})
      .finally(() => {
        guard.promise = null;
        guard.loadedAt = Date.now();
      });
    guard.promise = promise;
    return promise;
  }, []);

  const focusCustomerAc = useCallback(() => {
    const el = customerAcRef.current || (document.getElementById('sales-customer-ac-input') as HTMLInputElement | null);
    if (el) {
      el.focus({ preventScroll: true });
      el.select?.();
    }
  }, []);

  useEffect(() => {
    if (shouldFocusCustomerAcRef.current) {
      shouldFocusCustomerAcRef.current = false;
      focusCustomerAc();
      const t = setTimeout(focusCustomerAc, 60);
      return () => clearTimeout(t);
    }
  });

  // Address Details Dialog
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  // Billing Address
  const [billingAddress, setBillingAddress] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [billingNarration, setBillingNarration] = useState('');
  // Shipping Address
  const [shippingName, setShippingName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  const [shippingContactPerson, setShippingContactPerson] = useState('');

  // Cash Account
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [selectedCashAccount, setSelectedCashAccount] = useState<CashAccount | null>(null);

  // Card payment
  const [cardAccountId, setCardAccountId] = useState<string | null>(null);
  const [cardAccounts, setCardAccounts] = useState<CashAccount[]>([]);
  const [cardAmount, setCardAmount] = useState(0);
  const [cardReference, setCardReference] = useState('');

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  // Line items
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // Pharmacy & Riayati (E-Prescription) State
  const [emiratesId, setEmiratesId] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [prescriptionDate, setPrescriptionDate] = useState('');
  const [isRiayati, setIsRiayati] = useState(false);
  const [riayatiDialogOpen, setRiayatiDialogOpen] = useState(false);
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);

  // Doctor Dialog State
  const [doctorDialogOpen, setDoctorDialogOpen] = useState(false);
  const [docTab, setDocTab] = useState<'saved' | 'new'>('saved');
  const [docFormSavedSelect, setDocFormSavedSelect] = useState('');
  const [docFormName, setDocFormName] = useState('');
  const [docFormLic, setDocFormLic] = useState('');
  const [docFormProv, setDocFormProv] = useState<'MOHAP' | 'DHA' | 'DOH'>('MOHAP');
  const [docFormPhone, setDocFormPhone] = useState('');
  const [docFormSpecialty, setDocFormSpecialty] = useState('');
  const [docIsOpenAsUnsaved, setDocIsOpenAsUnsaved] = useState(false);

  // Patient Dialog State
  const [patientDialogOpen, setPatientDialogOpen] = useState(false);
  const [patTab, setPatTab] = useState<'saved' | 'new'>('saved');
  const [patFormSavedSelect, setPatFormSavedSelect] = useState('');
  const [patFormEid, setPatFormEid] = useState('');
  const [patFormFirst, setPatFormFirst] = useState('');
  const [patFormFamily, setPatFormFamily] = useState('');
  const [patFormDob, setPatFormDob] = useState('');
  const [patFormGender, setPatFormGender] = useState<'Female' | 'Male' | 'Unknown'>('Unknown');
  const [patFormMrn, setPatFormMrn] = useState('');
  const [patFormPhone, setPatFormPhone] = useState('');
  const [patFormLang, setPatFormLang] = useState('English');
  const [patFormEmirate, setPatFormEmirate] = useState('');
  const [patFormCity, setPatFormCity] = useState('');
  const [patFormStreet, setPatFormStreet] = useState('');
  const [patFormCountry, setPatFormCountry] = useState('United Arab Emirates');
  const [patSearchLoading, setPatSearchLoading] = useState(false);
  const [patIsOpenAsUnsaved, setPatIsOpenAsUnsaved] = useState(false);

  // Medication Instructions Dialog State
  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [selectedMedLineId, setSelectedMedLineId] = useState<string | null>(null);
  const [medDuration, setMedDuration] = useState('30');
  const [medDurationUnit, setMedDurationUnit] = useState<'Days' | 'Weeks' | 'Months'>('Days');
  const [medTiming, setMedTiming] = useState('Before Food');
  const [medFrequency, setMedFrequency] = useState('1');

  // Refs for input fields to enable focus navigation
  const imeiInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const itemNameListboxOpenRef = useRef(false);
  const unitInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const priceInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const discPercentInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const discAmountInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const batchRowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

  // Payment details refs for focus navigation
  const cashReceivedRef = useRef<HTMLInputElement>(null);
  const cardPaymentRef = useRef<HTMLInputElement>(null);
  const cardReferenceRef = useRef<HTMLInputElement>(null);
  const narrationRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const actionButtonsContainerRef = useRef<HTMLDivElement>(null);
  const navButtonsContainerRef = useRef<HTMLDivElement>(null);

  const focusPrintButton = useCallback(() => {
    setTimeout(() => {
      printButtonRef.current?.focus();
    }, 50);
    setTimeout(() => {
      printButtonRef.current?.focus();
    }, 150);
  }, []);

  // Payment tender fields are disabled for credit sales — skip them in keyboard flow
  const focusPaymentEntry = useCallback(() => {
    if (paymentType === 'Credit') {
      narrationRef.current?.focus();
    } else {
      cashReceivedRef.current?.focus();
    }
  }, [paymentType]);

  const handleActionButtonKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      return;
    }
    const container = actionButtonsContainerRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    ).filter((btn) => btn.offsetParent !== null);

    if (buttons.length === 0) return;

    const activeEl = document.activeElement as HTMLButtonElement | null;
    const currentIndex = activeEl ? buttons.indexOf(activeEl) : -1;

    e.preventDefault();
    e.stopPropagation();

    if (currentIndex === -1) {
      buttons[0]?.focus();
      return;
    }

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    }

    buttons[nextIndex]?.focus();
  };

  const handleNavButtonKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      return;
    }
    const container = navButtonsContainerRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    ).filter((btn) => btn.offsetParent !== null);

    if (buttons.length === 0) return;

    const activeEl = document.activeElement as HTMLButtonElement | null;
    const currentIndex = activeEl ? buttons.indexOf(activeEl) : -1;

    e.preventDefault();
    e.stopPropagation();

    if (currentIndex === -1) {
      buttons[0]?.focus();
      return;
    }

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    }

    buttons[nextIndex]?.focus();
  };

  // Store original invoice items when editing — used to add back stock during pre-save check
  const originalInvoiceItemsRef = useRef<Array<{ productId: string; quantity: number; unitConversion: number }>>([]);

  // When QTY exceeds stock, store lineId to refocus after dialog closes
  const qtyOverflowLineIdRef = useRef<string | null>(null);

  // Row edit commit/revert using reusable pattern
  const { rowSnapshotRef, rowCommittedRef } = createRowCommitRefs();
  // Item name field: snapshot before edit so we can undo if user clears then blurs without selecting
  const itemNameSnapshotRef = useRef<{ lineId: string; data: LineItem } | null>(null);

  // Summary
  const [cashReceived, setCashReceived] = useState(0);
  const [oldBalance, setOldBalance] = useState(0);
  const [otherDiscPercent, setOtherDiscPercent] = useState(0);
  const [otherDiscount, setOtherDiscount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [freightCharge, setFreightCharge] = useState(0);
  const [lendAddLess, setLendAddLess] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [autoRoundOff, setAutoRoundOff] = useState(false);
  const [narration, setNarration] = useState('');

  // Dialogs
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertMessage, setStockAlertMessage] = useState('');
  const [isSaved, setIsSaved] = useState(false); // Track if current invoice is saved
  const [editSuccessDialogOpen, setEditSuccessDialogOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState('');
  const [postToSalesDialogOpen, setPostToSalesDialogOpen] = useState(false);

  // Batch selection state
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [focusedBatchIndex, setFocusedBatchIndex] = useState(0);
  const [availableBatches, setAvailableBatches] = useState<{
    batchNumber: string;
    productId: string;
    productName: string;
    purchasePrice: number;
    expiryDate: string;
    quantity: number;
    retail: number;
    wholesale: number;
  }[]>([]);
  const [pendingProductSelection, setPendingProductSelection] = useState<{
    lineId: string;
    product: Product;
    matchedMultiUnitId?: string;
    searchedImei?: string;
  } | null>(null);

  // Focus and scroll focused batch into view
  useEffect(() => {
    if (batchDialogOpen) {
      setFocusedBatchIndex(0);
      const focusFirst = () => {
        const row = batchRowRefs.current[0];
        if (row) {
          row.focus();
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
      focusFirst();
      const id1 = requestAnimationFrame(focusFirst);
      const t1 = setTimeout(focusFirst, 50);
      const t2 = setTimeout(focusFirst, 150);
      const t3 = setTimeout(focusFirst, 300);
      return () => {
        cancelAnimationFrame(id1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [batchDialogOpen]);

  useEffect(() => {
    if (batchDialogOpen && batchRowRefs.current[focusedBatchIndex]) {
      batchRowRefs.current[focusedBatchIndex]?.focus();
      batchRowRefs.current[focusedBatchIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [batchDialogOpen, focusedBatchIndex]);

  // Hold invoices
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>(loadHeldInvoices);
  const [holdListDialogOpen, setHoldListDialogOpen] = useState(false);

  // Product transaction history dialog (Ctrl+M)
  const [txnHistoryDialogOpen, setTxnHistoryDialogOpen] = useState(false);
  const [txnHistoryData, setTxnHistoryData] = useState<Array<{ invoiceNo: string; date: string; customerName: string; quantity: number; unitPrice: number; unitName: string; discount: number; total: number }>>([]);
  const [txnHistoryProductName, setTxnHistoryProductName] = useState('');
  const [txnHistoryLoading, setTxnHistoryLoading] = useState(false);
  const [txnHistorySelectedIdx, setTxnHistorySelectedIdx] = useState(0);
  const [txnHistorySourceLineId, setTxnHistorySourceLineId] = useState<string | null>(null);
  const txnHistoryRowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

  // Scroll selected txn history row into view
  useEffect(() => {
    if (txnHistoryDialogOpen && txnHistoryRowRefs.current[txnHistorySelectedIdx]) {
      txnHistoryRowRefs.current[txnHistorySelectedIdx]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [txnHistoryDialogOpen, txnHistorySelectedIdx]);

  // Profit details dialog (Ctrl+P)
  const [profitDialogOpen, setProfitDialogOpen] = useState(false);

  // State
  const [loading, setLoading] = useState(false);
  // Error handling is done via errorDialogOpen/errorDialogMessage
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  // Selected Product Info
  const [selectedProductInfo, setSelectedProductInfo] = useState<{
    profit?: number;
    purchaseRate: number;
    lastVendor?: string;
    totalStock?: number;
    previousPrice?: number;
    stock?: number;
    retailPrice?: number;
    wholesalePrice?: number;
    batchNumber?: string;
    expiryDate?: string;
  } | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Invoice Navigation
  const [invoiceIds, setInvoiceIds] = useState<string[]>([]);

  // Numeric field editing: keep raw string (e.g. ".02", "10.0") while typing; parse on blur
  const [editingNumericCell, setEditingNumericCell] = useState<{ lineId?: string; field: string; value: string } | null>(null);
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === '-') return 0;
    const normalized = raw === '.' || (/^\.\d*$/.test(raw)) ? '0' + raw : raw;
    return parseFloat(normalized) || 0;
  };

  // Derive multi-unit info from current lines state (always up-to-date)
  const activeMultiUnitInfo = useMemo(() => {
    if (!activeLineId) return null;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line || !line.unitId) return null;
    const unit = line.availableUnits.find((u) => u.id === line.unitId);
    if (!unit?.isMultiUnit) return null;
    return {
      name: unit.name,
      pcsInside: unit.conversion,
      multiUnitPrice: unit.price,
      wholesale: unit.wholesale,
      retail: unit.retail,
      specialPrice1: unit.specialPrice1,
      specialPrice2: unit.specialPrice2,
    };
  }, [activeLineId, lines]);

  // Keep displayed profit in sync with active line data (handles unit changes, price edits, etc.)
  useEffect(() => {
    if (!activeLineId) return;
    const line = lines.find((l) => l.id === activeLineId);
    if (!line || !line.productId) return;
    const unit = line.availableUnits.find((u) => u.id === line.unitId);
    const isMulti = unit?.isMultiUnit && unit?.conversion;
    const multiCost = isMulti ? line.purchasePrice * unit!.conversion! : line.purchasePrice;
    const correctProfit = line.price - multiCost;
    setSelectedProductInfo((prev) => {
      if (!prev) return prev;
      // Only update if profit actually differs (avoids unnecessary re-renders)
      if (Math.abs((prev.profit ?? 0) - correctProfit) < 0.001) return prev;
      return { ...prev, profit: correctProfit };
    });
  }, [activeLineId, lines]);

  // Calculations
  const VAT_RATE = 5;

  // Helper: compute vatAmount & total based on taxMode
  const calcVatAndTotal = useCallback(
    (net: number, isVat: boolean) => {
      if (!isVat) return { vatAmount: 0, total: net };
      if (taxMode === 'inclusive') {
        // Price already includes tax — back-calculate VAT from inclusive amount
        const vatAmount = parseFloat((net * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
        return { vatAmount, total: parseFloat(net.toFixed(2)) };
      }
      // Exclusive: VAT is added on top
      const vatAmount = parseFloat((net * VAT_RATE / 100).toFixed(2));
      return { vatAmount, total: parseFloat((net + vatAmount).toFixed(2)) };
    },
    [taxMode]
  );

  // Recalculate all lines when taxMode (or vatType) changes
  useEffect(() => {
    setLines((prev) =>
      prev.map((line) => {
        if (!line.productId) return line; // skip empty rows
        const updated = { ...line };
        const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
        const vt = calcVatAndTotal(net, vatType === 'Vat');
        updated.vatAmount = vt.vatAmount;
        updated.total = vt.total;
        return updated;
      })
    );
  }, [taxMode, vatType, calcVatAndTotal]);

  const calculations = useMemo(() => {
    const itemsGross = lines.reduce((sum, l) => sum + l.gross, 0);
    const itemsDiscount = lines.reduce((sum, l) => sum + l.discAmount, 0);
    const itemsVat = lines.reduce((sum, l) => sum + l.vatAmount, 0);
    // When Vat: adjustments (other disc, other charges, freight, travel, round off) are inclusive of tax — extract VAT
    const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
    const vatFromAdjustments = vatType === 'Vat' && netAdjustments !== 0
      ? parseFloat((netAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2))
      : 0;
    const totalVat = itemsVat + vatFromAdjustments;
    // Use sum of line totals — works correctly for both inclusive & exclusive tax
    const subTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;
    const balance = grandTotal - cashReceived - cardAmount;
    const netBalance = balance + oldBalance;
    const totalItems = lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
    const totalProfit = lines.reduce((sum, l) => {
      const unit = l.availableUnits.find((u) => u.id === l.unitId);
      const isMulti = unit?.isMultiUnit && unit?.conversion;
      const cost = isMulti ? l.purchasePrice * unit!.conversion! : l.purchasePrice;
      return sum + ((l.price - cost) * l.quantity);
    }, 0);
    return { itemsGross, itemsDiscount, itemsVat, vatFromAdjustments, totalVat, subTotal, grandTotal, balance, netBalance, totalItems, totalProfit };
  }, [lines, otherDiscount, otherCharges, freightCharge, lendAddLess, roundOff, cashReceived, cardAmount, oldBalance, vatType]);

  // Handle other discount percentage change (uses memoized subTotal)
  const handleOtherDiscPercentChange = useCallback((percent: number) => {
    setOtherDiscPercent(percent);
    const discountAmount = (calculations.subTotal * percent) / 100;
    setOtherDiscount(parseFloat(discountAmount.toFixed(2)));
  }, [calculations.subTotal]);

  // Auto round-off toggle handler
  const handleAutoRoundOffToggle = useCallback((checked: boolean) => {
    setAutoRoundOff(checked);
    if (checked) {
      const baseTotal = calculations.subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess;
      const rounded = Math.round(baseTotal);
      const diff = parseFloat((rounded - baseTotal).toFixed(2));
      setRoundOff(diff);
    } else {
      setRoundOff(0);
    }
  }, [calculations.subTotal, otherDiscount, otherCharges, freightCharge, lendAddLess]);

  // Keep roundOff in sync when autoRoundOff is active and totals change
  useEffect(() => {
    if (!autoRoundOff) return;
    const baseTotal = calculations.subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess;
    const rounded = Math.round(baseTotal);
    const diff = parseFloat((rounded - baseTotal).toFixed(2));
    if (diff !== roundOff) {
      setRoundOff(diff);
    }
  }, [autoRoundOff, calculations.subTotal, otherDiscount, otherCharges, freightCharge, lendAddLess, roundOff]);

  // Customer handlers
  const handleCustomerSelect = (customer: Customer | null) => {
    if (!customer) {
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setBillingAddress('');
      setBillingPhone('');
      setPaymentType(isB2BMode ? 'Credit' : 'Cash'); // Revert to Credit/Cash when no customer selected
      return;
    }
    const isCash = customer.type === 'Cash' || customer._id === 'cash' || /cash\s*in\s*hand/i.test(customer.name || '');
    if (isB2BMode && isCash) {
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setBillingAddress('');
      setBillingPhone('');
      setPaymentType('Credit');
      return;
    }
    if (isCash) {
      setCustomerId(null);
      setCustomerName(customer.name);
      setCustomerAddress(customer.address || '');
      setBillingAddress(customer.address || '');
      setBillingPhone(customer.phone || '');
      setPaymentType('Cash');
      setCashAccountId(customer._id);
      setSelectedCashAccount(customer as unknown as CashAccount);
    } else {
      setCustomerId(customer._id);
      setCustomerName(customer.name);
      setCustomerAddress(customer.address || '');
      setBillingAddress(customer.address || '');
      setBillingPhone(customer.phone || '');
      setPaymentType('Credit');
    }
  };

  const loadCustomers = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    const isB2B = routeLocation.pathname === '/entry/sales-b2b';
    return runGuardedLoad('customers', async () => {
      const cashOption = { _id: 'cash', code: 'CASH', name: 'CASH IN HAND', address: '', type: 'Cash' };
      const promises = [ledgerAccountApi.list(companyId, 'Customer', undefined, undefined, true)];
      if (!isB2B) {
        promises.push(ledgerAccountApi.list(companyId, 'Cash', undefined, undefined, true));
      }
      try {
        const [custRes, cashRes] = await Promise.all(promises);
        const custList = (custRes.data.data ?? []) as Customer[];
        const cashList = cashRes ? (cashRes.data.data ?? []) as Customer[] : [];
        let primaryCash = cashList.find((c) => /cash\s*in\s*hand/i.test(c.name || ''));
        if (!primaryCash) {
          primaryCash = cashList.find((c) => c.type === 'Cash') || cashList[0];
        }
        if (!isB2B && cashList.length === 0) {
          cashList.push(cashOption);
          primaryCash = cashOption;
        }
        const all = [...custList, ...cashList];
        const sorted = all.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        setCustomers(sorted);
        if (!customerInitializedRef.current && !invoiceId && !isB2B) {
          customerInitializedRef.current = true;
          const defaultCash = primaryCash || cashList[0];
          if (defaultCash) {
            setCustomerId(null);
            setCustomerName(defaultCash.name);
            setCustomerAddress(defaultCash.address || '');
            setBillingAddress(defaultCash.address || '');
            setBillingPhone(defaultCash.phone || '');
            setPaymentType('Cash');
            setCashAccountId(defaultCash._id);
            setSelectedCashAccount(defaultCash as unknown as CashAccount);
          }
        }
      } catch {
        setCustomers(isB2B ? [] : [cashOption]);
      }
    }, force);
  }, [companyId, routeLocation.pathname, invoiceId, runGuardedLoad]);

  const loadDoctors = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('doctors', async () => {
      try {
        const res = await salesApi.getDoctors(companyId);
        setDoctors((res.data?.data ?? []) as DoctorItem[]);
      } catch {
        // ignore
      }
    }, force);
  }, [companyId, runGuardedLoad]);

  const loadPatients = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('patients', async () => {
      try {
        const res = await salesApi.getPatients(companyId);
        setPatients((res.data?.data ?? []) as PatientItem[]);
      } catch {
        // ignore
      }
    }, force);
  }, [companyId, runGuardedLoad]);

  const prevPathnameRef = useRef(routeLocation.pathname);

  // Reset page state when route path changes
  useEffect(() => {
    const state = routeLocation.state as { fromQuotation?: boolean; invoiceId?: string; id?: string; invoiceNo?: string } | null;
    if (state?.fromQuotation || state?.invoiceId || state?.id || state?.invoiceNo) return; // Skip reset if loading invoice or pre-filling from quotation

    const pathChanged = prevPathnameRef.current !== routeLocation.pathname;
    prevPathnameRef.current = routeLocation.pathname;
    if (!pathChanged) return;
    customerInitializedRef.current = false;

    const isB2B = routeLocation.pathname === '/entry/sales-b2b';
    setInvoiceId(null);
    setInvoiceNo('');
    setCustomerId(null);
    setCustomerName(isB2B ? '' : 'CASH IN HAND');
    setCustomerAddress('');
    setBillingAddress('');
    setBillingPhone('');
    setNarration('');
    setLines([emptyLine()]);
    setCashReceived(0);
    setCardAmount(0);
    setCardAccountId(null);
    setPaymentType(isB2B ? 'Credit' : 'Cash');
    setOtherDiscount(0);
    setOtherDiscPercent(0);
    setOtherCharges(0);
    setFreightCharge(0);
    setLendAddLess(0);
    setRoundOff(0);
    setAutoRoundOff(false);
    setEmiratesId('');
    setSelectedPatient('');
    setSelectedDoctor('');
    setPrescriptionNumber('');
    setPrescriptionDate('');
    setIsRiayati(false);
    setIsSaved(false);
  }, [routeLocation.pathname, routeLocation.state]);

  // Load initial data
  useEffect(() => {
    if (!companyId || !financialYearId) return;
    loadNextInvoiceNo();
    loadCustomers();
    loadCashAccounts();
    loadProducts();
    loadDoctors();
    loadPatients();
    loadInvoiceIds();
    // Focus Customer AC on page load
    setTimeout(() => customerAcRef.current?.focus({ preventScroll: true }), 300);
  }, [companyId, financialYearId, routeLocation.pathname, loadDoctors, loadPatients]);

  // Focus Customer AC when navigating back to this page
  useEffect(() => {
    if (routeLocation.pathname === '/entry/sales-b2c' || routeLocation.pathname === '/entry/sales-b2b' || routeLocation.pathname === '/entry/quotation-sales') {
      setTimeout(() => customerAcRef.current?.focus({ preventScroll: true }), 300);
    }
  }, [routeLocation.pathname]);

  // Detect return from Customer Create page — read created ledger from state, set pending and reload customers
  const handledReturnFromCreateRef = useRef(false);
  useEffect(() => {
    const state = routeLocation.state as { createdLedgerName?: string } | null;
    const isSalesPath = routeLocation.pathname === '/entry/sales-b2c' || routeLocation.pathname === '/entry/sales-b2b' || routeLocation.pathname === '/entry/quotation-sales';
    if (!isSalesPath || !state?.createdLedgerName) {
      handledReturnFromCreateRef.current = false;
      return;
    }
    if (handledReturnFromCreateRef.current) return;
    handledReturnFromCreateRef.current = true;
    setPendingCustomerName(state.createdLedgerName);
    loadCustomers(true);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, loadCustomers, navigate]);

  // Once customers list is reloaded after creating a new customer, auto-select it by name
  useEffect(() => {
    if (!pendingCustomerName) return;
    const found = customers.find((c) => (c.name || '').toLowerCase() === pendingCustomerName.toLowerCase());
    if (found) {
      handleCustomerSelect(found);
      setPendingCustomerName(null);
      setTimeout(() => customerAcRef.current?.focus({ preventScroll: true }), 200);
    }
  }, [customers, pendingCustomerName, handleCustomerSelect]);

  // Detect return from Product Create page — read created product name and line id, reload products, then auto-fill line
  useEffect(() => {
    const state = routeLocation.state as { createdProductName?: string; lineIdForProduct?: string } | null;
    const isSalesPath = routeLocation.pathname === '/entry/sales-b2c' || routeLocation.pathname === '/entry/sales-b2b' || routeLocation.pathname === '/entry/quotation-sales';
    if (!isSalesPath || !state?.createdProductName) {
      handledProductReturnRef.current = false;
      return;
    }
    if (handledProductReturnRef.current) return;
    handledProductReturnRef.current = true;
    setPendingProductName(state.createdProductName);
    setPendingProductLineId(state.lineIdForProduct ?? null);
    loadProducts(true);
    const path = routeLocation.pathname;
    setTimeout(() => navigate(path, { replace: true, state: {} }), 0);
  }, [routeLocation.pathname, routeLocation.state, navigate]);

  useEffect(() => {
    const onProductsUpdated = () => {
      loadProducts(true);
    };
    const onLedgersUpdated = () => {
      loadCustomers(true);
    };
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/entry/sales-b2c' || p === '/entry/sales-b2b' || p === '/entry/quotation-sales') {
        loadProducts();
        loadCustomers();
      }
    };
    window.addEventListener('app:products-updated', onProductsUpdated);
    window.addEventListener('app:ledgers-updated', onLedgersUpdated);
    window.addEventListener('app:window-activated', onWindowActivated);
    return () => {
      window.removeEventListener('app:products-updated', onProductsUpdated);
      window.removeEventListener('app:ledgers-updated', onLedgersUpdated);
      window.removeEventListener('app:window-activated', onWindowActivated);
    };
  }, [loadCustomers]);

  // Pre-fill from Sales Order (Quotation) when navigated via "Post to Sales"
  useEffect(() => {
    const state = routeLocation.state as {
      fromQuotation?: boolean;
      quotationInvoiceNo?: string;
      customerId?: string | null;
      customerName?: string;
      customerAddress?: string;
      date?: string;
      vatType?: 'Vat' | 'NonVat';
      taxMode?: 'inclusive' | 'exclusive';
      rateType?: 'Retail' | 'WSale' | 'Special1' | 'Special2';
      otherDiscount?: number;
      otherCharges?: number;
      freightCharge?: number;
      roundOff?: number;
      narration?: string;
      shippingName?: string;
      shippingAddress?: string;
      shippingPhone?: string;
      shippingContactPerson?: string;
      lines?: Array<{
        id: string;
        productId: string;
        productCode: string;
        imei?: string;
        name: string;
        unitId: string;
        unitName: string;
        availableUnits?: Array<{ id: string; name: string; isMultiUnit?: boolean; multiUnitId?: string }>;
        quantity: number;
        price: number;
        purchasePrice?: number;
        gross: number;
        discPercent?: number;
        discAmount?: number;
        vatAmount?: number;
        total: number;
      }>;
    } | null;
    if (!state?.fromQuotation || !state.lines?.length || !companyId || !financialYearId) return;
    setCustomerId(state.customerId ?? null);
    setCustomerName(state.customerName ?? 'CASH');
    setCustomerAddress(state.customerAddress ?? '');
    setDate(state.date ?? getCurrentDate());
    setVatType(state.vatType ?? 'Vat');
    setTaxMode(state.taxMode ?? 'inclusive');
    setRateType(state.rateType ?? 'WSale');
    setOtherDiscount(state.otherDiscount ?? 0);
    setOtherCharges(state.otherCharges ?? 0);
    setFreightCharge(state.freightCharge ?? 0);
    setLendAddLess(0);
    setRoundOff(state.roundOff ?? 0);
    setAutoRoundOff(false);
    setNarration(state.narration ?? '');
    setShippingName(state.shippingName ?? '');
    setShippingAddress(state.shippingAddress ?? '');
    setShippingPhone(state.shippingPhone ?? '');
    setShippingContactPerson(state.shippingContactPerson ?? '');
    const newLines: LineItem[] = state.lines.map((l) => {
      const au = (l.availableUnits && l.availableUnits.length > 0)
        ? l.availableUnits.map((u) => ({ id: u.id, name: u.name, isMultiUnit: u.isMultiUnit ?? false, multiUnitId: u.multiUnitId }))
        : (l.unitId && l.unitName ? [{ id: l.unitId, name: l.unitName, isMultiUnit: false }] : []);
      return {
        id: l.id,
        productId: l.productId,
        productCode: l.productCode,
        imei: l.imei ?? '',
        name: l.name,
        unitId: l.unitId ?? '',
        unitName: l.unitName ?? '',
        availableUnits: au,
        quantity: l.quantity,
        baseStockPieces: 0,
        price: l.price,
        purchasePrice: l.purchasePrice ?? 0,
        gross: l.gross,
        discPercent: l.discPercent ?? 0,
        discAmount: l.discAmount ?? 0,
        vatAmount: l.vatAmount ?? 0,
        total: l.total,
        isCommitted: true,
      };
    });
    setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    setInvoiceId(null);
    setCashReceived(0);
    setCardAmount(0);
    setCardAccountId(null);
    setOldBalance(0);
    loadNextInvoiceNo(true);
    window.history.replaceState({}, '', routeLocation.pathname);
  }, [companyId, financialYearId, routeLocation.pathname, routeLocation.state]);

  const loadNextInvoiceNo = (force = false) => {
    if (!companyId || !financialYearId) return Promise.resolve();
    return runGuardedLoad('nextInvoiceNo', async () => {
      try {
        const res = await salesApi.getNextB2CInvoiceNo(companyId, financialYearId, invoiceType);
        setInvoiceNo(res.data.data.invoiceNo);
      } catch {
        // ignore
      }
    }, force);
  };

  const loadInvoiceIds = (force = false) => {
    if (!companyId || !financialYearId) return Promise.resolve();
    return runGuardedLoad('invoiceIds', async () => {
      try {
        const res = await salesApi.listB2CIds(companyId, financialYearId, invoiceType);
        const invoices = res.data.data.invoices as Array<{ _id: string }>;
        setInvoiceIds(invoices.map((inv) => inv._id));
      } catch {
        // ignore
      }
    }, force);
  };

  const navigateToInvoice = async (id: string, fallbackInvoiceNo?: string) => {
    setLoading(true);
    setErrorDialogOpen(false);
    try {
      let res;
      try {
        res = await salesApi.getB2C(id, companyId!, invoiceType);
      } catch {
        res = await salesApi.getB2C(id, companyId!);
      }
      if (res?.data?.data) {
        loadInvoice(res.data.data as Record<string, unknown>);
      } else if (fallbackInvoiceNo) {
        const searchRes = await salesApi.searchB2CByInvoiceNo(companyId!, fallbackInvoiceNo);
        if (searchRes.data?.data) {
          loadInvoice(searchRes.data.data as Record<string, unknown>);
        } else {
          setErrorDialogMessage('Failed to load invoice');
          setErrorDialogOpen(true);
        }
      } else {
        setErrorDialogMessage('Failed to load invoice');
        setErrorDialogOpen(true);
      }
    } catch {
      if (fallbackInvoiceNo) {
        try {
          const searchRes = await salesApi.searchB2CByInvoiceNo(companyId!, fallbackInvoiceNo);
          if (searchRes.data?.data) {
            loadInvoice(searchRes.data.data as Record<string, unknown>);
            return;
          }
        } catch {
          // ignore
        }
      }
      setErrorDialogMessage('Failed to load invoice');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load invoice if navigated with invoiceId in location state
  useEffect(() => {
    const state = routeLocation.state as { invoiceId?: string; id?: string; invoiceNo?: string } | null;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = state?.invoiceId || state?.id || urlParams.get('id');
    const invNo = state?.invoiceNo || urlParams.get('invoiceNo') || undefined;
    if (targetId && companyId) {
      navigateToInvoice(targetId, invNo);
      navigate(routeLocation.pathname, { replace: true, state: {} });
    } else if (invNo && companyId) {
      navigateToInvoice(invNo, invNo);
      navigate(routeLocation.pathname, { replace: true, state: {} });
    }
  }, [companyId, routeLocation.pathname, routeLocation.state, navigate]);

  const handleFirstInvoice = () => {
    if (invoiceIds.length > 0) {
      navigateToInvoice(invoiceIds[invoiceIds.length - 1]); // First invoice (oldest)
    }
  };

  const handlePrevInvoice = () => {
    if (!invoiceId || invoiceIds.length === 0) {
      // If no current invoice, go to last one
      if (invoiceIds.length > 0) navigateToInvoice(invoiceIds[0]);
      return;
    }
    const currentIndex = invoiceIds.indexOf(invoiceId);
    if (currentIndex < invoiceIds.length - 1) {
      navigateToInvoice(invoiceIds[currentIndex + 1]);
    }
  };

  const handleNextInvoice = () => {
    if (!invoiceId || invoiceIds.length === 0) {
      // If no current invoice, go to first one
      if (invoiceIds.length > 0) navigateToInvoice(invoiceIds[invoiceIds.length - 1]);
      return;
    }
    const currentIndex = invoiceIds.indexOf(invoiceId);
    if (currentIndex > 0) {
      navigateToInvoice(invoiceIds[currentIndex - 1]);
    }
  };

  const handleLastInvoice = () => {
    if (invoiceIds.length > 0) {
      navigateToInvoice(invoiceIds[0]); // Last invoice (newest)
    }
  };

  const loadCashAccounts = (force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('cash', async () => {
      try {
        const [cashRes, bankRes] = await Promise.all([
          ledgerAccountApi.list(companyId, 'Cash', undefined, undefined, true),
          ledgerAccountApi.list(companyId, 'Bank', undefined, undefined, true),
        ]);
        const cashList = cashRes.data.data as CashAccount[];
        setCashAccounts(cashList);
        const bankList = (bankRes.data.data as Array<CashAccount & { isCardAccount?: boolean; cardAccount?: boolean }>) || [];
        const cardOnlyBanks = bankList.filter((b) => b.isCardAccount === true || b.cardAccount === true);
        setCardAccounts(cardOnlyBanks);
        // Default Cash A/C: prioritize "CASH IN HAND"
        if (cashList.length > 0) {
          const defaultCash = cashList.find((c) => /cash\s*in\s*hand/i.test(c.name || '')) || cashList[0];
          setCashAccountId(defaultCash._id);
          setSelectedCashAccount(defaultCash);
          if (!customerInitializedRef.current && !invoiceId && routeLocation.pathname !== '/entry/sales-b2b') {
            customerInitializedRef.current = true;
            setCustomerName((prev) => (!prev || prev === 'CASH' || /cash\s*in\s*hand/i.test(prev)) ? defaultCash.name : prev);
          }
        }
        // Default Card A/C: account named "CC1" if found, otherwise first card account if any
        const cc1 = cardOnlyBanks.find((b) => b.name.toUpperCase() === 'CC1');
        if (cc1) {
          setCardAccountId(cc1._id);
        } else if (cardOnlyBanks.length > 0) {
          setCardAccountId(cardOnlyBanks[0]._id);
        } else {
          setCardAccountId(null);
        }
      } catch {
        // ignore
      }
    }, force);
  };

  const loadProducts = useCallback((force = false) => {
    if (!companyId) return Promise.resolve();
    return runGuardedLoad('products', async () => {
      try {
        const res = await productApi.list(companyId, { limit: 10000 });
        setProducts((res.data.data.products || []) as Product[]);
      } catch {
        // ignore
      }
    }, force);
  }, [companyId, runGuardedLoad]);


  // Helper: Format Emirates ID strictly as 784-YYYY-NNNNNNN-C (max 15 digits)
  const formatEmiratesId = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 15);
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 14) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14, 15)}`;
  };

  const handleEmiratesIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape'].includes(e.key) ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleEmiratesIdChange = (raw: string) => {
    const formatted = formatEmiratesId(raw);
    setEmiratesId(formatted);
    setPatFormEid(formatted);

    // Clear patient details form on edit/clear
    setPatFormFirst('');
    setPatFormFamily('');
    setPatFormDob('');
    setPatFormGender('Unknown');
    setPatFormMrn('');
    setPatFormPhone('');
    setPatFormLang('English');
    setPatFormEmirate('');
    setPatFormCity('');
    setPatFormStreet('');
    setPatFormCountry('United Arab Emirates');
    setPatFormSavedSelect('');
    setSelectedPatient('');

    // If a full 15-digit Emirates ID is entered (18 chars with hyphens), check if an existing saved patient matches
    if (formatted.length === 18) {
      const match = patients.find((p) => p.emiratesId === formatted);
      if (match) {
        setPatFormFirst(match.firstName || match.fullName);
        setPatFormFamily(match.familyName || '');
        setPatFormDob(match.dob || '');
        setPatFormGender(match.gender || 'Unknown');
        setPatFormMrn(match.mrn || '');
        setPatFormPhone(match.phone || '');
        setPatFormLang(match.language || 'English');
        setPatFormEmirate(match.emirate || '');
        setPatFormCity(match.city || '');
        setPatFormStreet(match.street || '');
        setPatFormCountry(match.country || 'United Arab Emirates');
        setSelectedPatient(match.fullName);
        setPatFormSavedSelect(match.fullName);
      }
    }
  };

  // ── DOCTOR DIALOG HANDLERS ──
  const handleOpenDoctorDialog = () => {
    const trimmed = selectedDoctor.trim();
    const existing = doctors.find((d) => d.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setDocTab('saved');
      setDocFormSavedSelect(existing.name);
      setDocFormName(existing.name);
      setDocFormLic(existing.licenseNumber);
      if (existing.licensingAuthority) setDocFormProv(existing.licensingAuthority as any);
      setDocFormPhone(existing.phone || '');
      setDocFormSpecialty(existing.specialty || '');
      setDocIsOpenAsUnsaved(false);
    } else {
      setDocTab('new');
      setDocFormSavedSelect('');
      setDocFormName(trimmed);
      setDocFormLic('');
      setDocFormProv('MOHAP');
      setDocFormPhone('');
      setDocFormSpecialty('');
      setDocIsOpenAsUnsaved(Boolean(trimmed));
    }
    setDoctorDialogOpen(true);
  };

  const handleCloseDoctorDialog = () => {
    if (docIsOpenAsUnsaved) {
      setSelectedDoctor('');
      setDocFormName('');
    }
    setDoctorDialogOpen(false);
    setDocIsOpenAsUnsaved(false);
  };

  const handleSelectSavedDoctor = () => {
    if (!docFormSavedSelect) {
      return;
    }
    const found = doctors.find((d) => d.name === docFormSavedSelect);
    if (found) {
      setDocIsOpenAsUnsaved(false);
      setSelectedDoctor(found.name);
      setDoctorDialogOpen(false);
    }
  };

  const handleSaveDoctor = async () => {
    if (!docFormName.trim() || !docFormLic.trim()) {
      setErrorDialogMessage('Doctor Name and License Number are required');
      setErrorDialogOpen(true);
      return;
    }
    const docName = docFormName.trim();
    const docLic = docFormLic.trim();
    const newDoc: DoctorItem = {
      name: docName,
      licenseNumber: docLic,
      licensingAuthority: docFormProv,
      phone: docFormPhone.trim() || undefined,
      specialty: docFormSpecialty.trim() || undefined,
    };
    try {
      if (companyId) {
        await salesApi.createDoctor({
          companyId,
          name: docName,
          licenseNumber: docLic,
          licensingAuthority: docFormProv,
          phone: docFormPhone.trim() || undefined,
          specialty: docFormSpecialty.trim() || undefined,
        });
      }
    } catch {
      // Local fallback
    }
    setDoctors((prev) => {
      const filtered = prev.filter((d) => d.name.toLowerCase() !== docName.toLowerCase());
      return [newDoc, ...filtered];
    });
    setDocIsOpenAsUnsaved(false);
    setSelectedDoctor(docName);
    setDoctorDialogOpen(false);
  };

  // ── PATIENT DIALOG HANDLERS ──
  const handleOpenPatientDialog = () => {
    const trimmed = selectedPatient.trim();
    const existing = patients.find(
      (p) => p.fullName.toLowerCase() === trimmed.toLowerCase() || p.firstName.toLowerCase() === trimmed.toLowerCase()
    );

    if (existing) {
      setPatTab('saved');
      setPatFormSavedSelect(existing.fullName);
      setPatFormEid(existing.emiratesId || emiratesId);
      setPatFormFirst(existing.firstName || '');
      setPatFormFamily(existing.familyName || '');
      setPatFormDob(existing.dob || '');
      setPatFormGender(existing.gender || 'Unknown');
      setPatFormMrn(existing.mrn || '');
      setPatFormPhone(existing.phone || '');
      setPatFormLang(existing.language || 'English');
      setPatFormEmirate(existing.emirate || '');
      setPatFormCity(existing.city || '');
      setPatFormStreet(existing.street || '');
      setPatFormCountry(existing.country || 'United Arab Emirates');
      setPatIsOpenAsUnsaved(false);
    } else {
      const matchByEid = emiratesId.trim() ? patients.find((p) => p.emiratesId === emiratesId.trim()) : null;
      if (matchByEid) {
        setPatTab('saved');
        setPatFormSavedSelect(matchByEid.fullName);
        setPatFormEid(matchByEid.emiratesId);
        setPatFormFirst(matchByEid.firstName || matchByEid.fullName);
        setPatFormFamily(matchByEid.familyName || '');
        setPatFormDob(matchByEid.dob || '');
        setPatFormGender(matchByEid.gender || 'Unknown');
        setPatFormMrn(matchByEid.mrn || '');
        setPatFormPhone(matchByEid.phone || '');
        setPatFormLang(matchByEid.language || 'English');
        setPatFormEmirate(matchByEid.emirate || '');
        setPatFormCity(matchByEid.city || '');
        setPatFormStreet(matchByEid.street || '');
        setPatFormCountry(matchByEid.country || 'United Arab Emirates');
        setPatIsOpenAsUnsaved(false);
      } else {
        setPatTab('new');
        setPatFormSavedSelect('');
        setPatFormEid(emiratesId);
        setPatFormFirst(trimmed);
        setPatFormFamily('');
        setPatFormDob('');
        setPatFormGender('Unknown');
        setPatFormMrn('');
        setPatFormPhone('');
        setPatFormLang('English');
        setPatFormEmirate('');
        setPatFormCity('');
        setPatFormStreet('');
        setPatFormCountry('United Arab Emirates');
        setPatIsOpenAsUnsaved(Boolean(trimmed));
      }
    }
    setPatientDialogOpen(true);
  };

  const handleClosePatientDialog = () => {
    if (patIsOpenAsUnsaved) {
      setSelectedPatient('');
      setPatFormFirst('');
      setPatFormFamily('');
    }
    setPatientDialogOpen(false);
    setPatIsOpenAsUnsaved(false);
  };

  const handleSelectSavedPatient = () => {
    if (!patFormSavedSelect) return;
    const found = patients.find((p) => p.fullName === patFormSavedSelect);
    if (found) {
      setPatIsOpenAsUnsaved(false);
      setSelectedPatient(found.fullName);
      setPatFormFirst(found.firstName || found.fullName);
      if (found.emiratesId) setEmiratesId(formatEmiratesId(found.emiratesId));
      setIsRiayati(true);
      setPatientDialogOpen(false);
    }
  };

  const handlePatientSelect = (val: string | null) => {
    const patientName = val || '';
    setSelectedPatient(patientName);
    if (!patientName.trim()) return;

    setIsRiayati(true);

    const found = patients.find(
      (p) =>
        (p.fullName || '').toLowerCase() === patientName.toLowerCase() ||
        `${p.firstName || ''} ${p.familyName || ''}`.trim().toLowerCase() === patientName.toLowerCase()
    );
    if (found && found.emiratesId) {
      setEmiratesId(formatEmiratesId(found.emiratesId));
    }
  };

  const handleSearchPatientByEid = async (eidOverride?: string | React.MouseEvent | unknown) => {
    const searchEid = (typeof eidOverride === 'string' ? eidOverride : patFormEid || '').trim();
    if (!companyId || !searchEid) return;
    setPatSearchLoading(true);
    try {
      const res = await salesApi.findPatientByEmiratesId(companyId, searchEid);
      const pat = res.data?.data as PatientItem | null;
      if (pat) {
        setPatFormEid(pat.emiratesId || searchEid);
        setPatFormFirst(pat.firstName || '');
        setPatFormFamily(pat.familyName || '');
        setPatFormDob(pat.dob || '');
        setPatFormGender(pat.gender || 'Unknown');
        setPatFormMrn(pat.mrn || '');
        setPatFormPhone(pat.phone || '');
        setPatFormLang(pat.language || 'English');
        setPatFormEmirate(pat.emirate || '');
        setPatFormCity(pat.city || '');
        setPatFormStreet(pat.street || '');
        setPatFormCountry(pat.country || 'United Arab Emirates');
        setSelectedPatient(pat.fullName);
        setEmiratesId(formatEmiratesId(pat.emiratesId || searchEid));
        setIsRiayati(true);
      }
    } catch {
      // ignore
    } finally {
      setPatSearchLoading(false);
    }
  };

  const handleSavePatient = async () => {
    if (!patFormFirst.trim()) {
      setErrorDialogMessage('First name is required to save patient');
      setErrorDialogOpen(true);
      return;
    }
    const fName = patFormFirst.trim();
    const famName = patFormFamily.trim();
    const fullName = famName ? `${fName} ${famName}` : fName;
    const newPat: PatientItem = {
      emiratesId: patFormEid.trim(),
      firstName: fName,
      familyName: famName,
      fullName,
      dob: patFormDob,
      gender: patFormGender,
      mrn: patFormMrn.trim(),
      phone: patFormPhone.trim(),
      language: patFormLang,
      emirate: patFormEmirate,
      city: patFormCity.trim(),
      street: patFormStreet.trim(),
      country: patFormCountry,
    };
    try {
      if (companyId) {
        await salesApi.createPatient({ companyId, ...newPat });
      }
    } catch {
      // Local fallback
    }
    setPatients((prev) => {
      const filtered = prev.filter((p) => p.fullName.toLowerCase() !== fullName.toLowerCase());
      return [newPat, ...filtered];
    });
    setPatIsOpenAsUnsaved(false);
    setSelectedPatient(fullName);
    if (patFormEid.trim()) {
      setEmiratesId(formatEmiratesId(patFormEid.trim()));
    }
    setIsRiayati(true);
    setPatientDialogOpen(false);
  };

  const handleEditPatient = async () => {
    if (!patFormFirst.trim()) {
      setErrorDialogMessage('First name is required to edit patient');
      setErrorDialogOpen(true);
      return;
    }
    const fName = patFormFirst.trim();
    const famName = patFormFamily.trim();
    const fullName = famName ? `${fName} ${famName}` : fName;
    const updatedPat: PatientItem = {
      emiratesId: patFormEid.trim(),
      firstName: fName,
      familyName: famName,
      fullName,
      dob: patFormDob,
      gender: patFormGender,
      mrn: patFormMrn.trim(),
      phone: patFormPhone.trim(),
      language: patFormLang,
      emirate: patFormEmirate,
      city: patFormCity.trim(),
      street: patFormStreet.trim(),
      country: patFormCountry,
    };
    try {
      if (companyId) {
        await salesApi.createPatient({ companyId, ...updatedPat });
      }
    } catch {
      // Local fallback
    }
    setPatients((prev) => {
      const idx = prev.findIndex((p) => p.fullName.toLowerCase() === fullName.toLowerCase() || (patFormEid.trim() && p.emiratesId === patFormEid.trim()));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedPat;
        return copy;
      }
      return [updatedPat, ...prev];
    });
    setPatIsOpenAsUnsaved(false);
    setSelectedPatient(fullName);
    if (patFormEid.trim()) {
      setEmiratesId(formatEmiratesId(patFormEid.trim()));
    }
    setIsRiayati(true);
    setPatientDialogOpen(false);
  };

  // ── MEDICATION INSTRUCTIONS HANDLERS ──
  const handleOpenMedicationDialog = (lineId: string) => {
    setSelectedMedLineId(lineId);
    const line = lines.find((l) => l.id === lineId);
    if (line?.dosageInstructions) {
      setMedDuration(line.dosageInstructions.duration || '30');
      setMedDurationUnit((line.dosageInstructions.durationUnit as any) || 'Days');
      setMedTiming(line.dosageInstructions.timing || 'Before Food');
      setMedFrequency(line.dosageInstructions.frequency || '1');
    } else {
      setMedDuration(line?.duration || '30');
      setMedDurationUnit('Days');
      setMedTiming(line?.timing || 'Before Food');
      setMedFrequency(line?.frequency || '1');
    }
    setMedicationDialogOpen(true);
  };

  const medInstructionSummary = useMemo(() => {
    if (!medDuration && !medTiming && !medFrequency) {
      return 'No dosage instructions specified.';
    }
    const parts: string[] = ['Take'];
    if (medFrequency) {
      const num = parseFloat(medFrequency);
      if (!isNaN(num)) {
        parts.push(`${medFrequency} time(s) daily`);
      } else {
        parts.push(medFrequency);
      }
    }
    if (medTiming && medTiming !== 'None') parts.push(medTiming);
    if (medDuration) parts.push(`for ${medDuration} ${medDurationUnit}`);
    return parts.join(' ') + '.';
  }, [medDuration, medDurationUnit, medTiming, medFrequency]);

  const handleSaveMedInstructions = () => {
    if (!selectedMedLineId) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== selectedMedLineId) return l;
        return {
          ...l,
          isRx: true,
          duration: medDuration,
          timing: medTiming,
          frequency: medFrequency,
          dosageInstructions: {
            duration: medDuration,
            durationUnit: medDurationUnit,
            timing: medTiming,
            frequency: medFrequency,
            summary: medInstructionSummary,
          },
        };
      })
    );
    setMedicationDialogOpen(false);
  };

  const handleClearMedInstructions = () => {
    setMedDuration('');
    setMedTiming('');
    setMedFrequency('');
    if (selectedMedLineId) {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== selectedMedLineId) return l;
          const updated = { ...l, isRx: false, duration: '', timing: '', frequency: '' };
          delete updated.dosageInstructions;
          return updated;
        })
      );
    }
  };

  // Clear product/IMEI from a line when user clears item name (keep line id)
  const clearLineProduct = useCallback((lineId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          name: '',
          productId: '',
          productCode: '',
          imei: '',
          unitId: '',
          unitName: '',
          availableUnits: [],
          quantity: 0,
          baseStockPieces: 0,
          batchMaxPieces: undefined,
          price: 0,
          purchasePrice: 0,
          gross: 0,
          discPercent: 0,
          discAmount: 0,
          vatAmount: 0,
          total: 0,
        };
      })
    );
  }, []);

  // Item name focus: save snapshot so we can undo if user clears then blurs without selecting
  const handleItemNameFocus = useCallback((line: LineItem) => {
    // Save snapshot for potential revert using reusable pattern
    itemNameSnapshotRef.current = { lineId: line.id, data: { ...line } };
    loadProducts();
  }, [loadProducts]);

  // Item name blur: if user cleared and did not select a product, restore from snapshot using reusable pattern
  const handleItemNameBlur = useCallback((line: LineItem) => {
    // Pass isCommitted flag - only revert uncommitted rows where product was cleared
    handleItemNameBlurWithRevert(line, setLines, itemNameSnapshotRef, line.isCommitted);
    // Clear snapshot after blur
    itemNameSnapshotRef.current = null;
  }, [setLines]);

  // Line item handlers
  const updateLine = useCallback(
    (id: string, field: keyof LineItem, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };

          // Cap quantity to available stock (or to batch max when a batch was selected)
          if (field === 'quantity' && updated.productId) {
            const currentUnit = updated.availableUnits.find((u) => u.id === updated.unitId);
            const conv = (currentUnit?.isMultiUnit && currentUnit?.conversion) ? currentUnit.conversion : 1;
            let maxQtyForThisRow = 0;
            let stockCheckActive = false;
            if (updated.batchMaxPieces != null && updated.batchMaxPieces > 0) {
              // User selected a batch — cap to that batch's quantity minus usage by other rows with same batch
              const usedByOtherBatchRows = prev.reduce((sum, l) => {
                if (l.id === id || l.productId !== updated.productId) return sum;
                if (l.batchNumber !== updated.batchNumber) return sum;
                const u = l.availableUnits.find((au) => au.id === l.unitId);
                const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
                return sum + (l.quantity * c);
              }, 0);
              maxQtyForThisRow = (updated.batchMaxPieces - usedByOtherBatchRows) / conv;
              stockCheckActive = true;
            } else if (updated.baseStockPieces > 0) {
              const usedByOtherRows = prev.reduce((sum, l) => {
                if (l.id === id || l.productId !== updated.productId) return sum;
                const u = l.availableUnits.find((au) => au.id === l.unitId);
                const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
                return sum + (l.quantity * c);
              }, 0);
              const remainingPieces = updated.baseStockPieces - usedByOtherRows;
              maxQtyForThisRow = remainingPieces / conv;
              stockCheckActive = true;
            }
            if (stockCheckActive && updated.quantity > Math.max(maxQtyForThisRow, 0)) {
              updated.quantity = 0;
            }
          }

          // Ensure price is always stored with max 2 decimal places
          if (field === 'price' && typeof updated.price === 'number') {
            updated.price = parseFloat(updated.price.toFixed(2));
          }

          // Recalculate when quantity, price, or discount changes
          if (['quantity', 'price', 'discPercent', 'discAmount'].includes(field)) {
            updated.gross = parseFloat((updated.quantity * updated.price).toFixed(2));
            if (field === 'discPercent') {
              updated.discAmount = parseFloat(((updated.gross * updated.discPercent) / 100).toFixed(2));
            } else if (field === 'discAmount') {
              updated.discPercent = updated.gross > 0 ? parseFloat(((updated.discAmount / updated.gross) * 100).toFixed(2)) : 0;
            }
            const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
            const vt = calcVatAndTotal(net, vatType === 'Vat');
            updated.vatAmount = vt.vatAmount;
            updated.total = vt.total;
          }
          return updated;
        })
      );
    },
    [vatType, calcVatAndTotal]
  );

  // Get batches for a product from backend
  const getBatchesForProduct = useCallback(async (productId: string) => {
    try {
      if (!companyId) return [];
      const res = await purchaseApi.getProductBatches(companyId, productId);
      return res.data.data || [];
    } catch {
      return [];
    }
  }, [companyId]);

  // Complete product selection after batch is chosen (or if no batches)
  const completeProductSelection = useCallback(
    async (lineId: string, product: Product, selectedBatch?: typeof availableBatches[0], matchedMultiUnitId?: string, searchedImei?: string): Promise<boolean> => {
      let mainPrice = 0;
      if (rateType === 'WSale') {
        mainPrice = selectedBatch?.wholesale || (product.wholesalePrice ?? (product.retailPrice ?? 0));
      } else if (rateType === 'Special1') {
        mainPrice = (product as any).specialPrice ?? (product.retailPrice ?? 0);
      } else if (rateType === 'Special2') {
        mainPrice = (product as any).specialPrice2 ?? (product.retailPrice ?? 0);
      } else {
        mainPrice = selectedBatch?.retail || (product.retailPrice ?? 0);
      }
      // Always use per-piece purchase rate from the product (backend keeps this updated to per-piece)
      const purchaseRate = (product as any).purchasePrice ?? selectedBatch?.purchasePrice ?? 0;

      // Fetch actual net stock from backend (or use batch quantity when a batch is selected)
      let totalStock = 0;
      if (selectedBatch && selectedBatch.batchNumber !== 'MERGED') {
        // Real batch — use batch-level quantity
        totalStock = selectedBatch.quantity;
      } else {
        // No batch or merged batch — fetch real-time stock from InventoryTransaction
        let apiStock = 0;
        try {
          if (companyId) {
            const stockRes = await stockApi.getProductStock(companyId, product._id);
            apiStock = stockRes.data.data?.stock ?? 0;
          }
        } catch {
          apiStock = 0;
        }
        // For merged batches: if API returns 0 but batch records have stock,
        // the stock data may only live in batch records (no InventoryTransaction).
        // Use whichever is higher to avoid false out-of-stock blocks.
        const batchStock = selectedBatch ? selectedBatch.quantity : 0;
        totalStock = Math.max(apiStock, batchStock);
      }

      // When editing an existing invoice, add back the original quantities for this product
      // (they were already deducted from stock when the invoice was first saved)
      if (!selectedBatch && invoiceId && originalInvoiceItemsRef.current.length > 0) {
        const originalPieces = originalInvoiceItemsRef.current
          .filter((o) => o.productId === product._id)
          .reduce((sum, o) => sum + (o.quantity * o.unitConversion), 0);
        totalStock += originalPieces;
      }

      // Subtract quantities already used by other rows (only when not a real batch — real batch caps per line only)
      let remainingStock = totalStock;
      if (!selectedBatch || selectedBatch.batchNumber === 'MERGED') {
        const usedInGrid = lines.reduce((sum, l) => {
          if (l.productId === product._id && l.id !== lineId) {
            const unit = l.availableUnits.find((u) => u.id === l.unitId);
            const conv = (unit?.isMultiUnit && unit?.conversion) ? unit.conversion : 1;
            return sum + (l.quantity * conv);
          }
          return sum;
        }, 0);
        remainingStock = totalStock - usedInGrid;
      }

      // Block sale if no stock available (skip in quotation mode)
      if (!isQuotationMode && remainingStock <= 0) {
        setStockAlertMessage(`Cannot sell "${product.name}" — no stock available (all stock already in this invoice).`);
        setStockAlertOpen(true);
        return false;
      }

      // Build available units list
      const availableUnits: UnitOption[] = [];

      // Add main unit
      const mainUnit = product.unitOfMeasureId;
      if (mainUnit) {
        const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
        const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
        availableUnits.push({
          id: mainUnitId,
          name: mainUnitName,
          isMultiUnit: false,
          imei: product.imei,
          price: mainPrice,
        });
      }

      // Add multi-units
      if (product.multiUnits && product.multiUnits.length > 0) {
        product.multiUnits.forEach((mu) => {
          const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
          const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
          if (muUnitId) {
            const muRetail = mu.retail ?? 0;
            const muWholesale = mu.wholesale ?? 0;
            const muSp1 = mu.specialPrice1 ?? 0;
            const muSp2 = mu.specialPrice2 ?? 0;
            let muPrice = 0;
            if (rateType === 'WSale') muPrice = muWholesale;
            else if (rateType === 'Special1') muPrice = muSp1;
            else if (rateType === 'Special2') muPrice = muSp2;
            else muPrice = muRetail;
            if (!muPrice) muPrice = muRetail || muWholesale || 0;
            availableUnits.push({
              id: muUnitId,
              name: muUnitName,
              isMultiUnit: true,
              multiUnitId: mu.multiUnitId,
              imei: mu.imei,
              price: muPrice,
              conversion: mu.conversion,
              retail: muRetail,
              wholesale: muWholesale,
              specialPrice1: muSp1,
              specialPrice2: muSp2,
            });
          }
        });
      }

      // Determine which unit to use
      let selectedUnit: UnitOption | null = null;

      if (matchedMultiUnitId) {
        selectedUnit = availableUnits.find((u) => u.multiUnitId === matchedMultiUnitId) || null;
      }

      if (!selectedUnit && searchedImei) {
        const searchImeiStr = String(searchedImei).trim();
        const mainImeiStr = product.imei ? String(product.imei).trim() : '';
        if (mainImeiStr && mainImeiStr === searchImeiStr) {
          selectedUnit = availableUnits.find((u) => !u.isMultiUnit) || null;
        }
        if (!selectedUnit) {
          selectedUnit = availableUnits.find((u) => {
            if (!u.isMultiUnit) return false;
            const unitImeiStr = u.imei ? String(u.imei).trim() : '';
            return unitImeiStr === searchImeiStr;
          }) || null;
        }
      }

      if (!selectedUnit) {
        selectedUnit = availableUnits.length > 0 ? availableUnits[0] : null;
      }

      const usePrice = parseFloat((selectedUnit?.price ?? mainPrice).toFixed(2));
      const useImei = selectedUnit?.imei || product.imei || '';

      // Block if selected unit has 0 max qty (allow fractional multi-unit quantities) (skip in quotation mode)
      const effectiveMaxQty = (selectedUnit?.isMultiUnit && selectedUnit?.conversion && selectedUnit.conversion > 0)
        ? remainingStock / selectedUnit.conversion
        : remainingStock;
      if (!isQuotationMode && effectiveMaxQty <= 0) {
        setStockAlertMessage(`Cannot sell "${product.name}" — not enough stock for this unit.`);
        setStockAlertOpen(true);
        return false;
      }

      // Block if batch does not have enough stock for this multi-unit
      if (!isQuotationMode && selectedBatch && selectedBatch.batchNumber !== 'MERGED' && selectedUnit?.isMultiUnit && selectedUnit?.conversion && selectedUnit.conversion > 0) {
        const usedByOtherBatchRows = lines.reduce((sum, l) => {
          if (l.id === lineId || l.productId !== product._id || l.batchNumber !== selectedBatch.batchNumber) return sum;
          const u = l.availableUnits.find((au) => au.id === l.unitId);
          const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
          return sum + (l.quantity * c);
        }, 0);
        const batchRemaining = (selectedBatch.quantity ?? 0) - usedByOtherBatchRows;
        if (batchRemaining < selectedUnit.conversion) {
          setStockAlertMessage(`Cannot sell "${product.name}" in ${selectedUnit.name} — batch "${selectedBatch.batchNumber}" has only ${batchRemaining} pcs (requires at least ${selectedUnit.conversion} pcs).`);
          setStockAlertOpen(true);
          return false;
        }
      }

      // Calculate profit: for multi-unit, cost = purchaseRate * pcsInside
      const isMulti = selectedUnit?.isMultiUnit && selectedUnit?.conversion;
      const multiCost = isMulti ? purchaseRate * (selectedUnit!.conversion!) : purchaseRate;
      const profit = usePrice - multiCost;

      setSelectedProductInfo({
        profit,
        totalStock, // Show actual total stock in panel (not remaining after other rows)
        stock: remainingStock,
        purchaseRate: purchaseRate,
        retailPrice: selectedBatch?.retail || (product.retailPrice ?? 0),
        wholesalePrice: selectedBatch?.wholesale || (product.wholesalePrice ?? 0),
        lastVendor: (product as any).lastVendor ?? 'N/A',
        batchNumber: selectedBatch?.batchNumber,
        expiryDate: selectedBatch?.expiryDate,
      });
      setActiveLineId(lineId);

      if (!rowSnapshotRef.current) {
        rowCommittedRef.current = true;
      }

      // Default quantity capped to available stock
      const defaultQty = Math.min(1, parseFloat(effectiveMaxQty.toFixed(4)));

      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const updated = {
            ...line,
            productId: product._id,
            productCode: product.code || '',
            name: product.name,
            imei: useImei,
            unitId: selectedUnit?.id || '',
            unitName: selectedUnit?.name || '',
            availableUnits,
            quantity: defaultQty,
            baseStockPieces: totalStock,
            // Only cap by batch quantity for REAL batches — MERGED batch qty is unreliable;
            // baseStockPieces (from API) should be the stock cap for merged/non-batch products
            batchMaxPieces: (selectedBatch && selectedBatch.batchNumber !== 'MERGED') ? selectedBatch.quantity : undefined,
            batchNumber: selectedBatch?.batchNumber,
            price: usePrice,
            purchasePrice: purchaseRate,
            gross: parseFloat((defaultQty * usePrice).toFixed(2)),
          };
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        })
      );

      // Focus on qty field after product selection
      if (!searchedImei) {
        setTimeout(() => {
          qtyInputRefs.current[lineId]?.focus();
        }, 100);
      }
      return true;
    },
    [rateType, vatType, updateLine, companyId, lines, calcVatAndTotal, invoiceId, isQuotationMode]
  );

  const handleProductSelect = useCallback(
    async (lineId: string, product: Product | null, matchedMultiUnitId?: string, searchedImei?: string): Promise<boolean> => {
      if (!product) {
        updateLine(lineId, 'productId', '');
        updateLine(lineId, 'productCode', '');
        updateLine(lineId, 'name', '');
        updateLine(lineId, 'imei', '');
        updateLine(lineId, 'price', 0);
        setSelectedProductInfo(null);
        setActiveLineId(null);
        return false;
      }

      // Always fetch product by ID so batch decision uses server truth (list can have stale/wrong allowBatches)
      let productToUse = product;
      if (companyId) {
        try {
          const res = await productApi.get(product._id, companyId);
          const fetched = res.data?.data as { allowBatches?: boolean } | undefined;
          if (fetched) {
            productToUse = { ...product, allowBatches: fetched.allowBatches === true };
          }
        } catch {
          // use original product
        }
      }

      // Check if product has multiple batches (from backend)
      const batches = await getBatchesForProduct(productToUse._id);
      // Only show batch dialog when batch selection is explicitly enabled (allowBatches === true).
      // When allowBatches is false or undefined, treat as merged – never show batch list.
      const batchSelectionEnabled = (productToUse as { allowBatches?: boolean }).allowBatches === true;

      if (!batchSelectionEnabled) {
        // Merged: batches disabled or not set – merge all batches into one with average purchase rate
        if (batches.length > 0) {
          const nonZeroBatches = batches.filter((b) => b.quantity > 0);
          const totalQty = nonZeroBatches.reduce((sum, b) => sum + b.quantity, 0) || batches.reduce((sum, b) => sum + b.quantity, 0);
          const totalValuation = nonZeroBatches.reduce((sum, b) => sum + (b.purchasePrice * b.quantity), 0);
          const avgPurchasePrice = nonZeroBatches.length > 0 && totalQty > 0
            ? totalValuation / totalQty
            : batches[0].purchasePrice;
          const avgRetail = nonZeroBatches.length > 0
            ? nonZeroBatches.reduce((sum, b) => sum + b.retail, 0) / nonZeroBatches.length
            : batches[0].retail;
          const avgWholesale = nonZeroBatches.length > 0
            ? nonZeroBatches.reduce((sum, b) => sum + b.wholesale, 0) / nonZeroBatches.length
            : batches[0].wholesale;
          const mergedBatch = {
            batchNumber: 'MERGED',
            productId: product._id,
            productName: product.name,
            purchasePrice: avgPurchasePrice,
            expiryDate: '',
            quantity: totalQty,
            retail: avgRetail,
            wholesale: avgWholesale,
          };
          return await completeProductSelection(lineId, productToUse, mergedBatch, matchedMultiUnitId, searchedImei);
        } else {
          return await completeProductSelection(lineId, productToUse, undefined, matchedMultiUnitId, searchedImei);
        }
      }
      if (batches.length > 1) {
        // Multiple batches and batch selection enabled – show selection dialog
        setAvailableBatches(batches);
        setPendingProductSelection({ lineId, product: productToUse, matchedMultiUnitId, searchedImei });
        setFocusedBatchIndex(0);
        setBatchDialogOpen(true);
        return false; // Don't add row yet — user still picking a batch
      }
      if (batches.length === 1) {
        return await completeProductSelection(lineId, productToUse, batches[0], matchedMultiUnitId, searchedImei);
      }
      return await completeProductSelection(lineId, productToUse, undefined, matchedMultiUnitId, searchedImei);
    },
    [getBatchesForProduct, completeProductSelection, updateLine, companyId]
  );

  // Handle batch selection from dialog
  const handleBatchSelect = useCallback(async (selectedBatch: typeof availableBatches[0]) => {
    if (pendingProductSelection) {
      await completeProductSelection(
        pendingProductSelection.lineId,
        pendingProductSelection.product,
        selectedBatch,
        pendingProductSelection.matchedMultiUnitId,
        pendingProductSelection.searchedImei
      );
    }
    setBatchDialogOpen(false);
    setAvailableBatches([]);
    setPendingProductSelection(null);
  }, [pendingProductSelection, completeProductSelection]);

  // Once products list is reloaded after creating a new product, auto-select it into the line
  useEffect(() => {
    if (!pendingProductName || pendingProductLineId == null) return;
    const lineId = pendingProductLineId;
    const match = Array.isArray(products) && products.length > 0
      ? products.find((p) => (p.name || '').toLowerCase() === pendingProductName.toLowerCase())
      : null;
    if (match) {
      handleProductSelect(lineId, match).then(() => {
        setPendingProductName(null);
        setPendingProductLineId(null);
        setTimeout(() => {
          qtyInputRefs.current[lineId]?.focus();
          qtyInputRefs.current[lineId]?.select();
        }, 150);
      });
    } else if (Array.isArray(products) && products.length > 0) {
      updateLine(lineId, 'name', pendingProductName);
      setPendingProductName(null);
      setPendingProductLineId(null);
      setTimeout(() => {
        qtyInputRefs.current[lineId]?.focus();
        qtyInputRefs.current[lineId]?.select();
      }, 150);
    }
  }, [products, pendingProductName, pendingProductLineId, handleProductSelect, updateLine]);

  // Handle batch dialog close without selection
  const handleBatchDialogClose = useCallback(() => {
    setBatchDialogOpen(false);
    setAvailableBatches([]);
    setPendingProductSelection(null);
    setFocusedBatchIndex(0);
  }, []);

  // Handle keyboard navigation in batch dialog
  const handleBatchDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!batchDialogOpen || availableBatches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedBatchIndex((prev) => {
        const next = prev < availableBatches.length - 1 ? prev + 1 : prev;
        setTimeout(() => batchRowRefs.current[next]?.focus(), 10);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedBatchIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        setTimeout(() => batchRowRefs.current[next]?.focus(), 10);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedBatch = availableBatches[focusedBatchIndex];
      if (selectedBatch) {
        handleBatchSelect(selectedBatch);
      }
    } else if (e.key === 'Escape') {
      handleBatchDialogClose();
    }
  }, [batchDialogOpen, availableBatches, focusedBatchIndex, handleBatchSelect, handleBatchDialogClose]);

  const handleUnitChange = useCallback(
    (lineId: string, unitId: string) => {
      // Find the unit info from current lines first
      const currentLine = lines.find((l) => l.id === lineId);
      const selectedUnit = currentLine?.availableUnits.find((u) => u.id === unitId);
      if (!currentLine || !selectedUnit) return;

      // Disallow multi-unit if batch stock is insufficient
      if (!isQuotationMode && selectedUnit.isMultiUnit && selectedUnit.conversion && selectedUnit.conversion > 0 && currentLine.batchMaxPieces != null && currentLine.batchNumber && currentLine.batchNumber !== 'MERGED') {
        const usedByOtherBatchRows = lines.reduce((sum, l) => {
          if (l.id === lineId || l.productId !== currentLine.productId || l.batchNumber !== currentLine.batchNumber) return sum;
          const u = l.availableUnits.find((au) => au.id === l.unitId);
          const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
          return sum + (l.quantity * c);
        }, 0);
        const batchRemaining = currentLine.batchMaxPieces - usedByOtherBatchRows;
        if (batchRemaining < selectedUnit.conversion) {
          setStockAlertMessage(`Cannot change unit to "${selectedUnit.name}" — batch "${currentLine.batchNumber}" has only ${batchRemaining} pcs (requires at least ${selectedUnit.conversion} pcs).`);
          setStockAlertOpen(true);
          return;
        }
      }

      // Pick multi-unit price based on rateType
      let newPrice = selectedUnit.price ?? currentLine.price;
      if (selectedUnit.isMultiUnit) {
        if (rateType === 'WSale' && selectedUnit.wholesale) newPrice = selectedUnit.wholesale;
        else if (rateType === 'Special1' && selectedUnit.specialPrice1) newPrice = selectedUnit.specialPrice1;
        else if (rateType === 'Special2' && selectedUnit.specialPrice2) newPrice = selectedUnit.specialPrice2;
        else if (rateType === 'Retail' && selectedUnit.retail) newPrice = selectedUnit.retail;
      }
      newPrice = parseFloat(newPrice.toFixed(2));

      // Update line items (baseStockPieces stays the same; updateLine will dynamically cap qty)
      setLines((prev) => {
        return prev.map((line) => {
          if (line.id !== lineId) return line;
          const conv = (selectedUnit.isMultiUnit && selectedUnit.conversion && selectedUnit.conversion > 0) ? selectedUnit.conversion : 1;
          let maxPieces: number;
          if (line.batchMaxPieces != null && line.batchMaxPieces > 0) {
            maxPieces = line.batchMaxPieces;
          } else {
            const usedByOtherRows = prev.reduce((sum, l) => {
              if (l.id === lineId || l.productId !== line.productId) return sum;
              const u = l.availableUnits.find((au) => au.id === l.unitId);
              const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
              return sum + (l.quantity * c);
            }, 0);
            maxPieces = line.baseStockPieces - usedByOtherRows;
          }
          const maxQty = Math.max(maxPieces / conv, 0);
          const newQuantity = Math.min(line.quantity, parseFloat(maxQty.toFixed(4)));

          const updated = {
            ...line,
            unitId: selectedUnit.id,
            unitName: selectedUnit.name,
            imei: selectedUnit.imei || '',
            price: newPrice,
            quantity: newQuantity,
            discPercent: 0,
            discAmount: 0,
          };
          updated.gross = parseFloat((updated.quantity * updated.price).toFixed(2));
          const net = parseFloat((updated.gross - updated.discAmount).toFixed(2));
          const vt = calcVatAndTotal(net, vatType === 'Vat');
          updated.vatAmount = vt.vatAmount;
          updated.total = vt.total;
          return updated;
        });
      });

      // Update product info separately (not inside setLines)
      // For multi-unit: profit = selling price - (base purchase rate * pcs inside)
      const isMulti = selectedUnit.isMultiUnit && selectedUnit.conversion;
      const multiCost = isMulti ? currentLine.purchasePrice * (selectedUnit.conversion!) : currentLine.purchasePrice;
      const profit = newPrice - multiCost;
      setSelectedProductInfo((prev) => prev ? {
        ...prev,
        profit,
      } : null);
    },
    [vatType, lines, rateType, calcVatAndTotal]
  );

  const handleImeiSearch = useCallback(
    async (lineId: string, imei: string) => {
      if (!imei || !companyId) return;
      const searchImei = imei.trim();
      try {
        const res = await productApi.getByImei(companyId, searchImei);
        if (res.data.data) {
          const data = res.data.data as { product?: Product; matchedMultiUnitId?: string } | Product;

          // Get the product from either response structure
          const product = 'product' in data && data.product ? data.product : data as Product;
          const matchedMultiUnitId = 'matchedMultiUnitId' in data ? data.matchedMultiUnitId : undefined;

          // Pass matched multi-unit ID and searched IMEI to handleProductSelect
          const added = await handleProductSelect(lineId, product, matchedMultiUnitId, searchImei);

          // Only add a new row if product was successfully added (not blocked by stock)
          if (!added) return;

          // Check if any other row (excluding current) is missing Item Code
          const otherRowsMissingItemCode = lines.some((l) => l.id !== lineId && !l.productCode);
          if (otherRowsMissingItemCode) {
            return; // Don't create new row if any other row is missing Item Code
          }

          // Add a new row and focus on its IMEI field
          const newLine = emptyLine();
          setLines((prev) => [...prev, newLine]);

          // Focus on the new row's IMEI field after a short delay
          setTimeout(() => {
            const imeiInput = imeiInputRefs.current[newLine.id];
            if (imeiInput) {
              imeiInput.focus();
            }
          }, 100);
        }
      } catch {
        // ignore
      }
    },
    [companyId, handleProductSelect, lines]
  );

  // Handle Enter key on Unit field - focus on Qty
  const handleUnitKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const qtyInput = qtyInputRefs.current[lineId];
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }
  }, []);

  // Revert uncommitted row edits back to snapshot
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setLines((prev) =>
        prev.map((l) => (l.id === snapshot.lineId ? { ...snapshot.data } : l))
      );
      // Clear editing cell for the reverted row so fields show reverted values (e.g. old qty/price) not stale blank
      if (snapshot.lineId) {
        setEditingNumericCell((prev) =>
          prev && prev.lineId === snapshot.lineId ? null : prev
        );
      }
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  // Called when user enters a row (click or focus from keyboard navigation)
  const enterRow = useCallback((line: LineItem) => {
    // If we're entering the same row we're already on, do nothing
    if (rowSnapshotRef.current && rowSnapshotRef.current.lineId === line.id) return;

    // If switching from another filled row that wasn't committed, revert it
    revertUncommittedRow();

    // Take a snapshot of this row if it was previously committed
    if (line.isCommitted) {
      rowSnapshotRef.current = {
        lineId: line.id,
        data: { ...line, availableUnits: [...line.availableUnits] },
      };
      rowCommittedRef.current = false;
    }
  }, [revertUncommittedRow]);

  // Open batch dialog only when product has allowBatches from server (e.g. return to item field and press Enter)
  const openBatchDialogForLine = useCallback(async (line: LineItem): Promise<boolean> => {
    if (!line.productId) return false;
    let product = products.find((p) => p._id === line.productId);
    if (!product) return false;
    if (companyId) {
      try {
        const res = await productApi.get(product._id, companyId);
        const fetched = res.data?.data as { allowBatches?: boolean } | undefined;
        if (fetched) {
          product = { ...product, allowBatches: fetched.allowBatches === true };
        }
      } catch {
        // use original product
      }
    }
    if ((product as { allowBatches?: boolean }).allowBatches !== true) return false;
    const batches = await getBatchesForProduct(product._id);
    if (batches.length > 1) {
      setAvailableBatches(batches);
      setPendingProductSelection({ lineId: line.id, product });
      setFocusedBatchIndex(0);
      setBatchDialogOpen(true);
      return true;
    }
    return false;
  }, [products, getBatchesForProduct, companyId]);

  // Handle Enter key on Item Name field - auto-select matching product or verify name; Enter on batched product opens batch dialog
  const handleItemNameKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      // When list is open and typed value is a prefix of some product, let Autocomplete handle Enter (arrow+Enter to select)
      if (itemNameListboxOpenRef.current && line.name.trim()) {
        const typed = line.name.trim().toLowerCase();
        const isPrefixOfAny = products.some((p) => (p.name && String(p.name).trim().toLowerCase().startsWith(typed)));
        if (isPrefixOfAny) return;
      }

      // Use current input value from DOM so we don't rely on state (user may have just typed and state not yet updated)
      const inputEl = (e.target as HTMLElement)?.closest?.('input') || (e.target as HTMLInputElement) || itemNameInputRefs.current[line.id];
      const currentTyped = (inputEl && 'value' in inputEl ? (inputEl as HTMLInputElement).value : line.name) ?? '';
      const typed = currentTyped.trim();

      // If user typed an exact product name (match by name), select that product immediately without waiting for list selection.
      // Only run when: no product yet, or typed name is different from current product (so we don't re-run selection on same product).
      if (typed) {
        const exactMatch = products.find((p) => p.name.trim().toLowerCase() === typed.toLowerCase());
        const currentProduct = line.productId ? products.find((p) => p._id === line.productId) : null;
        const isDifferentProduct = !currentProduct || currentProduct.name.trim().toLowerCase() !== typed.toLowerCase();
        if (exactMatch && isDifferentProduct) {
          e.preventDefault();
          e.stopPropagation();
          handleProductSelect(line.id, exactMatch).then(() => {
            setTimeout(() => {
              qtyInputRefs.current[line.id]?.focus();
              qtyInputRefs.current[line.id]?.select();
            }, 100);
          });
          return;
        }
      }

      // If row already has a product, Enter opens batch dialog only when server says allowBatches (don't use list)
      if (line.productId) {
        e.preventDefault();
        e.stopPropagation();
        openBatchDialogForLine(line).then((opened) => {
          if (!opened) {
            setTimeout(() => {
              qtyInputRefs.current[line.id]?.focus();
              qtyInputRefs.current[line.id]?.select();
            }, 50);
          }
        });
        return;
      }

      // If item name is blank and no product selected
      if (!line.productId && !typed) {
        const currentIndex = lines.findIndex((l) => l.id === line.id);
        if (currentIndex === lines.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => focusPaymentEntry(), 50);
          return;
        }
      }

      // If item name was typed but does not match any product and line has no product
      if (!line.productId && typed) {
        const isPrefixOfAny = products.some((p) => (p.name && String(p.name).trim().toLowerCase().startsWith(typed.toLowerCase())));
        if (!isPrefixOfAny || !itemNameListboxOpenRef.current) {
          e.preventDefault();
          e.stopPropagation();
          pendingProductLineIdRef.current = line.id;
          setCreateProductConfirmName(typed);
          setCreateProductConfirmOpen(true);
          return;
        }
      }
      // If the row already has a product but name was edited to another exact match (handled above); otherwise restore/correct name
      if (line.productId) {
        const product = products.find((p) => p._id === line.productId);
        if (product && line.name !== product.name) {
          updateLine(line.id, 'name', product.name);
        }
        // Move focus to qty field (batched product case already handled above)
        setTimeout(() => {
          qtyInputRefs.current[line.id]?.focus();
          qtyInputRefs.current[line.id]?.select();
        }, 50);
      }
    }
  }, [products, updateLine, handleProductSelect, lines, openBatchDialogForLine, focusPaymentEntry]);

  // Handle Enter key on Qty field - focus on Price if qty > 0; if last row and any field blank, go to Cash Received
  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentIndex = lines.findIndex((l) => l.id === line.id);
      const isLastRow = currentIndex === lines.length - 1;

      const inputVal = qtyInputRefs.current[line.id]?.value;
      const currentQty = (inputVal !== undefined && inputVal !== '') ? (parseFloat(inputVal) || 0) : line.quantity;

      const isBlank = !line.productCode || currentQty <= 0 || line.price <= 0;
      if (isLastRow && isBlank) {
        setTimeout(() => focusPaymentEntry(), 50);
        return;
      }
      if (currentQty > 0) {
        const priceInput = priceInputRefs.current[line.id];
        if (priceInput) {
          priceInput.focus();
          priceInput.select();
        }
      }
    }
  }, [lines, focusPaymentEntry]);

  // Handle Enter key on Price field - commit row edit and move to next row
  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent, line: LineItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      // Validate current row: Item Code, Item Name, Qty > 0, Price > 0 must all be filled
      if (!line.productCode || !line.name || line.quantity <= 0 || line.price <= 0) {
        const currentIndex = lines.findIndex((l) => l.id === line.id);
        const isLastRow = currentIndex === lines.length - 1;
        const isBlank = !line.productCode || line.quantity <= 0 || line.price <= 0;
        // If last row and product code or qty or price is blank, go to Cash Received
        if (isLastRow && isBlank) {
          setTimeout(() => focusPaymentEntry(), 50);
          return;
        }
        // Find which field is missing and focus it
        if (!line.productCode || !line.name) {
          setTimeout(() => itemNameInputRefs.current[line.id]?.focus(), 50);
        } else if (line.quantity <= 0) {
          setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
        } else if (line.price <= 0) {
          setTimeout(() => priceInputRefs.current[line.id]?.focus(), 50);
        }
        return; // Don't allow moving to another row
      }

      // Mark current row as committed (edits are accepted)
      // Commit row edits using reusable pattern
      commitRowEdits(rowSnapshotRef, rowCommittedRef);
      updateLine(line.id, 'isCommitted', true);

      const currentIndex = lines.findIndex((l) => l.id === line.id);

      // If there is a next row below, move focus to its Item Name field
      if (currentIndex >= 0 && currentIndex < lines.length - 1) {
        const nextLine = lines[currentIndex + 1];
        // Snapshot the next row before entering it
        enterRow(nextLine);
        setActiveLineId(nextLine.id);
        setTimeout(() => {
          const nextInput = itemNameInputRefs.current[nextLine.id];
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
        return;
      }

      // Last row: create a new row if current line is valid
      const newLine = emptyLine();
      setLines((prev) => [...prev, newLine]);

      // Focus on new row's Item Name field
      enterRow(newLine);
      setActiveLineId(newLine.id);
      setTimeout(() => {
        const itemNameInput = itemNameInputRefs.current[newLine.id];
        if (itemNameInput) {
          itemNameInput.focus();
        }
      }, 100);
    }
  }, [lines, enterRow, updateLine, focusPaymentEntry]);

  // Handle QTY blur — if qty exceeds stock, show dialog and keep focus on QTY field
  const handleQtyBlur = useCallback((line: LineItem) => {
    const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : '';
    const parsedQty = parseNumericInput(raw);
    setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? null : prev);

    if (isQuotationMode) {
      updateLine(line.id, 'quantity', parsedQty);
      return;
    }

    if (!line.productId) {
      updateLine(line.id, 'quantity', parsedQty);
      return;
    }

    const currentUnit = line.availableUnits.find((u) => u.id === line.unitId);
    const conv = (currentUnit?.isMultiUnit && currentUnit?.conversion) ? currentUnit.conversion : 1;
    let maxQtyForThisRow = 0;
    let stockCheckActive = false;
    if (line.batchMaxPieces != null && line.batchMaxPieces > 0) {
      // Batch cap: subtract qty used by other rows with same product AND same batch
      const usedByOtherBatchRows = lines.reduce((sum, l) => {
        if (l.id === line.id || l.productId !== line.productId) return sum;
        if (l.batchNumber !== line.batchNumber) return sum;
        const u = l.availableUnits.find((au) => au.id === l.unitId);
        const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
        return sum + (l.quantity * c);
      }, 0);
      maxQtyForThisRow = (line.batchMaxPieces - usedByOtherBatchRows) / conv;
      stockCheckActive = true;
    } else if (line.baseStockPieces > 0) {
      const usedByOtherRows = lines.reduce((sum, l) => {
        if (l.id === line.id || l.productId !== line.productId) return sum;
        const u = l.availableUnits.find((au) => au.id === l.unitId);
        const c = (u?.isMultiUnit && u?.conversion) ? u.conversion : 1;
        return sum + (l.quantity * c);
      }, 0);
      const remainingPieces = line.baseStockPieces - usedByOtherRows;
      maxQtyForThisRow = remainingPieces / conv;
      stockCheckActive = true;
    }

    const cappedQty = Math.max(parseFloat((maxQtyForThisRow || 0).toFixed(4)), 0);
    if (stockCheckActive && parsedQty > cappedQty) {
      setStockAlertMessage('Qty not available');
      setStockAlertOpen(true);
      qtyOverflowLineIdRef.current = line.id;
      updateLine(line.id, 'quantity', 0);

      // Update the snapshot so that reverting the row doesn't bring back the original 1
      if (rowSnapshotRef.current?.lineId === line.id) {
        rowSnapshotRef.current.data.quantity = 0;
        rowSnapshotRef.current.data.gross = 0;
        rowSnapshotRef.current.data.discAmount = 0;
        rowSnapshotRef.current.data.vatAmount = 0;
        rowSnapshotRef.current.data.total = 0;
      }
    } else {
      updateLine(line.id, 'quantity', parsedQty);
    }
  }, [lines, editingNumericCell, updateLine, isQuotationMode]);

  const removeLine = (id: string) => {
    // Clear snapshot if the removed row was being edited
    if (rowSnapshotRef.current?.lineId === id) {
      // Reset commit state using reusable pattern
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.length === 0 ? [emptyLine()] : filtered;
    });
    setSelectedProductInfo(null);
    setActiveLineId(null);
  };

  // Stock cache: productId -> { stock, timestamp }
  const stockCacheRef = useRef<Map<string, { stock: number; ts: number }>>(new Map());
  const STOCK_CACHE_TTL = 30_000; // 30 seconds

  const getStockCached = useCallback(async (productId: string): Promise<number> => {
    const cached = stockCacheRef.current.get(productId);
    if (cached && Date.now() - cached.ts < STOCK_CACHE_TTL) return cached.stock;
    try {
      if (companyId) {
        const stockRes = await stockApi.getProductStock(companyId, productId);
        const stock = stockRes.data.data?.stock ?? 0;
        stockCacheRef.current.set(productId, { stock, ts: Date.now() });
        return stock;
      }
    } catch { /* fallback */ }
    return cached?.stock ?? 0;
  }, [companyId]);

  // Invalidate stock cache when saving/updating/deleting
  const invalidateStockCache = useCallback(() => {
    stockCacheRef.current.clear();
  }, []);

  const handleRowClick = async (line: LineItem) => {
    enterRow(line);
    setActiveLineId(line.id);

    if (!line.productId) {
      setSelectedProductInfo(null);
      return;
    }
    // Calculate profit using reusable pattern
    const profit = calculateProfit(line);
    const product = products.find(p => p._id === line.productId);

    // Show info immediately with cached stock, update async
    const cachedEntry = stockCacheRef.current.get(line.productId);
    let initialStock = cachedEntry?.stock ?? 0;
    if (invoiceId && originalInvoiceItemsRef.current.length > 0) {
      const originalPieces = originalInvoiceItemsRef.current
        .filter((o) => o.productId === line.productId)
        .reduce((sum, o) => sum + (o.quantity * o.unitConversion), 0);
      initialStock += originalPieces;
    }
    setSelectedProductInfo({
      profit,
      purchaseRate: line.purchasePrice,
      lastVendor: product ? ((product as any).lastVendor ?? '-') : '-',
      totalStock: initialStock,
      previousPrice: product ? ((product as any).previousPrice ?? 0) : 0,
    });

    // Fetch actual stock in background (uses cache with TTL)
    let actualStock = await getStockCached(line.productId);
    if (invoiceId && originalInvoiceItemsRef.current.length > 0) {
      const originalPieces = originalInvoiceItemsRef.current
        .filter((o) => o.productId === line.productId)
        .reduce((sum, o) => sum + (o.quantity * o.unitConversion), 0);
      actualStock += originalPieces;
    }
    setSelectedProductInfo((prev) => prev ? { ...prev, totalStock: actualStock } : null);
  };

  // Debounce timer for stock API calls
  const stockDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProductHighlight = useCallback((_e: React.SyntheticEvent, option: unknown) => {
    if (!option || typeof option === 'string') return;
    const product = option as Product;

    // Show instantly available info first (use cache if available to prevent flickering)
    const cachedEntry = stockCacheRef.current.get(product._id);
    let initialStock = cachedEntry?.stock ?? 0;
    if (invoiceId && originalInvoiceItemsRef.current.length > 0) {
      const originalPieces = originalInvoiceItemsRef.current
        .filter((o) => o.productId === product._id)
        .reduce((sum, o) => sum + (o.quantity * o.unitConversion), 0);
      initialStock += originalPieces;
    }

    setSelectedProductInfo({
      profit: 0,
      purchaseRate: product.purchasePrice ?? 0,
      lastVendor: (product as any).lastVendor ?? (product as any).lastSupplier ?? '-',
      totalStock: initialStock,
      previousPrice: (product as any).previousPrice ?? 0,
      retailPrice: product.retailPrice ?? 0,
      wholesalePrice: product.wholesalePrice ?? 0,
    });

    // Debounce the stock API call (300ms)
    if (stockDebounceRef.current) clearTimeout(stockDebounceRef.current);
    stockDebounceRef.current = setTimeout(async () => {
      try {
        if (companyId && product._id) {
          const stockRes = await stockApi.getProductStock(companyId, product._id);
          let actualStock = stockRes.data.data?.stock ?? 0;
          if (invoiceId && originalInvoiceItemsRef.current.length > 0) {
            const originalPieces = originalInvoiceItemsRef.current
              .filter((o) => o.productId === product._id)
              .reduce((sum, o) => sum + (o.quantity * o.unitConversion), 0);
            actualStock += originalPieces;
          }
          setSelectedProductInfo((prev) => prev ? { ...prev, totalStock: actualStock } : null);
        }
      } catch {
        // keep the previously shown stock value
      }
    }, 300);
  }, [companyId, invoiceId]);

  // Clear form
  // ── Hold / Restore invoice ─────────────────────────────────────────
  const handleHoldInvoice = async () => {
    if (isSaved) {
      setErrorDialogMessage('Cannot hold a saved invoice');
      setErrorDialogOpen(true);
      return;
    }
    const filledLines = lines.filter((l) => l.productId);
    if (filledLines.length === 0) {
      setErrorDialogMessage('Nothing to hold — add at least one product first');
      setErrorDialogOpen(true);
      return;
    }
    const held: HeldInvoice = {
      id: Date.now().toString(),
      heldAt: new Date().toLocaleString(),
      customerName,
      itemCount: filledLines.length,
      total: calculations.grandTotal,
      invoiceNo,
      date,
      vatType,
      taxMode,
      paymentType,
      rateType,
      customerId,
      customerAddress,
      billingAddress,
      billingPhone,
      billingNarration,
      shippingName,
      shippingAddress,
      shippingPhone,
      shippingContactPerson,
      cashAccountId,
      cardAccountId,
      cardAmount,
      cardReference,
      lines,
      cashReceived,
      oldBalance,
      otherDiscPercent,
      otherDiscount,
      otherCharges,
      freightCharge,
      lendAddLess,
      roundOff,
      autoRoundOff,
      narration,
      emiratesId,
      patientName: selectedPatient,
      doctorName: selectedDoctor,
      doctorLicenseNo: doctors.find((d) => d.name === selectedDoctor.trim())?.licenseNumber,
      prescriptionNumber,
      prescriptionDate,
      isRiayati,
    };
    const updated = [...heldInvoices, held];
    setHeldInvoices(updated);
    saveHeldInvoices(updated);
    setSuccessDialogMessage(`Invoice held (${filledLines.length} items)`);
    setSuccessDialogOpen(true);
    // Clear the form for a new invoice
    await handleClear();
  };

  const handleRestoreHeldInvoice = (held: HeldInvoice) => {
    setInvoiceId(null);
    setIsSaved(false);
    setInvoiceNo(held.invoiceNo);
    setDate(held.date);
    setVatType(held.vatType);
    setTaxMode(held.taxMode || 'inclusive');
    setPaymentType(held.paymentType);
    setRateType(held.rateType);
    setCustomerId(held.customerId);
    setCustomerName(held.customerName);
    setCustomerAddress(held.customerAddress);
    setBillingAddress(held.billingAddress);
    setBillingPhone(held.billingPhone);
    setBillingNarration(held.billingNarration);
    setShippingName(held.shippingName);
    setShippingAddress(held.shippingAddress);
    setShippingPhone(held.shippingPhone);
    setShippingContactPerson(held.shippingContactPerson);
    setCashAccountId(held.cashAccountId);
    setCardAccountId(held.cardAccountId);
    setCardAmount(held.cardAmount);
    setCardReference(held.cardReference || '');
    setLines(held.lines.length > 0 ? held.lines.map(l => ({ ...l, isCommitted: true })) : [emptyLine()]);
    setCashReceived(held.cashReceived);
    setOldBalance(held.oldBalance);
    setOtherDiscPercent(held.otherDiscPercent);
    setOtherDiscount(held.otherDiscount);
    setOtherCharges(held.otherCharges);
    setFreightCharge(held.freightCharge);
    setLendAddLess(held.lendAddLess);
    setRoundOff(held.roundOff);
    setAutoRoundOff(held.autoRoundOff ?? false);
    setNarration(held.narration);
    setEmiratesId(held.emiratesId || '');
    setSelectedPatient(held.patientName || '');
    setSelectedDoctor(held.doctorName || '');
    setPrescriptionNumber(held.prescriptionNumber || '');
    setPrescriptionDate(held.prescriptionDate || '');
    setIsRiayati(Boolean(held.isRiayati));
    setErrorDialogOpen(false);
    // Remove from held list
    const updated = heldInvoices.filter((h) => h.id !== held.id);
    setHeldInvoices(updated);
    saveHeldInvoices(updated);
    setHoldListDialogOpen(false);
  };

  const handleDeleteHeldInvoice = (heldId: string) => {
    const updated = heldInvoices.filter((h) => h.id !== heldId);
    setHeldInvoices(updated);
    saveHeldInvoices(updated);
  };

  const handleClear = async () => {
    setInvoiceId(null);
    setIsSaved(false);
    setDate(getCurrentDate());
    setVatType('Vat');
    setTaxMode('inclusive');
    setPaymentType(isB2BMode ? 'Credit' : 'Cash');
    setRateType('WSale');
    setCustomerId(null);
    const defaultCash = cashAccounts.find((c) => /cash\s*in\s*hand/i.test(c.name || '')) || cashAccounts[0];
    setCustomerName(isB2BMode ? '' : (defaultCash?.name || 'CASH IN HAND'));
    if (defaultCash && !isB2BMode) {
      setCashAccountId(defaultCash._id);
      setSelectedCashAccount(defaultCash);
    }
    setCustomerAddress('');
    // Clear address details
    setBillingAddress('');
    setBillingPhone('');
    setBillingNarration('');
    setShippingName('');
    setShippingAddress('');
    setShippingPhone('');
    setShippingContactPerson('');
    setEmiratesId('');
    setSelectedPatient('');
    setSelectedDoctor('');
    setPrescriptionNumber('');
    setPrescriptionDate('');
    setIsRiayati(false);
    setLines([emptyLine()]);
    setCashReceived(0);
    setOldBalance(0);
    setOtherDiscPercent(0);
    setOtherDiscount(0);
    setOtherCharges(0);
    setSelectedProductInfo(null);
    setActiveLineId(null);
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    originalInvoiceItemsRef.current = [];
    setFreightCharge(0);
    setLendAddLess(0);
    setRoundOff(0);
    setAutoRoundOff(false);
    setNarration('');
    setCardAmount(0);
    setCardReference('');
    // Reset Card A/C to CC1 default or first card account
    const cc1 = cardAccounts.find((b) => b.name.toUpperCase() === 'CC1');
    setCardAccountId(cc1?._id || (cardAccounts.length > 0 ? cardAccounts[0]._id : null));
    setErrorDialogOpen(false);
    shouldFocusCustomerAcRef.current = true;
    focusCustomerAc();
    setTimeout(focusCustomerAc, 50);
    setTimeout(focusCustomerAc, 150);
    await loadNextInvoiceNo(true);
    focusCustomerAc();
    setTimeout(focusCustomerAc, 100);
    setTimeout(focusCustomerAc, 250);
  };

  // ── Shared invoice validation ──────────────────────────────────────
  const validateInvoice = useCallback((): { valid: boolean; validLines: LineItem[] } => {
    if (!companyId || !financialYearId) {
      setErrorDialogMessage('Company and Financial Year required');
      setErrorDialogOpen(true);
      return { valid: false, validLines: [] };
    }
    if (!cashAccountId) {
      setErrorDialogMessage('Please select a Cash Account before saving');
      setErrorDialogOpen(true);
      return { valid: false, validLines: [] };
    }
    const rowsWithItemCode = lines.filter((l) => l.productCode);
    const rowsWithoutItemCode = lines.filter((l) => !l.productCode);
    if (rowsWithoutItemCode.length > 1) {
      setErrorDialogMessage('Enter data correctly. Multiple rows without product code found.');
      setErrorDialogOpen(true);
      return { valid: false, validLines: [] };
    }
    if (rowsWithItemCode.length === 0) {
      setErrorDialogMessage('At least one product with Item Code is required');
      setErrorDialogOpen(true);
      return { valid: false, validLines: [] };
    }
    const invalidRows = rowsWithItemCode.filter((l) => l.quantity <= 0 || l.price <= 0);
    if (invalidRows.length > 0) {
      const invalidRowNumbers = invalidRows.map((l) => {
        const idx = lines.findIndex((line) => line.id === l.id);
        return idx + 1;
      });
      setErrorDialogMessage(`Row(s) ${invalidRowNumbers.join(', ')} have invalid Quantity or Price. Quantity and Price must be greater than 0.`);
      setErrorDialogOpen(true);
      return { valid: false, validLines: [] };
    }
    const valid = rowsWithItemCode.filter((l) => l.productId && l.quantity > 0);
    if (valid.length === 0) {
      setErrorDialogMessage('At least one product is required');
      setErrorDialogOpen(true);
      return { valid: false, validLines: [] };
    }
    return { valid: true, validLines: valid };
  }, [companyId, financialYearId, cashAccountId, lines]);

  // Pre-save stock check
  const checkStockAvailability = useCallback(async (validLines: LineItem[]): Promise<boolean> => {
    if (isQuotationMode) return true;
    try {
      const productQtyMap = new Map<string, { name: string; totalPieces: number }>();
      for (const l of validLines) {
        const unit = l.availableUnits.find((u) => u.id === l.unitId);
        const conv = (unit?.isMultiUnit && unit?.conversion) ? unit.conversion : 1;
        const pieces = l.quantity * conv;
        const existing = productQtyMap.get(l.productId);
        if (existing) {
          existing.totalPieces += pieces;
        } else {
          productQtyMap.set(l.productId, { name: l.name, totalPieces: pieces });
        }
      }

      // When editing an existing invoice, add back the original quantities
      // (they were already deducted from stock when the invoice was first saved)
      const originalPiecesMap = new Map<string, number>();
      if (invoiceId && originalInvoiceItemsRef.current.length > 0) {
        for (const orig of originalInvoiceItemsRef.current) {
          const pieces = orig.quantity * orig.unitConversion;
          originalPiecesMap.set(orig.productId, (originalPiecesMap.get(orig.productId) || 0) + pieces);
        }
      }

      for (const [productId, info] of productQtyMap) {
        if (companyId) {
          const stockRes = await stockApi.getProductStock(companyId, productId);
          let available = stockRes.data.data?.stock ?? 0;
          // Add back original invoice qty for this product (already deducted from stock)
          const originalPieces = originalPiecesMap.get(productId) || 0;
          available += originalPieces;
          if (available < info.totalPieces) {
            setErrorDialogMessage(`Insufficient stock for "${info.name}". Available: ${available}, Required: ${info.totalPieces}`);
            setErrorDialogOpen(true);
            return false;
          }
        }
      }
    } catch {
      // If stock check fails, let the backend validate
    }
    return true;
  }, [companyId, invoiceId, isQuotationMode]);

  // Build items payload from validated lines
  const buildItemsPayload = useCallback((validLines: LineItem[]): B2CLineItem[] => {
    return validLines.map((l) => {
      const selectedUnit = l.availableUnits.find((u) => u.id === l.unitId);
      const multiUnitId = selectedUnit?.isMultiUnit ? selectedUnit.multiUnitId : undefined;
      return {
        productId: l.productId,
        productCode: l.productCode,
        imei: l.imei,
        description: l.name,
        quantity: l.quantity,
        unitPrice: l.price,
        discountPercent: l.discPercent,
        discount: l.discAmount,
        vatRate: vatType === 'Vat' ? VAT_RATE : 0,
        multiUnitId,
        unitId: l.unitId,
        unitName: l.unitName,
        batchNumber: l.batchNumber || undefined,
        expiryDate: l.expiryDate,
        isRx: l.isRx || Boolean(l.dosageInstructions?.summary),
        dosageInstructions: l.dosageInstructions,
        duration: l.dosageInstructions?.duration || l.duration,
        timing: l.dosageInstructions?.timing || l.timing,
        frequency: l.dosageInstructions?.frequency || l.frequency,
      };
    });
  }, [vatType]);

  // Save
  const handleSave = async () => {
    const { valid, validLines } = validateInvoice();
    if (!valid) return;

    const stockOk = await checkStockAvailability(validLines);
    if (!stockOk) return;

    const effectiveCardAccountId = cardAccountId || (cardAccounts.length > 0 ? cardAccounts[0]._id : undefined);
    const effectiveCashAccountId = cashAccountId || (cashAccounts.length > 0 ? cashAccounts[0]._id : undefined);

    const activePaymentDetails: Array<{ mode: string; amount: number; reference?: string; accountId?: string }> = [];
    if (cashReceived > 0) {
      activePaymentDetails.push({
        mode: 'Cash',
        amount: cashReceived,
        accountId: effectiveCashAccountId,
      });
    }
    if (cardAmount > 0) {
      activePaymentDetails.push({
        mode: 'Card',
        amount: cardAmount,
        reference: cardReference.trim() || undefined,
        accountId: effectiveCardAccountId,
      });
    }

    const payload: B2CInvoiceInput = {
      companyId: companyId!,
      financialYearId: financialYearId!,
      date,
      type: invoiceType,
      items: buildItemsPayload(validLines),
      customerId: customerId || undefined,
      customerName,
      customerAddress: billingAddress,
      customerPhone: billingPhone,
      rateType,
      paymentType,
      vatType,
      taxMode,
      cashAccountId: effectiveCashAccountId,
      otherDiscount,
      otherCharges,
      freightCharge,
      lendAddLess,
      roundOff,
      cashReceived,
      narration: billingNarration || narration,
      // Shipping Address
      shippingName,
      shippingAddress,
      shippingPhone,
      shippingContactPerson,
      paymentDetails: activePaymentDetails,
      emiratesId: emiratesId.trim() || undefined,
      patientName: selectedPatient.trim() || undefined,
      doctorName: selectedDoctor.trim() || undefined,
      doctorLicenseNo: doctors.find((d) => d.name === selectedDoctor.trim())?.licenseNumber || undefined,
      prescriptionNumber: prescriptionNumber.trim() || undefined,
      prescriptionDate: prescriptionDate || date,
      isRiayati,
    };

    setLoading(true);
    setErrorDialogOpen(false);
    setSaveDialogOpen(false);
    try {
      const res = await salesApi.createB2C(payload);
      invalidateStockCache();
      setInvoiceNo(res.data.data.invoiceNo);
      setInvoiceId(res.data.data.invoiceId);
      setIsSaved(true);
      setSavedDialogOpen(true);
      loadInvoiceIds(true);
      focusPrintButton();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Save failed';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Edit (Update existing invoice)
  const handleEditClick = () => {
    if (!invoiceId) return;
    setEditConfirmOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!invoiceId) return;
    const { valid, validLines } = validateInvoice();
    if (!valid) { setEditConfirmOpen(false); return; }

    const stockOk = await checkStockAvailability(validLines);
    if (!stockOk) { setEditConfirmOpen(false); return; }

    const effectiveCardAccountId = cardAccountId || (cardAccounts.length > 0 ? cardAccounts[0]._id : undefined);
    const effectiveCashAccountId = cashAccountId || (cashAccounts.length > 0 ? cashAccounts[0]._id : undefined);

    const activePaymentDetails: Array<{ mode: string; amount: number; reference?: string; accountId?: string }> = [];
    if (cashReceived > 0) {
      activePaymentDetails.push({
        mode: 'Cash',
        amount: cashReceived,
        accountId: effectiveCashAccountId,
      });
    }
    if (cardAmount > 0) {
      activePaymentDetails.push({
        mode: 'Card',
        amount: cardAmount,
        reference: cardReference.trim() || undefined,
        accountId: effectiveCardAccountId,
      });
    }

    const payload: B2CInvoiceInput = {
      companyId: companyId!,
      financialYearId: financialYearId!,
      date,
      type: invoiceType,
      items: buildItemsPayload(validLines),
      customerId: customerId && customerId !== 'cash' ? customerId : undefined,
      customerName,
      customerAddress: billingAddress,
      customerPhone: billingPhone,
      rateType,
      paymentType,
      vatType,
      taxMode,
      cashAccountId: effectiveCashAccountId,
      otherDiscount,
      otherCharges,
      freightCharge,
      lendAddLess,
      roundOff,
      cashReceived,
      narration: billingNarration || narration,
      shippingName,
      shippingAddress,
      shippingPhone,
      shippingContactPerson,
      paymentDetails: activePaymentDetails,
      emiratesId: emiratesId.trim() || undefined,
      patientName: selectedPatient.trim() || undefined,
      doctorName: selectedDoctor.trim() || undefined,
      doctorLicenseNo: doctors.find((d) => d.name === selectedDoctor.trim())?.licenseNumber || undefined,
      prescriptionNumber: prescriptionNumber.trim() || undefined,
      prescriptionDate: prescriptionDate || date,
      isRiayati,
    };

    setLoading(true);
    setErrorDialogOpen(false);
    setEditConfirmOpen(false);
    try {
      await salesApi.updateB2C(invoiceId, payload);
      invalidateStockCache();
      loadInvoiceIds(true);
      setEditSuccessDialogOpen(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Update failed';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!invoiceId || !companyId) return;
    setLoading(true);
    setDeleteDialogOpen(false);
    try {
      await salesApi.deleteB2C(invoiceId, companyId);
      invalidateStockCache();
      setSuccessDialogMessage('Invoice deleted successfully');
      setSuccessDialogOpen(true);
      loadInvoiceIds(true);
      setTimeout(() => {
        handleClear();
      }, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Delete failed';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePostToSales = (targetPath: '/entry/sales-b2c' | '/entry/sales-b2b') => {
    if (!invoiceId) return;
    setPostToSalesDialogOpen(false);
    navigate(targetPath, {
      state: {
        fromQuotation: true,
        quotationInvoiceNo: invoiceNo,
        customerId,
        customerName,
        customerAddress,
        date,
        vatType,
        taxMode,
        rateType,
        otherDiscount,
        otherCharges,
        freightCharge,
        roundOff,
        narration: billingNarration || narration,
        shippingName,
        shippingAddress,
        shippingPhone,
        shippingContactPerson,
        lines: lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productCode: l.productCode,
          imei: l.imei,
          name: l.name,
          unitId: l.unitId,
          unitName: l.unitName,
          availableUnits: l.availableUnits,
          quantity: l.quantity,
          price: l.price,
          purchasePrice: l.purchasePrice,
          gross: l.gross,
          discPercent: l.discPercent,
          discAmount: l.discAmount,
          vatAmount: l.vatAmount,
          total: l.total,
        })),
      }
    });
  };

  // Search by invoice number
  const handleSearch = async () => {
    if (!searchInvoiceNo || !companyId) return;
    setLoading(true);
    setSearchDialogOpen(false);
    try {
      const res = await salesApi.searchB2CByInvoiceNo(companyId, searchInvoiceNo, invoiceType);
      const invoice = res.data.data as Record<string, unknown>;
      if (invoice) {
        loadInvoice(invoice);
      } else {
        setErrorDialogMessage('Invoice not found');
        setErrorDialogOpen(true);
      }
    } catch {
      setErrorDialogMessage('Invoice not found');
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
      setSearchInvoiceNo('');
    }
  };

  const loadInvoice = (invoice: Record<string, unknown>) => {
    setInvoiceId(invoice._id as string);
    setInvoiceNo(invoice.invoiceNo as string);
    setDate((invoice.date as string)?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setVatType((invoice.vatType as 'Vat' | 'NonVat') || 'Vat');
    setTaxMode((invoice.taxMode as 'inclusive' | 'exclusive') ?? 'inclusive');
    setPaymentType((invoice.paymentType as 'Cash' | 'Credit') || 'Cash');
    setRateType((invoice.rateType as 'Retail' | 'WSale' | 'Special1' | 'Special2') || 'WSale');
    setCustomerId(invoice.customerId ? (invoice.customerId as { _id: string })._id : null);
    setCustomerName((invoice.customerName as string) || 'CASH');
    setCustomerAddress((invoice.customerAddress as string) || '');
    setBillingAddress((invoice.customerAddress as string) || '');
    setBillingPhone((invoice.customerPhone as string) || '');
    setEmiratesId((invoice.emiratesId as string) || '');
    setSelectedPatient((invoice.patientName as string) || '');
    setSelectedDoctor((invoice.doctorName as string) || '');
    setPrescriptionNumber((invoice.prescriptionNumber as string) || '');
    setPrescriptionDate((invoice.prescriptionDate as string) || '');
    setIsRiayati(Boolean(invoice.isRiayati));
    const loadedCashId = invoice.cashAccountId
      ? (typeof invoice.cashAccountId === 'object' ? (invoice.cashAccountId as any)._id : invoice.cashAccountId as string)
      : null;
    setCashAccountId(loadedCashId);
    if (loadedCashId) {
      const match = cashAccounts.find((c) => c._id === loadedCashId);
      if (match) {
        setSelectedCashAccount(match);
      } else {
        const cashObj = invoice.cashAccountId as any;
        setSelectedCashAccount({
          _id: loadedCashId,
          name: (cashObj && cashObj.name) || (invoice.customerName as string) || 'CASH',
          code: (cashObj && cashObj.code) || '',
        });
      }
    } else {
      setSelectedCashAccount(null);
    }
    setBillingNarration('');
    setShippingName((invoice.shippingName as string) || '');
    setShippingAddress((invoice.shippingAddress as string) || '');
    setShippingPhone((invoice.shippingPhone as string) || '');
    setShippingContactPerson((invoice.shippingContactPerson as string) || '');
    setOtherDiscount((invoice.otherDiscount as number) || 0);
    setOtherCharges((invoice.otherCharges as number) || 0);
    setFreightCharge((invoice.freightCharge as number) || 0);
    setLendAddLess((invoice.lendAddLess as number) || 0);
    setRoundOff((invoice.roundOff as number) || 0);
    setAutoRoundOff(false);
    setCashReceived((invoice.cashReceived as number) || 0);
    setOldBalance((invoice.oldBalance as number) || 0);
    setNarration((invoice.narration as string) || '');
    // Restore card payment details
    const paymentDetails = (invoice.paymentDetails as Array<{ mode: string; amount: number; reference?: string; accountId: string }>) || [];
    const cardPayment = paymentDetails.find((pd) => /card/i.test(pd.mode));
    if (cardPayment) {
      setCardAmount(cardPayment.amount || 0);
      setCardAccountId(cardPayment.accountId || null);
      setCardReference(cardPayment.reference || '');
    } else {
      setCardAmount(0);
      setCardReference('');
    }

    const items = (invoice.items as Array<Record<string, unknown>>) || [];
    if (items.length > 0) {
      setLines(
        items.map((item) => {
          const savedProduct = item.productId as Record<string, unknown>;
          const savedProductCode = (item.productCode as string) || (savedProduct?.code as string) || '';
          const savedMultiUnitId = (item.multiUnitId as string) || '';
          const savedUnitId = (item.unitId as string) || '';
          const savedUnitName = (item.unitName as string) || '';

          // Look up current product by product code from loaded products list
          const currentProduct = products.find((p) => p.code === savedProductCode);

          const qty = (item.quantity as number) || 0;
          const price = (item.unitPrice as number) || 0;
          const gross = (item.grossAmount as number) || qty * price;
          const discPct = (item.discountPercent as number) || 0;
          const disc = (item.discount as number) || 0;
          const vat = (item.vatAmount as number) || 0;
          const total = (item.totalAmount as number) || 0;

          // Build available units from current product
          const availableUnits: UnitOption[] = [];

          if (currentProduct) {
            // Use current product's unit data
            const mainUnit = currentProduct.unitOfMeasureId;
            if (mainUnit) {
              const mainUnitId = typeof mainUnit === 'object' ? mainUnit._id : mainUnit;
              const mainUnitName = typeof mainUnit === 'object' ? (mainUnit.shortCode || mainUnit.name || 'Main') : 'Main';
              availableUnits.push({
                id: mainUnitId,
                name: mainUnitName,
                isMultiUnit: false,
                imei: currentProduct.imei,
                price: currentProduct.retailPrice ?? 0
              });
            }

            // Add multi-units from current product
            if (currentProduct.multiUnits && currentProduct.multiUnits.length > 0) {
              currentProduct.multiUnits.forEach((mu) => {
                const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
                const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name || 'Unit') : 'Unit';
                if (muUnitId) {
                  const muRetail = mu.retail ?? 0;
                  const muWholesale = mu.wholesale ?? 0;
                  const muSp1 = mu.specialPrice1 ?? 0;
                  const muSp2 = mu.specialPrice2 ?? 0;
                  let muPrice = 0;
                  if (rateType === 'WSale') muPrice = muWholesale;
                  else if (rateType === 'Special1') muPrice = muSp1;
                  else if (rateType === 'Special2') muPrice = muSp2;
                  else muPrice = muRetail;
                  if (!muPrice) muPrice = muRetail || muWholesale || 0;
                  availableUnits.push({
                    id: muUnitId,
                    name: muUnitName,
                    isMultiUnit: true,
                    multiUnitId: mu.multiUnitId,
                    imei: mu.imei,
                    price: muPrice,
                    conversion: mu.conversion,
                    retail: muRetail,
                    wholesale: muWholesale,
                    specialPrice1: muSp1,
                    specialPrice2: muSp2,
                  });
                }
              });
            }
          } else {
            // Fall back to saved product data
            const unitOfMeasure = savedProduct?.unitOfMeasureId as { _id?: string; name?: string; shortCode?: string } | undefined;
            const mainUnitId = unitOfMeasure?._id || '';
            const mainUnitName = unitOfMeasure?.name || unitOfMeasure?.shortCode || 'Unit';
            if (mainUnitId) {
              availableUnits.push({ id: mainUnitId, name: mainUnitName, isMultiUnit: false });
            }
            const multiUnits = savedProduct?.multiUnits as Array<{
              multiUnitId?: string;
              unitId?: { _id?: string; name?: string; shortCode?: string } | string;
              price?: number;
              totalPrice?: number;
              retail?: number;
              wholesale?: number;
              specialPrice1?: number;
              specialPrice2?: number;
              conversion?: number;
              imei?: string;
            }> | undefined;
            if (multiUnits && Array.isArray(multiUnits)) {
              multiUnits.forEach((mu) => {
                const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
                const muUnitName = typeof mu.unitId === 'object' ? (mu.unitId?.name || mu.unitId?.shortCode) : '';
                if (muUnitId && muUnitName) {
                  const muRetail = mu.retail ?? 0;
                  const muWholesale = mu.wholesale ?? 0;
                  const muSp1 = mu.specialPrice1 ?? 0;
                  const muSp2 = mu.specialPrice2 ?? 0;
                  let muPrice = 0;
                  if (rateType === 'WSale') muPrice = muWholesale;
                  else if (rateType === 'Special1') muPrice = muSp1;
                  else if (rateType === 'Special2') muPrice = muSp2;
                  else muPrice = muRetail;
                  if (!muPrice) muPrice = muRetail || muWholesale || 0;
                  availableUnits.push({
                    id: mu.multiUnitId || muUnitId,
                    name: muUnitName,
                    isMultiUnit: true,
                    price: muPrice,
                    conversion: mu.conversion,
                    imei: mu.imei,
                    retail: muRetail,
                    wholesale: muWholesale,
                    specialPrice1: muSp1,
                    specialPrice2: muSp2,
                  });
                }
              });
            }
          }

          // Find the correct unit based on saved data
          let unitId = '';
          let unitName = '';

          // Try 1: Match by multiUnitId (new format)
          if (savedMultiUnitId) {
            const matchedUnit = availableUnits.find((u) => u.multiUnitId === savedMultiUnitId);
            if (matchedUnit) {
              unitId = matchedUnit.id;
              unitName = matchedUnit.name;
            }
          }

          // Try 2: Match by unitId (if saved)
          if (!unitId && savedUnitId) {
            const matchedUnit = availableUnits.find((u) => u.id === savedUnitId || u.multiUnitId === savedUnitId);
            if (matchedUnit) {
              unitId = matchedUnit.id;
              unitName = matchedUnit.name;
            }
          }

          // Try 3: Match by unit name (for older invoices)
          if (!unitId && savedUnitName) {
            const matchedUnit = availableUnits.find((u) =>
              u.name.toLowerCase() === savedUnitName.toLowerCase()
            );
            if (matchedUnit) {
              unitId = matchedUnit.id;
              unitName = matchedUnit.name;
            }
          }

          // Fall back to main unit if no match found
          if (!unitId && availableUnits.length > 0) {
            const mainUnit = availableUnits.find((u) => !u.isMultiUnit) || availableUnits[0];
            unitId = mainUnit.id;
            unitName = mainUnit.name;
          }

          // Get current product name (prefer current product, fall back to saved)
          const productName = currentProduct?.name || (item.description as string) || (savedProduct?.name as string) || '';
          const purchasePrice = currentProduct?.purchasePrice ?? (savedProduct?.purchasePrice as number) ?? 0;

          return {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
            productId: currentProduct?._id || (savedProduct?._id as string) || '',
            productCode: savedProductCode,
            imei: (item.imei as string) || '',
            name: productName,
            unitId,
            unitName,
            availableUnits,
            quantity: qty,
            baseStockPieces: 0,
            price,
            purchasePrice,
            gross,
            discPercent: discPct,
            discAmount: disc,
            vatAmount: vat,
            total,
            isRx: (item.isRx as boolean) || false,
            dosageInstructions: (item.dosageInstructions as any) || undefined,
            duration: (item.duration as string) || undefined,
            timing: (item.timing as string) || undefined,
            frequency: (item.frequency as string) || undefined,
            expiryDate: (item.expiryDate as string) || undefined,
            batchNumber: (item.batchNumber as string) || undefined,
            isCommitted: true,
          };
        })
      );
    }
    // Store original items for stock check when editing
    originalInvoiceItemsRef.current = items.map((item) => {
      const qty = (item.quantity as number) || 0;
      const savedMultiUnitId = (item.multiUnitId as string) || '';
      const savedProduct = item.productId as Record<string, unknown>;
      const productId = savedProduct?._id as string || '';
      // Determine unit conversion: if multi-unit, find conversion from product
      let unitConversion = 1;
      if (savedMultiUnitId) {
        const currentProduct = products.find((p) => p._id === productId || p.code === ((item.productCode as string) || (savedProduct?.code as string) || ''));
        if (currentProduct?.multiUnits) {
          const mu = currentProduct.multiUnits.find((m) => m.multiUnitId === savedMultiUnitId);
          if (mu?.conversion) unitConversion = mu.conversion;
        }
      }
      return { productId, quantity: qty, unitConversion };
    });
    setIsSaved(true); // Existing invoice is already saved, enable Print
  };

  if (!companyId || !financialYearId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select a company and financial year to continue.</Alert>
      </Box>
    );
  }

  // CSS to hide number input spinners
  const numberInputStyle = {
    '& input[type=number]': {
      MozAppearance: 'textfield',
    },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
      WebkitAppearance: 'none',
      margin: 0,
    },
  };

  // Prevent non-numeric input in number fields
  // Select all text when focusing on a text field (MUI TextField can be input or textarea)
  const handleTextFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>) => {
    e.target.select();
  };

  // Handle arrow up/down navigation between rows for the same field
  const handleGridArrowNavigation = (
    e: React.KeyboardEvent,
    lineId: string,
    fieldRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>
  ) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIndex = lines.findIndex((l) => l.id === lineId);
      if (currentIndex === -1) return;

      let targetIndex: number;
      if (e.key === 'ArrowUp') {
        targetIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
      } else {
        targetIndex = currentIndex < lines.length - 1 ? currentIndex + 1 : currentIndex;
      }

      if (targetIndex !== currentIndex) {
        const targetLine = lines[targetIndex];
        // Revert current row if uncommitted, snapshot the target row
        enterRow(targetLine);
        setActiveLineId(targetLine.id);
        const targetInput = fieldRefs.current[targetLine.id];
        if (targetInput) {
          targetInput.focus();
          targetInput.select();
        }
      }
    }
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    // Prevent up/down arrow increment/decrement on number fields
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      return;
    }
    // Allow: backspace, delete, tab, escape, enter, minus, arrows, home, end
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', '-', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (allowedKeys.includes(e.key) || (e.ctrlKey && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase()))) {
      return;
    }
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const selStart = input.selectionStart ?? value.length;
    const selEnd = input.selectionEnd ?? value.length;
    // Allow decimal point only if not already present
    if (e.key === '.') {
      if (value.includes('.')) { e.preventDefault(); }
      return;
    }
    // Block if not a number
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return;
    }
    const dotIndex = value.indexOf('.');
    // Restrict to 2 decimal places: if there's a decimal and already 2 digits after it, block further digits (unless text is selected)
    if (dotIndex !== -1 && selStart === selEnd) {
      const decimals = value.substring(dotIndex + 1);
      if (decimals.length >= 2 && selStart > dotIndex) {
        e.preventDefault();
      }
    }
  };

  // Ctrl+M: open product transaction history for the active row's product under the selected customer
  const handleCtrlM = useCallback(async (lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line || !line.productId) return;
    if (!companyId) return;
    setTxnHistorySourceLineId(lineId);
    setTxnHistoryProductName(line.name);
    setTxnHistorySelectedIdx(0);
    setTxnHistoryLoading(true);
    setTxnHistoryDialogOpen(true);
    setTxnHistoryData([]);
    try {
      const res = await salesApi.getProductCustomerHistory(companyId, line.productId, customerId || undefined, invoiceType);
      if (res.data.success) {
        setTxnHistoryData(res.data.data.history || []);
      }
    } catch {
      /* silently ignore */
    } finally {
      setTxnHistoryLoading(false);
    }
  }, [lines, companyId, customerId, invoiceType]);

  // Apply selected transaction price to the grid line
  const handleTxnHistorySelect = useCallback((idx: number) => {
    if (!txnHistorySourceLineId || idx < 0 || idx >= txnHistoryData.length) return;
    const selectedPrice = parseFloat(txnHistoryData[idx].unitPrice.toFixed(2));
    const lineId = txnHistorySourceLineId;
    updateLine(lineId, 'price', selectedPrice);
    setTxnHistoryDialogOpen(false);
    setTxnHistorySourceLineId(null);
    // Focus the price field of the source grid row after dialog closes
    setTimeout(() => {
      const priceInput = priceInputRefs.current[lineId];
      if (priceInput) {
        priceInput.focus();
        priceInput.select();
      }
    }, 100);
  }, [txnHistorySourceLineId, txnHistoryData, updateLine]);

  // Keyboard navigation inside the txn history dialog
  const handleTxnHistoryKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (txnHistoryData.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTxnHistorySelectedIdx((prev) => Math.min(prev + 1, txnHistoryData.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTxnHistorySelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleTxnHistorySelect(txnHistorySelectedIdx);
    } else if (e.key === 'Escape') {
      setTxnHistoryDialogOpen(false);
    }
  }, [txnHistoryData, txnHistorySelectedIdx, handleTxnHistorySelect]);

  // Global keydown handler for Ctrl+M / Ctrl+P on grid rows
  const handleGridKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      handleCtrlM(lineId);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      setProfitDialogOpen(true);
    }
  }, [handleCtrlM]);

  // Compute profit details for all filled grid rows (without VAT)
  const profitDetails = useMemo(() => {
    const rows = lines.filter((l) => l.productId).map((l) => {
      const unit = l.availableUnits.find((u) => u.id === l.unitId);
      const isMulti = unit?.isMultiUnit && unit?.conversion;
      const cost = isMulti ? l.purchasePrice * unit!.conversion! : l.purchasePrice;
      const totalWithoutVat = parseFloat((l.gross - l.discAmount).toFixed(2));
      const profit = parseFloat(((l.price - cost) * l.quantity).toFixed(2));
      return {
        name: l.name,
        qty: l.quantity,
        price: l.price,
        total: totalWithoutVat,
        profit,
      };
    });
    const totals = {
      qty: parseFloat(rows.reduce((s, r) => s + r.qty, 0).toFixed(2)),
      total: parseFloat(rows.reduce((s, r) => s + r.total, 0).toFixed(2)),
      profit: parseFloat(rows.reduce((s, r) => s + r.profit, 0).toFixed(2)),
    };
    return { rows, totals };
  }, [lines]);

  // Ctrl+S global shortcut to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!loading && !isSaved) {
          setSaveDialogOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [loading, isSaved]);

  return (
    <Box onClick={handlePageClick} sx={{ p: { xs: 0.5, md: 1.5 }, bgcolor: '#eef2f6', minHeight: '100vh', width: '100%', maxWidth: 1600, mx: 'auto', boxSizing: 'border-box', ...numberInputStyle }}>

      {/* ===== TOP HEADER BAR ===== */}
      <Paper elevation={0} sx={{ px: 1.25, py: 0.8, mb: 0.7, borderRadius: 1.5, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        {/* Row 1: Invoice info + Customer + Actions */}
        <Grid container spacing={1} alignItems="center">
          {/* Entry No - badge style */}
          <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
            <Box sx={{ bgcolor: isQuotationMode ? '#be185d' : '#0f766e', borderRadius: 1.2, px: 1, py: 0.35, textAlign: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.58rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>ENTRY NO</Typography>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.2 }}>{invoiceNo}</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3} md={2} lg={1.7}>
            <DateInput
              label="Date"
              value={date}
              onChange={setDate}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': { height: 28, borderRadius: 1.2, fontSize: '0.72rem' },
                '& .MuiInputBase-input': { py: '2px !important', fontSize: '0.72rem' },
                '& .MuiInputLabel-root': { fontSize: '0.70rem' },
              }}
            />
          </Grid>
          <Grid item xs={7.5} sm={4.6875} md={3.90625} lg={3.4375}>
            <Autocomplete
              size="small"
              options={customers}
              getOptionLabel={(opt) => opt.name || ''}
              filterOptions={(options, state) => {
                const q = (state.inputValue || '').trim().toLowerCase();
                const name = (c: Customer) => (c.name || '').toLowerCase();
                const sortByName = (arr: Customer[]) => arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
                if (!q) return options;
                const startsWith = options.filter((c) => name(c).startsWith(q));
                const containsOnly = options.filter((c) => name(c).includes(q) && !name(c).startsWith(q));
                return [...sortByName(startsWith), ...sortByName(containsOnly)];
              }}
              value={customers.find((c) => (c.name || '').trim().toLowerCase() === (customerName || '').trim().toLowerCase()) || null}
              onChange={(_, v) => handleCustomerSelect(v)}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === 'clear' || (reason === 'input' && newInputValue.trim() === '')) {
                  handleCustomerSelect(null);
                }
              }}
              onOpen={() => setCustomerAcListboxOpen(true)}
              onClose={() => setCustomerAcListboxOpen(false)}
              autoHighlight
              isOptionEqualToValue={(opt, val) => opt._id === val._id}
              slotProps={{
                paper: {
                  sx: { minWidth: '150%', width: '150%', maxWidth: '90vw' },
                },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  id="sales-customer-ac-input"
                  label="Cash / Customer A/C"
                  InputLabelProps={{ shrink: true }}
                  inputRef={customerAcRef}
                  onFocus={() => loadCustomers()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const typed = (e.target as HTMLInputElement).value.trim();
                      if (!typed) {
                        e.preventDefault();
                        setTimeout(() => rateTypeRef.current?.focus(), 50);
                        return;
                      }
                      const exists = customers.find((c) => (c.name || '').toLowerCase() === typed.toLowerCase());
                      if (exists) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCustomerSelect(exists);
                        setTimeout(() => rateTypeRef.current?.focus(), 50);
                        return;
                      }
                      if (customerAcListboxOpen) {
                        const isPrefixOfSome = customers.some((c) => (c.name || '').toLowerCase().startsWith(typed.toLowerCase()));
                        if (isPrefixOfSome) return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      setCreateCustomerConfirmName(typed);
                      setCreateCustomerConfirmOpen(true);
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                    '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' },
                    '& .MuiInputLabel-root': { fontSize: '0.70rem' },
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={6} sm={3.75} md={3.125} lg={3.125}>
            <TextField
              size="small"
              label="Customer Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onFocus={handleTextFieldFocus}
              inputRef={customerNameRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setTimeout(() => rateTypeRef.current?.focus(), 50);
                }
              }}
              InputLabelProps={{ shrink: true }}
              InputProps={{ readOnly: !!customerId }}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 28, minHeight: 28 },
                '& .MuiInputBase-input': { fontSize: '0.72rem', py: '2px !important' },
                '& .MuiInputLabel-root': { fontSize: '0.70rem' },
                ...(customerId ? { '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1.2, height: 28, minHeight: 28 } } : {}),
              }}
            />
          </Grid>
          <Grid item xs="auto">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setAddressDialogOpen(true)}
              sx={{ height: 26, fontSize: '0.72rem', px: 1, textTransform: 'none', borderRadius: 1.2, borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}
            >
              Address
            </Button>
          </Grid>
          <Grid item xs="auto">
            <TextField
              size="small"
              select
              label="Tax"
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as 'inclusive' | 'exclusive')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setTaxMode((prev) => (prev === 'inclusive' ? 'exclusive' : 'inclusive'));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => rateTypeRef.current?.focus(), 50);
                }
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 95, height: 26, '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 26, fontSize: '0.72rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiSelect-select': { py: '2px !important' } }}
            >
              <MenuItem value="inclusive" sx={{ fontSize: '0.72rem' }}>Include Tax</MenuItem>
              <MenuItem value="exclusive" sx={{ fontSize: '0.72rem' }}>Exclude Tax</MenuItem>
            </TextField>
          </Grid>
          {/* Spacer */}
          <Grid item xs />
          {/* Hold & Held Invoices */}
          <Grid item xs="auto">
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title="Hold this invoice for later">
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleHoldInvoice}
                    disabled={isSaved}
                    sx={{ height: 26, minWidth: 0, px: 1, fontSize: '0.72rem', textTransform: 'none', borderRadius: 1.2, bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, boxShadow: 'none' }}
                    startIcon={<HoldIcon sx={{ fontSize: 14 }} />}
                  >
                    Hold
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={heldInvoices.length > 0 ? `${heldInvoices.length} held invoice(s)` : 'No held invoices'}>
                <Badge badgeContent={heldInvoices.length} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 14, minWidth: 14 } }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setHoldListDialogOpen(true)}
                    sx={{ height: 26, minWidth: 26, px: 0.5, borderRadius: 1.2, borderColor: '#cbd5e1', color: '#475569' }}
                  >
                    <HoldListIcon sx={{ fontSize: 15 }} />
                  </Button>
                </Badge>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 0.6 }} />

        {/* Row 2: Rate/Location/Nav | VAT | Payment | Product Info */}
        <Grid container spacing={1} alignItems="stretch">
          {/* Rate Type + Location + Navigation */}
          <Grid item xs={12} sm={6} md={4} lg={3}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                <TextField
                  size="small"
                  select
                  label="Rate Type"
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as 'Retail' | 'WSale' | 'Special1' | 'Special2')}
                  InputLabelProps={{ shrink: true }}
                  inputRef={rateTypeRef}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const firstLine = lines[0];
                      if (firstLine && imeiInputRefs.current[firstLine.id]) {
                        imeiInputRefs.current[firstLine.id]?.focus();
                      }
                    }
                  }}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 26, fontSize: '0.72rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiSelect-select': { py: '2px !important' } }}
                >
                  <MenuItem value="Retail" sx={{ fontSize: '0.72rem' }}>Retail</MenuItem>
                  <MenuItem value="WSale" sx={{ fontSize: '0.72rem' }}>WSale</MenuItem>
                  <MenuItem value="Special1" sx={{ fontSize: '0.72rem' }}>Special Price 1</MenuItem>
                  <MenuItem value="Special2" sx={{ fontSize: '0.72rem' }}>Special Price 2</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  select
                  label="Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1.3, '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 26, fontSize: '0.72rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiSelect-select': { py: '2px !important' } }}
                >
                  <MenuItem value="MAIN BRANCH" sx={{ fontSize: '0.72rem' }}>MAIN BRANCH</MenuItem>
                </TextField>
              </Box>
              {/* Navigation buttons */}
              <Box
                ref={navButtonsContainerRef}
                onKeyDown={handleNavButtonKeyDown}
                sx={{ display: 'flex', gap: 0.4 }}
              >
                {[
                  { icon: <FirstIcon />, handler: handleFirstInvoice, tip: 'First' },
                  { icon: <PrevIcon />, handler: handlePrevInvoice, tip: 'Previous' },
                  { icon: <NextIcon />, handler: handleNextInvoice, tip: 'Next' },
                  { icon: <LastIcon />, handler: handleLastInvoice, tip: 'Last' },
                ].map((nav, i) => (
                  <Tooltip key={i} title={`${nav.tip} Invoice`}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={nav.handler}
                      sx={{
                        flex: 1, py: 0.15, height: 22, minWidth: 0, borderRadius: 1.2,
                        bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none',
                        '& .MuiSvgIcon-root': { fontSize: 15 },
                        '&:focus, &:focus-visible': { outline: '2px solid #000000', outlineOffset: 1 },
                      }}
                    >
                      {nav.icon}
                    </Button>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          </Grid>

          {/* VAT Type */}
          <Grid item xs={6} sm={3} md={2} lg={1.5}>
            <Box sx={{
              border: '1px solid #cbd5e1',
              borderRadius: 1.5,
              px: 0.8,
              py: 0.4,
              bgcolor: 'white',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <Typography sx={{ fontSize: '0.60rem', fontWeight: 700, color: '#475569', letterSpacing: 0.5, mb: 0.25, textTransform: 'uppercase' }}>
                VAT Type
              </Typography>
              <Box role="radiogroup" aria-label="VAT Type" sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 1.2, p: '2px', gap: '2px', border: '1px solid #e2e8f0' }}>
                <Box
                  role="radio"
                  aria-checked={vatType === 'Vat'}
                  tabIndex={0}
                  onClick={() => setVatType('Vat')}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVatType('Vat'); } }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.35,
                    borderRadius: 1,
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: vatType === 'Vat' ? 700 : 600,
                    color: vatType === 'Vat' ? '#ffffff' : '#64748b',
                    bgcolor: vatType === 'Vat' ? (isQuotationMode ? '#db2777' : '#0f766e') : 'transparent',
                    boxShadow: vatType === 'Vat' ? '0 1px 3px rgba(15,118,110,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': { bgcolor: vatType === 'Vat' ? (isQuotationMode ? '#be185d' : '#0d655e') : 'rgba(0,0,0,0.04)' }
                  }}
                >
                  VAT
                </Box>
                <Box
                  role="radio"
                  aria-checked={vatType === 'NonVat'}
                  tabIndex={0}
                  onClick={() => setVatType('NonVat')}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVatType('NonVat'); } }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    py: 0.35,
                    borderRadius: 1,
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: vatType === 'NonVat' ? 700 : 600,
                    color: vatType === 'NonVat' ? '#ffffff' : '#64748b',
                    bgcolor: vatType === 'NonVat' ? '#475569' : 'transparent',
                    boxShadow: vatType === 'NonVat' ? '0 1px 3px rgba(71,85,105,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': { bgcolor: vatType === 'NonVat' ? '#334155' : 'rgba(0,0,0,0.04)' }
                  }}
                >
                  Non-VAT
                </Box>
              </Box>
            </Box>
          </Grid>

          {/* Payment Type */}
          {!isQuotationMode && (
            <Grid item xs={6} sm={3} md={2} lg={1.5}>
              <Box sx={{
                border: '1px solid #cbd5e1',
                borderRadius: 1.5,
                px: 0.8,
                py: 0.4,
                bgcolor: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <Typography sx={{ fontSize: '0.60rem', fontWeight: 700, color: '#475569', letterSpacing: 0.5, mb: 0.25, textTransform: 'uppercase' }}>
                  Payment
                </Typography>
                <Box role="radiogroup" aria-label="Payment Type" sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 1.2, p: '2px', gap: '2px', border: '1px solid #e2e8f0' }}>
                  <Box
                    role="radio"
                    aria-checked={paymentType === 'Cash'}
                    tabIndex={isB2BMode ? -1 : 0}
                    onClick={() => {
                      if (!isB2BMode) setPaymentType('Cash');
                    }}
                    onKeyDown={(e) => { if (!isB2BMode && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setPaymentType('Cash'); } }}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      py: 0.35,
                      borderRadius: 1,
                      cursor: isB2BMode ? 'not-allowed' : 'pointer',
                      opacity: isB2BMode ? 0.4 : 1,
                      fontSize: '0.68rem',
                      fontWeight: paymentType === 'Cash' ? 700 : 600,
                      color: paymentType === 'Cash' ? '#ffffff' : '#64748b',
                      bgcolor: paymentType === 'Cash' ? '#16a34a' : 'transparent',
                      boxShadow: paymentType === 'Cash' ? '0 1px 3px rgba(22,163,74,0.35)' : 'none',
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                      '&:hover': { bgcolor: paymentType === 'Cash' ? '#15803d' : (isB2BMode ? 'transparent' : 'rgba(0,0,0,0.04)') }
                    }}
                  >
                    Cash
                  </Box>
                  <Box
                    role="radio"
                    aria-checked={paymentType === 'Credit'}
                    tabIndex={(!isB2BMode && !customerId) ? -1 : 0}
                    onClick={() => {
                      if (isB2BMode || customerId) setPaymentType('Credit');
                    }}
                    onKeyDown={(e) => { if ((isB2BMode || customerId) && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setPaymentType('Credit'); } }}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      py: 0.35,
                      borderRadius: 1,
                      cursor: (!isB2BMode && !customerId) ? 'not-allowed' : 'pointer',
                      opacity: (!isB2BMode && !customerId) ? 0.4 : 1,
                      fontSize: '0.68rem',
                      fontWeight: paymentType === 'Credit' ? 700 : 600,
                      color: paymentType === 'Credit' ? '#ffffff' : '#64748b',
                      bgcolor: paymentType === 'Credit' ? '#d97706' : 'transparent',
                      boxShadow: paymentType === 'Credit' ? '0 1px 3px rgba(217,119,6,0.35)' : 'none',
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                      '&:hover': { bgcolor: paymentType === 'Credit' ? '#b45309' : ((!isB2BMode && !customerId) ? 'transparent' : 'rgba(0,0,0,0.04)') }
                    }}
                  >
                    Credit
                  </Box>
                </Box>
              </Box>
            </Grid>
          )}

          {/* Product Info Section */}
          <Grid item xs={12} md={12} lg={isQuotationMode ? 7.5 : 6}>
            <Box sx={{
              borderRadius: 1.2, px: 1, py: 0.4, height: '100%', display: 'flex', alignItems: 'center', gap: 1,
              background: selectedProductInfo ? 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #f0fdf4 100%)' : '#f8fafc',
              border: selectedProductInfo ? '1px solid #99f6e4' : '1px dashed #cbd5e1',
              transition: 'all 0.2s',
            }}>
              {selectedProductInfo ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                  <Box sx={{ minWidth: 0, px: 0.7, py: 0.15, bgcolor: (selectedProductInfo.profit ?? 0) >= 0 ? '#dcfce7' : '#fee2e2', borderRadius: 0.8 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Profit</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', lineHeight: 1.2, color: (selectedProductInfo.profit ?? 0) >= 0 ? '#15803d' : '#dc2626' }}>{(selectedProductInfo.profit ?? 0).toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>P.Rate</Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {activeMultiUnitInfo && activeMultiUnitInfo.pcsInside
                        ? (selectedProductInfo.purchaseRate * activeMultiUnitInfo.pcsInside).toFixed(2)
                        : selectedProductInfo.purchaseRate.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, px: 0.7, py: 0.15, bgcolor: '#fef2f2', borderRadius: 0.8 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#dc2626', fontWeight: 600 }}>Stock</Typography>
                    <Typography sx={{ fontSize: '0.80rem', fontWeight: 800, lineHeight: 1.2, color: '#dc2626' }}>
                      {(() => {
                        const basePieces = selectedProductInfo.totalStock ?? selectedProductInfo.stock;
                        const pcsInside = activeMultiUnitInfo?.pcsInside;
                        const unitName = activeMultiUnitInfo?.name ?? '';
                        // Use reusable stock display formatter
                        return formatStockDisplay(basePieces, pcsInside, unitName);
                      })()}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Vendor</Typography>
                    <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, lineHeight: 1.2 }}>{selectedProductInfo.lastVendor ?? '-'}</Typography>
                  </Box>
                  {selectedProductInfo.batchNumber && (
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Batch</Typography>
                      <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, lineHeight: 1.2, color: '#0284c7' }}>
                        {selectedProductInfo.batchNumber.length > 10 ? selectedProductInfo.batchNumber.substring(0, 10) + '..' : selectedProductInfo.batchNumber}
                      </Typography>
                    </Box>
                  )}
                  {selectedProductInfo.expiryDate && (
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Expiry</Typography>
                      <Typography sx={{ fontSize: '0.70rem', fontWeight: 700, lineHeight: 1.2, color: '#ea580c' }}>{selectedProductInfo.expiryDate}</Typography>
                    </Box>
                  )}
                  {activeMultiUnitInfo && (
                    <>
                      <Box sx={{ width: '1px', height: 20, bgcolor: '#0f766e', opacity: 0.2, flexShrink: 0 }} />
                      {activeMultiUnitInfo.pcsInside != null && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Pcs Inside</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#7c3aed' }}>{activeMultiUnitInfo.pcsInside}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.wholesale != null && activeMultiUnitInfo.wholesale > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>WSale</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#1565c0' }}>{activeMultiUnitInfo.wholesale.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.retail != null && activeMultiUnitInfo.retail > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Retail</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#15803d' }}>{activeMultiUnitInfo.retail.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.specialPrice1 != null && activeMultiUnitInfo.specialPrice1 > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Spl.1</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#e65100' }}>{activeMultiUnitInfo.specialPrice1.toFixed(2)}</Typography>
                        </Box>
                      )}
                      {activeMultiUnitInfo.specialPrice2 != null && activeMultiUnitInfo.specialPrice2 > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.55rem', lineHeight: 1, color: '#64748b', fontWeight: 500 }}>Spl.2</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.2, color: '#ad1457' }}>{activeMultiUnitInfo.specialPrice2.toFixed(2)}</Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>Select a product to see details</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>


      {/* ===== PRODUCT GRID ===== */}
      <Paper elevation={0} sx={{ mb: 0.7, width: '100%', overflow: 'hidden', border: '1px solid #e0e7ef', borderRadius: 1.5 }}>
        <TableContainer
          sx={{ minHeight: 320, maxHeight: 320, width: '100%', bgcolor: '#fafbfc' }}
          onBlurCapture={(e) => {
            const container = e.currentTarget;
            setTimeout(() => {
              const active = document.activeElement;
              if (!active) return;
              const inPopper = active.closest('.MuiAutocomplete-popper, .MuiAutocomplete-listbox, .MuiPopper-root');
              if (inPopper) return;
              if (!container.contains(active)) {
                revertUncommittedRow();
              }
            }, 100);
          }}
        >
          <Table stickyHeader size="small" sx={{
            minWidth: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
            '& .MuiTableCell-root': { fontSize: '0.68rem', py: '2px', px: '3px', fontWeight: 700, borderBottom: '1px solid #cbd5e1' },
            '& .MuiInputBase-input': { fontSize: '0.68rem', fontWeight: 700 },
            '& .MuiAutocomplete-input': { fontSize: '0.68rem', fontWeight: 700 },
            '& .MuiSelect-select': { fontSize: '0.68rem', fontWeight: 700 },
          }}>
            <TableHead>
              <TableRow>
                {[
                  { label: 'Sl', w: '3%' },
                  { label: 'Item Code', w: '6%' },
                  { label: 'IMEI', w: '8%' },
                  { label: 'Item Name', w: '18%' },
                  { label: 'Rx', w: '4.5%' },
                  { label: 'Unit', w: '7.5%' },
                  { label: 'QTY', w: '6%' },
                  { label: 'Price', w: '6%' },
                  { label: 'Gross', w: '8%' },
                  { label: 'Disc%', w: '5%' },
                  { label: 'Disc', w: '5%' },
                  { label: 'VAT', w: '5%' },
                  { label: 'Total', w: '8%' },
                  { label: '', w: '3%' },
                ].map((col, ci) => (
                  <TableCell key={ci} sx={{
                    bgcolor: isQuotationMode ? '#db2777' : '#0f766e', color: 'white', fontWeight: 700, fontSize: '0.65rem', width: col.w,
                    p: '4px 3px', textAlign: 'center', letterSpacing: 0.2, textTransform: 'uppercase',
                    borderRight: ci < 13 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                    borderBottom: isQuotationMode ? '2px solid #be185d' : '2px solid #0b534d',
                  }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow
                  key={line.id}
                  sx={{
                    bgcolor: activeLineId === line.id ? '#e0f7fa' : (idx === 0 && !line.productId ? '#fffbeb' : (idx % 2 === 0 ? '#f8fafb' : 'white')),
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#e0f7fa' },
                    transition: 'background-color 0.1s',
                  }}
                  onClick={() => handleRowClick(line)}
                  onFocusCapture={() => { enterRow(line); setActiveLineId(line.id); }}
                  onKeyDownCapture={(e) => handleGridKeyDown(e, line.id)}
                >
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '0.68rem', bgcolor: '#f1f5f9' }}>{idx + 1}</TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      value={line.productCode}
                      fullWidth
                      InputProps={{ readOnly: true }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f8fafc', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      value={line.imei}
                      onChange={(e) => updateLine(line.id, 'imei', e.target.value)}
                      onFocus={handleTextFieldFocus}
                      onKeyDown={(e) => {
                        handleGridArrowNavigation(e, line.id, imeiInputRefs);
                        if (e.key === 'Enter') {
                          if (!line.imei.trim()) {
                            // IMEI is blank — focus Item Name
                            e.preventDefault();
                            setTimeout(() => itemNameInputRefs.current[line.id]?.focus(), 50);
                          } else {
                            handleImeiSearch(line.id, line.imei);
                          }
                        }
                      }}
                      fullWidth
                      inputRef={(el) => { imeiInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }} onClick={(e) => e.stopPropagation()}>
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={products}
                      filterOptions={productFilterOptions}
                      isOptionEqualToValue={(opt, val) => opt._id === val._id}
                      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name || '')}
                      value={products.find((p) => p._id === line.productId) || null}
                      inputValue={line.name}
                      onInputChange={(_, v) => {
                        if (v.trim() === '') {
                          clearLineProduct(line.id);
                        } else {
                          updateLine(line.id, 'name', v);
                        }
                      }}
                      onChange={(_, v) => {
                        if (v && typeof v !== 'string') {
                          itemNameSnapshotRef.current = null;
                          handleProductSelect(line.id, v);
                        }
                      }}
                      onOpen={() => { itemNameListboxOpenRef.current = true; }}
                      onClose={() => { itemNameListboxOpenRef.current = false; }}
                      onHighlightChange={handleProductHighlight}
                      autoHighlight
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          variant="outlined"
                          inputRef={(el) => { itemNameInputRefs.current[line.id] = el; }}
                          onFocus={() => handleItemNameFocus(line)}
                          onBlur={() => handleItemNameBlur(line)}
                          onKeyDown={(e) => handleItemNameKeyDown(e, line)}
                          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                        />
                      )}
                      renderOption={(props, opt) => (
                        <li {...props} key={opt._id} style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          cursor: 'pointer'
                        }}>
                          {opt.name}
                        </li>
                      )}
                      ListboxProps={{
                        sx: {
                          p: 0,
                          maxHeight: 220,
                          overflowX: 'hidden',
                          overflowY: 'auto',
                          '&::-webkit-scrollbar': { display: 'none' },
                          msOverflowStyle: 'none',
                          scrollbarWidth: 'none',
                          '& .MuiAutocomplete-option': {
                            minHeight: 'auto', py: 0.5, px: 1.5, fontSize: '0.68rem', fontWeight: 700, bgcolor: 'transparent',
                            '&[data-focus="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                            '&[aria-selected="true"]': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                            '&.Mui-focused': { bgcolor: '#0f766e !important', color: '#ffffff !important' },
                            '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.15) !important', color: '#0f766e' }
                          }
                        }
                      }}
                      componentsProps={{
                        popper: { placement: 'bottom-start', modifiers: [{ name: 'flip', enabled: false }, { name: 'preventOverflow', enabled: false }] },
                        paper: { sx: { width: '300px', boxShadow: '0 8px 24px rgba(15,118,110,0.15)', borderRadius: '8px', border: '1px solid #99f6e4', bgcolor: '#ffffff', overflow: 'hidden', mt: 0.5 } }
                      }}
                      sx={{ width: '100%' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={line.dosageInstructions?.summary ? `Rx: ${line.dosageInstructions.summary}` : (line.isRx ? "Prescription Item" : "Click to add Rx Instructions")}>
                      <Button
                        size="small"
                        onClick={() => handleOpenMedicationDialog(line.id)}
                        sx={{
                          minWidth: 0,
                          width: '100%',
                          height: 24,
                          px: 0.4,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'none',
                          borderRadius: 0.8,
                          border: line.dosageInstructions?.summary || line.isRx ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                          bgcolor: line.dosageInstructions?.summary || line.isRx ? '#e6f4f2' : '#ffffff',
                          color: line.dosageInstructions?.summary || line.isRx ? '#0f766e' : '#64748b',
                          '&:hover': { bgcolor: '#d1fae5', borderColor: '#0f766e' },
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 0.2,
                        }}
                      >
                        <span>Rx</span>
                        {(line.dosageInstructions?.summary || line.isRx) && <CheckCircleIcon sx={{ fontSize: 11, color: '#0f766e' }} />}
                      </Button>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }} onClick={(e) => e.stopPropagation()}>
                    <TextField
                      size="small"
                      select
                      variant="outlined"
                      value={line.unitId}
                      onChange={(e) => handleUnitChange(line.id, e.target.value)}
                      onKeyDown={(e) => handleUnitKeyDown(e, line.id)}
                      fullWidth
                      disabled={line.availableUnits.length === 0}
                      inputRef={(el) => { unitInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontSize: '0.68rem', fontWeight: 700 } }}
                    >
                      {line.availableUnits.length === 0 ? (
                        <MenuItem value="" sx={{ fontSize: '0.68rem', fontWeight: 700, py: 0.5 }}>-</MenuItem>
                      ) : (
                        line.availableUnits.map((u) => (
                          <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.68rem', fontWeight: 700, py: 0.5 }}>{u.name}</MenuItem>
                        ))
                      )}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'quantity' ? editingNumericCell.value : (line.quantity === 0 ? '' : String(line.quantity))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'quantity', value: line.quantity === 0 ? '' : String(line.quantity) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'quantity' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => handleQtyBlur(line)}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, qtyInputRefs); handleNumberKeyDown(e); handleQtyKeyDown(e, line); }}
                      inputProps={{ min: 0, style: { textAlign: 'center', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal' }}
                      fullWidth
                      inputRef={(el) => { qtyInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : (line.price === 0 ? '' : String(line.price))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'price', value: line.price === 0 ? '' : String(line.price) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'price' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'price' ? editingNumericCell.value : ''; const num = parseFloat(parseNumericInput(raw).toFixed(2)); updateLine(line.id, 'price', num); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'price' ? null : prev); }}
                      onKeyDown={(e) => { handleGridArrowNavigation(e, line.id, priceInputRefs); handleNumberKeyDown(e); handlePriceKeyDown(e, line); }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal' }}
                      fullWidth
                      inputRef={(el) => { priceInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '3px 4px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1', fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>{line.gross.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : (line.discPercent === 0 ? '' : String(line.discPercent))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discPercent', value: line.discPercent === 0 ? '' : String(line.discPercent) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discPercent' ? editingNumericCell.value : ''; updateLine(line.id, 'discPercent', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discPercent' ? null : prev); }}
                      onKeyDown={(e) => {
                        handleGridArrowNavigation(e, line.id, discPercentInputRefs);
                        handleNumberKeyDown(e);
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setTimeout(() => discAmountInputRefs.current[line.id]?.focus(), 50);
                        }
                      }}
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal' }}
                      fullWidth
                      inputRef={(el) => { discPercentInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '2px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1' }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      type="number"
                      value={editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : (line.discAmount === 0 ? '' : String(line.discAmount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ lineId: line.id, field: 'discAmount', value: line.discAmount === 0 ? '' : String(line.discAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.lineId === line.id && editingNumericCell?.field === 'discAmount' ? editingNumericCell.value : ''; updateLine(line.id, 'discAmount', parseNumericInput(raw)); setEditingNumericCell((prev) => prev && prev.lineId === line.id && prev.field === 'discAmount' ? null : prev); }}
                      onKeyDown={(e) => {
                        handleGridArrowNavigation(e, line.id, discAmountInputRefs);
                        handleNumberKeyDown(e);
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setTimeout(() => qtyInputRefs.current[line.id]?.focus(), 50);
                        }
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'right', fontSize: '0.68rem', fontWeight: 700 }, inputMode: 'decimal' }}
                      fullWidth
                      inputRef={(el) => { discAmountInputRefs.current[line.id] = el; }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 0.8, height: 24, '& fieldset': { borderColor: '#e2e8f0' } }, '& .MuiOutlinedInput-input': { py: 0, px: 0.5, fontWeight: 700 } }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ p: '3px 4px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1', fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>{line.vatAmount.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ p: '3px 4px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #cbd5e1', fontWeight: 800, fontSize: '0.70rem', color: '#0f766e' }}>
                    {line.total.toFixed(2)}
                  </TableCell>
                  <TableCell sx={{ p: '2px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => removeLine(line.id)} sx={{ p: 0.2, color: '#ef4444', '&:hover': { bgcolor: '#fee2e2' } }}>
                      <DeleteIcon sx={{ fontSize: '0.72rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ===== BOTTOM SECTION ===== */}
      <Paper elevation={0} sx={{ p: 0.85, mb: 0.5, borderRadius: 1.3, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Grid container spacing={0.75}>
          {/* Left Column - Payment Details */}
          {!isQuotationMode && (
            <Grid item xs={12} md={5} lg={3.5}>
              <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1.3, border: '1px solid #e2e8f0', p: 0.85 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#0f766e', mb: 0.6, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                  Payment Details
                </Typography>
                <Grid container spacing={0.65} alignItems="center">
                  <Grid item xs={6}>
                    <TextField
                      size="small" label="Cash Received" type="number"
                      value={editingNumericCell?.field === 'cashReceived' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (cashReceived === 0 ? '' : String(cashReceived))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'cashReceived', value: cashReceived === 0 ? '' : String(cashReceived) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'cashReceived' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'cashReceived' ? editingNumericCell.value : ''; setCashReceived(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'cashReceived' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => cardPaymentRef.current?.focus(), 50); } }}
                      inputRef={cashReceivedRef}
                      inputProps={{ inputMode: 'decimal' }}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      size="small" label="Card Payment" type="number"
                      value={editingNumericCell?.field === 'cardAmount' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (cardAmount === 0 ? '' : String(cardAmount))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'cardAmount', value: cardAmount === 0 ? '' : String(cardAmount) }); }}
                      onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'cardAmount' ? { ...prev, value: e.target.value } : prev)}
                      onBlur={() => { const raw = editingNumericCell?.field === 'cardAmount' ? editingNumericCell.value : ''; setCardAmount(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'cardAmount' ? null : prev); }}
                      onKeyDown={(e) => { handleNumberKeyDown(e); if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => cardReferenceRef.current?.focus(), 50); } }}
                      inputRef={cardPaymentRef}
                      inputProps={{ inputMode: 'decimal' }}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      size="small" label="Card Ref / Auth"
                      value={cardReference}
                      onChange={(e) => setCardReference(e.target.value)}
                      onFocus={handleTextFieldFocus}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => narrationRef.current?.focus(), 50); } }}
                      inputRef={cardReferenceRef}
                      InputLabelProps={{ shrink: true }}
                      placeholder="Auth/Ref code"
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <Autocomplete
                      size="small" options={cardAccounts}
                      getOptionLabel={(opt) => opt.name}
                      value={cardAccounts.find((c) => c._id === cardAccountId) || null}
                      onChange={(_, v) => setCardAccountId(v?._id || null)}
                      renderInput={(params) => <TextField {...params} label="Card A/C" InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26, py: '0 !important', px: '8px !important' }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiAutocomplete-input': { py: '2px !important', fontSize: '0.76rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiAutocomplete-endAdornment': { top: 'calc(50% - 9px)', right: 4 }, '& .MuiSvgIcon-root': { fontSize: '1rem' } }} />}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <Autocomplete
                      size="small" options={cashAccounts}
                      getOptionLabel={(opt) => opt.name}
                      value={selectedCashAccount}
                      onChange={(_, v) => { setSelectedCashAccount(v); setCashAccountId(v?._id || null); }}
                      disabled
                      renderInput={(params) => <TextField {...params} label="Cash A/C" InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26, py: '0 !important', px: '8px !important' }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiAutocomplete-input': { py: '2px !important', fontSize: '0.76rem' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, '& .MuiAutocomplete-endAdornment': { top: 'calc(50% - 9px)', right: 4 }, '& .MuiSvgIcon-root': { fontSize: '1rem' } }} />}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      size="small" label="Balance"
                      value={calculations.balance.toFixed(2)}
                      InputProps={{ readOnly: true, sx: { fontWeight: 700 } }}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26, bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      size="small" label="Narration" value={narration}
                      onChange={(e) => setNarration(e.target.value)}
                      onFocus={handleTextFieldFocus}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }}
                      inputRef={narrationRef}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                  </Grid>
                </Grid>
                {/* Total Qty & Profit Chips */}
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.65, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Qty: ${calculations.totalItems}`}
                    size="small"
                    sx={{ fontWeight: 700, bgcolor: '#e0f2fe', color: '#0369a1', fontSize: '0.70rem', height: 21, '& .MuiChip-label': { px: 0.9 } }}
                  />
                  <Chip
                    label={`Profit: ${calculations.totalProfit.toFixed(2)}`}
                    size="small"
                    sx={{ fontWeight: 700, bgcolor: calculations.totalProfit >= 0 ? '#dcfce7' : '#fee2e2', color: calculations.totalProfit >= 0 ? '#15803d' : '#dc2626', fontSize: '0.70rem', height: 21, '& .MuiChip-label': { px: 0.9 } }}
                  />
                </Box>
              </Box>
            </Grid>
          )}

          {/* Middle Column - Adjustments */}
          <Grid item xs={12} md={isQuotationMode ? 3.5 : 3.5} lg={3.5}>
            <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1.3, border: '1px solid #e2e8f0', p: 0.85, height: '100%' }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', mb: 0.6, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                Adjustments
              </Typography>
              <Grid container spacing={0.65}>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Disc %" type="number" value={editingNumericCell?.field === 'otherDiscPercent' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscPercent === 0 ? '' : String(otherDiscPercent))} onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscPercent', value: otherDiscPercent === 0 ? '' : String(otherDiscPercent) }); }} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscPercent' ? editingNumericCell.value : ''; handleOtherDiscPercentChange(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherDiscPercent' ? null : prev); }} onKeyDown={handleNumberKeyDown} inputProps={{ inputMode: 'decimal', max: 100 }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Discount" type="number" value={editingNumericCell?.field === 'otherDiscount' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherDiscount === 0 ? '' : String(otherDiscount))} onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherDiscount', value: otherDiscount === 0 ? '' : String(otherDiscount) }); }} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherDiscount' ? editingNumericCell.value : ''; setOtherDiscount(parseNumericInput(raw)); setOtherDiscPercent(0); setEditingNumericCell((prev) => prev?.field === 'otherDiscount' ? null : prev); }} onKeyDown={handleNumberKeyDown} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Other Charges" type="number" value={editingNumericCell?.field === 'otherCharges' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (otherCharges === 0 ? '' : String(otherCharges))} onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'otherCharges', value: otherCharges === 0 ? '' : String(otherCharges) }); }} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'otherCharges' ? editingNumericCell.value : ''; setOtherCharges(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'otherCharges' ? null : prev); }} onKeyDown={handleNumberKeyDown} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Freight Charge" type="number" value={editingNumericCell?.field === 'freightCharge' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (freightCharge === 0 ? '' : String(freightCharge))} onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'freightCharge', value: freightCharge === 0 ? '' : String(freightCharge) }); }} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'freightCharge' ? editingNumericCell.value : ''; setFreightCharge(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'freightCharge' ? null : prev); }} onKeyDown={handleNumberKeyDown} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField size="small" label="Travel Charge" type="number" value={editingNumericCell?.field === 'lendAddLess' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (lendAddLess === 0 ? '' : String(lendAddLess))} onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'lendAddLess', value: lendAddLess === 0 ? '' : String(lendAddLess) }); }} onChange={(e) => setEditingNumericCell((prev) => prev?.field === 'lendAddLess' ? { ...prev, value: e.target.value } : prev)} onBlur={() => { const raw = editingNumericCell?.field === 'lendAddLess' ? editingNumericCell.value : ''; setLendAddLess(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'lendAddLess' ? null : prev); }} onKeyDown={handleNumberKeyDown} inputProps={{ inputMode: 'decimal' }} InputLabelProps={{ shrink: true }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }} />
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField
                      size="small"
                      label="Round Off"
                      type="number"
                      value={editingNumericCell?.field === 'roundOff' && editingNumericCell.lineId === undefined ? editingNumericCell.value : (roundOff === 0 ? '' : String(roundOff))}
                      onFocus={(e) => { handleTextFieldFocus(e); setEditingNumericCell({ field: 'roundOff', value: roundOff === 0 ? '' : String(roundOff) }); }}
                      onChange={(e) => {
                        setAutoRoundOff(false);
                        setEditingNumericCell((prev) => prev?.field === 'roundOff' ? { ...prev, value: e.target.value } : prev);
                      }}
                      onBlur={() => { const raw = editingNumericCell?.field === 'roundOff' ? editingNumericCell.value : ''; setRoundOff(parseNumericInput(raw)); setEditingNumericCell((prev) => prev?.field === 'roundOff' ? null : prev); }}
                      onKeyDown={handleNumberKeyDown}
                      inputProps={{ inputMode: 'decimal' }}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' } }}
                    />
                    <Tooltip title="Round Off Total (Auto Round)" arrow placement="top">
                      <Checkbox
                        size="small"
                        checked={autoRoundOff}
                        onChange={(e) => handleAutoRoundOffToggle(e.target.checked)}
                        sx={{
                          p: 0.2,
                          color: '#94a3b8',
                          '&.Mui-checked': { color: '#0f766e' },
                          '& .MuiSvgIcon-root': { fontSize: '1.05rem' },
                        }}
                      />
                    </Tooltip>
                  </Box>
                </Grid>
              </Grid>
              {/* If in Quotation Mode, render Narration, Qty & Profit chips here */}
              {isQuotationMode && (
                <Box sx={{ mt: 0.8 }}>
                  <TextField
                    size="small" label="Narration" value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    onFocus={handleTextFieldFocus}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => saveButtonRef.current?.focus(), 50); } }}
                    inputRef={narrationRef}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.1, height: 26, minHeight: 26 }, '& .MuiInputBase-input': { fontSize: '0.76rem', py: '2px !important' }, '& .MuiInputLabel-root': { fontSize: '0.70rem' }, mb: 0.6 }}
                  />
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    <Chip
                      label={`Qty: ${calculations.totalItems}`}
                      size="small"
                      sx={{ fontWeight: 700, bgcolor: '#fdf2f8', color: '#be185d', fontSize: '0.70rem', height: 21, '& .MuiChip-label': { px: 0.9 } }}
                    />
                    <Chip
                      label={`Profit: ${calculations.totalProfit.toFixed(2)}`}
                      size="small"
                      sx={{ fontWeight: 700, bgcolor: calculations.totalProfit >= 0 ? '#dcfce7' : '#fee2e2', color: calculations.totalProfit >= 0 ? '#15803d' : '#dc2626', fontSize: '0.70rem', height: 21, '& .MuiChip-label': { px: 0.9 } }}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          </Grid>

          {/* Right Column - Grand Total & Bill Summary */}
          <Grid item xs={12} md={isQuotationMode ? 8.5 : 3.5} lg={isQuotationMode ? 8.5 : 5}>
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {/* Grand Total */}
              <Box sx={{
                background: isQuotationMode
                  ? 'linear-gradient(135deg, #db2777 0%, #be185d 100%)'
                  : 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
                borderRadius: 1.3, p: 0.65, mb: 0.55, textAlign: 'center',
              }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.56rem', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 0.08 }}>Grand Total</Typography>
                <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '1.25rem', lineHeight: 1.1, letterSpacing: -0.5 }}>
                  {calculations.grandTotal.toFixed(2)}
                </Typography>
              </Box>
              {/* Bill breakdown */}
              <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1.3, border: '1px solid #e2e8f0', p: 0.75, flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
                  <Typography sx={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 500 }}>
                    {isQuotationMode ? 'This Quotation' : 'This Bill'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{calculations.subTotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
                  <Typography sx={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 500 }}>Before tax (incl. adjustments)</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{(calculations.grandTotal - calculations.totalVat).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
                  <Typography sx={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 500 }}>Total VAT</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{calculations.totalVat.toFixed(2)}</Typography>
                </Box>
                {[
                  { label: 'Old Balance', value: oldBalance },
                  { label: 'Freight Chgs', value: freightCharge },
                  { label: 'Round Off', value: roundOff },
                  { label: 'Other Discount', value: otherDiscount },
                  { label: 'Other Charges', value: otherCharges },
                  { label: 'Travel Chg', value: lendAddLess },
                ].map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.08 }}>
                    <Typography sx={{ fontSize: '0.60rem', color: '#94a3b8' }}>{item.label}</Typography>
                    <Typography sx={{ fontSize: '0.60rem', color: '#64748b', fontWeight: 500 }}>{item.value.toFixed(2)}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* ===== ACTION BUTTONS ROW ===== */}
      <Paper elevation={0} sx={{ p: 0.8, width: '100%', borderRadius: 1.5, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
        <Box
          ref={actionButtonsContainerRef}
          onKeyDown={handleActionButtonKeyDown}
          sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {/* Primary Actions */}
          <Button
            ref={saveButtonRef}
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => setSaveDialogOpen(true)}
            disabled={loading || isSaved}
            sx={{
              ...commonButtonStyles,
              bgcolor: isQuotationMode ? '#db2777' : '#16a34a',
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' },
              '&:focus, &:focus-visible': {
                outline: '2px solid #000000',
                outlineOffset: 1,
              },
            }}
          >
            Save
          </Button>
          <Button
            ref={printButtonRef}
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
            disabled={!isSaved}
            sx={{
              ...commonButtonStyles,
              bgcolor: isQuotationMode ? '#db2777' : '#16a34a',
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' },
              '&:focus, &:focus-visible': {
                outline: '2px solid #000000',
                outlineOffset: 1,
              },
            }}
          >
            Print
          </Button>
          {isQuotationMode && (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              disabled={!invoiceId || loading}
              onClick={() => setPostToSalesDialogOpen(true)}
              sx={{
                ...commonButtonStyles,
                bgcolor: '#db2777',
                '&:hover': { bgcolor: '#be185d' },
                '&:focus, &:focus-visible': {
                  outline: '2px solid #000000',
                  outlineOffset: 1,
                },
              }}
            >
              Post to Sales
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<ClearIcon />}
            onClick={async (e) => {
              (e.currentTarget as HTMLElement)?.blur();
              await handleClear();
            }}
            sx={{
              ...commonButtonStyles,
              bgcolor: isQuotationMode ? '#db2777' : '#16a34a',
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' },
              '&:focus, &:focus-visible': {
                outline: '2px solid #000000',
                outlineOffset: 1,
              },
            }}
          >
            Clear
          </Button>

          {/* Divider */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />

          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={handleEditClick}
            disabled={!invoiceId || loading}
            sx={{
              minWidth: 65, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none',
              borderRadius: 1.2, boxShadow: 'none',
              bgcolor: isQuotationMode ? '#db2777' : '#16a34a', color: '#fff',
              '& .MuiSvgIcon-root': { fontSize: 16 },
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' },
              '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
              '&:focus, &:focus-visible': {
                outline: '2px solid #000000',
                outlineOffset: 1,
              },
            }}
          >
            Edit
          </Button>
          <Button
            variant="contained"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!invoiceId}
            sx={{
              minWidth: 70, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none',
              borderRadius: 1.2, boxShadow: 'none',
              bgcolor: isQuotationMode ? '#db2777' : '#16a34a', color: '#fff',
              '& .MuiSvgIcon-root': { fontSize: 16 },
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' },
              '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
              '&:focus, &:focus-visible': {
                outline: '2px solid #000000',
                outlineOffset: 1,
              },
            }}
          >
            Delete
          </Button>
          {!isB2BMode && !isQuotationMode && (
            <Button
              variant="contained"
              startIcon={<LocalPharmacyIcon />}
              onClick={() => setRiayatiDialogOpen(true)}
              sx={{
                ...commonButtonStyles,
                minWidth: 85,
                bgcolor: isRiayati ? '#0f766e' : '#16a34a',
                color: '#ffffff',
                fontWeight: 600,
                '&:hover': { bgcolor: isRiayati ? '#0d5d57' : '#000000' },
                '&:focus, &:focus-visible': {
                  outline: '2px solid #000000',
                  outlineOffset: 1,
                },
              }}
            >
              Riayati {isRiayati ? '(E-Rx)' : ''}
            </Button>
          )}

          {/* Spacer */}
          <Box sx={{ flex: 1 }} />

          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={() => setSearchDialogOpen(true)}
            sx={{
              minWidth: 100, py: 0.35, height: 28, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none',
              borderRadius: 1.2, boxShadow: 'none',
              bgcolor: isQuotationMode ? '#db2777' : '#16a34a', color: '#fff',
              '& .MuiSvgIcon-root': { fontSize: 16 },
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' },
              '&:focus, &:focus-visible': {
                outline: '2px solid #000000',
                outlineOffset: 1,
              },
            }}
          >
            {isQuotationMode ? 'Search Quotation' : 'Search Invoice'}
          </Button>
        </Box>
      </Paper>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>{isQuotationMode ? 'Save Quotation' : 'Save Invoice'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Do you want to save this {isQuotationMode ? 'quotation' : 'invoice'}?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setSaveDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" data-confirm-btn onClick={handleSave} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isQuotationMode ? '#db2777' : '#0f766e', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#115e59' }, boxShadow: 'none' }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Saved Success Dialog */}
      <Dialog
        open={savedDialogOpen}
        onClose={() => {
          setSavedDialogOpen(false);
          focusPrintButton();
        }}
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{
          onEntered: (node) => {
            const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]');
            btn?.focus();
          },
          onExited: () => {
            focusPrintButton();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Saved Successfully</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{isQuotationMode ? 'Quotation' : 'Invoice'} has been saved successfully.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            data-confirm-btn
            onClick={() => {
              setSavedDialogOpen(false);
              focusPrintButton();
            }}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              bgcolor: isQuotationMode ? '#db2777' : '#0f766e',
              '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#115e59' },
              boxShadow: 'none',
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>{isQuotationMode ? 'Edit Quotation' : 'Edit Invoice'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Do you want to update this {isQuotationMode ? 'quotation' : 'invoice'}?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setEditConfirmOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" data-confirm-btn onClick={handleEditConfirm} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isQuotationMode ? '#db2777' : '#0f766e', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#115e59' }, boxShadow: 'none' }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Success Dialog */}
      <Dialog open={editSuccessDialogOpen} onClose={() => { setEditSuccessDialogOpen(false); handleClear(); }} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Edited Successfully</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{isQuotationMode ? 'Quotation' : 'Invoice'} has been updated successfully.</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>{isQuotationMode ? 'Quotation No' : 'Invoice No'}: {invoiceNo}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => { setEditSuccessDialogOpen(false); handleClear(); }} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isQuotationMode ? '#db2777' : '#16a34a', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#000000' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => setErrorDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create customer confirm: account doesn't exist, do you want to create? */}
      <Dialog
        open={createCustomerConfirmOpen}
        onClose={() => { setCreateCustomerConfirmOpen(false); setCreateCustomerConfirmName(null); }}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{
          onEntered: (node) => {
            const yesBtn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-create-customer-yes]');
            yesBtn?.focus();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f766e' }}>Create account?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            This account doesn&apos;t exist. Do you want to create it{createCustomerConfirmName ? ` for "${createCustomerConfirmName}"` : ''}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => { setCreateCustomerConfirmOpen(false); setCreateCustomerConfirmName(null); }} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            No
          </Button>
          <Button
            variant="contained"
            data-create-customer-yes
            autoFocus
            onClick={() => {
              const name = createCustomerConfirmName;
              setCreateCustomerConfirmOpen(false);
              setCreateCustomerConfirmName(null);
              if (name) {
                setPendingCustomerName(name);
                navigate('/master/customer-create', { state: { prefillName: name, returnTo: isQuotationMode ? '/entry/quotation-sales' : (isB2BMode ? '/entry/sales-b2b' : '/entry/sales-b2c') } });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d6561' }, boxShadow: 'none' }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Product Confirm Dialog */}
      <Dialog
        open={createProductConfirmOpen}
        onClose={() => { setCreateProductConfirmOpen(false); setCreateProductConfirmName(null); pendingProductLineIdRef.current = null; }}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{
          onEntered: (node) => {
            const yesBtn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-create-product-yes]');
            yesBtn?.focus();
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f766e' }}>Create product?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            This product doesn&apos;t exist. Do you want to create it{createProductConfirmName ? ` for "${createProductConfirmName}"` : ''}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            onClick={() => { setCreateProductConfirmOpen(false); setCreateProductConfirmName(null); pendingProductLineIdRef.current = null; }}
            sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}
          >
            No
          </Button>
          <Button
            variant="contained"
            data-create-product-yes
            autoFocus
            onClick={() => {
              const name = createProductConfirmName;
              const lineId = pendingProductLineIdRef.current;
              setCreateProductConfirmOpen(false);
              setCreateProductConfirmName(null);
              pendingProductLineIdRef.current = null;
              if (name) {
                navigate('/master/products/create', {
                  state: {
                    prefillName: name,
                    returnTo: isQuotationMode ? '/entry/quotation-sales' : (isB2BMode ? '/entry/sales-b2b' : '/entry/sales-b2c'),
                    lineIdForProduct: lineId ?? undefined,
                  },
                });
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d6561' }, boxShadow: 'none' }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onClose={() => setSuccessDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Success</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{successDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => setSuccessDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>{isQuotationMode ? 'Delete Quotation' : 'Delete Invoice'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Are you sure you want to delete this {isQuotationMode ? 'quotation' : 'invoice'}? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" color="error" data-confirm-btn onClick={handleDelete} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isQuotationMode ? '#db2777' : '#d32f2f', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#c62828' }, boxShadow: 'none' }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stock Alert Dialog */}
      <Dialog open={stockAlertOpen} onClose={() => {
        setStockAlertOpen(false);
        const lineId = qtyOverflowLineIdRef.current;
        if (lineId) {
          qtyOverflowLineIdRef.current = null;
          setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
        }
      }} disableRestoreFocus PaperProps={{ sx: { borderRadius: 2, minWidth: 360 } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon sx={{ fontSize: 22, color: '#f59e0b' }} />
          Out of Stock
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{stockAlertMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" data-confirm-btn onClick={() => {
            setStockAlertOpen(false);
            const lineId = qtyOverflowLineIdRef.current;
            if (lineId) {
              qtyOverflowLineIdRef.current = null;
              setTimeout(() => qtyInputRefs.current[lineId]?.focus(), 50);
            }
          }} sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Post to Sales Selection Dialog */}
      <Dialog open={postToSalesDialogOpen} onClose={() => setPostToSalesDialogOpen(false)} PaperProps={{ sx: { borderRadius: 3, maxWidth: 380, width: '100%' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', textAlign: 'center', pb: 1, pt: 2.5 }}>
          Post Quotation to Sales
        </DialogTitle>
        <DialogContent sx={{ pb: 1, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>
            Choose the target sales type where you want to post this quotation:
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 1.5, px: 3, pb: 3, pt: 1.5 }}>
          <Button
            variant="contained"
            onClick={() => handlePostToSales('/entry/sales-b2c')}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: '#16a34a',
              '&:hover': { bgcolor: '#15803d' },
              fontWeight: 600,
              fontSize: '0.85rem',
              px: 2.5,
              py: 0.75,
              boxShadow: 'none',
            }}
          >
            Sales B2C
          </Button>
          <Button
            variant="contained"
            onClick={() => handlePostToSales('/entry/sales-b2b')}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: '#0f766e',
              '&:hover': { bgcolor: '#0d9488' },
              fontWeight: 600,
              fontSize: '0.85rem',
              px: 2.5,
              py: 0.75,
              boxShadow: 'none',
            }}
          >
            Sales B2B
          </Button>
          <Button
            onClick={() => setPostToSalesDialogOpen(false)}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              color: '#64748b',
              fontWeight: 600,
              fontSize: '0.85rem',
              px: 2,
              py: 0.75,
            }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Search Dialog */}
      <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>{isQuotationMode ? 'Search Quotation' : 'Search Invoice'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label={isQuotationMode ? 'Quotation Number' : 'Invoice Number'}
            value={searchInvoiceNo}
            onChange={(e) => setSearchInvoiceNo(e.target.value)}
            onFocus={handleTextFieldFocus}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            fullWidth
            size="small"
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setSearchDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSearch} autoFocus sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: isQuotationMode ? '#db2777' : '#334155', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#1e293b' }, boxShadow: 'none' }}>
            Search
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Selection Dialog */}
      <Dialog
        open={batchDialogOpen}
        onClose={handleBatchDialogClose}
        onKeyDown={handleBatchDialogKeyDown}
        maxWidth="sm"
        fullWidth
        autoFocus={false}
        disableAutoFocus={true}
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2 } }}
        TransitionProps={{
          onEntered: () => {
            const firstRow = batchRowRefs.current[focusedBatchIndex] || batchRowRefs.current[0];
            if (firstRow) {
              firstRow.focus();
              firstRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          },
        }}
      >
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Select Batch</Typography>
          {pendingProductSelection && (
            <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mt: 0.3 }}>{pendingProductSelection.product.name}</Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {['Batch No', 'Expiry Date', 'Stock', 'P.Rate', rateType === 'WSale' ? 'W.Sale' : 'Retail', 'Action'].map((label, ci) => (
                    <TableCell key={ci} align={ci >= 2 && ci <= 4 ? 'right' : ci === 5 ? 'center' : 'left'}
                      sx={{ bgcolor: '#f0fdfa', fontWeight: 600, fontSize: '0.72rem', color: '#0f766e', py: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {availableBatches.map((batch, index) => (
                  <TableRow
                    key={batch.batchNumber}
                    ref={(el) => { batchRowRefs.current[index] = el; }}
                    tabIndex={index === focusedBatchIndex ? 0 : -1}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#f0fdfa' },
                      bgcolor: index === focusedBatchIndex ? '#ccfbf1 !important' : (index % 2 === 0 ? '#ffffff' : '#fafafa'),
                      outline: index === focusedBatchIndex ? '2px solid #0f766e !important' : 'none',
                      outlineOffset: -2,
                      transition: 'all 0.1s',
                      '&:focus': {
                        outline: '2px solid #0f766e !important',
                        bgcolor: '#ccfbf1 !important',
                      },
                    }}
                    onClick={() => {
                      setFocusedBatchIndex(index);
                      handleBatchSelect(batch);
                    }}
                    onFocus={() => setFocusedBatchIndex(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleBatchSelect(batch);
                      }
                    }}
                  >
                    <TableCell sx={{ fontSize: '0.8rem', color: '#334155', py: 0.75 }}>
                      {batch.batchNumber.length > 15 ? batch.batchNumber.substring(0, 15) + '...' : batch.batchNumber}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: '#475569', py: 0.75 }}>{batch.expiryDate || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{batch.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#64748b', py: 0.75 }}>{batch.purchasePrice.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#1e293b', py: 0.75, fontWeight: 600 }}>{(rateType === 'WSale' ? batch.wholesale : batch.retail).toFixed(2)}</TableCell>
                    <TableCell align="center" sx={{ py: 0.75 }}>
                      <Button size="small" variant="contained" tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); handleBatchSelect(batch); }}
                        sx={{ minWidth: 'auto', px: 1.5, py: 0.25, fontSize: '0.7rem', borderRadius: 1, boxShadow: 'none', bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', px: 2, py: 1 }}>
          <Button tabIndex={-1} onClick={handleBatchDialogClose} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Held Invoices Dialog */}
      <Dialog open={holdListDialogOpen} onClose={() => setHoldListDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HoldListIcon sx={{ color: '#f59e0b' }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Held Invoices</Typography>
            {heldInvoices.length > 0 && (
              <Chip label={heldInvoices.length} size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: '0.75rem' }} />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, borderColor: '#e2e8f0' }}>
          {heldInvoices.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.9rem' }}>No held invoices</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {heldInvoices.map((held, idx) => (
                <ListItem
                  key={held.id}
                  divider={idx < heldInvoices.length - 1}
                  sx={{ py: 1.5, '&:hover': { bgcolor: '#f8fafc' } }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip label={held.invoiceNo || 'Draft'} size="small" variant="outlined" sx={{ borderColor: '#0f766e', color: '#0f766e', fontWeight: 600 }} />
                        <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{held.customerName}</Typography>
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                        <span style={{ color: '#64748b' }}>{held.itemCount} item{held.itemCount !== 1 ? 's' : ''}</span>
                        <span style={{ fontWeight: 700, color: '#0f766e' }}>AED {held.total.toFixed(2)}</span>
                        <span style={{ color: '#94a3b8' }}>{held.heldAt}</span>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Restore this invoice">
                      <IconButton edge="end" onClick={() => handleRestoreHeldInvoice(held)} sx={{ mr: 0.5, color: '#0f766e' }}>
                        <RestoreIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton edge="end" onClick={() => handleDeleteHeldInvoice(held.id)} sx={{ color: '#ef4444' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={() => setHoldListDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Address Details Dialog */}
      <Dialog open={addressDialogOpen} onClose={() => setAddressDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Address Details</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f766e', mb: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Billing Address
          </Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Address</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} onFocus={handleTextFieldFocus} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Phone</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} onFocus={handleTextFieldFocus} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Narration</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={billingNarration} onChange={(e) => setBillingNarration(e.target.value)} onFocus={handleTextFieldFocus} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 1.5, borderColor: '#e2e8f0' }} />

          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#475569', mb: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Shipping Address
          </Typography>
          <Grid container spacing={1}>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Name</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={shippingName} onChange={(e) => setShippingName(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Address</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Phone</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
            <Grid item xs={3.5}>
              <Typography sx={{ fontWeight: 500, pt: 0.75, fontSize: '0.78rem', color: '#475569' }}>Contact</Typography>
            </Grid>
            <Grid item xs={8.5}>
              <TextField size="small" value={shippingContactPerson} onChange={(e) => setShippingContactPerson(e.target.value)} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 1.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setAddressDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button
            variant="contained" size="small"
            onClick={() => { setCustomerAddress(billingAddress); setAddressDialogOpen(false); }}
            autoFocus
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' }, boxShadow: 'none' }}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Product Transaction History Dialog (Ctrl+M) */}
      <Dialog
        open={txnHistoryDialogOpen}
        onClose={() => setTxnHistoryDialogOpen(false)}
        maxWidth="md"
        fullWidth
        onKeyDown={handleTxnHistoryKeyDown}
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0.5 }}>
          <Box>
            Transaction History
            <Typography sx={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, mt: 0.2 }}>{txnHistoryProductName}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center' }}>
            {customerId && (
              <Chip label="Customer" size="small" sx={{ bgcolor: '#f0fdfa', color: '#0f766e', fontSize: '0.68rem', fontWeight: 600, height: 22, border: '1px solid #99f6e4' }} />
            )}
            <Chip label={`${txnHistoryData.length} records`} size="small" sx={{ bgcolor: '#0f766e', color: 'white', fontSize: '0.68rem', fontWeight: 700, height: 22 }} />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {txnHistoryLoading ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#64748b', fontSize: '0.85rem' }}>Loading transactions...</Typography>
            </Box>
          ) : txnHistoryData.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>No Transactions Found</Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.78rem', mt: 0.5 }}>No sales history for this product{customerId ? ' under the selected customer' : ''}.</Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 380 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        { label: '#', w: '4%', align: 'center' as const },
                        { label: 'Invoice', w: '13%', align: 'left' as const },
                        { label: 'Date', w: '11%', align: 'left' as const },
                        { label: 'Customer', w: '19%', align: 'left' as const },
                        { label: 'Unit', w: '8%', align: 'center' as const },
                        { label: 'Qty', w: '8%', align: 'right' as const },
                        { label: 'Price', w: '12%', align: 'right' as const },
                        { label: 'Disc', w: '10%', align: 'right' as const },
                        { label: 'Total', w: '15%', align: 'right' as const },
                      ].map((col, ci) => (
                        <TableCell key={ci} sx={{
                          bgcolor: isQuotationMode ? '#db2777' : '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.72rem', width: col.w, textAlign: col.align,
                          textTransform: 'uppercase', letterSpacing: 0.3, py: 0.8, px: 1.2,
                        }}>
                          {col.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {txnHistoryData.map((row, i) => (
                      <TableRow
                        key={i}
                        ref={(el) => { txnHistoryRowRefs.current[i] = el; }}
                        onClick={() => setTxnHistorySelectedIdx(i)}
                        onDoubleClick={() => handleTxnHistorySelect(i)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: i === txnHistorySelectedIdx ? '#ecfdf5' : (i % 2 === 0 ? '#fff' : '#f8fafc'),
                          '&:hover': { bgcolor: i === txnHistorySelectedIdx ? '#d1fae5' : '#f0fdf4' },
                          outline: i === txnHistorySelectedIdx ? '2px solid #0f766e' : 'none',
                          outlineOffset: -2,
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center', px: 1.2, py: 0.8 }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f766e', px: 1.2, py: 0.8 }}>{row.invoiceNo}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#64748b', px: 1.2, py: 0.8 }}>{row.date ? formatDateDisplay(row.date) : ''}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#334155', px: 1.2, py: 0.8 }}>{row.customerName || 'Cash'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center', px: 1.2, py: 0.8 }}>{row.unitName || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', textAlign: 'right', color: '#334155', fontWeight: 500, px: 1.2, py: 0.8 }}>{row.quantity.toFixed(2)}</TableCell>
                        <TableCell sx={{
                          fontSize: '0.8rem', textAlign: 'right', px: 1.2, py: 0.8,
                          fontWeight: i === txnHistorySelectedIdx ? 800 : 600,
                          color: i === txnHistorySelectedIdx ? '#0f766e' : '#1e293b',
                        }}>{row.unitPrice.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', textAlign: 'right', color: row.discount > 0 ? '#dc2626' : '#94a3b8', px: 1.2, py: 0.8 }}>{row.discount > 0 ? `-${row.discount.toFixed(2)}` : '0.00'}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', px: 1.2, py: 0.8 }}>{row.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Summary Footer */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2.5, px: 2, py: 1.2, bgcolor: '#f8fafc', borderTop: '1px solid #e0e7ef' }}>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Qty</Typography>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f766e' }}>{txnHistoryData.reduce((s, r) => s + r.quantity, 0).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Discount</Typography>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#dc2626' }}>{txnHistoryData.reduce((s, r) => s + r.discount, 0).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Grand Total</Typography>
                  <Typography sx={{ fontSize: '0.92rem', fontWeight: 900, color: '#0f766e' }}>{txnHistoryData.reduce((s, r) => s + r.total, 0).toFixed(2)}</Typography>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Typography sx={{ flex: 1, fontSize: '0.68rem', color: '#94a3b8' }}>↑↓ Navigate &middot; Enter Apply Price &middot; Double-click Select</Typography>
          <Button
            variant="contained"
            onClick={() => setTxnHistoryDialogOpen(false)}
            autoFocus
            sx={{ textTransform: 'none', borderRadius: 1.5, px: 2.5, fontWeight: 600, fontSize: '0.82rem', bgcolor: isQuotationMode ? '#db2777' : '#0f766e', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#115e59' }, boxShadow: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Profit Details Dialog (Ctrl+P) */}
      <Dialog
        open={profitDialogOpen}
        onClose={() => setProfitDialogOpen(false)}
        disableRestoreFocus
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
        TransitionProps={{ onEntered: (node) => { const btn = (node as HTMLElement).querySelector<HTMLButtonElement>('[data-confirm-btn]'); btn?.focus(); } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0.5 }}>
          <Box>
            Profit Breakdown
            <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, mt: 0.2 }}>Excluding VAT</Typography>
          </Box>
          {profitDetails.rows.length > 0 && (
            <Box sx={{
              bgcolor: profitDetails.totals.profit >= 0 ? '#f0fdf4' : '#fef2f2',
              borderRadius: 1.5, px: 1.5, py: 0.5, textAlign: 'center',
              border: `1px solid ${profitDetails.totals.profit >= 0 ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <Typography sx={{ fontSize: '0.58rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>Net Profit</Typography>
              <Typography sx={{
                fontSize: '1.05rem', fontWeight: 900, lineHeight: 1.2,
                color: profitDetails.totals.profit >= 0 ? '#16a34a' : '#dc2626',
              }}>
                {profitDetails.totals.profit >= 0 ? '+' : ''}{profitDetails.totals.profit.toFixed(2)}
              </Typography>
            </Box>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {profitDetails.rows.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>No Items Yet</Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.78rem', mt: 0.5 }}>Add products to the grid to see profit details.</Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        { label: '#', w: '6%', align: 'center' as const },
                        { label: 'Item Name', w: '34%', align: 'left' as const },
                        { label: 'Qty', w: '12%', align: 'right' as const },
                        { label: 'Price', w: '16%', align: 'right' as const },
                        { label: 'Total', w: '16%', align: 'right' as const },
                        { label: 'Profit', w: '16%', align: 'right' as const },
                      ].map((col, ci) => (
                        <TableCell key={ci} sx={{
                          bgcolor: isQuotationMode ? '#db2777' : '#0f766e', color: 'white', fontWeight: 600, fontSize: '0.72rem', width: col.w, textAlign: col.align,
                          textTransform: 'uppercase', letterSpacing: 0.3, py: 0.8, px: 1.2,
                        }}>
                          {col.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {profitDetails.rows.map((row, i) => (
                      <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? '#fff' : '#f8fafc', '&:hover': { bgcolor: '#f0fdf4' } }}>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center', px: 1.2, py: 0.8 }}>{i + 1}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 500, px: 1.2, py: 0.8 }}>{row.name}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: '#475569', px: 1.2, py: 0.8 }}>{row.qty.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: '#475569', px: 1.2, py: 0.8 }}>{row.price.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', textAlign: 'right', color: '#1e293b', fontWeight: 600, px: 1.2, py: 0.8 }}>{row.total.toFixed(2)}</TableCell>
                        <TableCell sx={{
                          fontSize: '0.8rem', textAlign: 'right', fontWeight: 700, px: 1.2, py: 0.8,
                          color: row.profit >= 0 ? '#16a34a' : '#dc2626',
                        }}>
                          {row.profit >= 0 ? '+' : ''}{row.profit.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Summary Footer */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.2, bgcolor: '#f8fafc', borderTop: '1px solid #e0e7ef' }}>
                <Box sx={{ display: 'flex', gap: 2.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Items</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: isQuotationMode ? '#db2777' : '#0f766e' }}>{profitDetails.rows.length}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Qty</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: isQuotationMode ? '#db2777' : '#0f766e' }}>{profitDetails.totals.qty.toFixed(2)}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-end' }}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Sale Total</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>{profitDetails.totals.total.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{
                    textAlign: 'right', bgcolor: profitDetails.totals.profit >= 0 ? '#f0fdf4' : '#fef2f2',
                    px: 1.5, py: 0.5, borderRadius: 1.5, border: `1px solid ${profitDetails.totals.profit >= 0 ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Profit</Typography>
                    <Typography sx={{
                      fontSize: '0.92rem', fontWeight: 900,
                      color: profitDetails.totals.profit >= 0 ? '#16a34a' : '#dc2626',
                    }}>
                      {profitDetails.totals.profit >= 0 ? '+' : ''}{profitDetails.totals.profit.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            data-confirm-btn
            onClick={() => setProfitDialogOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 1.5, px: 2.5, fontWeight: 600, fontSize: '0.82rem', bgcolor: isQuotationMode ? '#db2777' : '#0f766e', '&:hover': { bgcolor: isQuotationMode ? '#be185d' : '#115e59' }, boxShadow: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── MEDICATION INSTRUCTIONS DIALOG ── */}
      <Dialog
        open={medicationDialogOpen}
        onClose={() => setMedicationDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '10px',
            border: '1px solid #d3dcd9',
            boxShadow: '0 10px 30px rgba(10,31,28,0.12)',
            overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '10px 16px', bgcolor: '#f3f6f5', borderBottom: '1px solid #d3dcd9' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalPharmacyIcon sx={{ color: '#0f766e', fontSize: 20 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#15302e' }}>
              Medication & Dosage Instructions
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setMedicationDialogOpen(false)} sx={{ p: 0.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ p: '20px 22px 14px' }}>
          {/* DURATION */}
          <Box sx={{ mb: 1.8 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#5d716e', mb: 0.5 }}>
              Duration of Treatment:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <select
                value={
                  ['1', '2', '3', '5', '7', '10', '14', '21', '30', '60', '90'].includes(medDuration)
                    ? medDuration
                    : (medDuration ? 'custom' : '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'custom') {
                    setMedDuration(val);
                  }
                }}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#15302e',
                  outline: 'none',
                }}
              >
                <option value="">Select duration...</option>
                <option value="1">1 Day</option>
                <option value="2">2 Days</option>
                <option value="3">3 Days</option>
                <option value="5">5 Days</option>
                <option value="7">7 Days</option>
                <option value="10">10 Days</option>
                <option value="14">14 Days</option>
                <option value="21">21 Days</option>
                <option value="30">30 Days</option>
                <option value="60">60 Days</option>
                <option value="90">90 Days</option>
                {medDuration && !['1', '2', '3', '5', '7', '10', '14', '21', '30', '60', '90'].includes(medDuration) && (
                  <option value="custom">Custom ({medDuration})</option>
                )}
              </select>

              <input
                type="text"
                value={medDuration}
                placeholder="Enter days (e.g. 30)"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d+$/.test(val)) {
                    setMedDuration(val);
                  }
                }}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#15302e',
                  outline: 'none',
                }}
              />
            </Box>
          </Box>

          {/* MEDICINE TIMING */}
          <Box sx={{ mb: 1.8 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#5d716e', mb: 0.5 }}>
              Medicine Timing (Before Food / After Food):
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <select
                value={
                  ['Before Food', 'After Food', 'With Food', 'As Directed', 'Before Meals', 'After Meals', 'With Meals', 'On Empty Stomach', 'At Bedtime'].includes(medTiming)
                    ? medTiming
                    : (medTiming ? 'custom' : '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'custom') {
                    setMedTiming(val);
                  }
                }}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#15302e',
                  outline: 'none',
                }}
              >
                <option value="">Select timing...</option>
                <option value="Before Food">Before Food</option>
                <option value="After Food">After Food</option>
                <option value="With Food">With Food</option>
                <option value="As Directed">As Directed</option>
                <option value="Before Meals">Before Meals</option>
                <option value="After Meals">After Meals</option>
                <option value="With Meals">With Meals</option>
                <option value="On Empty Stomach">On Empty Stomach</option>
                <option value="At Bedtime">At Bedtime</option>
                {medTiming && !['Before Food', 'After Food', 'With Food', 'As Directed', 'Before Meals', 'After Meals', 'With Meals', 'On Empty Stomach', 'At Bedtime'].includes(medTiming) && (
                  <option value="custom">Custom ({medTiming})</option>
                )}
              </select>

              <input
                type="text"
                value={medTiming}
                placeholder="Or type custom timing"
                onChange={(e) => setMedTiming(e.target.value)}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#15302e',
                  outline: 'none',
                }}
              />
            </Box>
          </Box>

          {/* FREQUENCY / QTY PER DAY */}
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#5d716e', mb: 0.5 }}>
              Frequency / Qty Per Day:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <select
                value={
                  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(medFrequency)
                    ? medFrequency
                    : (medFrequency && parseFloat(medFrequency) > 9 ? 'more_than_9' : (medFrequency ? 'custom' : ''))
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'more_than_9') {
                    setMedFrequency((prev) => {
                      const n = parseFloat(prev);
                      return !isNaN(n) && n > 9 ? prev : '10';
                    });
                  } else if (val === 'custom') {
                    // keep current
                  } else {
                    setMedFrequency(val);
                  }
                }}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#15302e',
                  outline: 'none',
                }}
              >
                <option value="">Select frequency...</option>
                <option value="1">1 time daily (q.d.)</option>
                <option value="2">2 times daily (b.i.d.)</option>
                <option value="3">3 times daily (t.i.d.)</option>
                <option value="4">4 times daily (q.i.d.)</option>
                <option value="5">5 times daily</option>
                <option value="6">6 times daily</option>
                <option value="7">7 times daily</option>
                <option value="8">8 times daily</option>
                <option value="9">9 times daily</option>
                <option value="more_than_9">More than 9 (&gt; 9)</option>
              </select>

              <input
                type="text"
                value={medFrequency}
                placeholder="Enter value (e.g. 1, 2, 2.5)"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setMedFrequency(val);
                  }
                }}
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#15302e',
                  outline: 'none',
                }}
              />
            </Box>
          </Box>

          {/* INSTRUCTION SUMMARY CARD */}
          <Box
            sx={{
              bgcolor: '#f8faf9',
              border: '1px solid #d3dcd9',
              borderRadius: '8px',
              p: '12px 14px',
            }}
          >
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#5d716e', mb: 0.3 }}>
              Instruction Summary:
            </Typography>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#15302e' }}>
              {medInstructionSummary}
            </Typography>
          </Box>
        </Box>

        {/* DIALOG ACTIONS FOOTER */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: '12px 20px',
            borderTop: '1px solid #d3dcd9',
            bgcolor: '#f3f6f5',
          }}
        >
          <Button
            variant="contained"
            onClick={handleSaveMedInstructions}
            sx={{
              bgcolor: '#0f766e',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13.5,
              height: 38,
              px: 3,
              borderRadius: '7px',
              '&:hover': { bgcolor: '#0b5650' },
            }}
          >
            Save Instructions
          </Button>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={handleClearMedInstructions}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#fca5a5',
                color: '#ef4444',
                height: 38,
                px: 2.2,
                borderRadius: '7px',
                '&:hover': { borderColor: '#ef4444', bgcolor: '#fef2f2' },
              }}
            >
              Clear
            </Button>
            <Button
              variant="outlined"
              onClick={() => setMedicationDialogOpen(false)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#d3dcd9',
                color: '#5d716e',
                height: 38,
                px: 2.2,
                borderRadius: '7px',
                '&:hover': { borderColor: '#b7c5c2', bgcolor: '#fff' },
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* ── RIAYATI E-PRESCRIPTION & SUBMISSION DIALOG ── */}
      <Dialog
        open={riayatiDialogOpen}
        onClose={() => setRiayatiDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '10px',
            border: '1px solid #d3dcd9',
            boxShadow: '0 10px 30px rgba(10,31,28,0.12)',
            overflow: 'hidden',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '10px 16px', bgcolor: '#f3f6f5', borderBottom: '1px solid #d3dcd9' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalPharmacyIcon sx={{ color: '#0f766e', fontSize: 22 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#15302e' }}>
              Riayati e-Prescription & Submission
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setRiayatiDialogOpen(false)} sx={{ p: 0.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ p: '18px 22px' }}>
          {/* Riayati Enablement Banner */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              mb: 2.5,
              borderRadius: 2,
              bgcolor: isRiayati ? '#f0fdfa' : '#f8fafc',
              border: isRiayati ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => setIsRiayati(!isRiayati)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
              <input
                type="checkbox"
                checked={isRiayati}
                onChange={(e) => setIsRiayati(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: '#0f766e', width: 18, height: 18 }}
              />
              <Box>
                <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: isRiayati ? '#0f766e' : '#334155' }}>
                  Enable Riayati HL7 e-Rx Submission
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                  Transmits ADT^A04 (patient admission), RDS^O13 (dispense order), and ADT^A03 upon invoice save.
                </Typography>
              </Box>
            </Box>
            <Chip
              label={isRiayati ? 'E-Rx ACTIVE' : 'OFF'}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.70rem',
                bgcolor: isRiayati ? '#0f766e' : '#e2e8f0',
                color: isRiayati ? '#ffffff' : '#64748b',
              }}
            />
          </Box>

          <Grid container spacing={2}>
            {/* Emirates ID */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Emirates ID"
                placeholder="784-YYYY-NNNNNNN-C"
                value={emiratesId}
                onChange={(e) => handleEmiratesIdChange(e.target.value)}
                onKeyDown={handleEmiratesIdKeyDown}
                inputProps={{ maxLength: 18 }}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  endAdornment: patSearchLoading ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} sx={{ color: '#0f766e' }} />
                    </InputAdornment>
                  ) : (
                    <InputAdornment position="end">
                      <Tooltip title="Search Patient by Emirates ID">
                        <IconButton size="small" onClick={() => handleSearchPatientByEid(emiratesId)}>
                          <SearchIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
                helperText="Format: 784-YYYY-NNNNNNN-C (Auto-formatted, press Enter or click search to lookup)"
              />
            </Grid>

            {/* Patient Name */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Autocomplete
                  fullWidth
                  size="small"
                  freeSolo
                  options={patients.map((p) => p.fullName)}
                  value={selectedPatient}
                  onChange={(_, val) => handlePatientSelect(val)}
                  onInputChange={(_, val, reason) => {
                    if (reason === 'input') {
                      setSelectedPatient(val);
                      const found = patients.find(
                        (p) =>
                          (p.fullName || '').toLowerCase() === val.toLowerCase() ||
                          `${p.firstName || ''} ${p.familyName || ''}`.trim().toLowerCase() === val.toLowerCase()
                      );
                      if (found) {
                        if (found.emiratesId) setEmiratesId(formatEmiratesId(found.emiratesId));
                        setIsRiayati(true);
                      }
                    } else if (reason === 'reset' && val) {
                      handlePatientSelect(val);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Patient Name"
                      placeholder="Select or enter patient name"
                      InputLabelProps={{ shrink: true }}
                    />
                  )}
                />
                <Tooltip title="Add / Edit Patient Details">
                  <IconButton
                    size="small"
                    onClick={handleOpenPatientDialog}
                    sx={{
                      p: 0.9,
                      borderRadius: 1.5,
                      border: '1px solid #cbd5e1',
                      bgcolor: '#f8fafc',
                      color: '#0f766e',
                      '&:hover': { bgcolor: '#e2ece9' },
                    }}
                  >
                    <AddIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            {/* Prescribing Doctor */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Autocomplete
                  fullWidth
                  size="small"
                  freeSolo
                  options={doctors.map((d) => d.name)}
                  value={selectedDoctor}
                  onInputChange={(_, val) => setSelectedDoctor(val)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Prescribing Doctor"
                      placeholder="Select or enter doctor name"
                      InputLabelProps={{ shrink: true }}
                    />
                  )}
                />
                <Tooltip title="Add / Edit Doctor Details">
                  <IconButton
                    size="small"
                    onClick={handleOpenDoctorDialog}
                    sx={{
                      p: 0.9,
                      borderRadius: 1.5,
                      border: '1px solid #cbd5e1',
                      bgcolor: '#f8fafc',
                      color: '#0f766e',
                      '&:hover': { bgcolor: '#e2ece9' },
                    }}
                  >
                    <AddIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            {/* Prescription No & Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Prescription No."
                placeholder="e.g. RX-1002"
                value={prescriptionNumber}
                onChange={(e) => setPrescriptionNumber(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DateInput
                fullWidth
                size="small"
                label="Prescription Date"
                value={prescriptionDate || date || getCurrentDate()}
                onChange={(d) => setPrescriptionDate(d)}
              />
            </Grid>

            {/* Prescription Items Summary */}
            <Grid item xs={12}>
              <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Typography sx={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155', mb: 0.5 }}>
                  Prescription (Rx) Items in Invoice ({lines.filter((l) => l.isRx).length}):
                </Typography>
                {lines.filter((l) => l.isRx).length === 0 ? (
                  <Typography sx={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    No items marked as Rx yet. Click the "Rx" button next to any item in the grid to configure dosage instructions.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap', mt: 0.5 }}>
                    {lines
                      .filter((l) => l.isRx)
                      .map((l, idx) => (
                        <Chip
                          key={l.id || idx}
                          label={`${l.name || 'Item'} (${l.quantity} ${l.unitName || 'Units'}) · ${l.duration || '30'} ${l.dosageInstructions?.durationUnit || 'Days'} · ${l.timing || 'Before Food'} · ${l.frequency || '1'}x`}
                          size="small"
                          sx={{ fontSize: '0.70rem', bgcolor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                          variant="outlined"
                        />
                      ))}
                  </Box>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* Dialog Actions Footer */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: '12px 20px',
            borderTop: '1px solid #d3dcd9',
            bgcolor: '#f3f6f5',
          }}
        >
          <Button
            variant="contained"
            onClick={() => setRiayatiDialogOpen(false)}
            sx={{
              bgcolor: '#0f766e',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13.5,
              height: 38,
              px: 3,
              borderRadius: '7px',
              '&:hover': { bgcolor: '#0b5650' },
            }}
          >
            Apply & Done
          </Button>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setEmiratesId('');
                setSelectedPatient('');
                setSelectedDoctor('');
                setPrescriptionNumber('');
                setPrescriptionDate('');
                setIsRiayati(false);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#fca5a5',
                color: '#ef4444',
                height: 38,
                px: 2,
                borderRadius: '7px',
                '&:hover': { borderColor: '#ef4444', bgcolor: '#fef2f2' },
              }}
            >
              Clear Riayati
            </Button>
            <Button
              variant="outlined"
              onClick={() => setRiayatiDialogOpen(false)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#d3dcd9',
                color: '#5d716e',
                height: 38,
                px: 2,
                borderRadius: '7px',
                '&:hover': { borderColor: '#b7c5c2', bgcolor: '#fff' },
              }}
            >
              Close
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* ── DOCTOR DETAILS DIALOG ── */}
      <Dialog
        open={doctorDialogOpen}
        onClose={handleCloseDoctorDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '10px',
            border: '1px solid #d3dcd9',
            boxShadow: '0 10px 30px rgba(10,31,28,0.12)',
            overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '8px 12px', bgcolor: '#f3f6f5', borderBottom: '1px solid #d3dcd9' }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#5d716e' }}>Doctor Details</Typography>
          <IconButton size="small" onClick={handleCloseDoctorDialog} sx={{ p: 0.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ p: '20px 22px 14px' }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#15302e', letterSpacing: '-0.01em' }}>
            Prescribing doctor
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#5d716e', mb: 2 }}>
            Choose a saved doctor or add a new one.
          </Typography>

          {/* Segment Toggle */}
          <Box sx={{ display: 'inline-flex', p: '3px', bgcolor: '#f3f6f5', border: '1px solid #d3dcd9', borderRadius: '8px', mb: 2 }}>
            <button
              type="button"
              onClick={() => setDocTab('saved')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '5px 14px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                background: docTab === 'saved' ? '#fff' : 'transparent',
                color: docTab === 'saved' ? '#15302e' : '#5d716e',
                boxShadow: docTab === 'saved' ? '0 1px 3px rgba(10,31,28,0.18)' : 'none',
              }}
            >
              Saved doctor
            </button>
            <button
              type="button"
              onClick={() => setDocTab('new')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '5px 14px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                background: docTab === 'new' ? '#fff' : 'transparent',
                color: docTab === 'new' ? '#15302e' : '#5d716e',
                boxShadow: docTab === 'new' ? '0 1px 3px rgba(10,31,28,0.18)' : 'none',
              }}
            >
              New doctor
            </button>
          </Box>

          {docTab === 'saved' ? (
            <Box sx={{ mb: 1.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>Doctor</Typography>
              <select
                value={docFormSavedSelect}
                onChange={(e) => {
                  const val = e.target.value;
                  setDocFormSavedSelect(val);
                  if (!val) {
                    setDocFormName('');
                    setDocFormLic('');
                    setDocFormPhone('');
                    setDocFormSpecialty('');
                    return;
                  }
                  const found = doctors.find((d) => d.name === val);
                  if (found) {
                    setDocFormName(found.name);
                    setDocFormLic(found.licenseNumber);
                    if (found.licensingAuthority) setDocFormProv(found.licensingAuthority as any);
                    setDocFormPhone(found.phone || '');
                    setDocFormSpecialty(found.specialty || '');
                  }
                }}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  color: '#15302e',
                  outline: 'none',
                }}
              >
                <option value="">{doctors.length === 0 ? 'No saved doctors' : 'Select a doctor'}</option>
                {doctors.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.licensingAuthority || 'MOHAP'}: {d.licenseNumber})
                  </option>
                ))}
              </select>

              {docFormSavedSelect && (() => {
                const found = doctors.find((d) => d.name === docFormSavedSelect);
                if (!found) return null;
                return (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f8faf9', border: '1px solid #e2ece9', borderRadius: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f6b62' }}>{found.name}</Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mt: 0.75, fontSize: 12, color: '#4b5f5c' }}>
                      <div><strong>License:</strong> {found.licensingAuthority || 'MOHAP'}: {found.licenseNumber}</div>
                      {found.specialty && <div><strong>Specialty:</strong> {found.specialty}</div>}
                      {found.phone && <div><strong>Phone:</strong> {found.phone}</div>}
                    </Box>
                  </Box>
                );
              })()}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>
                  Doctor name <span style={{ color: '#b42318' }}>*</span>
                </Typography>
                <input
                  value={docFormName}
                  onChange={(e) => {
                    setDocFormName(e.target.value);
                    setSelectedDoctor(e.target.value);
                    setDocIsOpenAsUnsaved(true);
                  }}
                  placeholder="e.g. Dr. Rashid Khan"
                  style={{
                    width: '100%',
                    height: 38,
                    padding: '0 11px',
                    borderRadius: 7,
                    border: '1px solid #d3dcd9',
                    background: '#fff',
                    font: 'inherit',
                    color: '#15302e',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>
                    License number <span style={{ color: '#b42318' }}>*</span>
                  </Typography>
                  <input
                    value={docFormLic}
                    onChange={(e) => setDocFormLic(e.target.value)}
                    placeholder="e.g. 84920"
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 11px',
                      borderRadius: 7,
                      border: '1px solid #d3dcd9',
                      background: '#fff',
                      font: 'inherit',
                      color: '#15302e',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>
                    Licensing authority
                  </Typography>
                  <select
                    value={docFormProv}
                    onChange={(e) => setDocFormProv(e.target.value as any)}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 11px',
                      borderRadius: 7,
                      border: '1px solid #d3dcd9',
                      background: '#fff',
                      font: 'inherit',
                      color: '#15302e',
                      outline: 'none',
                    }}
                  >
                    <option value="MOHAP">MOHAP</option>
                    <option value="DHA">DHA</option>
                    <option value="DOH">DOH</option>
                  </select>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>
                    Phone (Optional)
                  </Typography>
                  <input
                    value={docFormPhone}
                    onChange={(e) => setDocFormPhone(e.target.value)}
                    placeholder="+971 5X XXX XXXX"
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 11px',
                      borderRadius: 7,
                      border: '1px solid #d3dcd9',
                      background: '#fff',
                      font: 'inherit',
                      color: '#15302e',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>
                    Specialty (Optional)
                  </Typography>
                  <input
                    value={docFormSpecialty}
                    onChange={(e) => setDocFormSpecialty(e.target.value)}
                    placeholder="e.g. General Medicine, Cardiology"
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 11px',
                      borderRadius: 7,
                      border: '1px solid #d3dcd9',
                      background: '#fff',
                      font: 'inherit',
                      color: '#15302e',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </Box>
              </Box>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '14px 22px', borderTop: '1px solid #d3dcd9', bgcolor: '#f3f6f5' }}>
          <Typography sx={{ fontSize: 12.5, color: '#5d716e' }}>
            {docTab === 'saved'
              ? (docFormSavedSelect ? 'Doctor selected. Ready to choose.' : (doctors.length === 0 ? 'No saved doctors found.' : 'Select a doctor.'))
              : (!docFormName.trim() || !docFormLic.trim() ? 'Fill in doctor name and license number to save.' : 'Ready to save.')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {docTab === 'saved' ? (
              <>
                <Button
                  onClick={handleCloseDoctorDialog}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#5d716e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#d3dcd9' },
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!docFormSavedSelect}
                  onClick={handleSelectSavedDoctor}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #0f766e',
                    bgcolor: '#0f766e',
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#0b5650', borderColor: '#0b5650' },
                  }}
                >
                  Select doctor
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setDocFormName('');
                    setDocFormLic('');
                    setDocFormPhone('');
                    setDocFormSpecialty('');
                  }}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#15302e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#d3dcd9' },
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={handleCloseDoctorDialog}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#5d716e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#d3dcd9' },
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveDoctor}
                  disabled={!docFormName.trim() || !docFormLic.trim()}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #0f766e',
                    bgcolor: '#0f766e',
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#0b5650', borderColor: '#0b5650' },
                  }}
                >
                  Save doctor
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Dialog>

      {/* ── PATIENT DETAILS DIALOG ── */}
      <Dialog
        open={patientDialogOpen}
        onClose={handleClosePatientDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '10px',
            border: '1px solid #d3dcd9',
            boxShadow: '0 10px 30px rgba(10,31,28,0.12)',
            overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '8px 12px', bgcolor: '#f3f6f5', borderBottom: '1px solid #d3dcd9' }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#5d716e' }}>Patient Details</Typography>
          <IconButton size="small" onClick={handleClosePatientDialog} sx={{ p: 0.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ p: '20px 22px 14px', maxHeight: '72vh', overflowY: 'auto' }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#15302e', letterSpacing: '-0.01em' }}>
            Patient details
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#5d716e', mb: 2 }}>
            Choose a saved patient or enter new patient details.
          </Typography>

          {/* Segment Toggle */}
          <Box sx={{ display: 'inline-flex', p: '3px', bgcolor: '#f3f6f5', border: '1px solid #d3dcd9', borderRadius: '8px', mb: 2 }}>
            <button
              type="button"
              onClick={() => setPatTab('saved')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '5px 14px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                background: patTab === 'saved' ? '#fff' : 'transparent',
                color: patTab === 'saved' ? '#15302e' : '#5d716e',
                boxShadow: patTab === 'saved' ? '0 1px 3px rgba(10,31,28,0.18)' : 'none',
              }}
            >
              Saved patient
            </button>
            <button
              type="button"
              onClick={() => setPatTab('new')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '5px 14px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                background: patTab === 'new' ? '#fff' : 'transparent',
                color: patTab === 'new' ? '#15302e' : '#5d716e',
                boxShadow: patTab === 'new' ? '0 1px 3px rgba(10,31,28,0.18)' : 'none',
              }}
            >
              New patient
            </button>
          </Box>

          {patTab === 'saved' ? (
            <Box sx={{ mb: 1.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.5 }}>Select Patient</Typography>
              <select
                value={patFormSavedSelect}
                onChange={(e) => {
                  const val = e.target.value;
                  setPatFormSavedSelect(val);
                  if (!val) {
                    setPatFormEid('');
                    setPatFormFirst('');
                    setPatFormFamily('');
                    setPatFormDob('');
                    setPatFormGender('Unknown');
                    setPatFormMrn('');
                    setPatFormPhone('');
                    setPatFormLang('English');
                    setPatFormEmirate('');
                    setPatFormCity('');
                    setPatFormStreet('');
                    setPatFormCountry('United Arab Emirates');
                    return;
                  }
                  const found = patients.find((p) => p.fullName === val);
                  if (found) {
                    setPatFormEid(found.emiratesId || '');
                    setPatFormFirst(found.firstName || found.fullName);
                    setPatFormFamily(found.familyName || '');
                    setPatFormDob(found.dob || '');
                    setPatFormGender(found.gender || 'Unknown');
                    setPatFormMrn(found.mrn || '');
                    setPatFormPhone(found.phone || '');
                    setPatFormLang(found.language || 'English');
                    setPatFormEmirate(found.emirate || '');
                    setPatFormCity(found.city || '');
                    setPatFormStreet(found.street || '');
                    setPatFormCountry(found.country || 'United Arab Emirates');
                  }
                }}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d3dcd9',
                  background: '#fff',
                  font: 'inherit',
                  color: '#15302e',
                  outline: 'none',
                }}
              >
                <option value="">Select a saved patient</option>
                {patients.map((p) => (
                  <option key={p.fullName} value={p.fullName}>
                    {p.fullName} {p.emiratesId ? `(EID: ${p.emiratesId})` : ''} {p.mrn ? `· MRN: ${p.mrn}` : ''}
                  </option>
                ))}
              </select>

              {patFormSavedSelect && (() => {
                const found = patients.find((p) => p.fullName === patFormSavedSelect);
                if (!found) return null;
                return (
                  <Box sx={{ mt: 1.5, p: 2, bgcolor: '#f8faf9', border: '1px solid #e2ece9', borderRadius: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#0f6b62' }}>
                        {found.fullName}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          setPatFormEid(found.emiratesId || '');
                          setPatFormFirst(found.firstName || found.fullName);
                          setPatFormFamily(found.familyName || '');
                          setPatFormDob(found.dob || '');
                          setPatFormGender(found.gender || 'Unknown');
                          setPatFormMrn(found.mrn || '');
                          setPatFormPhone(found.phone || '');
                          setPatFormLang(found.language || 'English');
                          setPatFormEmirate(found.emirate || '');
                          setPatFormCity(found.city || '');
                          setPatFormStreet(found.street || '');
                          setPatFormCountry(found.country || 'United Arab Emirates');
                          setPatTab('new');
                        }}
                        startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />}
                        sx={{
                          textTransform: 'none',
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: '#0f766e',
                          bgcolor: '#fff',
                          border: '1px solid #d3dcd9',
                          borderRadius: '6px',
                          height: 26,
                          px: 1,
                          '&:hover': { bgcolor: '#f3f6f5' },
                        }}
                      >
                        Edit
                      </Button>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1, fontSize: 12.5, color: '#4b5f5c' }}>
                      <div><strong>Emirates ID:</strong> {found.emiratesId || 'N/A'}</div>
                      <div><strong>MRN:</strong> {found.mrn || 'N/A'}</div>
                      <div><strong>Phone:</strong> {found.phone || 'N/A'}</div>
                      <div><strong>Gender / DOB:</strong> {found.gender || 'Unknown'}{found.dob ? ` (${found.dob})` : ''}</div>
                      <div><strong>Language:</strong> {found.language || 'English'}</div>
                      <div><strong>City / Emirate:</strong> {[found.city, found.emirate].filter(Boolean).join(', ') || 'N/A'}</div>
                    </Box>
                  </Box>
                );
              })()}
            </Box>
          ) : (
            <>
              {/* Fieldset: Identity */}
              <Box component="fieldset" sx={{ border: 'none', p: 0, m: '0 0 16px' }}>
                <Typography component="legend" sx={{ fontWeight: 600, fontSize: 13, color: '#15302e', mb: 1 }}>
                  Identity
                </Typography>
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>
                    Emirates ID
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <input
                      value={patFormEid}
                      onChange={(e) => handleEmiratesIdChange(e.target.value)}
                      onKeyDown={handleEmiratesIdKeyDown}
                      placeholder="784-0000-0000000-0"
                      maxLength={18}
                      style={{
                        flex: 1,
                        height: 38,
                        padding: '0 11px',
                        borderRadius: 7,
                        border: '1px solid #d3dcd9',
                        background: '#fff',
                        font: 'inherit',
                        outline: 'none',
                      }}
                    />
                    <Button
                      variant="outlined"
                      onClick={handleSearchPatientByEid}
                      disabled={patSearchLoading}
                      sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#d3dcd9', color: '#15302e', height: 38 }}
                    >
                      {patSearchLoading ? <CircularProgress size={16} /> : 'Search'}
                    </Button>
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>
                      First name <span style={{ color: '#b42318' }}>*</span>
                    </Typography>
                    <input
                      value={patFormFirst}
                      onChange={(e) => {
                        setPatFormFirst(e.target.value);
                        setSelectedPatient(e.target.value);
                        setPatIsOpenAsUnsaved(true);
                      }}
                      style={{
                        width: '100%',
                        height: 38,
                        padding: '0 11px',
                        borderRadius: 7,
                        border: '1px solid #d3dcd9',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>
                      Family name
                    </Typography>
                    <input
                      value={patFormFamily}
                      onChange={(e) => setPatFormFamily(e.target.value)}
                      style={{
                        width: '100%',
                        height: 38,
                        padding: '0 11px',
                        borderRadius: 7,
                        border: '1px solid #d3dcd9',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Date of birth</Typography>
                    <input
                      type="date"
                      value={patFormDob}
                      onChange={(e) => setPatFormDob(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Gender</Typography>
                    <select
                      value={patFormGender}
                      onChange={(e) => setPatFormGender(e.target.value as any)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', outline: 'none' }}
                    >
                      <option value="Unknown">Unknown</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </select>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>MRN</Typography>
                    <input
                      value={patFormMrn}
                      onChange={(e) => setPatFormMrn(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </Box>
                </Box>
              </Box>

              {/* Fieldset: Contact & Address */}
              <Box component="fieldset" sx={{ border: 'none', p: 0, m: 0 }}>
                <Typography component="legend" sx={{ fontWeight: 600, fontSize: 13, color: '#15302e', mb: 1 }}>
                  Contact and address
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Phone</Typography>
                    <input
                      type="tel"
                      placeholder="+971 5X XXX XXXX"
                      value={patFormPhone}
                      onChange={(e) => setPatFormPhone(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Language</Typography>
                    <select
                      value={patFormLang}
                      onChange={(e) => setPatFormLang(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', outline: 'none' }}
                    >
                      <option value="Arabic">Arabic</option>
                      <option value="English">English</option>
                      <option value="Urdu">Urdu</option>
                      <option value="Hindi">Hindi</option>
                    </select>
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Emirate</Typography>
                    <select
                      value={patFormEmirate}
                      onChange={(e) => setPatFormEmirate(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', outline: 'none' }}
                    >
                      <option value="">Select</option>
                      <option value="Abu Dhabi">Abu Dhabi</option>
                      <option value="Dubai">Dubai</option>
                      <option value="Sharjah">Sharjah</option>
                      <option value="Ajman">Ajman</option>
                      <option value="Umm Al Quwain">Umm Al Quwain</option>
                      <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                      <option value="Fujairah">Fujairah</option>
                    </select>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>City</Typography>
                    <input
                      value={patFormCity}
                      onChange={(e) => setPatFormCity(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Street address</Typography>
                    <input
                      value={patFormStreet}
                      onChange={(e) => setPatFormStreet(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: '#5d716e', mb: 0.4 }}>Country</Typography>
                    <select
                      value={patFormCountry}
                      onChange={(e) => setPatFormCountry(e.target.value)}
                      style={{ width: '100%', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid #d3dcd9', outline: 'none' }}
                    >
                      <option value="United Arab Emirates">United Arab Emirates</option>
                      <option value="Other">Other</option>
                    </select>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '14px 22px', borderTop: '1px solid #d3dcd9', bgcolor: '#f3f6f5' }}>
          <Typography sx={{ fontSize: 12.5, color: '#5d716e' }}>
            {patTab === 'saved'
              ? (patFormSavedSelect ? 'Patient selected. Ready to choose or edit.' : 'Select a patient or edit details.')
              : (!patFormFirst.trim() ? 'First name is required to save.' : 'Ready to save.')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {patTab === 'saved' ? (
              <>
                <Button
                  onClick={handleClosePatientDialog}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#5d716e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#d3dcd9' },
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!patFormSavedSelect}
                  onClick={() => {
                    const found = patients.find((p) => p.fullName === patFormSavedSelect);
                    if (found) {
                      setPatFormEid(found.emiratesId || '');
                      setPatFormFirst(found.firstName || found.fullName);
                      setPatFormFamily(found.familyName || '');
                      setPatFormDob(found.dob || '');
                      setPatFormGender(found.gender || 'Unknown');
                      setPatFormMrn(found.mrn || '');
                      setPatFormPhone(found.phone || '');
                      setPatFormLang(found.language || 'English');
                      setPatFormEmirate(found.emirate || '');
                      setPatFormCity(found.city || '');
                      setPatFormStreet(found.street || '');
                      setPatFormCountry(found.country || 'United Arab Emirates');
                      setPatTab('new');
                    }
                  }}
                  startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#15302e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#c6d2cf' },
                  }}
                >
                  Edit patient
                </Button>
                <Button
                  disabled={!patFormSavedSelect}
                  onClick={handleSelectSavedPatient}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #0f766e',
                    bgcolor: '#0f766e',
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#0b5650', borderColor: '#0b5650' },
                  }}
                >
                  Select patient
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setPatFormFirst('');
                    setPatFormFamily('');
                    setPatFormEid('');
                    setPatFormDob('');
                    setPatFormMrn('');
                    setPatFormPhone('');
                    setPatFormCity('');
                    setPatFormStreet('');
                  }}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#15302e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#d3dcd9' },
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={handleClosePatientDialog}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#5d716e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#d3dcd9' },
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditPatient}
                  disabled={!patFormFirst.trim()}
                  startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #d3dcd9',
                    bgcolor: '#fff',
                    color: '#15302e',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#f3f6f5', borderColor: '#c6d2cf' },
                  }}
                >
                  Edit patient
                </Button>
                <Button
                  onClick={handleSavePatient}
                  disabled={!patFormFirst.trim()}
                  sx={{
                    textTransform: 'none',
                    height: 38,
                    borderRadius: '7px',
                    px: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #0f766e',
                    bgcolor: '#0f766e',
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#0b5650', borderColor: '#0b5650' },
                  }}
                >
                  Save patient
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
