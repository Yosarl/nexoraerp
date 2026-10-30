import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Tooltip,
  CircularProgress,
  Chip,
  Autocomplete,
  TextField,
  Badge,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Search as SearchIcon,
  QrCodeScanner as QrCodeScannerIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  DeleteOutline as DeleteOutlineIcon,
  Print as PrintIcon,
  RestartAlt as RestartAltIcon,
  LocalPharmacy as LocalPharmacyIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  EditOutlined as EditOutlinedIcon,
  WarningAmber as WarningIcon,
  PauseCircleOutline as HoldIcon,
  PlaylistPlay as HoldListIcon,
  Restore as RestoreIcon,
  KeyboardDoubleArrowLeft as FirstIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
  KeyboardDoubleArrowRight as LastIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { productApi, salesApi, ledgerAccountApi, userApi, purchaseApi, stockApi, type B2CInvoiceInput } from '../services/api';
import { formatDateDisplay } from '../components/DateInput';

interface POSCartLine {
  productId: string;
  name: string;
  code?: string;
  genericName?: string;
  isRx?: boolean;
  batchNumber: string;
  expiryDate: string;
  availableBatches?: Array<{
    batchNumber: string;
    expiryDate: string;
    quantity?: number;
    retail?: number;
  }>;
  unit?: string;
  unitId?: string;
  availableUnits?: Array<{
    id: string;
    name: string;
    price: number;
    conversion?: number;
    isMultiUnit: boolean;
  }>;
  quantity: number;
  availableStock?: number;
  unitPrice: number;
  basePrice?: number;
  vatRate: number;
  discount: number;
  totalAmount: number;
  dosageInstructions?: {
    duration: string;
    durationUnit: string;
    timing: string;
    frequency: string;
    summary: string;
  };
}

interface CustomerOption {
  _id: string;
  name: string;
  code?: string;
  phone?: string;
  address?: string;
  type: string;
}

interface DoctorItem {
  _id?: string;
  name: string;
  licenseNumber: string;
  licensingAuthority?: string;
  phone?: string;
  specialty?: string;
}

interface PatientItem {
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

const DEFAULT_DOCTORS: DoctorItem[] = [];

interface HeldPOSInvoice {
  id: string;
  heldAt: string;
  invoiceNo: string;
  date: string;
  itemCount: number;
  total: number;
  lines: POSCartLine[];
  customerName?: string;
  selectedCustomer?: CustomerOption | null;
  selectedSalesmanId?: string;
  emiratesId?: string;
  patientName?: string;
  doctorName?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  isRiayati?: boolean;
  discountAED?: number;
  paymentMode?: 'Cash' | 'Card' | 'Split';
  splitCashAmount?: string;
  splitCardAmount?: string;
}

const POS_HOLD_STORAGE_KEY = 'pos_heldInvoices';

function loadHeldPOSInvoices(): HeldPOSInvoice[] {
  try {
    const data = localStorage.getItem(POS_HOLD_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHeldPOSInvoices(invoices: HeldPOSInvoice[]): void {
  localStorage.setItem(POS_HOLD_STORAGE_KEY, JSON.stringify(invoices));
}

export default function POS() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);
  const currentUser = useAppSelector((s) => s.auth.user);

  // Header & POS Metadata
  const [invoiceNo, setInvoiceNo] = useState<string>('INV-0001');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  });

  const [salesmen, setSalesmen] = useState<Array<{ _id: string; fullName?: string; username: string }>>([]);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string>('');

  // Customer & Cash in Hand (like Sales B2C)
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const isCashInHandCustomer = !selectedCustomer || selectedCustomer.type === 'Cash' || selectedCustomer._id === 'cash_in_hand_default';

  // Cart & Items
  const [lines, setLines] = useState<POSCartLine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownListRef = useRef<HTMLDivElement>(null);


  // Stock Alert Dialog state (matches Sales Invoice procedure)
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertMessage, setStockAlertMessage] = useState('');

  // Right Sidebar / Patient, Doctor & Payment
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Card' | 'Split'>('Split');
  const [emiratesId, setEmiratesId] = useState('');
  const [isRiayati, setIsRiayati] = useState(false);
  const [discountAED, setDiscountAED] = useState<number>(0);

  // Payment Dialog state (styled from DESIGN NEW WINDOW DETAILS/POS payment window.html)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  // Split payment state (Cash + Card together)
  const [splitCashAmount, setSplitCashAmount] = useState<string>('0');
  const [splitCardAmount, setSplitCardAmount] = useState<string>('0');
  const [splitCardApproval, setSplitCardApproval] = useState<string>('');
  const splitCardInputRef = useRef<HTMLInputElement>(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paymentDoneInfo, setPaymentDoneInfo] = useState<{
    title: string;
    subtitle: string;
    invoiceNo: string;
    change: number;
  } | null>(null);

  // Doctor List & Selection
  const [doctors, setDoctors] = useState<DoctorItem[]>(DEFAULT_DOCTORS);
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [doctorDialogOpen, setDoctorDialogOpen] = useState(false);

  // Patient List & Selection
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [patientDialogOpen, setPatientDialogOpen] = useState(false);

  // Holds & Held Invoices State (matches Sales Window)
  const [heldInvoices, setHeldInvoices] = useState<HeldPOSInvoice[]>(() => loadHeldPOSInvoices());
  const [holdListDialogOpen, setHoldListDialogOpen] = useState(false);

  const routeLocation = useLocation();
  const navigate = useNavigate();

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [lastInvoiceSummary, setLastInvoiceSummary] = useState<{ invoiceNo: string; totalAmount: number; date: string } | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  // Invoice state for Save / Edit / Delete / Print / Search (Matches Sales Window)
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editSuccessDialogOpen, setEditSuccessDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInvoiceNo, setSearchInvoiceNo] = useState('');
  const [isSearchingInvoice, setIsSearchingInvoice] = useState(false);
  const [invoiceIds, setInvoiceIds] = useState<string[]>([]);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [recentInvoices, setRecentInvoices] = useState<Array<{
    _id: string;
    invoiceNo: string;
    date?: string;
    customerName?: string;
    grandTotal?: number;
    totalAmount?: number;
  }>>([]);
  const [isLoadingRecentInvoices, setIsLoadingRecentInvoices] = useState(false);

  // Prescription fields (saves with invoice)
  const [prescriptionNumber, setPrescriptionNumber] = useState<string>('');
  const [prescriptionDate, setPrescriptionDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const rxDateRef = useRef<HTMLInputElement>(null);

  // Card Account state
  const [cardAccounts, setCardAccounts] = useState<CustomerOption[]>([]);
  const [selectedCardAccountId, setSelectedCardAccountId] = useState<string>('');

  // Doctor Dialog Form State
  const [docTab, setDocTab] = useState<'saved' | 'new'>('saved');
  const [docFormName, setDocFormName] = useState('');
  const [docFormSavedSelect, setDocFormSavedSelect] = useState('');
  const [docFormLic, setDocFormLic] = useState('');
  const [docFormProv, setDocFormProv] = useState<'MOHAP' | 'DHA' | 'DOH'>('MOHAP');
  const [docFormPhone, setDocFormPhone] = useState('');
  const [docFormSpecialty, setDocFormSpecialty] = useState('');
  const [docIsOpenAsUnsaved, setDocIsOpenAsUnsaved] = useState(false);

  // Patient Dialog Form State
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
  const [patIsOpenAsUnsaved, setPatIsOpenAsUnsaved] = useState(false);
  const [patSearchLoading, setPatSearchLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Medication Details Dialog State
  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [selectedMedLineIndex, setSelectedMedLineIndex] = useState<number | null>(null);
  const [medDuration, setMedDuration] = useState<string>('5');
  const [medDurationUnit, setMedDurationUnit] = useState<'Days' | 'Weeks' | 'Months'>('Days');
  const [medTiming, setMedTiming] = useState<string>('After Meals');
  const [medFrequency, setMedFrequency] = useState<string>('1');

  // Unit lookup dictionary
  const [unitsMap, setUnitsMap] = useState<Record<string, string>>({});

  // Load next invoice number
  const loadNextInvoiceNo = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      const res = await salesApi.getNextPOSInvoiceNo(companyId, financialYearId);
      if (res.data?.data?.invoiceNo) {
        setInvoiceNo(res.data.data.invoiceNo);
      }
    } catch {
      setInvoiceNo('INV-0001');
    }
  }, [companyId, financialYearId]);

  // Load invoice IDs for POS navigation (matches Sales window navigation)
  const loadInvoiceIds = useCallback(async () => {
    if (!companyId || !financialYearId) return;
    try {
      setIsLoadingRecentInvoices(true);
      const res = await salesApi.listB2C(companyId, financialYearId, { limit: 10000, type: 'POS' });
      const invoices = (res.data?.data?.invoices || []) as Array<{
        _id: string;
        invoiceNo: string;
        date?: string;
        customerName?: string;
        grandTotal?: number;
        totalAmount?: number;
      }>;
      setInvoiceIds(invoices.map((inv) => inv._id));
      setRecentInvoices(invoices);
    } catch {
      // ignore
    } finally {
      setIsLoadingRecentInvoices(false);
    }
  }, [companyId, financialYearId]);

  // Initial load
  useEffect(() => {
    loadNextInvoiceNo();
    loadInvoiceIds();
    searchInputRef.current?.focus();
  }, [loadNextInvoiceNo, loadInvoiceIds]);

  // Filtered invoices for search & find dialog
  const filteredInvoices = useMemo(() => {
    if (!searchInvoiceNo.trim()) return recentInvoices;
    const q = searchInvoiceNo.trim().toLowerCase();
    return recentInvoices.filter(
      (inv) =>
        (inv.invoiceNo || '').toLowerCase().includes(q) ||
        (inv.customerName || '').toLowerCase().includes(q)
    );
  }, [recentInvoices, searchInvoiceNo]);

  // Load Salesmen, Customers, Cash Accounts, Doctors & Patients
  useEffect(() => {
    if (!companyId) return;

    // 1. Load salesmen
    userApi.list(companyId)
      .then((res: any) => {
        const users = (res.data?.data || []) as Array<{ _id: string; fullName?: string; username: string }>;
        setSalesmen(users);
        if (currentUser?._id) {
          const matched = users.find((u) => u._id === currentUser._id);
          if (matched) setSelectedSalesmanId(matched._id);
          else if (users.length > 0) setSelectedSalesmanId(users[0]._id);
        } else if (users.length > 0) {
          setSelectedSalesmanId(users[0]._id);
        }
      })
      .catch(() => {});

    // 2. Load Customers and Cash in Hand accounts (exact Sales B2C behavior)
    const pCust = ledgerAccountApi.list(companyId, 'Customer');
    const pCash = ledgerAccountApi.list(companyId, 'Cash');

    Promise.all([pCust, pCash])
      .then(([custRes, cashRes]) => {
        const custList = (custRes.data?.data || []) as CustomerOption[];
        const cashList = (cashRes.data?.data || []) as CustomerOption[];

        let primaryCash = cashList.find((c) => /cash\s*in\s*hand/i.test(c.name)) || cashList[0];
        if (!primaryCash) {
          primaryCash = { _id: 'cash_in_hand_default', name: 'CASH IN HAND', code: 'CASH001', type: 'Cash' };
        }
        setCashAccountId(primaryCash._id);

        // Put CASH IN HAND at the top of customerOptions
        const otherCash = cashList.filter((c) => c._id !== primaryCash._id);
        const combined = [primaryCash, ...custList, ...otherCash];
        setCustomerOptions(combined);
        setSelectedCustomer(primaryCash);
      })
      .catch(() => {
        const fallbackCash: CustomerOption = { _id: 'cash_in_hand', name: 'CASH IN HAND', code: 'CASH001', type: 'Cash' };
        setCustomerOptions([fallbackCash]);
        setSelectedCustomer(fallbackCash);
      });

    // 2b. Load Bank Card Accounts (only accounts where isCardAccount is enabled)
    ledgerAccountApi
      .list(companyId, 'Bank')
      .then((bankRes) => {
        const bankList = (bankRes.data?.data || []) as Array<CustomerOption & { isCardAccount?: boolean; cardAccount?: boolean }>;
        const cardOnly = bankList.filter((b) => b.isCardAccount === true || b.cardAccount === true);
        setCardAccounts(cardOnly);
        const cc1 = cardOnly.find((b) => b.name.toUpperCase() === 'CC1');
        if (cc1) {
          setSelectedCardAccountId(cc1._id);
        } else if (cardOnly.length > 0) {
          setSelectedCardAccountId(cardOnly[0]._id);
        }
      })
      .catch(() => {});

    // 3. Load Doctors from backend
    salesApi.getDoctors(companyId)
      .then((res: any) => {
        const docs = (res.data?.data || []) as DoctorItem[];
        setDoctors(docs);
      })
      .catch(() => {});

    // 4. Load Patients from backend
    salesApi.getPatients(companyId)
      .then((res: any) => {
        const pats = (res.data?.data || []) as PatientItem[];
        setPatients(pats);
      })
      .catch(() => {});


    // 6. Load Units of measure
    productApi.getUnits(companyId)
      .then((res: any) => {
        const uList = (res.data?.data || []) as any[];
        const map: Record<string, string> = {};
        uList.forEach((u) => {
          if (u._id) map[u._id] = u.shortCode || u.name;
        });
        setUnitsMap(map);
      })
      .catch(() => {});
  }, [companyId, currentUser]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/entry/pos') {
        loadNextInvoiceNo();
        if (companyId) {
          const pCust = ledgerAccountApi.list(companyId, 'Customer');
          const pCash = ledgerAccountApi.list(companyId, 'Cash');
          Promise.all([pCust, pCash])
            .then(([custRes, cashRes]) => {
              const custList = (custRes.data?.data || []) as CustomerOption[];
              const cashList = (cashRes.data?.data || []) as CustomerOption[];
              let primaryCash = cashList.find((c) => /cash\s*in\s*hand/i.test(c.name)) || cashList[0];
              if (!primaryCash) {
                primaryCash = { _id: 'cash_in_hand_default', name: 'CASH IN HAND', code: 'CASH001', type: 'Cash' };
              }
              const otherCash = cashList.filter((c) => c._id !== primaryCash._id);
              const combined = [primaryCash, ...custList, ...otherCash];
              setCustomerOptions(combined);
            })
            .catch(() => {});
        }
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:ledgers-updated', onWindowActivated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:ledgers-updated', onWindowActivated);
    };
  }, [companyId, loadNextInvoiceNo]);

  // Product Live Search & Barcode Scan (Shows all matching items; stock verified on cart addition like Sales Invoice)
  useEffect(() => {
    if (!companyId || !searchTerm.trim() || searchTerm.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await productApi.list(companyId, { search: searchTerm.trim(), limit: 12 });
        const list = (res.data?.data?.products || []) as any[];
        
        // Check real-time stock for each product in parallel
        const withStock = await Promise.all(
          list.map(async (prod) => {
            try {
              const sRes = await stockApi.getProductStock(companyId, prod._id);
              const stock = sRes.data?.data?.stock ?? 0;
              return { ...prod, currentStock: stock };
            } catch {
              return { ...prod, currentStock: 0 };
            }
          })
        );

        // Show all matching items in search; when user tries to add, stock availability is enforced
        setSearchResults(withStock);
        setShowDropdown(withStock.length > 0);
        setHighlightedIndex(withStock.length > 0 ? 0 : -1);
      } catch {
        setSearchResults([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm, companyId]);

  // Scroll highlighted search item into view when navigating with arrow keys
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownListRef.current) {
      const activeEl = dropdownListRef.current.querySelector<HTMLElement>(`[data-search-idx="${highlightedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Helper: Build available units for a product (main unit + multiUnits)
  const buildProductUnits = (prod: any, basePrice: number) => {
    const units: Array<{ id: string; name: string; price: number; conversion?: number; isMultiUnit: boolean }> = [];
    const mainUnit = prod.unitOfMeasureId;
    const mainUnitId = typeof mainUnit === 'object' ? mainUnit?._id : mainUnit;
    const mainUnitName = (typeof mainUnit === 'object' ? (mainUnit?.shortCode || mainUnit?.name) : unitsMap[mainUnitId]) || 'Pcs';

    units.push({
      id: mainUnitId || 'base_pcs',
      name: mainUnitName,
      price: basePrice,
      conversion: 1,
      isMultiUnit: false,
    });

    if (prod.multiUnits && Array.isArray(prod.multiUnits)) {
      prod.multiUnits.forEach((mu: any) => {
        const muUnitId = typeof mu.unitId === 'object' ? mu.unitId?._id : mu.unitId;
        const muName = (typeof mu.unitId === 'object' ? (mu.unitId?.shortCode || mu.unitId?.name) : unitsMap[muUnitId]) || mu.multiUnitId || 'Unit';
        const muPrice = Number(mu.retail ?? mu.price ?? (mu.conversion ? basePrice * mu.conversion : basePrice));
        units.push({
          id: mu.multiUnitId || muUnitId || String(Math.random()),
          name: muName,
          price: muPrice,
          conversion: mu.conversion || 1,
          isMultiUnit: true,
        });
      });
    }

    return units;
  };

  // Helper: Fetch real batches for product from inventory / purchase invoices (Sales Invoice procedure)
  const fetchBatchesForProduct = (productId: string, defaultBatch: string, defaultExp: string, totalStock?: number) => {
    if (!productId || productId.startsWith('q') || !companyId) return;
    purchaseApi.getProductBatches(companyId, productId)
      .then((res: any) => {
        const rawBatches = (res.data?.data || []) as any[];
        // Filter out batches with 0 or negative quantity
        const validBatches = rawBatches
          .filter((b) => (b.quantity ?? 0) > 0)
          .map((b) => ({
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate ? formatDateDisplay(b.expiryDate) : defaultExp,
            quantity: b.quantity ?? 0,
            retail: b.retail,
          }));

        if (validBatches.length > 0) {
          setLines((prev) => {
            const usedBatches = new Set<string>();
            return prev.map((l) => {
              if (l.productId === productId) {
                // Keep line's current batch if it exists in validBatches, otherwise assign next unused batch
                const exactMatch = validBatches.find((fb) => fb.batchNumber === l.batchNumber);
                let chosen = exactMatch;
                if (!chosen) {
                  chosen = validBatches.find((fb) => !usedBatches.has(fb.batchNumber)) || validBatches.find((fb) => fb.batchNumber === defaultBatch) || validBatches[0];
                }
                usedBatches.add(chosen.batchNumber);
                return {
                  ...l,
                  availableBatches: validBatches,
                  batchNumber: chosen.batchNumber,
                  expiryDate: chosen.expiryDate,
                  availableStock: totalStock !== undefined ? totalStock : l.availableStock,
                };
              }
              return l;
            });
          });
        } else if (totalStock !== undefined) {
          setLines((prev) =>
            prev.map((l) => {
              if (l.productId === productId) {
                return {
                  ...l,
                  availableStock: totalStock,
                };
              }
              return l;
            })
          );
        }
      })
      .catch(() => {});
  };

  // Change selected batch for a cart row (Sales Invoice procedure)
  const handleBatchChange = (lineIndex: number, newBatchNumber: string) => {
    setLines((prev) => {
      const updated = [...prev];
      const item = updated[lineIndex];
      const foundBatch = item.availableBatches?.find((b) => b.batchNumber === newBatchNumber);
      if (foundBatch) {
        let newPrice = item.unitPrice;
        if (foundBatch.retail && foundBatch.retail > 0) {
          newPrice = foundBatch.retail;
        }
        let qty = item.quantity;
        if (foundBatch.quantity !== undefined && qty > foundBatch.quantity) {
          qty = Math.max(1, foundBatch.quantity);
          setAlertInfo({ open: true, message: `Quantity adjusted to batch available (${foundBatch.quantity})`, severity: 'info' });
        }
        const gross = qty * newPrice;
        const net = Math.max(0, gross - item.discount);
        const vatAmt = parseFloat((net * (item.vatRate / 100)).toFixed(2));
        updated[lineIndex] = {
          ...item,
          quantity: qty,
          batchNumber: foundBatch.batchNumber,
          expiryDate: foundBatch.expiryDate,
          unitPrice: newPrice,
          totalAmount: parseFloat((net + vatAmt).toFixed(2)),
        };
      } else {
        updated[lineIndex] = {
          ...item,
          batchNumber: newBatchNumber,
        };
      }
      return updated;
    });
  };

  // Change selected unit for a cart row (Sales Invoice procedure)
  const handleUnitChange = (lineIndex: number, unitId: string) => {
    setLines((prev) => {
      const updated = [...prev];
      const item = updated[lineIndex];
      const foundUnit = item.availableUnits?.find((u) => u.id === unitId);
      if (foundUnit) {
        const newPrice = foundUnit.price;
        const newConv = foundUnit.conversion || 1;
        const totalStock = item.availableStock ?? 999999;

        // Check if current quantity exceeds available stock with new conversion
        const usedInOtherLines = prev.reduce((sum, l, i) => {
          if (i !== lineIndex && l.productId === item.productId) {
            const conv = l.availableUnits?.find((u) => u.id === l.unitId)?.conversion || 1;
            return sum + (l.quantity * conv);
          }
          return sum;
        }, 0);
        const remainingStock = totalStock - usedInOtherLines;

        let effectiveQty = item.quantity;
        if (effectiveQty * newConv > remainingStock) {
          effectiveQty = Math.max(1, Math.floor(remainingStock / newConv));
          const msg = `Quantity adjusted to ${effectiveQty} to match available stock for ${foundUnit.name}.`;
          setAlertInfo({ open: true, message: msg, severity: 'info' });
        }

        const gross = effectiveQty * newPrice;
        const net = Math.max(0, gross - item.discount);
        const vatAmt = parseFloat((net * (item.vatRate / 100)).toFixed(2));
        updated[lineIndex] = {
          ...item,
          quantity: effectiveQty,
          unit: foundUnit.name,
          unitId: foundUnit.id,
          unitPrice: newPrice,
          totalAmount: parseFloat((net + vatAmt).toFixed(2)),
        };
      }
      return updated;
    });
  };

  // Medication Details Dialog Handlers
  const handleOpenMedicationDialog = (index: number) => {
    setSelectedMedLineIndex(index);
    const line = lines[index];
    if (line?.dosageInstructions) {
      setMedDuration(line.dosageInstructions.duration || '30');
      setMedDurationUnit((line.dosageInstructions.durationUnit as any) || 'Days');
      setMedTiming(line.dosageInstructions.timing || 'Before Food');
      setMedFrequency(line.dosageInstructions.frequency || '1');
    } else {
      setMedDuration('30');
      setMedDurationUnit('Days');
      setMedTiming('Before Food');
      setMedFrequency('1');
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
    if (selectedMedLineIndex === null || selectedMedLineIndex >= lines.length) return;
    const updated = [...lines];
    updated[selectedMedLineIndex] = {
      ...updated[selectedMedLineIndex],
      dosageInstructions: {
        duration: medDuration,
        durationUnit: medDurationUnit,
        timing: medTiming,
        frequency: medFrequency,
        summary: medInstructionSummary,
      },
    };
    setLines(updated);
    setMedicationDialogOpen(false);
    setAlertInfo({
      open: true,
      message: `Prescription instructions saved for ${updated[selectedMedLineIndex].name}`,
      severity: 'success',
    });
  };

  const handleClearMedInstructions = () => {
    setMedDuration('');
    setMedTiming('');
    setMedFrequency('');
    if (selectedMedLineIndex !== null && selectedMedLineIndex < lines.length) {
      const updated = [...lines];
      delete updated[selectedMedLineIndex].dosageInstructions;
      setLines(updated);
    }
  };

  // Add product to cart helper with stock check (Sales Invoice procedure)
  const addProductToCart = async (prod: any) => {
    if (!companyId) {
      setAlertInfo({ open: true, message: 'Please select a company first.', severity: 'error' });
      return;
    }

    // 1. Fetch real-time available stock from backend (Sales Invoice procedure)
    let totalStock = prod.currentStock;
    if (totalStock === undefined) {
      try {
        const sRes = await stockApi.getProductStock(companyId, prod._id);
        totalStock = sRes.data?.data?.stock ?? 0;
      } catch {
        totalStock = 0;
      }
    }

    // 2. Calculate pieces currently used in cart for this product
    const usedInCart = lines.reduce((sum, l) => {
      if (l.productId === prod._id) {
        const conv = l.availableUnits?.find((u) => u.id === l.unitId)?.conversion || 1;
        return sum + (l.quantity * conv);
      }
      return sum;
    }, 0);

    const remainingStock = totalStock - usedInCart;

    // 3. Block sale if no stock available (Sales Invoice procedure)
    if (totalStock <= 0 || remainingStock <= 0) {
      const msg = totalStock <= 0
        ? `Cannot sell "${prod.name}" — no stock available.`
        : `Cannot sell "${prod.name}" — no stock available (all ${totalStock} available pieces are already in the cart).`;
      setStockAlertMessage(msg);
      setStockAlertOpen(true);
      setAlertInfo({ open: true, message: msg, severity: 'error' });
      return;
    }

    const unitPrice = Number(prod.sellingPrice ?? prod.retailPrice ?? 0);
    const vatRate = Number(prod.vatPercent ?? (prod.vatCategory === 'exempt' || prod.vatCategory === 'zero' ? 0 : 5));
    const availableUnits = buildProductUnits(prod, unitPrice);
    const initialUnit = availableUnits[0];
    const initialConv = initialUnit.conversion || 1;

    // Check if at least 1 unit fits in remainingStock
    if (remainingStock < initialConv) {
      const msg = `Cannot sell "${prod.name}" — not enough stock for unit "${initialUnit.name}". Remaining stock: ${remainingStock} piece(s).`;
      setStockAlertMessage(msg);
      setStockAlertOpen(true);
      setAlertInfo({ open: true, message: msg, severity: 'error' });
      return;
    }

    // Check if other lines of this product already exist in cart to borrow fetched batches or pick an unused batch
    const existingLinesOfProd = lines.filter((l) => l.productId === prod._id);
    let availableBatches: Array<{ batchNumber: string; expiryDate: string; quantity?: number; retail?: number }> = [];
    let batchNumber = prod.batchNumber || (prod.code ? `B-${prod.code.toUpperCase()}` : 'B2401');
    let expiryDate = prod.expiryDate ? formatDateDisplay(prod.expiryDate) : '12-2027';

    if (existingLinesOfProd.length > 0 && existingLinesOfProd[0].availableBatches && existingLinesOfProd[0].availableBatches.length > 0) {
      availableBatches = [...existingLinesOfProd[0].availableBatches];
      const usedBatches = new Set(existingLinesOfProd.map((l) => l.batchNumber));
      // Pick a batch not already used in previous rows if possible
      const unusedBatch = availableBatches.find((b) => !usedBatches.has(b.batchNumber) && (b.quantity ?? 1) > 0);
      if (unusedBatch) {
        batchNumber = unusedBatch.batchNumber;
        expiryDate = unusedBatch.expiryDate;
      }
    } else {
      availableBatches = [{ batchNumber, expiryDate, quantity: totalStock }];
    }

    const qty = 1;
    const gross = qty * initialUnit.price;
    const vatAmt = parseFloat((gross * (vatRate / 100)).toFixed(2));
    const newLine: POSCartLine = {
      productId: prod._id,
      name: prod.name,
      code: prod.code || prod.sku || '',
      genericName: prod.genericName,
      isRx: Boolean(prod.isControlledSubstance),
      batchNumber,
      expiryDate,
      availableBatches,
      unit: initialUnit.name,
      unitId: initialUnit.id,
      availableUnits,
      quantity: qty,
      availableStock: totalStock,
      unitPrice: initialUnit.price,
      basePrice: unitPrice,
      vatRate,
      discount: 0,
      totalAmount: parseFloat((gross + vatAmt).toFixed(2)),
    };
    setLines([...lines, newLine]);
    fetchBatchesForProduct(prod._id, batchNumber, expiryDate, totalStock);

    setSearchTerm('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
    searchInputRef.current?.focus();
  };


  // Barcode / Arrow navigation / Enter key handler (Sales Invoice procedure)
  const handleBarcodeSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setShowDropdown(true);
        setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setShowDropdown(true);
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
      }
      return;
    }

    if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const code = searchTerm.trim();
      if (!code && searchResults.length === 0) return;

      // If an item in dropdown is highlighted via Arrow keys or mouse hover, choose it
      if (showDropdown && highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        const selectedProd = searchResults[highlightedIndex];
        setShowDropdown(false);
        setHighlightedIndex(-1);
        await addProductToCart(selectedProd);
        return;
      }

      // Check if it's a direct barcode match
      if (code && companyId) {
        try {
          const bcRes = await productApi.getByBarcode(companyId, code);
          const prod = bcRes.data?.data as any;
          if (prod && prod._id) {
            setShowDropdown(false);
            setHighlightedIndex(-1);
            await addProductToCart(prod);
            return;
          }
        } catch {
          // Fallback to first search result
        }
      }

      if (searchResults.length > 0) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
        await addProductToCart(searchResults[0]);
      } else if (code) {
        setAlertInfo({
          open: true,
          message: `Item not found or out of stock for "${code}"`,
          severity: 'error',
        });
      }
    }
  };

  // Stepper quantity update with stock check (Sales Invoice procedure)
  const updateQuantity = (index: number, delta: number) => {
    const updated = [...lines];
    const item = updated[index];
    if (!item) return;

    if (delta > 0) {
      const lineConv = item.availableUnits?.find((u) => u.id === item.unitId)?.conversion || 1;
      const totalStock = item.availableStock ?? 999999;

      // Calculate how much of this product is used in other cart lines
      const usedInOtherLines = lines.reduce((sum, l, i) => {
        if (i !== index && l.productId === item.productId) {
          const conv = l.availableUnits?.find((u) => u.id === l.unitId)?.conversion || 1;
          return sum + (l.quantity * conv);
        }
        return sum;
      }, 0);

      const remainingStock = totalStock - usedInOtherLines;
      const requestedNewQty = item.quantity + delta;
      const requestedPieces = requestedNewQty * lineConv;

      // Check batch-level limit if a specific batch is chosen with batch quantity
      const selectedBatch = item.availableBatches?.find((b) => b.batchNumber === item.batchNumber);
      if (selectedBatch && selectedBatch.quantity !== undefined && requestedNewQty > selectedBatch.quantity) {
        const msg = `Qty not available in batch "${item.batchNumber}". Maximum available for this batch is ${selectedBatch.quantity}.`;
        setStockAlertMessage(msg);
        setStockAlertOpen(true);
        setAlertInfo({ open: true, message: msg, severity: 'error' });
        return;
      }

      if (requestedPieces > remainingStock) {
        const maxUnits = Math.max(0, Math.floor(remainingStock / lineConv));
        const msg = `Qty not available for "${item.name}". Maximum available stock is ${maxUnits} ${item.unit || 'unit(s)'} (${totalStock} pieces total).`;
        setStockAlertMessage(msg);
        setStockAlertOpen(true);
        setAlertInfo({ open: true, message: msg, severity: 'error' });
        return;
      }
    }

    const newQty = Math.max(1, item.quantity + delta);
    const gross = newQty * item.unitPrice;
    const net = Math.max(0, gross - item.discount);
    const vatAmt = parseFloat((net * (item.vatRate / 100)).toFixed(2));
    updated[index] = {
      ...item,
      quantity: newQty,
      totalAmount: parseFloat((net + vatAmt).toFixed(2)),
    };
    setLines(updated);
  };

  // Remove line
  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Totals calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalVat = 0;

    lines.forEach((l) => {
      const lineGross = l.quantity * l.unitPrice;
      const lineNet = Math.max(0, lineGross - l.discount);
      const lineVat = lineNet * (l.vatRate / 100);
      subtotal += lineNet;
      totalVat += lineVat;
    });

    const disc = Math.min(Math.max(Number(discountAED) || 0, 0), subtotal);
    const taxable = Math.max(0, subtotal - disc);
    const adjustedVat = subtotal > 0 ? totalVat * (taxable / subtotal) : 0;
    const unroundedGrand = taxable + adjustedVat;
    const grandTotal = Math.round(unroundedGrand * 20) / 20; // 0.05 step
    const roundOff = parseFloat((grandTotal - unroundedGrand).toFixed(2));

    return {
      subtotal: subtotal.toFixed(2),
      discount: disc.toFixed(2),
      taxable: taxable.toFixed(2),
      vat: adjustedVat.toFixed(2),
      roundOff: (roundOff >= 0 ? '+' : '') + roundOff.toFixed(2),
      roundOffNum: roundOff,
      grandTotal: grandTotal.toFixed(2),
      grandTotalNum: grandTotal,
    };
  }, [lines, discountAED]);

  // Open Payment Window with stock check (Sales Invoice procedure)
  const handleOpenPaymentDialog = async () => {
    if (!companyId || !financialYearId) {
      setAlertInfo({ open: true, message: 'Please select a Company and Financial Year first.', severity: 'error' });
      return;
    }
    if (lines.length === 0) {
      setAlertInfo({ open: true, message: 'Cart is empty. Please add at least one item.', severity: 'error' });
      return;
    }

    // Verify stock availability for all items in cart (Sales Invoice procedure)
    try {
      const productQtyMap = new Map<string, { name: string; totalPieces: number }>();
      for (const line of lines) {
        const conv = line.availableUnits?.find((u) => u.id === line.unitId)?.conversion || 1;
        const pieces = line.quantity * conv;
        const existing = productQtyMap.get(line.productId);
        if (existing) {
          existing.totalPieces += pieces;
        } else {
          productQtyMap.set(line.productId, { name: line.name, totalPieces: pieces });
        }
      }

      for (const [pId, info] of productQtyMap) {
        const stockRes = await stockApi.getProductStock(companyId, pId);
        const currentStock = stockRes.data?.data?.stock ?? 0;
        if (currentStock < info.totalPieces) {
          const msg = `Insufficient stock for "${info.name}". Available: ${currentStock}, In cart: ${info.totalPieces}. Please adjust quantity.`;
          setStockAlertMessage(msg);
          setStockAlertOpen(true);
          setAlertInfo({ open: true, message: msg, severity: 'error' });
          return;
        }
      }
    } catch {
      // Proceed if network check fails
    }

    setPaymentDone(false);
    setPaymentDoneInfo(null);

    // Default both Cash portion and Card portion to zero
    setPaymentMode('Split');
    setSplitCashAmount('0');
    setSplitCardAmount('0');
    setSplitCardApproval('');

    setPaymentDialogOpen(true);
  };

  const handleSplitCashChange = (val: string) => {
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setSplitCashAmount(val);
    }
  };

  const handleSplitCardChange = (val: string) => {
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setSplitCardAmount(val);
    }
  };

  // Cash In Hand: cash is the auto-calculated remainder after card.
  // Account customers: whatever cash + card does not cover stays on credit.
  const computePaymentSplit = () => {
    const total = totals.grandTotalNum;
    const sc = parseFloat(splitCashAmount) || 0;
    const cr = parseFloat(splitCardAmount) || 0;
    const isBlank = sc <= 0 && cr <= 0;
    const cardExceedsTotal = cr > total + 0.001;
    const cardApplied = Math.min(cr, total);
    const autoCash = Math.max(0, total - cardApplied);
    const cashApplied = isCashInHandCustomer ? autoCash : Math.min(sc, autoCash);
    const cashTendered = isCashInHandCustomer ? autoCash : sc;
    const paid = Math.min(total, parseFloat((cashApplied + cardApplied).toFixed(2)));
    const balance = Math.max(0, parseFloat((total - paid).toFixed(2)));
    const change = Math.max(0, parseFloat((cashTendered + cardApplied - total).toFixed(2)));
    return { total, sc, cr, isBlank, cardExceedsTotal, cardApplied, autoCash, cashApplied, cashTendered, paid, balance, change };
  };

  // Complete Sale / Save & Charge
  const handleSaveAndCharge = async (override?: {
    mode?: 'Cash' | 'Card' | 'Split' | 'Credit';
    cashRec?: number;
    approvalCode?: string;
    splitDetails?: { cash: number; card: number; cardApproval?: string; cashRec: number };
  }) => {
    if (!companyId || !financialYearId) {
      setAlertInfo({ open: true, message: 'Please select a Company and Financial Year first.', severity: 'error' });
      return;
    }
    if (lines.length === 0) {
      setAlertInfo({ open: true, message: 'Cart is empty. Please add at least one item.', severity: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      const activeMode = override?.mode || paymentMode;
      const isCredit = activeMode === 'Credit';
      const isSplit = activeMode === 'Split';
      const isCash = activeMode === 'Cash';
      // Determine if customer is Cash In Hand / Walk-in
      const isCashAccount = isCashInHandCustomer;
      const custId = isCashAccount ? undefined : selectedCustomer._id;
      const custName = isCashAccount ? (selectedCustomer?.name || 'CASH IN HAND') : selectedCustomer.name;
      const activeCashId = isCashAccount ? (selectedCustomer?._id || cashAccountId) : cashAccountId;

      let pDetails: Array<{ mode: string; amount: number; reference?: string; accountId?: string }> = [];
      let finalCashRec = totals.grandTotalNum;
      let finalChange = 0;

      if (isCredit) {
        // No tender entered for an account customer — carry the full amount on credit
        pDetails = [];
        finalCashRec = 0;
        finalChange = 0;
      } else if (isSplit) {
        const sc = parseFloat(splitCashAmount) || 0;
        const cr = parseFloat(splitCardAmount) || 0;
        const cardAmt = Math.min(cr, totals.grandTotalNum);
        const autoCashAmt = Math.max(0, totals.grandTotalNum - cardAmt);
        const cashAmt = isCashAccount ? autoCashAmt : Math.min(sc, autoCashAmt);
        const sDetails = override?.splitDetails || {
          cash: cashAmt,
          card: cardAmt,
          cardApproval: splitCardApproval.trim(),
          cashRec: isCashAccount ? autoCashAmt : sc,
        };
        pDetails = [];
        if (sDetails.cash > 0) {
          pDetails.push({ mode: 'Cash', amount: sDetails.cash, accountId: activeCashId || undefined });
        }
        if (sDetails.card > 0) {
          pDetails.push({
            mode: 'Card',
            amount: sDetails.card,
            reference: sDetails.cardApproval || undefined,
            accountId: selectedCardAccountId || undefined,
          });
        }
        finalCashRec = sDetails.cashRec > 0 ? sDetails.cashRec : sDetails.cash;
        finalChange = Math.max(0, parseFloat(((sDetails.cashRec + sDetails.card) - totals.grandTotalNum).toFixed(2)));
      } else if (isCash) {
        const tenderedCash = override?.cashRec ?? totals.grandTotalNum;
        const appliedCash = isCashAccount ? totals.grandTotalNum : Math.min(tenderedCash, totals.grandTotalNum);
        finalCashRec = tenderedCash;
        pDetails = [{ mode: 'Cash', amount: appliedCash, accountId: activeCashId || undefined }];
        finalChange = Math.max(0, parseFloat((tenderedCash - totals.grandTotalNum).toFixed(2)));
      } else {
        pDetails = [
          {
            mode: 'Card',
            amount: totals.grandTotalNum,
            reference: override?.approvalCode || (splitCardApproval ? splitCardApproval.trim() : undefined),
            accountId: selectedCardAccountId || undefined,
          },
        ];
        finalCashRec = totals.grandTotalNum;
        finalChange = 0;
      }

      const payload = {
        companyId,
        financialYearId,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          vatRate: l.vatRate,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          multiUnitId: l.availableUnits?.find((u) => u.id === l.unitId)?.isMultiUnit ? l.unitId : undefined,
          dosageInstructions: l.dosageInstructions,
          duration: l.dosageInstructions?.duration,
          timing: l.dosageInstructions?.timing,
          frequency: l.dosageInstructions?.frequency,
          description: l.name,
          productName: l.name,
        })),
        paymentDetails: pDetails,
        paymentType: isCredit ? 'Credit' as const : 'Cash' as const,
        cashReceived: finalCashRec,
        billDiscount: Number(totals.discount),
        roundOff: totals.roundOffNum,
        customerId: custId,
        customerName: custName,
        cashAccountId: activeCashId,
        cardAccountId: selectedCardAccountId || undefined,
        salesmanId: selectedSalesmanId || undefined,
        emiratesId: emiratesId.trim() || undefined,
        patientName: selectedPatient.trim() || undefined,
        doctorName: selectedDoctor.trim() || undefined,
        doctorLicenseNo: doctors.find((d) => d.name === selectedDoctor)?.licenseNumber || undefined,
        prescriptionNumber: prescriptionNumber.trim() || undefined,
        prescriptionDate: prescriptionDate || undefined,
        isRiayati,
      };

      const res = await salesApi.createPOS(payload);
      const createdInvoiceNo = res.data?.data?.invoiceNo || invoiceNo;
      const createdInvoiceId = res.data?.data?.invoiceId;
      if (createdInvoiceId) {
        setInvoiceId(createdInvoiceId);
      }
      setInvoiceNo(createdInvoiceNo);
      setIsSaved(true);
      loadInvoiceIds();
      const riayatiSub = res.data?.data?.riayatiSubmission;

      let riayatiNote = '';
      if (isRiayati) {
        if (riayatiSub?.status === 'Success') {
          riayatiNote = ` · Riayati HL7: Acknowledged (${riayatiSub.ackCode || 'AA'})`;
        } else if (riayatiSub?.status === 'Offline') {
          riayatiNote = ` · Riayati HL7: Receiver Offline (Recorded locally)`;
        } else if (riayatiSub?.status === 'Partial') {
          riayatiNote = ` · Riayati HL7: Partially Accepted`;
        } else if (riayatiSub?.status === 'Failed') {
          riayatiNote = ` · Riayati HL7: ${riayatiSub.error || 'Check listener'}`;
        }
      }

      setLastInvoiceSummary({
        invoiceNo: createdInvoiceNo,
        totalAmount: totals.grandTotalNum,
        date: invoiceDate,
      });

      if (paymentDialogOpen) {
        let subMsg = '';
        let doneTitle = '';
        if (isCredit) {
          doneTitle = 'Credit sale recorded';
          subMsg = `${totals.grandTotalNum.toFixed(2)} AED added to ${custName}'s account.${riayatiNote}`;
        } else if (isSplit) {
          const sc = parseFloat(splitCashAmount) || 0;
          const cr = parseFloat(splitCardAmount) || 0;
          const cardAmt = Math.min(cr, totals.grandTotalNum);
          const autoCashAmt = Math.max(0, totals.grandTotalNum - cardAmt);
          const cashAmt = isCashAccount ? autoCashAmt : Math.min(sc, autoCashAmt);
          const sDetails = override?.splitDetails || {
            cash: cashAmt,
            card: cardAmt,
            cardApproval: splitCardApproval.trim(),
            cashRec: isCashAccount ? autoCashAmt : sc,
          };
          const creditBalance = isCashAccount
            ? 0
            : Math.max(0, parseFloat((totals.grandTotalNum - sDetails.cash - sDetails.card).toFixed(2)));
          if (creditBalance > 0.001) {
            doneTitle = 'Payment accepted — balance on credit';
            subMsg = `Cash: ${sDetails.cash.toFixed(2)} AED · Card: ${sDetails.card.toFixed(2)} AED${sDetails.cardApproval ? ' (' + sDetails.cardApproval + ')' : ''}. ${creditBalance.toFixed(2)} AED added to ${custName}'s account.${riayatiNote}`;
          } else {
            doneTitle = 'Payment accepted (Card + Cash)';
            subMsg = `Cash: ${sDetails.cash.toFixed(2)} AED · Card: ${sDetails.card.toFixed(2)} AED${sDetails.cardApproval ? ' (' + sDetails.cardApproval + ')' : ''}. ${finalChange > 0.001 ? 'Return ' + finalChange.toFixed(2) + ' AED to customer.' : 'Exact payment.'}${riayatiNote}`;
          }
        } else if (isCash) {
          const paidCash = Math.min(finalCashRec, totals.grandTotalNum);
          const creditBalance = isCashAccount
            ? 0
            : Math.max(0, parseFloat((totals.grandTotalNum - paidCash).toFixed(2)));
          if (creditBalance > 0.001) {
            doneTitle = 'Payment accepted — balance on credit';
            subMsg = `${paidCash.toFixed(2)} AED received in cash. ${creditBalance.toFixed(2)} AED added to ${custName}'s account.${riayatiNote}`;
          } else {
            doneTitle = 'Cash accepted';
            subMsg = (finalChange > 0.001 ? `Return ${finalChange.toFixed(2)} AED to the customer.` : 'No change due.') + riayatiNote;
          }
        } else {
          doneTitle = 'Card payment recorded';
          subMsg = `${totals.grandTotalNum.toFixed(2)} AED by card${override?.approvalCode ? ', ' + override.approvalCode : ''}.${riayatiNote}`;
        }

        setPaymentDoneInfo({
          title: doneTitle,
          subtitle: subMsg,
          invoiceNo: createdInvoiceNo,
          change: finalChange,
        });
        setPaymentDone(true);
      } else {
        setAlertInfo({
          open: true,
          message: `Sale completed successfully! Invoice: ${createdInvoiceNo}${riayatiNote}`,
          severity: 'success',
        });
        setShowReceiptDialog(true);
      }

      // In line with Sales window: Cart items remain visible with isSaved = true
      // so user can print receipt, edit invoice, or delete.
      // New sale or Clear will reset the cart and load next invoice number.
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to complete sale';
      setAlertInfo({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Clear current cart / start new sale
  const handleClear = () => {
    if (lines.length > 0 && !isSaved && !window.confirm('Clear all items from current cart?')) {
      return;
    }
    setLines([]);
    setInvoiceId(null);
    setIsSaved(false);
    setDiscountAED(0);
    setSearchTerm('');
    setPrescriptionNumber('');
    setPrescriptionDate(new Date().toISOString().slice(0, 10));
    setSelectedPatient('');
    setSelectedDoctor('');
    const cc1 = cardAccounts.find((b) => b.name.toUpperCase() === 'CC1');
    if (cc1) setSelectedCardAccountId(cc1._id);
    else if (cardAccounts.length > 0) setSelectedCardAccountId(cardAccounts[0]._id);
    else setSelectedCardAccountId('');
    loadNextInvoiceNo();
    searchInputRef.current?.focus();
  };

  // ── Hold / Restore Invoice (matches Sales Window behaviour) ──────────
  const handleHoldInvoice = () => {
    if (isSaved) {
      setAlertInfo({ open: true, message: 'Cannot hold an already saved invoice', severity: 'error' });
      return;
    }
    const filledLines = lines.filter((l) => l.productId);
    if (filledLines.length === 0) {
      setAlertInfo({ open: true, message: 'Nothing to hold — add at least one product first', severity: 'error' });
      return;
    }
    const held: HeldPOSInvoice = {
      id: Date.now().toString(),
      heldAt: new Date().toLocaleString(),
      invoiceNo,
      date: invoiceDate,
      itemCount: filledLines.length,
      total: parseFloat(totals.grandTotal) || 0,
      lines: [...lines],
      customerName: selectedCustomer?.name,
      selectedCustomer,
      selectedSalesmanId,
      emiratesId,
      patientName: selectedPatient,
      doctorName: selectedDoctor,
      prescriptionNumber,
      prescriptionDate,
      isRiayati,
      discountAED,
      paymentMode,
      splitCashAmount,
      splitCardAmount,
    };
    const updated = [...heldInvoices, held];
    setHeldInvoices(updated);
    saveHeldPOSInvoices(updated);
    setAlertInfo({
      open: true,
      message: `Sale held (${filledLines.length} item${filledLines.length > 1 ? 's' : ''})`,
      severity: 'success',
    });

    // Clear cart for next sale
    setLines([]);
    setInvoiceId(null);
    setIsSaved(false);
    setDiscountAED(0);
    setSearchTerm('');
    setPrescriptionNumber('');
    setPrescriptionDate(new Date().toISOString().slice(0, 10));
    setSelectedPatient('');
    setSelectedDoctor('');
    loadNextInvoiceNo();
    searchInputRef.current?.focus();
  };

  const handleRestoreHeldInvoice = (held: HeldPOSInvoice) => {
    setInvoiceId(null);
    setIsSaved(false);
    setInvoiceNo(held.invoiceNo);
    setInvoiceDate(held.date || invoiceDate);
    setLines(held.lines || []);
    if (held.selectedCustomer) setSelectedCustomer(held.selectedCustomer);
    if (held.selectedSalesmanId) setSelectedSalesmanId(held.selectedSalesmanId);
    setEmiratesId(held.emiratesId || '');
    setSelectedPatient(held.patientName || '');
    setSelectedDoctor(held.doctorName || '');
    setPrescriptionNumber(held.prescriptionNumber || '');
    setPrescriptionDate(held.prescriptionDate || new Date().toISOString().slice(0, 10));
    setIsRiayati(Boolean(held.isRiayati));
    setDiscountAED(held.discountAED || 0);
    if (held.paymentMode) setPaymentMode(held.paymentMode);
    if (held.splitCashAmount) setSplitCashAmount(held.splitCashAmount);
    if (held.splitCardAmount) setSplitCardAmount(held.splitCardAmount);

    const updated = heldInvoices.filter((h) => h.id !== held.id);
    setHeldInvoices(updated);
    saveHeldPOSInvoices(updated);
    setHoldListDialogOpen(false);
    setAlertInfo({ open: true, message: `Restored held sale (${held.invoiceNo})`, severity: 'success' });
  };

  const handleDeleteHeldInvoice = (heldId: string) => {
    const updated = heldInvoices.filter((h) => h.id !== heldId);
    setHeldInvoices(updated);
    saveHeldPOSInvoices(updated);
  };

  // Load a saved invoice into POS
  const loadInvoiceIntoPOS = (inv: any) => {
    setInvoiceId(inv._id);
    setInvoiceNo(inv.invoiceNo);
    setIsSaved(true);

    if (inv.date) {
      try {
        const d = new Date(inv.date);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const mon = String(d.getMonth() + 1).padStart(2, '0');
          const yr = d.getFullYear();
          setInvoiceDate(`${day}/${mon}/${yr}`);
        } else if (typeof inv.date === 'string') {
          setInvoiceDate(inv.date);
        }
      } catch {
        if (typeof inv.date === 'string') setInvoiceDate(inv.date);
      }
    }
    if (inv.cardAccountId) {
      const cardId = typeof inv.cardAccountId === 'object' ? inv.cardAccountId._id : inv.cardAccountId;
      setSelectedCardAccountId(cardId || '');
    } else {
      const cardDetail = (inv.paymentDetails || []).find((p: any) => /card/i.test(p.mode) && p.accountId);
      if (cardDetail?.accountId) {
        const cardId = typeof cardDetail.accountId === 'object' ? cardDetail.accountId._id : cardDetail.accountId;
        setSelectedCardAccountId(cardId || '');
      }
    }
    if (inv.prescriptionNumber) setPrescriptionNumber(inv.prescriptionNumber);
    if (inv.prescriptionDate) {
      try {
        const pd = new Date(inv.prescriptionDate);
        if (!isNaN(pd.getTime())) {
          setPrescriptionDate(pd.toISOString().slice(0, 10));
        } else if (typeof inv.prescriptionDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(inv.prescriptionDate)) {
          setPrescriptionDate(inv.prescriptionDate.slice(0, 10));
        } else {
          setPrescriptionDate('');
        }
      } catch {
        setPrescriptionDate('');
      }
    } else {
      setPrescriptionDate('');
    }
    if (inv.emiratesId) setEmiratesId(inv.emiratesId);
    if (inv.patientName) setSelectedPatient(inv.patientName);
    else setSelectedPatient('');
    if (inv.doctorName) setSelectedDoctor(inv.doctorName);
    else setSelectedDoctor('');
    if (inv.salesmanId) {
      const sId = typeof inv.salesmanId === 'object' ? inv.salesmanId._id : inv.salesmanId;
      setSelectedSalesmanId(sId || '');
    }
    if (inv.customerId) {
      const cId = typeof inv.customerId === 'object' ? inv.customerId._id : inv.customerId;
      const match = customerOptions.find((c) => c._id === cId);
      if (match) setSelectedCustomer(match);
    } else if (inv.customerName) {
      const match = customerOptions.find((c) => c.name.toLowerCase() === inv.customerName.toLowerCase());
      if (match) setSelectedCustomer(match);
    }
    if (inv.otherDiscount) setDiscountAED(inv.otherDiscount);

    if (Array.isArray(inv.items) && inv.items.length > 0) {
      const restoredLines: POSCartLine[] = inv.items.map((it: any) => {
        const prod = typeof it.productId === 'object' && it.productId !== null ? it.productId : null;
        const pid = prod?._id ? String(prod._id) : String(it.productId || '');
        const pname = it.description || prod?.name || 'Product';
        const pcode = it.productCode || prod?.code || '';

        let safeExpiry = '';
        if (it.expiryDate) {
          try {
            const expD = new Date(it.expiryDate);
            if (!isNaN(expD.getTime())) {
              safeExpiry = expD.toISOString().slice(0, 10);
            } else if (typeof it.expiryDate === 'string') {
              safeExpiry = it.expiryDate.slice(0, 10);
            }
          } catch {
            safeExpiry = typeof it.expiryDate === 'string' ? it.expiryDate : '';
          }
        }

        return {
          productId: pid,
          name: pname,
          code: pcode,
          genericName: prod?.genericName || '',
          isRx: prod?.isPrescriptionRequired || false,
          batchNumber: it.batchNumber || '',
          expiryDate: safeExpiry,
          unit: it.unitName || '',
          unitId: it.unitId || '',
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice || 0,
          vatRate: it.vatRate ?? 5,
          discount: it.discount || 0,
          totalAmount: it.totalAmount || ((it.quantity || 1) * (it.unitPrice || 0)),
        };
      });
      setLines(restoredLines);
    }

    let summaryDate = invoiceDate;
    if (inv.date) {
      try {
        const d = new Date(inv.date);
        if (!isNaN(d.getTime())) {
          summaryDate = d.toISOString().slice(0, 10);
        } else if (typeof inv.date === 'string') {
          summaryDate = inv.date.slice(0, 10);
        }
      } catch {
        summaryDate = typeof inv.date === 'string' ? inv.date : invoiceDate;
      }
    }

    setLastInvoiceSummary({
      invoiceNo: inv.invoiceNo,
      totalAmount: inv.totalAmount || 0,
      date: summaryDate,
    });
  };

  // Search invoice by number
  const handleSearchInvoice = async () => {
    const invNo = searchInvoiceNo.trim();
    if (!invNo || !companyId) return;
    setIsSearchingInvoice(true);
    try {
      const res = await salesApi.searchB2CByInvoiceNo(companyId, invNo, 'POS');
      const inv = res.data?.data as any;
      if (inv) {
        loadInvoiceIntoPOS(inv);
        setSearchDialogOpen(false);
        setAlertInfo({ open: true, message: `Loaded invoice ${inv.invoiceNo}`, severity: 'info' });
      } else {
        setAlertInfo({ open: true, message: `Invoice "${invNo}" not found.`, severity: 'error' });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Invoice not found';
      setAlertInfo({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsSearchingInvoice(false);
    }
  };

  // ── INVOICE NAVIGATION HANDLERS (Matches Sales Window) ──
  const navigateToInvoice = async (id: string, fallbackInvoiceNo?: string) => {
    if (!id || !companyId) return;
    setIsLoadingInvoice(true);
    try {
      let res;
      try {
        res = await salesApi.getB2C(id, companyId, 'POS');
      } catch {
        res = await salesApi.getB2C(id, companyId);
      }
      if (res?.data?.data) {
        loadInvoiceIntoPOS(res.data.data as Record<string, unknown>);
        setAlertInfo({
          open: true,
          message: `Loaded invoice ${(res.data.data as any).invoiceNo}`,
          severity: 'info',
        });
      } else if (fallbackInvoiceNo) {
        const searchRes = await salesApi.searchB2CByInvoiceNo(companyId, fallbackInvoiceNo);
        if (searchRes.data?.data) {
          loadInvoiceIntoPOS(searchRes.data.data as Record<string, unknown>);
          setAlertInfo({
            open: true,
            message: `Loaded invoice ${(searchRes.data.data as any).invoiceNo}`,
            severity: 'info',
          });
        } else {
          setAlertInfo({ open: true, message: 'Invoice not found', severity: 'error' });
        }
      } else {
        setAlertInfo({ open: true, message: 'Invoice not found', severity: 'error' });
      }
    } catch (err: any) {
      if (fallbackInvoiceNo) {
        try {
          const searchRes = await salesApi.searchB2CByInvoiceNo(companyId, fallbackInvoiceNo);
          if (searchRes.data?.data) {
            loadInvoiceIntoPOS(searchRes.data.data as Record<string, unknown>);
            setAlertInfo({
              open: true,
              message: `Loaded invoice ${(searchRes.data.data as any).invoiceNo}`,
              severity: 'info',
            });
            return;
          }
        } catch {
          // ignore
        }
      }
      const msg = err?.response?.data?.message || err?.message || 'Failed to load invoice';
      setAlertInfo({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsLoadingInvoice(false);
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
    if (invoiceIds.length === 0) return;
    if (!invoiceId) {
      navigateToInvoice(invoiceIds[0]); // If on new unsaved invoice, go to most recent
      return;
    }
    const currentIndex = invoiceIds.indexOf(invoiceId);
    if (currentIndex === -1) {
      navigateToInvoice(invoiceIds[0]);
    } else if (currentIndex < invoiceIds.length - 1) {
      navigateToInvoice(invoiceIds[currentIndex + 1]);
    }
  };

  const handleNextInvoice = () => {
    if (invoiceIds.length === 0) return;
    if (!invoiceId) {
      navigateToInvoice(invoiceIds[invoiceIds.length - 1]);
      return;
    }
    const currentIndex = invoiceIds.indexOf(invoiceId);
    if (currentIndex === -1) {
      navigateToInvoice(invoiceIds[invoiceIds.length - 1]);
    } else if (currentIndex > 0) {
      navigateToInvoice(invoiceIds[currentIndex - 1]);
    }
  };

  const handleLastInvoice = () => {
    if (invoiceIds.length > 0) {
      navigateToInvoice(invoiceIds[0]); // Last invoice (newest)
    }
  };

  // Edit (update existing invoice)
  const handleEditClick = () => {
    if (!invoiceId) {
      setAlertInfo({ open: true, message: 'No saved invoice selected to edit.', severity: 'info' });
      return;
    }
    setEditConfirmOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!invoiceId || !companyId || !financialYearId) return;
    if (lines.length === 0) {
      setAlertInfo({ open: true, message: 'Cart cannot be empty for edit.', severity: 'error' });
      setEditConfirmOpen(false);
      return;
    }

    setIsSaving(true);
    setEditConfirmOpen(false);
    try {
      const isCashAccount = !selectedCustomer || selectedCustomer.type === 'Cash' || selectedCustomer._id === 'cash_in_hand_default';
      const custId = isCashAccount ? undefined : selectedCustomer._id;
      const custName = isCashAccount ? (selectedCustomer?.name || 'CASH IN HAND') : selectedCustomer.name;
      const activeCashId = isCashAccount ? (selectedCustomer?._id || cashAccountId) : cashAccountId;

      const payload: B2CInvoiceInput = {
        companyId,
        financialYearId,
        date: invoiceDate,
        type: 'POS',
        items: lines.map((l) => ({
          productId: l.productId,
          productCode: l.code,
          description: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          vatRate: l.vatRate,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          multiUnitId: l.availableUnits?.find((u) => u.id === l.unitId)?.isMultiUnit ? l.unitId : undefined,
          unitId: l.unitId,
          unitName: l.unit,
          dosageInstructions: l.dosageInstructions,
          duration: l.dosageInstructions?.duration,
          timing: l.dosageInstructions?.timing,
          frequency: l.dosageInstructions?.frequency,
          productName: l.name,
        })),
        customerId: custId,
        customerName: custName,
        cashAccountId: activeCashId,
        cardAccountId: selectedCardAccountId || undefined,
        salesmanId: selectedSalesmanId || undefined,
        patientName: selectedPatient.trim() || undefined,
        doctorName: selectedDoctor.trim() || undefined,
        doctorLicenseNo: doctors.find((d) => d.name === selectedDoctor)?.licenseNumber || undefined,
        emiratesId: emiratesId.trim() || undefined,
        prescriptionNumber: prescriptionNumber.trim() || undefined,
        prescriptionDate: prescriptionDate || undefined,
        otherDiscount: Number(totals.discount),
        roundOff: totals.roundOffNum,
        cashReceived: totals.grandTotalNum,
      };

      await salesApi.updateB2C(invoiceId, payload);
      loadInvoiceIds();
      setLastInvoiceSummary({
        invoiceNo,
        totalAmount: totals.grandTotalNum,
        date: invoiceDate,
      });
      setEditSuccessDialogOpen(true);
      setAlertInfo({ open: true, message: `Invoice ${invoiceNo} updated successfully.`, severity: 'success' });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Update failed';
      setAlertInfo({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete
  const handleDeleteClick = () => {
    if (!invoiceId) {
      setAlertInfo({ open: true, message: 'No saved invoice selected to delete.', severity: 'info' });
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceId || !companyId) return;
    setIsSaving(true);
    setDeleteConfirmOpen(false);
    try {
      await salesApi.deleteB2C(invoiceId, companyId);
      setAlertInfo({ open: true, message: `Invoice ${invoiceNo} deleted successfully.`, severity: 'success' });
      handleClear();
      loadInvoiceIds();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Delete failed';
      setAlertInfo({ open: true, message: msg, severity: 'error' });
    } finally {
      setIsSaving(false);
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
      // User typed a doctor name not saved (or OTC / empty) -> defaultly open New Doctor tab
      setDocTab('new');
      setDocFormSavedSelect('');
      const typedName = trimmed;
      setDocFormName(typedName);
      setDocFormLic('');
      setDocFormProv('MOHAP');
      setDocFormPhone('');
      setDocFormSpecialty('');
      setDocIsOpenAsUnsaved(Boolean(typedName));
    }
    setDoctorDialogOpen(true);
  };

  const handleCloseDoctorDialog = () => {
    if (docIsOpenAsUnsaved) {
      // If user typed an unsaved doctor name and closed without saving, clear it
      setSelectedDoctor('');
      setDocFormName('');
    }
    setDoctorDialogOpen(false);
    setDocIsOpenAsUnsaved(false);
  };

  const handleSelectSavedDoctor = () => {
    if (!docFormSavedSelect) {
      setAlertInfo({ open: true, message: 'Please select a doctor', severity: 'info' });
      return;
    }
    const found = doctors.find((d) => d.name === docFormSavedSelect);
    if (found) {
      setDocIsOpenAsUnsaved(false);
      setSelectedDoctor(found.name);
      setDocFormName(found.name);
      setDoctorDialogOpen(false);
      setAlertInfo({ open: true, message: `Doctor "${found.name}" selected`, severity: 'success' });
    }
  };

  const handleSaveDoctor = async () => {
    const docName = docFormName.trim();
    const docLic = docFormLic.trim();

    if (!docName) {
      setAlertInfo({ open: true, message: 'Please enter a doctor name', severity: 'error' });
      return;
    }
    if (!docLic) {
      setAlertInfo({ open: true, message: 'Please enter a valid license number', severity: 'error' });
      return;
    }

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

    const newDoc: DoctorItem = {
      name: docName,
      licenseNumber: docLic,
      licensingAuthority: docFormProv,
      phone: docFormPhone.trim() || undefined,
      specialty: docFormSpecialty.trim() || undefined,
    };

    setDoctors((prev) => {
      const filtered = prev.filter((d) => d.name.toLowerCase() !== docName.toLowerCase() && d.licenseNumber !== docLic);
      return [newDoc, ...filtered];
    });

    setDocIsOpenAsUnsaved(false);
    setSelectedDoctor(docName);
    setDoctorDialogOpen(false);
    setAlertInfo({ open: true, message: `Doctor "${docName}" saved & selected`, severity: 'success' });
  };

  // Helper: Format Emirates ID strictly as 784-YYYY-NNNNNNN-C (max 15 digits)
  const formatEmiratesId = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 15);
    if (!digits) return '';
    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 7) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    if (digits.length <= 14) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14, 15)}`;
  };

  // Helper: Prevent typing non-numeric characters in Emirates ID
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

  // Handle Emirates ID change or clear: automatically adds hyphens & clears Patient Details window
  const handleEmiratesIdChange = (raw: string) => {
    const formatted = formatEmiratesId(raw);
    setEmiratesId(formatted);
    setPatFormEid(formatted);

    // IF USER CLEAR OR CHANGE EMIRATES ID CLEAR THE PATIENT DETAILS WINDOW
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
        // User typed a custom patient name not in saved list -> defaultly open New Patient tab
        setPatTab('new');
        setPatFormSavedSelect('');
        setPatFormEid(emiratesId);
        const typedName = trimmed;
        setPatFormFirst(typedName);
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
        setPatIsOpenAsUnsaved(Boolean(typedName));
      }
    }
    setPatientDialogOpen(true);
  };

  const handleClosePatientDialog = () => {
    if (patIsOpenAsUnsaved) {
      // If user typed an unsaved patient name and closed without saving, clear it
      setSelectedPatient('');
      setPatFormFirst('');
      setPatFormFamily('');
    }
    setPatientDialogOpen(false);
    setPatIsOpenAsUnsaved(false);
  };

  const handleSelectSavedPatient = () => {
    if (!patFormSavedSelect) {
      setAlertInfo({ open: true, message: 'Please select a patient', severity: 'info' });
      return;
    }
    const found = patients.find((p) => p.fullName === patFormSavedSelect);
    if (found) {
      setPatIsOpenAsUnsaved(false);
      setSelectedPatient(found.fullName);
      setPatFormFirst(found.firstName || found.fullName);
      if (found.emiratesId) setEmiratesId(found.emiratesId);
      setPatientDialogOpen(false);
      setAlertInfo({ open: true, message: `Patient "${found.fullName}" selected`, severity: 'success' });
    }
  };

  const handleSearchPatientByEid = async () => {
    if (!companyId || !patFormEid.trim()) return;
    setPatSearchLoading(true);
    try {
      const res = await salesApi.findPatientByEmiratesId(companyId, patFormEid.trim());
      const pat = res.data?.data as PatientItem | null;
      if (pat) {
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
        setAlertInfo({ open: true, message: `Found record for ${pat.fullName}`, severity: 'success' });
      } else {
        setAlertInfo({ open: true, message: 'No saved patient found. Enter details manually.', severity: 'info' });
      }
    } catch {
      setAlertInfo({ open: true, message: 'No saved patient found. Enter details manually.', severity: 'info' });
    } finally {
      setPatSearchLoading(false);
    }
  };

  const handleSavePatient = async () => {
    if (!patFormFirst.trim()) {
      setAlertInfo({ open: true, message: 'First name is required to save patient', severity: 'error' });
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
      setEmiratesId(patFormEid.trim());
    }
    setPatientDialogOpen(false);
    setAlertInfo({ open: true, message: `Patient "${fullName}" saved & selected`, severity: 'success' });
  };

  const handleEditPatient = async () => {
    if (!patFormFirst.trim()) {
      setAlertInfo({ open: true, message: 'First name is required to edit patient', severity: 'error' });
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
      setEmiratesId(patFormEid.trim());
    }
    setPatientDialogOpen(false);
    setAlertInfo({ open: true, message: `Patient "${fullName}" updated & selected`, severity: 'success' });
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: 'calc(100vh - 44px - 24px)',
        maxHeight: 'calc(100vh - 44px - 24px)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#eef2f1',
        color: '#12201e',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        overflow: 'hidden',
        borderRadius: 2,
        p: 1,
      }}
    >
      {/* ── TOP HEADER BAR (2 Rows) ── */}
      <Box
        sx={{
          flex: 'none',
          bgcolor: '#ffffff',
          borderRadius: 2,
          border: '1px solid #d5dfdc',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          p: 1.5,
          mb: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* ROW 1: Branding, Invoice Number, Navigation Buttons, Invoice Date, Status */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Brand Logo & Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalPharmacyIcon sx={{ color: '#0f6b62', fontSize: 26 }} />
            <Typography sx={{ fontSize: 19, fontWeight: 800, color: '#0b4f48', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
              Pharmacy POS
            </Typography>
          </Box>

          {/* Center: Invoice No & Navigation Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase' }}>
                    Invoice No.
                  </Typography>
                  {invoiceId && (
                    <Chip
                      label="Saved"
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: 9.5,
                        fontWeight: 700,
                        bgcolor: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        px: 0.4,
                      }}
                    />
                  )}
                </Box>
                <Chip
                  label={invoiceNo}
                  size="small"
                  sx={{
                    bgcolor: invoiceId ? '#ecfdf5' : '#e6f3f1',
                    color: '#0b4f48',
                    fontWeight: 800,
                    fontSize: 13,
                    height: 30,
                    border: '1px solid #b7d9d4',
                    mt: 0.2,
                  }}
                />
              </Box>

              {/* Navigation buttons: First, Previous, Next, Last */}
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', alignSelf: 'flex-end', mb: 0.1 }}>
                {[
                  {
                    icon: <FirstIcon sx={{ fontSize: 19 }} />,
                    handler: handleFirstInvoice,
                    tip: 'First Invoice (Oldest)',
                    disabled: invoiceIds.length === 0 || (!!invoiceId && invoiceIds.indexOf(invoiceId) === invoiceIds.length - 1),
                  },
                  {
                    icon: <PrevIcon sx={{ fontSize: 19 }} />,
                    handler: handlePrevInvoice,
                    tip: 'Previous Invoice',
                    disabled: invoiceIds.length === 0 || (!!invoiceId && invoiceIds.indexOf(invoiceId) === invoiceIds.length - 1),
                  },
                  {
                    icon: <NextIcon sx={{ fontSize: 19 }} />,
                    handler: handleNextInvoice,
                    tip: 'Next Invoice',
                    disabled: invoiceIds.length === 0 || !invoiceId || invoiceIds.indexOf(invoiceId) === 0,
                  },
                  {
                    icon: <LastIcon sx={{ fontSize: 19 }} />,
                    handler: handleLastInvoice,
                    tip: 'Last Invoice (Newest)',
                    disabled: invoiceIds.length === 0 || (!!invoiceId && invoiceIds.indexOf(invoiceId) === invoiceIds.length - 0),
                  },
                ].map((nav, i) => (
                  <Tooltip key={i} title={nav.tip}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={nav.handler}
                        disabled={nav.disabled || isLoadingInvoice}
                        sx={{
                          bgcolor: '#334155',
                          color: '#fff',
                          width: 32,
                          height: 32,
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: '#1e293b' },
                          '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                        }}
                      >
                        {nav.icon}
                      </IconButton>
                    </span>
                  </Tooltip>
                ))}

                <Tooltip title="Find / Search Saved Invoice">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSearchInvoiceNo('');
                      loadInvoiceIds();
                      setSearchDialogOpen(true);
                    }}
                    sx={{
                      bgcolor: '#0f766e',
                      color: '#fff',
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      '&:hover': { bgcolor: '#0d9488' },
                    }}
                  >
                    <SearchIcon sx={{ fontSize: 19 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Invoice Date */}
            <Box sx={{ ml: { xs: 0, sm: 1.5 }, display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase' }}>
                Invoice Date
              </Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#12201e', lineHeight: 1.4 }}>
                {invoiceDate}
              </Typography>
            </Box>
          </Box>

          {/* Right: Hold & Held Invoices + Status badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Hold & Held Invoices */}
            <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}>
              <Tooltip title="Hold this sale for later">
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleHoldInvoice}
                    disabled={isSaved || lines.length === 0}
                    startIcon={<HoldIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      height: 30,
                      px: 1.2,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'none',
                      borderRadius: 1.5,
                      boxShadow: 'none',
                      bgcolor: '#f59e0b',
                      color: '#fff',
                      '&:hover': { bgcolor: '#d97706' },
                      '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                    }}
                  >
                    Hold
                  </Button>
                </span>
              </Tooltip>

              <Tooltip title={heldInvoices.length > 0 ? `${heldInvoices.length} held sale(s)` : 'No held sales'}>
                <Badge badgeContent={heldInvoices.length} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 9.5, height: 16, minWidth: 16 } }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setHoldListDialogOpen(true)}
                    sx={{
                      height: 30,
                      minWidth: 34,
                      px: 0.8,
                      borderRadius: 1.5,
                      borderColor: '#cbd5e1',
                      color: '#475569',
                      bgcolor: '#fff',
                      '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
                    }}
                  >
                    <HoldListIcon sx={{ fontSize: 18 }} />
                  </Button>
                </Badge>
              </Tooltip>
            </Box>

            <Chip
              label="CASH IN HAND Ready"
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontSize: 11.5, fontWeight: 700, height: 26, display: { xs: 'none', sm: 'inline-flex' } }}
            />
          </Box>
        </Box>

        {/* ROW 2: Transaction Details Fields */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          {/* Salesman Select */}
          <Box sx={{ flex: '1 1 160px', minWidth: 150, maxWidth: { md: 210 } }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase', mb: 0.3 }}>
              Salesman
            </Typography>
            <select
              value={selectedSalesmanId}
              onChange={(e) => setSelectedSalesmanId(e.target.value)}
              style={{
                height: 32,
                width: '100%',
                borderRadius: 6,
                border: '1px solid #c6d2cf',
                padding: '0 8px',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#12201e',
                background: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            >
              <option value="">-- Select Salesman --</option>
              {salesmen.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName || u.username}
                </option>
              ))}
            </select>
          </Box>

          {/* Cash / Customer A/C */}
          <Box sx={{ flex: '1.5 1 240px', minWidth: 200, maxWidth: { md: 320 } }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase', mb: 0.3 }}>
              Cash / Customer A/C
            </Typography>
            <Autocomplete
              size="small"
              options={customerOptions}
              getOptionLabel={(opt) => `${opt.name}${opt.code ? ` (${opt.code})` : ''}`}
              isOptionEqualToValue={(opt, val) => opt._id === val?._id}
              value={selectedCustomer}
              onChange={(_, val) => {
                setSelectedCustomer(val);
                if (val && val.type === 'Cash') {
                  setCashAccountId(val._id);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="CASH IN HAND / Customer"
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      height: 32,
                      borderRadius: 1.5,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      bgcolor: '#fff',
                      p: '0 8px !important',
                      borderColor: '#c6d2cf',
                    },
                    '& .MuiInputBase-input': { p: '0 !important', fontSize: '0.8rem' },
                  }}
                />
              )}
            />
          </Box>

          {/* Prescription Number */}
          <Box sx={{ flex: '1 1 140px', minWidth: 130, maxWidth: { md: 170 } }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase', mb: 0.3 }}>
              Prescription No.
            </Typography>
            <input
              value={prescriptionNumber}
              onChange={(e) => setPrescriptionNumber(e.target.value)}
              placeholder="Rx Number"
              style={{
                height: 32,
                width: '100%',
                borderRadius: 6,
                border: '1px solid #c6d2cf',
                padding: '0 8px',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#12201e',
                background: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </Box>

          {/* Prescription Date */}
          <Box sx={{ flex: '1 1 130px', minWidth: 125, maxWidth: { md: 155 } }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase', mb: 0.3 }}>
              Rx Date
            </Typography>
            <Box
              onClick={() => rxDateRef.current?.showPicker?.()}
              sx={{ position: 'relative', cursor: 'pointer' }}
            >
              <input
                type="text"
                readOnly
                value={formatDateDisplay(prescriptionDate)}
                style={{
                  height: 32,
                  width: '100%',
                  borderRadius: 6,
                  border: '1px solid #c6d2cf',
                  padding: '0 6px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#12201e',
                  background: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                }}
              />
              <input
                ref={rxDateRef}
                type="date"
                value={prescriptionDate}
                onChange={(e) => setPrescriptionDate(e.target.value)}
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

          {/* Card Account */}
          <Box sx={{ flex: '1 1 160px', minWidth: 150, maxWidth: { md: 220 } }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#4b5f5c', textTransform: 'uppercase', mb: 0.3 }}>
              Card Account
            </Typography>
            <Autocomplete
              size="small"
              options={cardAccounts}
              getOptionLabel={(opt) => `${opt.name}${opt.code ? ` (${opt.code})` : ''}`}
              isOptionEqualToValue={(opt, val) => opt._id === val?._id}
              value={cardAccounts.find((c) => c._id === selectedCardAccountId) || null}
              onChange={(_, val) => setSelectedCardAccountId(val?._id || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select Card A/C"
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      height: 32,
                      borderRadius: 1.5,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      bgcolor: '#fff',
                      p: '0 8px !important',
                      borderColor: '#c6d2cf',
                    },
                    '& .MuiInputBase-input': { p: '0 !important', fontSize: '0.8rem' },
                  }}
                />
              )}
            />
          </Box>
        </Box>
      </Box>

      {/* ── MAIN CONTENT (Split View: Left Cart, Right Sidebar) ── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: 1.25,
          overflow: 'hidden',
        }}
      >
        {/* ── LEFT AREA: Search & Cart Table ── */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minHeight: 0,
          }}
        >
          {/* SEARCH & SCAN BAR */}
          <Box sx={{ display: 'flex', gap: 1, position: 'relative' }}>
            <Box sx={{ flex: 1, position: 'relative' }}>
              <SearchIcon
                sx={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#4b5f5c',
                  fontSize: 20,
                  zIndex: 2,
                }}
              />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleBarcodeSubmit}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                placeholder="Scan barcode or search medicine by name, generic, code... (Use Up/Down arrows to choose)"
                style={{
                  height: 40,
                  boxSizing: 'border-box',
                  width: '100%',
                  border: '1px solid #c6d2cf',
                  borderRadius: 8,
                  padding: '0 40px 0 40px',
                  font: "600 13px 'Plus Jakarta Sans', system-ui, sans-serif",
                  color: '#12201e',
                  background: '#fff',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                {isSearching && <CircularProgress size={16} sx={{ color: '#0f6b62' }} />}
                <Tooltip title="Barcode Scanner Active">
                  <QrCodeScannerIcon sx={{ color: '#0f6b62', fontSize: 20 }} />
                </Tooltip>
              </Box>

              {/* SEARCH AUTOCOMPLETE DROPDOWN */}
              {showDropdown && searchResults.length > 0 && (
                <Paper
                  ref={dropdownListRef}
                  onMouseDown={(e) => e.preventDefault()}
                  sx={{
                    position: 'absolute',
                    top: 44,
                    left: 0,
                    right: 0,
                    bgcolor: '#fff',
                    borderRadius: 2,
                    border: '1px solid #c6d2cf',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  {searchResults.map((prod, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <Box
                        key={prod._id}
                        data-search-idx={idx}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => {
                          setShowDropdown(false);
                          setHighlightedIndex(-1);
                          addProductToCart(prod);
                        }}
                        sx={{
                          p: 1.2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          borderBottom: '1px solid #eef2f1',
                          bgcolor: isHighlighted ? '#e6f4f2' : '#fff',
                          borderLeft: isHighlighted ? '4px solid #0f6b62' : '4px solid transparent',
                          transition: 'background-color 0.1s ease',
                          '&:hover': { bgcolor: '#f2f9f8' },
                        }}
                      >
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#12201e' }}>
                            {prod.name}
                          </Typography>
                          {prod.isControlledSubstance && (
                            <span
                              style={{
                                background: '#b3360a',
                                color: '#fff',
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: 4,
                              }}
                            >
                              Rx
                            </span>
                          )}
                          {(prod.currentStock ?? 0) > 0 ? (
                            <span
                              style={{
                                background: '#e6f4f2',
                                color: '#0b4f48',
                                fontSize: 10.5,
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: 4,
                                border: '1px solid #99f6e4',
                              }}
                            >
                              Stock: {prod.currentStock}
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#fef2f2',
                                color: '#b91c1c',
                                fontSize: 10.5,
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: 4,
                                border: '1px solid #fca5a5',
                              }}
                            >
                              No Stock
                            </span>
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 11, color: '#4b5f5c' }}>
                          Code: {prod.code || 'N/A'} {prod.genericName ? `· Generic: ${prod.genericName}` : ''}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#0b4f48' }}>
                        AED {Number(prod.sellingPrice ?? prod.retailPrice ?? 0).toFixed(2)}
                      </Typography>
                    </Box>
                    );
                  })}
                </Paper>
              )}
              {showDropdown && !isSearching && searchResults.length === 0 && searchTerm.trim().length >= 2 && (
                <Paper
                  sx={{
                    position: 'absolute',
                    top: 44,
                    left: 0,
                    right: 0,
                    bgcolor: '#fff',
                    borderRadius: 2,
                    border: '1px solid #d3dcd9',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    p: 1.5,
                    textAlign: 'center',
                  }}
                >
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#4b5f5c' }}>
                    No items found for "{searchTerm}"
                  </Typography>
                </Paper>
              )}
            </Box>

            <Button
              variant="outlined"
              onClick={() => {
                if (searchResults.length > 0) addProductToCart(searchResults[0]);
              }}
              sx={{
                height: 40,
                px: 2,
                color: '#0b4f48',
                borderColor: '#0f6b62',
                borderRadius: 2,
                fontWeight: 700,
                fontSize: 13,
                textTransform: 'none',
                '&:hover': { bgcolor: '#f2f9f8', borderColor: '#0b4f48' },
              }}
            >
              Add Item
            </Button>
          </Box>

          {/* CART TABLE CONTAINER */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              bgcolor: '#ffffff',
              border: '1px solid #d5dfdc',
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            {/* TABLE HEADER */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '36px minmax(0,1.3fr) 68px 90px 105px 85px 70px 90px 42px',
                alignItems: 'center',
                height: 36,
                flex: 'none',
                bgcolor: '#0f6b62',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.4px',
                px: 1,
              }}
            >
              <div>#</div>
              <div>DESCRIPTION / BATCH</div>
              <div style={{ textAlign: 'center' }}>RX</div>
              <div style={{ textAlign: 'center' }}>UNIT</div>
              <div style={{ textAlign: 'center' }}>QTY</div>
              <div style={{ textAlign: 'right' }}>UNIT PRICE</div>
              <div style={{ textAlign: 'right' }}>VAT</div>
              <div style={{ textAlign: 'right' }}>TOTAL</div>
              <div></div>
            </Box>

            {/* TABLE BODY (Scrolls internally if rows overflow) */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {lines.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', color: '#4b5f5c' }}>
                  <LocalPharmacyIcon sx={{ fontSize: 44, color: '#b7d9d4', mb: 1 }} />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    Cart is empty. Scan barcode or search medicine to add.
                  </Typography>
                </Box>
              ) : (
                lines.map((it, idx) => (
                  <Box
                    key={`${it.productId}-${idx}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '36px minmax(0,1.3fr) 68px 90px 105px 85px 70px 90px 42px',
                      alignItems: 'center',
                      minHeight: 52,
                      py: 0.75,
                      px: 1,
                      borderBottom: '1px solid #e3eae8',
                      transition: 'background 0.1s',
                      '&:hover': { bgcolor: '#f7faf9' },
                    }}
                  >
                    <Typography sx={{ fontSize: 12, color: '#4b5f5c', fontWeight: 600 }}>
                      {idx + 1}
                    </Typography>

                    <Box sx={{ minWidth: 0, pr: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#12201e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {it.name}
                        </Typography>
                        {it.isRx && (
                          <span
                            style={{
                              background: '#b3360a',
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 4,
                            }}
                          >
                            Rx
                          </span>
                        )}
                      </Box>

                      {/* BATCH SELECTOR (Touch friendly) */}
                      {it.availableBatches && it.availableBatches.length > 1 ? (
                        <Box sx={{ mt: 0.3 }}>
                          <select
                            value={it.batchNumber}
                            onChange={(e) => handleBatchChange(idx, e.target.value)}
                            style={{
                              height: 28,
                              maxWidth: '100%',
                              padding: '0 6px',
                              borderRadius: 5,
                              border: '1px solid #0f766e',
                              background: '#f0f7f6',
                              color: '#0b4f48',
                              fontSize: 11,
                              fontWeight: 700,
                              outline: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {it.availableBatches.map((b) => (
                              <option key={b.batchNumber} value={b.batchNumber}>
                                Batch: {b.batchNumber} · Exp: {b.expiryDate}{b.quantity !== undefined ? ` (Stock: ${b.quantity})` : ''}
                              </option>
                            ))}
                          </select>
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: 11, color: '#4b5f5c', mt: 0.2 }}>
                          Batch {it.batchNumber} · Exp {it.expiryDate}
                          {it.availableStock !== undefined ? ` · Stock: ${it.availableStock}` : ''}
                        </Typography>
                      )}
                    </Box>

                    {/* RX COLUMN WITH TOUCH FRIENDLY [+] BUTTON */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <Tooltip title={it.dosageInstructions?.summary ? `Dosage: ${it.dosageInstructions.summary}` : "Add Medication Instructions"}>
                        <button
                          type="button"
                          onClick={() => handleOpenMedicationDialog(idx)}
                          style={{
                            height: 32,
                            padding: '0 7px',
                            borderRadius: 6,
                            border: it.dosageInstructions?.summary ? '1.5px solid #0f766e' : '1px solid #c6d2cf',
                            background: it.dosageInstructions?.summary ? '#e6f4f2' : '#fff',
                            color: it.dosageInstructions?.summary ? '#0f766e' : '#4b5f5c',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 11,
                            fontWeight: 700,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>Rx</span>
                          {it.dosageInstructions?.summary ? (
                            <CheckCircleIcon sx={{ fontSize: 14, color: '#0f766e' }} />
                          ) : (
                            <AddIcon sx={{ fontSize: 15, color: '#0f6b62' }} />
                          )}
                        </button>
                      </Tooltip>
                    </Box>

                    {/* UNIT SELECTION COLUMN (RIGHT SIDE OF RX) */}
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      {it.availableUnits && it.availableUnits.length > 1 ? (
                        <select
                          value={it.unitId || it.availableUnits[0].id}
                          onChange={(e) => handleUnitChange(idx, e.target.value)}
                          style={{
                            height: 32,
                            width: '100%',
                            maxWidth: 82,
                            padding: '0 4px',
                            borderRadius: 6,
                            border: '1px solid #0f766e',
                            background: '#fff',
                            color: '#12201e',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          {it.availableUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Box
                          sx={{
                            height: 28,
                            px: 1,
                            borderRadius: 1.5,
                            bgcolor: '#f3f6f5',
                            border: '1px solid #d3dcd9',
                            color: '#3d524e',
                            fontSize: 11.5,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {it.unit || 'Pcs'}
                        </Box>
                      )}
                    </Box>

                    {/* QTY STEPPER (TOUCH FRIENDLY) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, -1)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: '1px solid #c6d2cf',
                          background: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 16,
                        }}
                      >
                        <RemoveIcon sx={{ fontSize: 16 }} />
                      </button>
                      <span style={{ minWidth: 26, textAlign: 'center', fontSize: 13.5, fontWeight: 700 }}>
                        {it.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, 1)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: '1px solid #c6d2cf',
                          background: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 16,
                        }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </button>
                    </Box>

                    <Typography sx={{ textAlign: 'right', fontSize: 12.5, fontWeight: 600 }}>
                      {it.unitPrice.toFixed(2)}
                    </Typography>

                    <Typography sx={{ textAlign: 'right', fontSize: 12, color: '#4b5f5c' }}>
                      {((it.quantity * it.unitPrice - it.discount) * (it.vatRate / 100)).toFixed(2)}
                    </Typography>

                    <Typography sx={{ textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: '#0b4f48' }}>
                      {it.totalAmount.toFixed(2)}
                    </Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <IconButton
                        size="small"
                        onClick={() => removeLine(idx)}
                        sx={{ color: '#b3360a', p: 0.75, '&:hover': { bgcolor: '#fdeeed' } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </Box>

        {/* ── RIGHT AREA: Patient Info, Payment, Billing Summary ── */}
        <Box
          sx={{
            width: { xs: 320, md: 360, lg: 380 },
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minHeight: 0,
          }}
        >
          {/* PATIENT & PRESCRIPTION CARD */}
          <Box
            sx={{
              bgcolor: '#fff',
              border: '1px solid #d5dfdc',
              borderRadius: 2,
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              flex: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            {/* Emirates ID */}
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#4b5f5c', mb: 0.3 }}>
                Emirates ID
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <input
                  value={emiratesId}
                  onChange={(e) => handleEmiratesIdChange(e.target.value)}
                  onKeyDown={handleEmiratesIdKeyDown}
                  placeholder="784-XXXX-XXXXXXX-X"
                  maxLength={18}
                  style={{
                    height: 32,
                    flex: 1,
                    borderRadius: 6,
                    border: '1px solid #c6d2cf',
                    padding: '0 8px',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => {
                    handleOpenPatientDialog();
                    if (emiratesId.trim()) {
                      handleSearchPatientByEid();
                    }
                  }}
                  title="Lookup Patient by Emirates ID"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: '1px solid #c6d2cf',
                    background: '#fff',
                    color: '#0f6b62',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SearchIcon sx={{ fontSize: 18 }} />
                </button>
              </Box>
            </Box>

            {/* PATIENT COMBOBOX WITH [+] BUTTON */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#4b5f5c' }}>
                  Patient Name
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={patients.map((p) => p.fullName)}
                  value={selectedPatient}
                  onInputChange={(_, newVal) => {
                    setSelectedPatient(newVal);
                    setPatFormFirst(newVal);
                  }}
                  onChange={(_, val) => {
                    const chosen = val || '';
                    setSelectedPatient(chosen);
                    const match = patients.find((p) => p.fullName === chosen);
                    setPatFormFirst(match?.firstName || chosen);
                    if (match?.emiratesId) setEmiratesId(match.emiratesId);
                  }}
                  sx={{ flex: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Select or enter patient name"
                      variant="outlined"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          height: 32,
                          borderRadius: 1.5,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          bgcolor: '#fff',
                          p: '0 6px !important',
                        },
                        '& .MuiInputBase-input': { p: '0 !important', fontSize: '0.75rem' },
                      }}
                    />
                  )}
                />
                <Tooltip title="Patient Details">
                  <button
                    onClick={handleOpenPatientDialog}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: '1px solid #0f6b62',
                      background: '#0f6b62',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AddIcon sx={{ fontSize: 18 }} />
                  </button>
                </Tooltip>
              </Box>
            </Box>

            {/* DOCTOR COMBOBOX WITH [+] BUTTON */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#4b5f5c' }}>
                  Prescribing Doctor
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={doctors.map((d) => d.name)}
                  value={selectedDoctor}
                  onInputChange={(_, newVal) => {
                    setSelectedDoctor(newVal);
                    setDocFormName(newVal);
                  }}
                  onChange={(_, val) => {
                    const chosen = val || '';
                    setSelectedDoctor(chosen);
                    setDocFormName(chosen);
                    const match = doctors.find((d) => d.name === chosen);
                    if (match) {
                      setDocFormLic(match.licenseNumber);
                      if (match.licensingAuthority) setDocFormProv(match.licensingAuthority as any);
                    }
                  }}
                  sx={{ flex: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Select or enter doctor"
                      variant="outlined"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          height: 32,
                          borderRadius: 1.5,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          bgcolor: '#fff',
                          p: '0 6px !important',
                        },
                        '& .MuiInputBase-input': { p: '0 !important', fontSize: '0.75rem' },
                      }}
                    />
                  )}
                />
                <Tooltip title="Add Doctor Details">
                  <button
                    onClick={handleOpenDoctorDialog}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: '1px solid #0f6b62',
                      background: '#0f6b62',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AddIcon sx={{ fontSize: 18 }} />
                  </button>
                </Tooltip>
              </Box>
            </Box>

            {/* Riayati Sale Checkbox */}
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.2 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: '#0b4f48',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isRiayati}
                  onChange={(e) => setIsRiayati(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#0f6b62', cursor: 'pointer' }}
                />
                Riayati sale (E-Prescription)
              </label>
            </Box>

            {/* PAYMENT DETAILS BUTTON (Moved below Patient / Doctor section with reduced height) */}
            <button
              type="button"
              onClick={handleOpenPaymentDialog}
              style={{
                height: 44,
                width: '100%',
                borderRadius: 8,
                border: '1.5px solid #0f6b62',
                background: '#0f6b62',
                color: '#fff',
                font: "700 14px 'Plus Jakarta Sans', system-ui, sans-serif",
                cursor: 'pointer',
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(15, 107, 98, 0.2)',
                transition: 'all 0.15s ease',
                marginTop: 4,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Payment details
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  background: 'rgba(255, 255, 255, 0.22)',
                  padding: '3px 8px',
                  borderRadius: 5,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                }}
              >
                {paymentMode === 'Split' ? 'CARD + CASH' : paymentMode}
              </span>
            </button>
          </Box>

          {/* BILLING SUMMARY CARD */}
          <Box
            sx={{
              bgcolor: '#fff',
              border: '1px solid #d5dfdc',
              borderRadius: 2,
              p: 1.1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.35,
              flex: 1,
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4b5f5c' }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>AED {totals.subtotal}</span>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#4b5f5c' }}>Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={discountAED === 0 ? '' : discountAED}
                  onChange={(e) => setDiscountAED(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  style={{
                    width: 76,
                    height: 22,
                    textAlign: 'right',
                    border: '1px solid #c6d2cf',
                    borderRadius: 5,
                    padding: '0 4px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4b5f5c' }}>Taxable</span>
                <span style={{ fontWeight: 600 }}>AED {totals.taxable}</span>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4b5f5c' }}>VAT (5%)</span>
                <span style={{ fontWeight: 600 }}>AED {totals.vat}</span>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#4b5f5c' }}>Round off</span>
                <span style={{ fontWeight: 600 }}>AED {totals.roundOff}</span>
              </Box>

              {/* Grand Total */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  borderTop: '1px dashed #b7c5c2',
                  pt: 0.5,
                  mt: 0.25,
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#12201e' }}>
                  Grand Total
                </Typography>
                <Typography sx={{ fontSize: 19, fontWeight: 800, color: '#0b4f48', letterSpacing: '-0.4px' }}>
                  AED {totals.grandTotal}
                </Typography>
              </Box>
            </Box>

            {/* ACTION BUTTONS & SAVE & CHARGE */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mt: 1 }}>
              {/* Row 1: Print, Edit, Delete */}
              <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center' }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowReceiptDialog(true)}
                  disabled={!isSaved}
                  startIcon={<PrintIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    flex: 1,
                    height: 36,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    borderRadius: 1.5,
                    borderColor: '#c6d2cf',
                    color: '#12201e',
                    '&.Mui-disabled': { borderColor: '#e2e8f0', color: '#94a3b8' },
                  }}
                >
                  Print
                </Button>

                {/* Small Edit Button (matches Sales Window behaviour) */}
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleEditClick}
                  disabled={!invoiceId || isSaving}
                  startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    flex: 1,
                    height: 36,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 1.5,
                    boxShadow: 'none',
                    bgcolor: '#0f6b62',
                    color: '#fff',
                    '& .MuiSvgIcon-root': { fontSize: 16 },
                    '&:hover': { bgcolor: '#0b4f48' },
                    '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                  }}
                >
                  Edit
                </Button>

                {/* Small Delete Button (matches Sales Window behaviour) */}
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleDeleteClick}
                  disabled={!invoiceId || isSaving}
                  startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    flex: 1,
                    height: 36,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 1.5,
                    boxShadow: 'none',
                    bgcolor: '#dc2626',
                    color: '#fff',
                    '& .MuiSvgIcon-root': { fontSize: 16 },
                    '&:hover': { bgcolor: '#b91c1c' },
                    '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                  }}
                >
                  Delete
                </Button>
              </Box>

              {/* Row 2: Clear */}
              <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center' }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  onClick={handleClear}
                  startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    height: 36,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    borderRadius: 1.5,
                    borderColor: '#c6d2cf',
                    color: '#b3360a',
                    '&:hover': { borderColor: '#b3360a', bgcolor: '#fff5f2' },
                  }}
                >
                  Clear
                </Button>
              </Box>

              <Button
                variant="contained"
                disabled={isSaving || lines.length === 0 || isSaved}
                onClick={handleOpenPaymentDialog}
                sx={{
                  height: 48,
                  borderRadius: 2.2,
                  bgcolor: '#0f6b62',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 15.5,
                  textTransform: 'none',
                  letterSpacing: '0.2px',
                  boxShadow: '0 4px 12px rgba(15, 107, 98, 0.25)',
                  '&:hover': { bgcolor: '#0b4f48' },
                  '&:disabled': { bgcolor: isSaved ? '#94a3b8' : '#b7d9d4', color: '#fff' },
                }}
              >
                {isSaving ? (
                  <CircularProgress size={22} color="inherit" />
                ) : isSaved ? (
                  `Saved  AED ${totals.grandTotal}`
                ) : (
                  `Save & Charge  AED ${totals.grandTotal}`
                )}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── MEDICATION DETAILS DIALOG (Replicating Doctor Details & Screenshot Aesthetic) ── */}
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
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: '8px 14px',
            bgcolor: '#f3f6f5',
            borderBottom: '1px solid #d3dcd9',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalPharmacyIcon sx={{ fontSize: 18, color: '#0f766e' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#15302e' }}>
              Medication Details
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#0f766e' }}>
              Prescription Instructions
            </Typography>
            <IconButton size="small" onClick={() => setMedicationDialogOpen(false)} sx={{ p: 0.5 }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ p: '18px 22px 14px' }}>
          {/* PRODUCT INFO CARD (Styled from user screenshot) */}
          {selectedMedLineIndex !== null && lines[selectedMedLineIndex] && (
            <Box
              sx={{
                bgcolor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                p: '12px 14px',
                mb: 2,
              }}
            >
              <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#1d4ed8', letterSpacing: '-0.2px' }}>
                {lines[selectedMedLineIndex].name.toUpperCase()}
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#2563eb', mt: 0.3, fontWeight: 600 }}>
                Item Code: {lines[selectedMedLineIndex].code || lines[selectedMedLineIndex].productId.slice(-4).toUpperCase() || '11'}
                {lines[selectedMedLineIndex].batchNumber ? ` · Batch: ${lines[selectedMedLineIndex].batchNumber}` : ''}
              </Typography>
            </Box>
          )}

          {/* MEDICINE DURATION */}
          <Box sx={{ mb: 1.8 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#5d716e', mb: 0.5 }}>
              Medicine Duration (Days):
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <select
                value={['1', '2', '3', '5', '7', '10', '14', '21', '30', '60', '90'].includes(medDuration) ? medDuration : (medDuration ? 'custom' : '')}
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
                <option value="">Preset days...</option>
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
                  // Allow numbers only
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
                placeholder="Enter value (e.g. 1, 2.5, 10)"
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow numbers and decimals only (e.g. 1, 2, 2.5, 0.5, 10, 12.5)
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
            <Typography sx={{ fontSize: 11, color: '#7a8c88', mt: 0.5 }}>
              Select 1 to 9, More than 9, or type any number/decimal directly.
            </Typography>
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

      {/* ── DOCTOR DETAILS DIALOG (Replicating DESIGN NEW WINDOW DETAILS) ── */}
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
                  <Typography sx={{ fontSize: 12, color: '#5d716e', mt: 0.4 }}>
                    Digits from the doctor's license.
                  </Typography>
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
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      bgcolor: '#0f766e',
                      color: '#fff',
                      borderColor: '#0f766e',
                    },
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
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      bgcolor: '#0f766e',
                      color: '#fff',
                      borderColor: '#0f766e',
                    },
                  }}
                >
                  Save doctor
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Dialog>

      {/* ── PATIENT DETAILS DIALOG (Replicating DESIGN NEW WINDOW DETAILS) ── */}
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
                  <Typography sx={{ fontSize: 12, color: '#5d716e', mt: 0.4 }}>
                    15 digits, starting with 784 (e.g. 784-1990-1234567-1).
                  </Typography>
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
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      color: '#15302e',
                      borderColor: '#d3dcd9',
                      bgcolor: '#fff',
                    },
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
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      bgcolor: '#0f766e',
                      color: '#fff',
                      borderColor: '#0f766e',
                    },
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
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      color: '#15302e',
                      borderColor: '#d3dcd9',
                      bgcolor: '#fff',
                    },
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
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      bgcolor: '#0f766e',
                      color: '#fff',
                      borderColor: '#0f766e',
                    },
                  }}
                >
                  Save patient
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Dialog>

      {/* ── PAYMENT MODAL DIALOG (DESIGN: POS payment window.html) ── */}
      <Dialog
        open={paymentDialogOpen}
        onClose={() => {
          if (!isSaving) setPaymentDialogOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            maxWidth: 380,
            borderRadius: '10px',
            bgcolor: '#ffffff',
            border: '1px solid #d3dcd9',
            boxShadow: '0 10px 30px rgba(10,31,28,0.12)',
            overflow: 'hidden',
            fontFamily: "'Instrument Sans', 'Plus Jakarta Sans', system-ui, sans-serif",
          },
        }}
      >
        {/* TOP BAR */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: '14px',
            py: '8px',
            bgcolor: '#f3f6f5',
            borderBottom: '1px solid #d3dcd9',
            fontSize: '12.5px',
            color: '#5d716e',
            fontWeight: 600,
          }}
        >
          <span>Payment</span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setPaymentDialogOpen(false)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 6,
              fontSize: 18,
              lineHeight: 1,
              color: '#5d716e',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#d3dcd9')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            ×
          </button>
        </Box>

        {/* AMOUNT DUE BANNER */}
        <Box
          sx={{
            p: '16px 20px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: '1px solid #d3dcd9',
          }}
        >
          <span style={{ color: '#5d716e', fontWeight: 500, fontSize: 13 }}>Amount due</span>
          <div>
            <b
              style={{
                fontSize: 30,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                color: '#15302e',
              }}
            >
              {totals.grandTotal}
            </b>
            <small style={{ fontSize: 14, fontWeight: 600, color: '#5d716e', marginLeft: 4 }}>AED</small>
          </div>
        </Box>

        {/* FORM CONTENT */}
        {!paymentDone ? (
          <Box>
            <Box sx={{ p: '16px 20px 6px' }}>
              {/* PAYMENT METHOD TOGGLE (CARD + CASH ONLY) */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  p: '3px',
                  bgcolor: '#f3f6f5',
                  border: '1px solid #d3dcd9',
                  borderRadius: '8px',
                  mb: '16px',
                }}
              >
                <button
                  type="button"
                  aria-pressed="true"
                  style={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    cursor: 'default',
                    textAlign: 'center',
                    padding: '8px 4px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 13,
                    background: '#ffffff',
                    color: '#15302e',
                    boxShadow: '0 1px 3px rgba(10,31,28,0.19)',
                  }}
                >
                  Card + Cash
                </button>
              </Box>


              {/* CARD + CASH SPLIT PANEL */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Cash portion & Card portion row */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <Box>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 18,
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#334844',
                        marginBottom: 5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Cash portion (AED)
                      {isCashInHandCustomer && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: '0.4px',
                            lineHeight: '11px',
                            color: '#0f766e',
                            background: '#e6f2f0',
                            border: '1px solid #c9e3df',
                            borderRadius: 3,
                            padding: '1px 4px',
                          }}
                        >
                          AUTO
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={isCashInHandCustomer ? computePaymentSplit().autoCash.toFixed(2) : splitCashAmount}
                      disabled={isCashInHandCustomer}
                      title={isCashInHandCustomer ? 'Cash In Hand: cash is calculated automatically as the invoice balance after card' : undefined}
                      onChange={(e) => handleSplitCashChange(e.target.value)}
                      onFocus={() => {
                        setSplitCashAmount('');
                      }}
                      onBlur={() => {
                        if (!splitCashAmount.trim()) {
                          setSplitCashAmount('0');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          splitCardInputRef.current?.focus();
                        }
                      }}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        height: 48,
                        padding: '0 12px',
                        fontSize: 20,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: isCashInHandCustomer ? '#5d716e' : '#15302e',
                        background: isCashInHandCustomer ? '#eef2f1' : '#ffffff',
                        border: '1.5px solid #c6d2cf',
                        borderRadius: 8,
                        outline: 'none',
                        boxSizing: 'border-box',
                        cursor: isCashInHandCustomer ? 'not-allowed' : 'text',
                      }}
                    />
                  </Box>
                  <Box>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: 18,
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#334844',
                        marginBottom: 5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Card portion (AED)
                    </label>
                    <input
                      ref={splitCardInputRef}
                      type="text"
                      inputMode="decimal"
                      value={splitCardAmount}
                      onChange={(e) => handleSplitCardChange(e.target.value)}
                      onFocus={() => {
                        setSplitCardAmount('');
                      }}
                      onBlur={() => {
                        if (!splitCardAmount.trim()) {
                          setSplitCardAmount('0');
                        }
                      }}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        height: 48,
                        padding: '0 12px',
                        fontSize: 20,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: '#15302e',
                        background: '#ffffff',
                        border: '1.5px solid #c6d2cf',
                        borderRadius: 8,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </Box>
                </Box>

                {/* Card Details / Approval code */}
                <Box>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#5d716e', marginBottom: 3 }}>
                    Card approval code / note
                  </label>
                  <input
                    type="text"
                    value={splitCardApproval}
                    onChange={(e) => setSplitCardApproval(e.target.value)}
                    placeholder="Auth code or transaction note"
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px',
                      fontSize: 13,
                      color: '#15302e',
                      background: '#ffffff',
                      border: '1px solid #d3dcd9',
                      borderRadius: 7,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </Box>

                {/* Status & Change Box */}
                {(() => {
                  const { total, cr, isBlank, cardExceedsTotal, cardApplied, cashApplied, cashTendered, paid, balance, change } = computePaymentSplit();

                  let title: string;
                  let detail: string;
                  let amount: number;
                  let isError = false;
                  if (cardExceedsTotal) {
                    isError = true;
                    title = 'Card amount exceeds invoice total';
                    detail = `Card ${cr.toFixed(2)} AED is more than the total ${total.toFixed(2)} AED. Reduce the card amount to continue.`;
                    amount = cr - total;
                  } else if (isBlank) {
                    title = isCashInHandCustomer ? 'Cash sale' : 'Credit sale';
                    detail = isCashInHandCustomer
                      ? 'No card amount entered — the full amount will be paid in cash.'
                      : `No payment entered — full amount will be added to ${selectedCustomer?.name || 'customer'}'s account.`;
                    amount = total;
                  } else if (balance > 0.001) {
                    title = 'Balance on credit';
                    detail = `Cash: ${cashApplied.toFixed(2)} + Card: ${cardApplied.toFixed(2)} = ${paid.toFixed(2)} AED · ${balance.toFixed(2)} AED added to ${selectedCustomer?.name || 'customer'}'s account.`;
                    amount = balance;
                  } else if (change > 0.001) {
                    title = 'Change to return';
                    detail = `Cash tendered: ${cashTendered.toFixed(2)} · Card: ${cardApplied.toFixed(2)} · Bill: ${total.toFixed(2)} AED`;
                    amount = change;
                  } else {
                    title = 'Exact payment';
                    detail = `Cash: ${cashApplied.toFixed(2)} + Card: ${cardApplied.toFixed(2)} = ${total.toFixed(2)} AED`;
                    amount = 0;
                  }

                  return (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: '10px 14px',
                        bgcolor: '#f3f6f5',
                        border: `1px solid ${isError ? '#b42318' : '#0f766e'}`,
                        borderRadius: '8px',
                        mb: '4px',
                      }}
                    >
                      <Box>
                        <Typography
                          sx={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: isError ? '#b42318' : '#0f766e',
                          }}
                        >
                          {title}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: '#5d716e' }}>{detail}</Typography>
                      </Box>
                      <b
                        style={{
                          fontSize: 20,
                          fontVariantNumeric: 'tabular-nums',
                          color: isError ? '#b42318' : '#0f766e',
                        }}
                      >
                        {amount.toFixed(2)} <span style={{ fontSize: 12 }}>AED</span>
                      </b>
                    </Box>
                  );
                })()}
              </Box>
            </Box>

            {/* FOOTER */}
            <Box
              sx={{
                display: 'flex',
                gap: '8px',
                p: '14px 20px',
                borderTop: '1px solid #d3dcd9',
                bgcolor: '#f3f6f5',
              }}
            >
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(false)}
                style={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  height: 42,
                  padding: '0 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: 13,
                  border: '1px solid #d3dcd9',
                  color: '#15302e',
                  background: '#ffffff',
                }}
              >
                Cancel
              </button>
              {(() => {
                const { sc, cr, isBlank, cardExceedsTotal, cardApplied, cashApplied, cashTendered, balance } = computePaymentSplit();
                const disabled = isSaving || lines.length === 0 || cardExceedsTotal;
                const label = isSaving
                  ? 'Processing...'
                  : cardExceedsTotal
                  ? 'Card exceeds total'
                  : isBlank
                  ? (isCashInHandCustomer ? 'Accept full cash' : 'Save on credit')
                  : balance > 0.001
                  ? 'Accept payment & credit balance'
                  : cr > 0 || isCashInHandCustomer
                  ? 'Accept payment (Card + Cash)'
                  : 'Accept cash';

                return (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (isBlank) {
                        handleSaveAndCharge({ mode: isCashInHandCustomer ? 'Cash' : 'Credit' });
                      } else if (cr > 0 || isCashInHandCustomer) {
                        handleSaveAndCharge({
                          mode: 'Split',
                          splitDetails: {
                            cash: cashApplied,
                            card: cardApplied,
                            cardApproval: splitCardApproval.trim(),
                            cashRec: cashTendered,
                          },
                        });
                      } else {
                        handleSaveAndCharge({ mode: 'Cash', cashRec: sc });
                      }
                    }}
                    style={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      flex: 1,
                      height: 42,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 7,
                      fontWeight: 600,
                      fontSize: 14,
                      background: '#0f766e',
                      borderColor: '#0f766e',
                      color: '#ffffff',
                      opacity: disabled ? 0.45 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {label}
                  </button>
                );
              })()}
            </Box>
          </Box>
        ) : (
          /* PAYMENT ACCEPTED / COMPLETED VIEW (.done) */
          <Box sx={{ p: '32px 20px', textAlign: 'center' }}>
            <b
              style={{
                display: 'block',
                fontSize: 20,
                fontWeight: 700,
                color: '#15302e',
                marginBottom: 6,
              }}
            >
              {paymentDoneInfo?.title}
            </b>
            <p style={{ margin: '0 0 12px', color: '#5d716e', fontSize: 14.5 }}>
              {paymentDoneInfo?.subtitle}
            </p>
            <Box
              sx={{
                display: 'inline-block',
                bgcolor: '#eef6f5',
                color: '#0f6b62',
                px: 1.5,
                py: 0.5,
                borderRadius: 1.5,
                fontSize: 12.5,
                fontWeight: 700,
                border: '1px solid #cce5e2',
                mb: 3,
              }}
            >
              Invoice: {paymentDoneInfo?.invoiceNo}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                style={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  flex: 1,
                  height: 42,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: 13,
                  border: '1px solid #d3dcd9',
                  color: '#15302e',
                  background: '#ffffff',
                }}
              >
                Print receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentDialogOpen(false);
                  setPaymentDone(false);
                  setPaymentDoneInfo(null);
                  handleClear();
                  searchInputRef.current?.focus();
                }}
                style={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  flex: 1,
                  height: 42,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 7,
                  fontWeight: 700,
                  fontSize: 14,
                  background: '#0f766e',
                  color: '#ffffff',
                }}
              >
                New sale
              </button>
            </Box>
          </Box>
        )}
      </Dialog>

      {/* ── NOTIFICATION SNACKBAR ── */}
      <Snackbar
        open={alertInfo.open}
        autoHideDuration={4000}
        onClose={() => setAlertInfo({ ...alertInfo, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setAlertInfo({ ...alertInfo, open: false })}
          severity={alertInfo.severity}
          variant="filled"
          sx={{ width: '100%', fontWeight: 700 }}
        >
          {alertInfo.message}
        </Alert>
      </Snackbar>

      {/* ── RECEIPT / INVOICE DIALOG MODAL ── */}
      <Dialog
        open={showReceiptDialog}
        onClose={() => setShowReceiptDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
          <CheckCircleIcon sx={{ fontSize: 50, color: '#0f6b62', mb: 0.5 }} />
          <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#0b4f48' }}>
            Sale Completed!
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 1.5 }}>
          <Typography sx={{ fontSize: 14, color: '#4b5f5c', mb: 1 }}>
            Invoice has been recorded in the database and stock updated.
          </Typography>
          <Box sx={{ bgcolor: '#f2f9f8', p: 1.5, borderRadius: 2, border: '1px solid #b7d9d4' }}>
            <Typography sx={{ fontSize: 13, color: '#4b5f5c' }}>Invoice Number</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#0b4f48' }}>
              {lastInvoiceSummary?.invoiceNo}
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#4b5f5c', mt: 1 }}>Amount Paid</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#12201e' }}>
              AED {lastInvoiceSummary?.totalAmount.toFixed(2)}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 1 }}>
          <Button
            variant="outlined"
            onClick={() => {
              window.print();
              setShowReceiptDialog(false);
            }}
            startIcon={<PrintIcon />}
            sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#0f6b62', color: '#0f6b62' }}
          >
            Print Thermal Receipt
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setShowReceiptDialog(false);
              handleClear();
            }}
            sx={{ bgcolor: '#0f6b62', textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#0b4f48' } }}
          >
            Next Sale
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── STOCK ALERT DIALOG (Matches Sales Invoice Window) ── */}
      <Dialog
        open={stockAlertOpen}
        onClose={() => setStockAlertOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#dc2626', fontWeight: 800 }}>
          <WarningIcon color="error" /> Stock Alert
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.92rem', color: '#475569', fontWeight: 600 }}>
            {stockAlertMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => setStockAlertOpen(false)}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d5d57' }, fontWeight: 700, textTransform: 'none', px: 3 }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT CONFIRMATION DIALOG (Matches Sales Window) ── */}
      <Dialog
        open={editConfirmOpen}
        onClose={() => setEditConfirmOpen(false)}
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2, minWidth: 340 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f6b62' }}>
          Edit POS Invoice
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            Do you want to update this POS invoice ({invoiceNo})?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setEditConfirmOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditConfirm}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#0f6b62', '&:hover': { bgcolor: '#0b4f48' }, boxShadow: 'none' }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT SUCCESS DIALOG (Matches Sales Window) ── */}
      <Dialog
        open={editSuccessDialogOpen}
        onClose={() => {
          setEditSuccessDialogOpen(false);
          handleClear();
        }}
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2, minWidth: 340 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>
          Edited Successfully
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            Invoice has been updated successfully.
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 1, fontWeight: 700 }}>
            Invoice No: {invoiceNo}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setEditSuccessDialogOpen(false);
              handleClear();
            }}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, boxShadow: 'none' }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE CONFIRMATION DIALOG (Matches Sales Window) ── */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2, minWidth: 340 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>
          Delete POS Invoice
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            Are you sure you want to delete invoice {invoiceNo}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── SEARCH & FIND INVOICE DIALOG (Matches Sales Window) ── */}
      <Dialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        maxWidth="md"
        fullWidth
        disableRestoreFocus
        PaperProps={{ sx: { borderRadius: 2, minWidth: { xs: 340, sm: 600 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f6b62', borderBottom: '1px solid #e2e8f0', pb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon sx={{ color: '#0f6b62' }} />
            <span>Search & Load POS Invoices</span>
          </Box>
          <IconButton size="small" onClick={() => setSearchDialogOpen(false)} sx={{ color: '#64748b' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Search by Invoice No. or Customer Name"
              value={searchInvoiceNo}
              onChange={(e) => setSearchInvoiceNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchInvoice();
                }
              }}
              placeholder="e.g. POS-000001, INV-0001, or customer name..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />
            <Button
              variant="contained"
              onClick={handleSearchInvoice}
              disabled={isSearchingInvoice || !searchInvoiceNo.trim()}
              sx={{
                minWidth: 90,
                textTransform: 'none',
                borderRadius: 1.5,
                bgcolor: '#0f6b62',
                '&:hover': { bgcolor: '#0b4f48' },
                boxShadow: 'none',
                fontWeight: 600,
              }}
            >
              {isSearchingInvoice ? <CircularProgress size={18} color="inherit" /> : 'Search'}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Saved POS Invoices ({filteredInvoices.length})
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
              Click any invoice row to load into POS
            </Typography>
          </Box>

          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320, borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', fontSize: '0.75rem', py: 1, color: '#0f766e' }}>Invoice No</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', fontSize: '0.75rem', py: 1, color: '#0f766e' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', fontSize: '0.75rem', py: 1, color: '#0f766e' }}>Customer</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f8fafc', fontSize: '0.75rem', py: 1, color: '#0f766e' }}>Total (AED)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, bgcolor: '#f8fafc', fontSize: '0.75rem', py: 1, color: '#0f766e' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingRecentInvoices ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: '#64748b' }}>
                      <CircularProgress size={24} sx={{ color: '#0f6b62', mb: 1 }} />
                      <Typography sx={{ fontSize: '0.8rem' }}>Loading invoices...</Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: '#94a3b8', fontSize: '0.85rem' }}>
                      No saved POS invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.slice(0, 50).map((inv) => (
                    <TableRow
                      key={inv._id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        bgcolor: invoiceId === inv._id ? '#f0fdfa' : 'inherit',
                        '&:hover': { bgcolor: '#f1f5f9' },
                      }}
                      onClick={() => {
                        navigateToInvoice(inv._id);
                        setSearchDialogOpen(false);
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700, color: '#0f6b62', fontSize: '0.78rem', py: 0.8 }}>
                        {inv.invoiceNo}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#475569', py: 0.8 }}>
                        {inv.date ? formatDateDisplay(inv.date) : '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#1e293b', py: 0.8 }}>
                        {inv.customerName || 'Cash In Hand'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#0f172a', py: 0.8 }}>
                        {Number(inv.grandTotal ?? inv.totalAmount ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.8 }}>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToInvoice(inv._id);
                            setSearchDialogOpen(false);
                          }}
                          sx={{
                            fontSize: '0.7rem',
                            py: 0.2,
                            px: 1,
                            borderRadius: 1,
                            bgcolor: '#0f6b62',
                            color: '#fff',
                            textTransform: 'none',
                            boxShadow: 'none',
                            '&:hover': { bgcolor: '#0b4f48' },
                          }}
                        >
                          Load
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, pt: 1, borderTop: '1px solid #f1f5f9' }}>
          <Button onClick={() => setSearchDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Held Invoices Dialog (matches Sales Window) */}
      <Dialog
        open={holdListDialogOpen}
        onClose={() => setHoldListDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HoldListIcon sx={{ color: '#f59e0b' }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Held POS Sales</Typography>
            {heldInvoices.length > 0 && (
              <Chip
                label={heldInvoices.length}
                size="small"
                sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: '0.75rem' }}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, borderColor: '#e2e8f0' }}>
          {heldInvoices.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ color: '#94a3b8', fontSize: '0.9rem' }}>No held sales</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {heldInvoices.map((held, idx) => (
                <ListItem
                  key={held.id}
                  divider={idx < heldInvoices.length - 1}
                  sx={{ py: 1.5, px: 2, '&:hover': { bgcolor: '#f8fafc' } }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip
                          label={held.invoiceNo || 'Draft'}
                          size="small"
                          variant="outlined"
                          sx={{ borderColor: '#0f766e', color: '#0f766e', fontWeight: 600 }}
                        />
                        <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                          {held.patientName || held.customerName || 'General Sale'}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                        <span style={{ color: '#64748b' }}>
                          {held.itemCount} item{held.itemCount !== 1 ? 's' : ''}
                        </span>
                        <span style={{ fontWeight: 700, color: '#0f766e' }}>
                          AED {held.total.toFixed(2)}
                        </span>
                        <span style={{ color: '#94a3b8' }}>{held.heldAt}</span>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Restore this sale">
                      <IconButton
                        edge="end"
                        onClick={() => handleRestoreHeldInvoice(held)}
                        sx={{ mr: 0.5, color: '#0f766e' }}
                      >
                        <RestoreIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        edge="end"
                        onClick={() => handleDeleteHeldInvoice(held.id)}
                        sx={{ color: '#ef4444' }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button
            onClick={() => setHoldListDialogOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
