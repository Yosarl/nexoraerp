import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { ledgerAccountApi, ledgerGroupApi } from '../services/api';
import { isPrimaryHead } from '../pages/GroupCreate';
import DateInput from './DateInput';

type Group = {
  _id: string;
  name: string;
  code: string;
  type: string;
  isReceivables?: boolean;
  isPayables?: boolean;
  isBank?: boolean;
  parentGroupId?: string | { _id: string; name?: string; code?: string };
};
type UnderOption = { _id: string; name: string; code?: string; type?: string; isBank?: boolean };
type LedgerOption = { _id: string; name: string; code: string };

interface FormData {
  name: string;
  aliasName: string;
  code: string;
  groupId: string;
  address: string;
  mobile: string;
  TRN: string;
  state: string;
  openingBalanceCr: string;
  openingBalanceDr: string;
  creditLimit: string;
  creditDays: string;
  phone: string;
  email: string;
  area: string;
  route: string;
  agency: string;
  regDate: string;
  discPercent: string;
  rateType: string;
  remarks: string;
  serviceItem: boolean;
  taxable: boolean;
  againstRef: boolean;
  reconciliation: boolean;
  isCardAccount: boolean;

  // Bank Details
  accountHolderName: string;
  accountNumber: string;
  iban: string;
  swiftCode: string;
  bankName: string;
  branch: string;

  // VAT Registration Details
  vatRegistrationType: string;
  vatRegistrationDate: string;

  // Mailing Details
  mailingName: string;
  mailingBank: string;
  country: string;
  poBox: string;
  localLanguageDetails: string;
}

const defaultFormValues: FormData = {
  name: '',
  aliasName: '',
  code: '',
  groupId: '',
  address: '',
  mobile: '',
  TRN: '',
  state: 'Dubai',
  openingBalanceCr: '',
  openingBalanceDr: '',
  creditLimit: '',
  creditDays: '',
  phone: '',
  email: '',
  area: '',
  route: '',
  agency: '',
  regDate: new Date().toISOString().slice(0, 10),
  discPercent: '',
  rateType: '',
  remarks: '',
  serviceItem: false,
  taxable: false,
  againstRef: true,
  reconciliation: true,
  isCardAccount: false,

  accountHolderName: '',
  accountNumber: '',
  iban: '',
  swiftCode: '',
  bankName: '',
  branch: '',

  vatRegistrationType: '',
  vatRegistrationDate: new Date().toISOString().slice(0, 10),

  mailingName: '',
  mailingBank: '',
  country: 'UAE',
  poBox: '',
  localLanguageDetails: '',
};

const UAE_EMIRATES = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
];

const COUNTRIES = [
  'UAE',
  'Saudi Arabia',
  'Kuwait',
  'Qatar',
  'Bahrain',
  'Oman',
  'Other',
];

export default function LedgerRegForm({
  ledgerType,
  title,
}: {
  ledgerType: 'Customer' | 'Supplier' | null;
  title?: string;
}) {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);
  const routeLocation = useLocation();
  const routeNavigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ledgerOptions, setLedgerOptions] = useState<LedgerOption[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [underOptions, setUnderOptions] = useState<UnderOption[]>([]);
  const [receivablesId, setReceivablesId] = useState<string | null>(null);
  const [payablesId, setPayablesId] = useState<string | null>(null);
  const [bankGroupId, setBankGroupId] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [bottomToast, setBottomToast] = useState<{ message: string; severity: 'success' | 'info' | 'error' } | null>(null);
  const [bottomBanner, setBottomBanner] = useState<string | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'edit' | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false);

  const prefillAppliedRef = useRef<string | null>(null);
  const savedLedgerNameRef = useRef<string | null>(null);
  const ledgerNameInputRef = useRef<HTMLInputElement>(null);
  const underInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusOnResetRef = useRef(false);

  const highlightedLedgerOptionRef = useRef<LedgerOption | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const highlightedUnderOptionRef = useRef<UnderOption | null>(null);
  const [underOpen, setUnderOpen] = useState(false);

  const regDateInputRef = useRef<HTMLInputElement>(null);
  const againstRefInputRef = useRef<HTMLInputElement>(null);
  const aliasNameInputRef = useRef<HTMLInputElement>(null);
  const emirateSelectRef = useRef<HTMLSelectElement>(null);
  const emirateBankSelectRef = useRef<HTMLSelectElement>(null);
  const openingBalanceDrRef = useRef<HTMLInputElement>(null);

  // Change Led Name Dialog
  const [changeNameDialogOpen, setChangeNameDialogOpen] = useState(false);
  const [changeNameCode, setChangeNameCode] = useState('');
  const [changeNameValue, setChangeNameValue] = useState('');
  const [changeNameSaving, setChangeNameSaving] = useState(false);
  const [currentLedgerType, setCurrentLedgerType] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, control } = useForm<FormData>({
    defaultValues: defaultFormValues,
  });

  const groupIdValue = watch('groupId');
  const isEditMode = !!selectedId;

  const isUnderLocked = false;

  const selectedUnderOption = underOptions.find((o) => o._id === groupIdValue);
  const isBankSelected = Boolean(
    selectedUnderOption?.isBank ||
    (bankGroupId && groupIdValue === bankGroupId) ||
    selectedUnderOption?.name?.toLowerCase().includes('bank') ||
    (isEditMode && (watch('accountNumber') || watch('iban') || watch('bankName')))
  );

  const isCashSelected = Boolean(
    !isBankSelected && (
      selectedUnderOption
        ? (selectedUnderOption.code?.toUpperCase() === 'CASH' ||
           selectedUnderOption.name?.toLowerCase().includes('cash') ||
           selectedUnderOption.type?.toLowerCase() === 'cash')
        : (isEditMode && currentLedgerType?.toLowerCase() === 'cash')
    )
  );

  const displayTitle =
    title ||
    (ledgerType === 'Customer'
      ? 'Customer Registration'
      : ledgerType === 'Supplier'
        ? 'Supplier Registration'
        : isBankSelected
          ? 'Bank Ledger Registration'
          : isCashSelected
            ? 'Cash Ledger Registration'
            : 'Other Ledger Registration');

  const listType = ledgerType ? ledgerType : (isBankSelected ? 'Bank' : isCashSelected ? 'Cash' : undefined);

  const formRef = useRef<HTMLFormElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const updateBtnRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);

  // Dialog buttons refs for keyboard focus and arrow key navigation
  const dialogYesBtnRef = useRef<HTMLButtonElement>(null);
  const dialogNoBtnRef = useRef<HTMLButtonElement>(null);
  const deleteYesBtnRef = useRef<HTMLButtonElement>(null);
  const deleteNoBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the Save/Yes button when confirmation dialog opens
  useEffect(() => {
    if (confirmSaveOpen) {
      const t = setTimeout(() => {
        dialogYesBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [confirmSaveOpen]);

  // Auto-focus the Delete button when delete dialog opens
  useEffect(() => {
    if (deleteConfirmOpen) {
      const t = setTimeout(() => {
        deleteYesBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [deleteConfirmOpen]);

  // Focus Ledger Name on initial load, route/window change, or when company changes
  useEffect(() => {
    if (!companyId) return;
    const focusInput = () => {
      if (ledgerNameInputRef.current && !ledgerNameInputRef.current.disabled) {
        ledgerNameInputRef.current.focus();
      }
    };
    const t1 = setTimeout(focusInput, 60);
    const t2 = setTimeout(focusInput, 150);
    const t3 = setTimeout(focusInput, 300);
    const t4 = setTimeout(focusInput, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [companyId, routeLocation.pathname, routeLocation.key]);

  // Focus Ledger Name immediately when an edit mode is cleared and input is enabled
  useEffect(() => {
    if (!selectedId && shouldFocusOnResetRef.current) {
      shouldFocusOnResetRef.current = false;
      const t = setTimeout(() => {
        if (ledgerNameInputRef.current && !ledgerNameInputRef.current.disabled) {
          ledgerNameInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(t);
    }
  }, [selectedId]);

  // Query all visible, enabled interactive fields in form order
  const getNavigableFields = useCallback((): HTMLElement[] => {
    if (!formRef.current) return [];
    const elements = Array.from(
      formRef.current.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])'
      )
    );
    return elements.filter((el) => {
      return (
        el.offsetParent !== null &&
        window.getComputedStyle(el).display !== 'none' &&
        window.getComputedStyle(el).visibility !== 'hidden' &&
        el.tabIndex !== -1 &&
        !el.closest('.MuiDialog-root') &&
        !el.closest('[role="dialog"]')
      );
    });
  }, []);

  // Navigate to next field on Enter, or focus Save button if at the end (without opening dialog)
  const focusNextField = useCallback(
    (currentElement: HTMLElement) => {
      const fields = getNavigableFields();
      let currentIndex = fields.indexOf(currentElement);
      if (currentIndex === -1) {
        const inputChild = currentElement.querySelector<HTMLElement>('input, select, textarea');
        if (inputChild) {
          currentIndex = fields.indexOf(inputChild);
        } else {
          const parentInput = currentElement.closest<HTMLElement>('input, select, textarea');
          if (parentInput) {
            currentIndex = fields.indexOf(parentInput);
          }
        }
      }

      if (currentElement === emirateSelectRef.current || currentElement === emirateBankSelectRef.current) {
        setAdditionalDetailsOpen(true);
        setTimeout(() => {
          if (openingBalanceDrRef.current) {
            openingBalanceDrRef.current.focus();
            openingBalanceDrRef.current.select?.();
          }
        }, 50);
        return;
      }

      if (currentIndex === -1) {
        // If currentElement itself is disabled or not in navigable fields,
        // find the first navigable field that appears after currentElement in DOM order
        const allElements = Array.from(
          formRef.current?.querySelectorAll<HTMLElement>('input, select, textarea') || []
        );
        const domIndex = allElements.indexOf(currentElement);
        if (domIndex !== -1) {
          const subsequent = allElements.slice(domIndex + 1);
          const nextEnabled = subsequent.find((el) => fields.includes(el));
          if (nextEnabled) {
            nextEnabled.focus();
            if (nextEnabled instanceof HTMLInputElement || nextEnabled instanceof HTMLTextAreaElement) {
              nextEnabled.select?.();
            }
            return;
          }
        }
      }

      if (currentIndex >= 0 && currentIndex < fields.length - 1) {
        const nextField = fields[currentIndex + 1];
        nextField.focus();
        if (nextField instanceof HTMLInputElement || nextField instanceof HTMLTextAreaElement) {
          nextField.select?.();
        }
      } else if (currentIndex >= fields.length - 1) {
        // Last field finished: cleanly focus Save (or Update) button without triggering submission
        setTimeout(() => {
          if (isEditMode) {
            updateBtnRef.current?.focus();
          } else {
            saveBtnRef.current?.focus();
          }
        }, 10);
      }
    },
    [getNavigableFields, isEditMode]
  );

  // Navigate to previous field on Shift+Enter
  const focusPrevField = useCallback(
    (currentElement: HTMLElement) => {
      const fields = getNavigableFields();
      let currentIndex = fields.indexOf(currentElement);
      if (currentIndex === -1) {
        const inputChild = currentElement.querySelector<HTMLElement>('input, select, textarea');
        if (inputChild) {
          currentIndex = fields.indexOf(inputChild);
        } else {
          const parentInput = currentElement.closest<HTMLElement>('input, select, textarea');
          if (parentInput) {
            currentIndex = fields.indexOf(parentInput);
          }
        }
      }

      if (currentIndex > 0) {
        const prevField = fields[currentIndex - 1];
        prevField.focus();
        if (prevField instanceof HTMLInputElement || prevField instanceof HTMLTextAreaElement) {
          prevField.select?.();
        }
      }
    },
    [getNavigableFields]
  );

  // Form-wide Enter key handler: prevents unwanted form submission and navigates fields
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    // If inside a Dialog or Modal, do not intercept
    const target = e.target as HTMLElement;
    if (target.closest('.MuiDialog-root') || target.closest('[role="dialog"]')) {
      return;
    }

    // Keyboard navigation when user is on action buttons
    if (target.tagName === 'BUTTON') {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (target === saveBtnRef.current) {
          clearBtnRef.current?.focus();
        } else if (target === clearBtnRef.current) {
          if (isEditMode) {
            updateBtnRef.current?.focus();
          } else {
            saveBtnRef.current?.focus();
          }
        } else if (target === updateBtnRef.current) {
          deleteBtnRef.current?.focus();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (target === deleteBtnRef.current) {
          updateBtnRef.current?.focus();
        } else if (target === updateBtnRef.current) {
          clearBtnRef.current?.focus();
        } else if (target === clearBtnRef.current) {
          if (isEditMode) {
            updateBtnRef.current?.focus();
          } else {
            saveBtnRef.current?.focus();
          }
        }
        return;
      }

      // If user is already on a button (Save, Clear, Update, Delete), let Enter activate it!
      if (e.key === 'Enter') {
        return;
      }
    }

    if (e.key === 'Enter') {
      // If in textarea with Shift+Enter, allow newline
      if (target.tagName === 'TEXTAREA' && e.shiftKey) {
        return;
      }

      // Prevent default form submit on Enter!
      e.preventDefault();

      if (e.shiftKey) {
        focusPrevField(target);
      } else {
        focusNextField(target);
      }
    }
  };

  // Keyboard navigation inside Confirmation Save Dialog
  const handleConfirmDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      dialogNoBtnRef.current?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      dialogYesBtnRef.current?.focus();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      handleConfirmSave();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      handleCancelSave();
    }
  };

  // Keyboard navigation inside Delete Confirmation Dialog
  const handleDeleteDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      deleteNoBtnRef.current?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      deleteYesBtnRef.current?.focus();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      handleDeleteConfirm();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      setDeleteConfirmOpen(false);
    }
  };

  // Load ledger accounts for search dropdown
  useEffect(() => {
    if (!companyId) return;
    const search = ledgerSearch.trim() || undefined;
    ledgerAccountApi.list(companyId, listType, search).then((res) => {
      const list = (res.data.data as LedgerOption[]) ?? [];
      setLedgerOptions(list);
    });
  }, [companyId, listType, ledgerSearch]);

  // Load ledger groups for "Under" / "Ledger Group" dropdown - ONLY account groups
  useEffect(() => {
    if (!companyId) return;
    ledgerGroupApi.list(companyId).then((res) => {
      const list = (res.data.data as Group[]) ?? [];

      // Filter out primary category heads so only operational account groups remain
      const accountGroups = list.filter((g) => !isPrimaryHead(g));

      // Match Customer / Receivables group with explicit priority:
      const recv =
        accountGroups.find((g) => {
          const n = (g.name || '').trim().toLowerCase();
          return n === 'customer' || n === 'customers';
        }) ||
        accountGroups.find((g) => (g.name || '').toLowerCase().includes('customer')) ||
        accountGroups.find((g) => g.isReceivables === true) ||
        accountGroups.find((g) => g.code?.toUpperCase() === 'RECV') ||
        accountGroups.find((g) => (g.name || '').toLowerCase().includes('debtor')) ||
        accountGroups.find((g) => (g.name || '').toLowerCase().includes('receiv'));

      // Match Supplier / Payables group with explicit priority:
      const pay =
        accountGroups.find((g) => {
          const n = (g.name || '').trim().toLowerCase();
          return n === 'supplier' || n === 'suppliers';
        }) ||
        accountGroups.find((g) => (g.name || '').toLowerCase().includes('supplier')) ||
        accountGroups.find((g) => g.isPayables === true) ||
        accountGroups.find((g) => g.code?.toUpperCase() === 'PAY') ||
        accountGroups.find((g) => (g.name || '').toLowerCase().includes('creditor')) ||
        accountGroups.find((g) => (g.name || '').toLowerCase().includes('payab'));

      const bnk = accountGroups.find(
        (g) =>
          g.isBank === true ||
          (g.code && g.code.toUpperCase() === 'BANK') ||
          (g.name && g.name.toLowerCase().includes('bank'))
      );

      const recvId = recv?._id ?? null;
      const payId = pay?._id ?? null;
      const bnkId = bnk?._id ?? null;
      setReceivablesId(recvId);
      setPayablesId(payId);
      setBankGroupId(bnkId);

      const options: UnderOption[] = accountGroups.map((g) => ({
        _id: g._id,
        name: g.name,
        code: g.code,
        type: g.type,
        isBank: Boolean(g.isBank || g.code?.toUpperCase() === 'BANK' || g.name?.toLowerCase().includes('bank')),
      }));

      // Sort account groups alphabetically by name
      options.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      setUnderOptions(options);

      if (ledgerType === 'Customer' && recvId) {
        setValue('groupId', recvId);
      } else if (ledgerType === 'Supplier' && payId) {
        setValue('groupId', payId);
      }
    });
  }, [companyId, ledgerType, setValue]);

  const populateForm = useCallback(
    (ledger: Record<string, unknown>) => {
      const gid = (ledger.groupId as { _id?: string })?._id ?? ledger.groupId;
      const ob =
        Array.isArray(ledger.openingBalances) && financialYearId
          ? (ledger.openingBalances as Array<{ financialYearId: string; amount: number; isDebit: boolean }>).find(
              (b) => String(b.financialYearId) === financialYearId
            )
          : null;

      setValue('name', String(ledger.name ?? ''));
      setValue('aliasName', String(ledger.aliasName ?? ''));
      setValue('code', String(ledger.code ?? ''));
      setValue('groupId', String(gid ?? ''));
      setValue('address', String(ledger.address ?? ''));
      setValue('mobile', String(ledger.mobile ?? ''));
      setValue('TRN', String(ledger.TRN ?? ''));
      setValue('state', String(ledger.state ?? 'Dubai'));
      setValue('openingBalanceCr', ob && !ob.isDebit ? String(ob.amount) : '');
      setValue('openingBalanceDr', ob && ob.isDebit ? String(ob.amount) : '');
      setValue('creditLimit', ledger.creditLimit != null ? String(ledger.creditLimit) : '');
      setValue('creditDays', ledger.creditDays != null ? String(ledger.creditDays) : '');
      setValue('phone', String(ledger.phone ?? ''));
      setValue('email', String(ledger.email ?? ''));
      setValue('area', String(ledger.area ?? ''));
      setValue('route', String(ledger.route ?? ''));
      setValue('agency', String(ledger.agency ?? ''));
      setValue('regDate', ledger.regDate ? new Date(ledger.regDate as string).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
      setValue('discPercent', ledger.discPercent != null ? String(ledger.discPercent) : '');
      setValue('rateType', String(ledger.rateType ?? ''));
      setValue('remarks', String(ledger.remarks ?? ''));
      setValue('serviceItem', Boolean(ledger.serviceItem));
      setValue('taxable', Boolean(ledger.taxable));
      setValue('againstRef', ledger.againstRef !== undefined ? Boolean(ledger.againstRef) : true);
      setValue('reconciliation', ledger.reconciliation !== false);
      setValue('isCardAccount', Boolean(ledger.isCardAccount || (ledger as any).cardAccount));

      // Bank Details
      setValue('accountHolderName', String(ledger.accountHolderName ?? ''));
      setValue('accountNumber', String(ledger.accountNumber ?? ''));
      setValue('iban', String(ledger.iban ?? ''));
      setValue('swiftCode', String(ledger.swiftCode ?? ''));
      setValue('bankName', String(ledger.bankName ?? ''));
      setValue('branch', String(ledger.branch ?? ''));

      // VAT Details
      setValue('vatRegistrationType', String(ledger.vatRegistrationType ?? ''));
      setValue('vatRegistrationDate', ledger.vatRegistrationDate ? new Date(ledger.vatRegistrationDate as string).toISOString().slice(0, 10) : '');

      // Mailing Details
      setValue('mailingName', String(ledger.mailingName ?? ''));
      setValue('mailingBank', String(ledger.mailingBank ?? ''));
      setValue('country', String(ledger.country ?? 'UAE'));
      setValue('poBox', String(ledger.poBox ?? ''));
      setValue('localLanguageDetails', String(ledger.localLanguageDetails ?? ''));
      setCurrentLedgerType(String(ledger.type ?? ''));
    },
    [financialYearId, setValue]
  );

  const clearForm = useCallback(() => {
    setSelectedId(null);
    setCurrentLedgerType(null);
    setMessage('');
    setLedgerSearch('');
    highlightedLedgerOptionRef.current = null;
    setLedgerOpen(false);
    highlightedUnderOptionRef.current = null;
    setUnderOpen(false);
    shouldFocusOnResetRef.current = true;
    reset({
      ...defaultFormValues,
    });
    if (ledgerType === 'Customer' && receivablesId) {
      setValue('groupId', receivablesId);
    } else if (ledgerType === 'Supplier' && payablesId) {
      setValue('groupId', payablesId);
    }
    const focusLedgerInput = () => {
      if (ledgerNameInputRef.current) {
        ledgerNameInputRef.current.disabled = false;
        ledgerNameInputRef.current.focus();
        ledgerNameInputRef.current.select?.();
      }
    };
    setTimeout(focusLedgerInput, 40);
    setTimeout(focusLedgerInput, 120);
    setTimeout(focusLedgerInput, 250);
  }, [reset, setValue, ledgerType, receivablesId, payablesId]);

  // Support ?edit=<id> query parameter
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && companyId && editId !== selectedId) {
      ledgerAccountApi.get(editId, companyId).then((res) => {
        const ledger = res.data.data as Record<string, unknown>;
        if (ledger) {
          setSelectedId(editId);
          setLedgerSearch(String(ledger.name ?? ''));
          populateForm(ledger);
        }
      });
    }
  }, [searchParams, companyId, selectedId, populateForm]);

  // Pre-fill name when navigated with prefillName
  useEffect(() => {
    const state = routeLocation.state as { prefillName?: string; returnTo?: string } | null;
    if (state?.prefillName && state.prefillName !== prefillAppliedRef.current) {
      prefillAppliedRef.current = state.prefillName;
      clearForm();
      setValue('name', state.prefillName);
      setValue('aliasName', state.prefillName);
      setValue('mailingName', state.prefillName);
      setLedgerSearch(state.prefillName);
      setTimeout(() => {
        ledgerNameInputRef.current?.focus();
        ledgerNameInputRef.current?.select();
      }, 100);
    }
  }, [routeLocation.state, clearForm, setValue]);

  const onLedgerSelect = (_: unknown, value: LedgerOption | string | null) => {
    if (!value) {
      setSelectedId(null);
      setCurrentLedgerType(null);
      setValue('name', '');
      setValue('aliasName', '');
      setValue('mailingName', '');
      setLedgerSearch('');
      setTimeout(() => {
        ledgerNameInputRef.current?.focus();
      }, 50);
      return;
    }
    if (typeof value === 'string') {
      setSelectedId(null);
      setCurrentLedgerType(null);
      setValue('name', value);
      setValue('aliasName', value);
      setValue('mailingName', value);
      setLedgerSearch(value);
      return;
    }
    if (!companyId) return;

    // Immediately reflect selected option into fields and state
    setSelectedId(value._id);
    setLedgerSearch(value.name);
    setValue('name', value.name);
    setValue('aliasName', value.name);
    setValue('mailingName', value.name);
    if (value.code) setValue('code', value.code);

    ledgerAccountApi.get(value._id, companyId).then((res) => {
      const ledger = res.data.data as Record<string, unknown>;
      if (ledger) {
        setSelectedId(value._id);
        setLedgerSearch(String(ledger.name || value.name));
        populateForm(ledger);
      }
    });
  };

  const handleGroupChange = (newGroupId: string) => {
    if (isUnderLocked) return;
    setValue('groupId', newGroupId, { shouldValidate: true });
    const selectedGroup = underOptions.find((o) => o._id === newGroupId);
    const isBank = Boolean(
      selectedGroup?.isBank ||
      (bankGroupId && newGroupId === bankGroupId) ||
      selectedGroup?.name?.toLowerCase().includes('bank')
    );
    if (isBank) {
      setValue('isCardAccount', false);
      setValue('reconciliation', true);
    }
  };

  const onSubmit = (data: FormData) => {
    if (!companyId) return;
    if (!data.name || !data.name.trim()) {
      setErrorDialogMessage('Ledger name is required');
      setErrorDialogOpen(true);
      return;
    }
    const finalGroupId = data.groupId || (ledgerType === 'Customer' ? (receivablesId ?? '') : ledgerType === 'Supplier' ? (payablesId ?? '') : '');
    if (!finalGroupId) {
      setErrorDialogMessage('Under group is required');
      setErrorDialogOpen(true);
      return;
    }
    setPendingFormData({ ...data, groupId: finalGroupId });
    setPendingAction('save');
    setConfirmSaveOpen(true);
  };

  const onEdit = (data: FormData) => {
    if (!companyId || !selectedId) return;
    const finalGroupId = data.groupId || (ledgerType === 'Customer' ? (receivablesId ?? '') : ledgerType === 'Supplier' ? (payablesId ?? '') : '');
    setPendingFormData({ ...data, groupId: finalGroupId });
    setPendingAction('edit');
    setConfirmSaveOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmSaveOpen(false);
    if (!pendingFormData || !companyId) return;
    const data = pendingFormData;
    setMessage('');

    const effectiveGroupId = data.groupId || (ledgerType === 'Customer' ? (receivablesId ?? '') : ledgerType === 'Supplier' ? (payablesId ?? '') : '');
    const matchedGroup = underOptions.find((o) => o._id === effectiveGroupId);

    let targetType: 'Customer' | 'Supplier' | 'Bank' | 'Cash' | 'Expense' | 'Revenue' | 'Other' = 'Other';
    if (ledgerType === 'Customer') {
      targetType = 'Customer';
    } else if (ledgerType === 'Supplier') {
      targetType = 'Supplier';
    } else if (isBankSelected || matchedGroup?.isBank || matchedGroup?.name?.toLowerCase().includes('bank')) {
      targetType = 'Bank';
    } else if (isCashSelected || matchedGroup?.name?.toLowerCase().includes('cash') || matchedGroup?.code?.toUpperCase() === 'CASH') {
      targetType = 'Cash';
    } else if (matchedGroup?.type === 'Expense' || matchedGroup?.name?.toLowerCase().includes('expense')) {
      targetType = 'Expense';
    } else if (
      matchedGroup?.type === 'Income' ||
      matchedGroup?.name?.toLowerCase().includes('revenue') ||
      matchedGroup?.name?.toLowerCase().includes('income') ||
      matchedGroup?.name?.toLowerCase().includes('sales')
    ) {
      targetType = 'Revenue';
    } else {
      targetType = 'Other';
    }

    if (pendingAction === 'edit' && selectedId) {
      try {
        await ledgerAccountApi.update(selectedId, {
          companyId,
          financialYearId: financialYearId || undefined,
          openingBalanceDr: data.openingBalanceDr ? Number(data.openingBalanceDr) : undefined,
          openingBalanceCr: data.openingBalanceCr ? Number(data.openingBalanceCr) : undefined,
          name: data.name,
          aliasName: data.aliasName || undefined,
          groupId: effectiveGroupId,
          type: targetType,
          phone: data.phone || undefined,
          mobile: data.mobile || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          TRN: data.TRN || undefined,
          state: data.state || undefined,
          creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
          creditDays: data.creditDays ? Number(data.creditDays) : undefined,
          serviceItem: data.serviceItem,
          taxable: data.taxable,
          againstRef: data.againstRef,
          reconciliation: data.reconciliation !== false,
          isCardAccount: Boolean(data.isCardAccount),
          cardAccount: Boolean(data.isCardAccount),
          area: data.area || undefined,
          route: data.route || undefined,
          agency: data.agency || undefined,
          regDate: data.regDate || undefined,
          discPercent: data.discPercent ? Number(data.discPercent) : undefined,
          rateType: data.rateType || undefined,
          remarks: data.remarks || undefined,

          // Bank Details
          accountHolderName: data.accountHolderName || undefined,
          accountNumber: data.accountNumber || undefined,
          iban: data.iban || undefined,
          swiftCode: data.swiftCode || undefined,
          bankName: data.bankName || undefined,
          branch: data.branch || undefined,

          // VAT Details
          vatRegistrationType: data.vatRegistrationType || undefined,
          vatRegistrationDate: data.vatRegistrationDate || undefined,

          // Mailing Details
          country: data.country || undefined,
          poBox: data.poBox || undefined,
          localLanguageDetails: data.localLanguageDetails || undefined,
          mailingName: data.mailingName || undefined,
          mailingBank: data.mailingBank || undefined,
        });
        setPendingFormData(null);
        setPendingAction(null);
        triggerSuccess('edited');
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to update ledger');
        setErrorDialogOpen(true);
      }
    } else {
      try {
        await ledgerAccountApi.create({
          companyId,
          financialYearId: financialYearId || undefined,
          name: data.name,
          aliasName: data.aliasName || undefined,
          code: data.code || undefined,
          groupId: effectiveGroupId,
          type: targetType,
          phone: data.phone || undefined,
          mobile: data.mobile || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          TRN: data.TRN || undefined,
          state: data.state || undefined,
          creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
          creditDays: data.creditDays ? Number(data.creditDays) : undefined,
          openingBalanceDr: data.openingBalanceDr ? Number(data.openingBalanceDr) : undefined,
          openingBalanceCr: data.openingBalanceCr ? Number(data.openingBalanceCr) : undefined,
          serviceItem: data.serviceItem,
          taxable: data.taxable,
          againstRef: data.againstRef,
          reconciliation: data.reconciliation !== false,
          isCardAccount: Boolean(data.isCardAccount),
          cardAccount: Boolean(data.isCardAccount),
          area: data.area || undefined,
          route: data.route || undefined,
          agency: data.agency || undefined,
          regDate: data.regDate || undefined,
          discPercent: data.discPercent ? Number(data.discPercent) : undefined,
          rateType: data.rateType || undefined,
          remarks: data.remarks || undefined,

          // Bank Details
          accountHolderName: data.accountHolderName || undefined,
          accountNumber: data.accountNumber || undefined,
          iban: data.iban || undefined,
          swiftCode: data.swiftCode || undefined,
          bankName: data.bankName || undefined,
          branch: data.branch || undefined,

          // VAT Details
          vatRegistrationType: data.vatRegistrationType || undefined,
          vatRegistrationDate: data.vatRegistrationDate || undefined,

          // Mailing Details
          country: data.country || undefined,
          poBox: data.poBox || undefined,
          localLanguageDetails: data.localLanguageDetails || undefined,
          mailingName: data.mailingName || undefined,
          mailingBank: data.mailingBank || undefined,
        });
        setPendingFormData(null);
        setPendingAction(null);
        savedLedgerNameRef.current = data.name.trim();
        triggerSuccess('saved');
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to save ledger');
        setErrorDialogOpen(true);
      }
    }
  };

  const handleCancelSave = () => {
    setConfirmSaveOpen(false);
    setPendingFormData(null);
    setPendingAction(null);
  };

  const onDelete = () => {
    if (!companyId || !selectedId) return;
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    if (!companyId || !selectedId) return;
    try {
      await ledgerAccountApi.delete(selectedId, companyId);
      triggerSuccess('deleted');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to delete ledger');
      setErrorDialogOpen(true);
    }
  };

  const triggerSuccess = (action: 'saved' | 'edited' | 'deleted') => {
    const msg =
      action === 'saved'
        ? 'Ledger has been saved successfully.'
        : action === 'edited'
          ? 'Ledger has been updated successfully.'
          : 'Ledger has been deleted successfully.';

    setBottomToast({ message: msg, severity: 'success' });
    setBottomBanner(msg);

    const state = routeLocation.state as { returnTo?: string } | null;
    window.dispatchEvent(new CustomEvent('app:ledgers-updated'));
    if (action === 'saved' && state?.returnTo) {
      prefillAppliedRef.current = null;
      const createdName = savedLedgerNameRef.current;
      savedLedgerNameRef.current = null;
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        routeNavigate(state.returnTo!, { state: createdName ? { createdLedgerName: createdName } : undefined });
      }, 350);
      return;
    }

    clearForm();
    setTimeout(() => {
      ledgerNameInputRef.current?.focus();
    }, 100);

    setTimeout(() => {
      setBottomBanner(null);
    }, 3500);
  };

  const handleOpenChangeName = () => {
    if (!selectedId) return;
    const selectedLedger = ledgerOptions.find((o) => o._id === selectedId);
    if (selectedLedger) {
      setChangeNameCode(selectedLedger.code);
      setChangeNameValue(selectedLedger.name);
      setChangeNameDialogOpen(true);
    }
  };

  const handleChangeNameSave = async () => {
    if (!selectedId || !companyId || !changeNameValue.trim()) return;
    setChangeNameSaving(true);
    try {
      await ledgerAccountApi.update(selectedId, {
        companyId,
        name: changeNameValue.trim(),
      });
      setLedgerOptions((prev) =>
        prev.map((o) => (o._id === selectedId ? { ...o, name: changeNameValue.trim() } : o))
      );
      setLedgerSearch(changeNameValue.trim());
      setValue('name', changeNameValue.trim());
      setChangeNameDialogOpen(false);
      setMessage('Ledger name updated successfully');
      setTimeout(() => setMessage(''), 2500);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to update name');
      setErrorDialogOpen(true);
    } finally {
      setChangeNameSaving(false);
    }
  };

  if (!companyId) return <Typography color="error">Select a company first.</Typography>;

  return (
    <Box
      sx={{
        py: { xs: 1, sm: 2 },
        px: { xs: 0.5, sm: 1.5 },
        bgcolor: '#f8f9fb',
        minHeight: '100%',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        .bank-reg-container {
          max-width: 900px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 6px;
          box-shadow: 0 3px 5px rgba(0, 0, 0, 0.06);
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        .bank-reg-header {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          padding: 14px 22px;
          color: white;
        }
        .bank-reg-header-content {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 6px;
        }
        .bank-reg-header h1 {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.3px;
          margin: 0;
          color: #ffffff;
        }
        .bank-reg-header-date {
          font-size: 11.5px;
          opacity: 0.85;
          color: #94a3b8;
        }
        .bank-reg-content {
          padding: 18px 22px;
        }
        .bank-reg-form-section {
          margin-bottom: 16px;
        }
        .bank-reg-section-header {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #1a2332;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 2px solid #3b82f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .bank-reg-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          margin-bottom: 10px;
        }
        .bank-reg-form-grid.full {
          grid-template-columns: 1fr;
        }
        .bank-reg-form-group {
          display: flex;
          flex-direction: column;
        }
        .bank-reg-form-label {
          font-size: 11.5px;
          font-weight: 600;
          color: #1a2332;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .bank-reg-required {
          color: #ef4444;
          font-weight: 700;
        }
        .bank-reg-hint {
          font-size: 10.5px;
          color: #94a3b8;
          margin-top: 2px;
        }
        .bank-reg-input,
        .bank-reg-select {
          height: 28px;
          padding: 4px 8px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          font-size: 12px;
          font-family: inherit;
          transition: all 0.2s ease;
          background: white;
          color: #1a2332;
          width: 100%;
          box-sizing: border-box;
        }
        .bank-reg-textarea {
          padding: 5px 8px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          font-size: 12px;
          font-family: inherit;
          transition: all 0.2s ease;
          background: white;
          color: #1a2332;
          width: 100%;
          box-sizing: border-box;
          resize: vertical;
          min-height: 52px;
        }
        .bank-reg-input:hover,
        .bank-reg-select:hover,
        .bank-reg-textarea:hover {
          border-color: #cbd5e1;
        }
        .bank-reg-input:focus,
        .bank-reg-select:focus,
        .bank-reg-textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
        }
        .bank-reg-input:disabled {
          background-color: #f1f5f9;
          color: #64748b;
          cursor: not-allowed;
        }
        .bank-reg-actions {
          display: flex;
          gap: 8px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .bank-reg-btn {
          padding: 6px 14px;
          border: none;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .bank-reg-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .bank-reg-btn:focus-visible,
        .bank-reg-btn:focus {
          outline: 2px solid #2563eb !important;
          outline-offset: 1px !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.3) !important;
        }
        .bank-reg-btn-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #0284c7 100%);
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .bank-reg-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(59, 130, 246, 0.25);
        }
        .bank-reg-btn-clear {
          background: #ef4444;
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .bank-reg-btn-clear:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(239, 68, 68, 0.25);
        }
        .bank-reg-btn-tertiary {
          background: white;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .bank-reg-btn-tertiary:hover:not(:disabled) {
          background: #f8f9fb;
          color: #1a2332;
          border-color: #cbd5e1;
        }
        .bank-reg-btn-danger {
          background: #fee2e2;
          color: #991b1b;
        }
        .bank-reg-btn-danger:hover:not(:disabled) {
          background: #fecaca;
        }
        .bank-reg-icon {
          font-size: 12px;
          font-weight: bold;
        }

        /* 35% reduced compact sizing for MUI inputs inside the ledger registration window */
        .bank-reg-container .MuiOutlinedInput-root {
          min-height: 28px !important;
          height: 28px !important;
          border-radius: 5px !important;
          font-size: 12px !important;
          padding: 0 6px !important;
          background-color: #ffffff;
        }
        .bank-reg-container .MuiOutlinedInput-root.Mui-disabled {
          background-color: #f1f5f9 !important;
        }
        .bank-reg-container .MuiOutlinedInput-input {
          padding: 4px 6px !important;
          font-size: 12px !important;
          height: auto !important;
          color: #1a2332;
        }
        .bank-reg-container .MuiInputBase-input.Mui-disabled {
          -webkit-text-fill-color: #334155 !important;
          color: #334155 !important;
          cursor: not-allowed;
        }
        .bank-reg-container .MuiAutocomplete-root .MuiOutlinedInput-root {
          padding-right: 28px !important;
          position: relative !important;
        }
        .bank-reg-container .MuiAutocomplete-root.MuiAutocomplete-hasPopupIcon.MuiAutocomplete-hasClearIcon .MuiOutlinedInput-root {
          padding-right: 48px !important;
        }
        .bank-reg-container .MuiAutocomplete-inputRoot {
          padding: 0 6px !important;
        }
        .bank-reg-container .MuiAutocomplete-input {
          padding: 3px 4px !important;
          font-size: 12px !important;
        }
        .bank-reg-container .MuiAutocomplete-endAdornment {
          position: absolute !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          right: 4px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 2px !important;
        }
        .bank-reg-container .MuiAutocomplete-clearIndicator {
          width: 20px !important;
          height: 20px !important;
          min-width: 20px !important;
          min-height: 20px !important;
          padding: 2px !important;
          margin: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: #94a3b8 !important;
          border-radius: 4px !important;
          transition: all 0.15s ease !important;
        }
        .bank-reg-container .MuiAutocomplete-clearIndicator:hover {
          color: #ef4444 !important;
          background-color: #fee2e2 !important;
        }
        .bank-reg-container .MuiAutocomplete-clearIndicator .MuiSvgIcon-root {
          font-size: 14px !important;
        }
        .bank-reg-container .MuiAutocomplete-popupIndicator {
          width: 20px !important;
          height: 20px !important;
          min-width: 20px !important;
          min-height: 20px !important;
          padding: 2px !important;
          margin: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: #64748b !important;
        }
        .bank-reg-container .MuiAutocomplete-popupIndicator .MuiSvgIcon-root {
          font-size: 16px !important;
        }
        .bank-reg-container .MuiIconButton-root {
          padding: 2px !important;
        }
        .bank-reg-container .MuiSvgIcon-root {
          font-size: 16px !important;
        }
        .bank-reg-container .MuiInputAdornment-root {
          margin-left: 2px !important;
        }

        @media (max-width: 768px) {
          .bank-reg-content { padding: 14px; }
          .bank-reg-header { padding: 12px 14px; }
          .bank-reg-actions button { width: 100%; justify-content: center; }
        }
      `}</style>

      <div className="bank-reg-container">
        {/* Header */}
        <div className="bank-reg-header">
          <div className="bank-reg-header-content">
            <h1>{displayTitle}</h1>
            <div className="bank-reg-header-date">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bank-reg-content">
          {message && (
            <Box sx={{ mb: 2.5, p: 1.5, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
              <Typography sx={{ color: '#166534', fontSize: '0.9rem', fontWeight: 600 }}>{message}</Typography>
            </Box>
          )}

          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
            }}
            onKeyDown={handleFormKeyDown}
          >
            {/* Basic Information Section */}
            <div className="bank-reg-form-section">
              <div className="bank-reg-section-header">Basic Information</div>

              <div className="bank-reg-form-grid">
                {/* Ledger Name */}
                <div className="bank-reg-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="bank-reg-form-label" style={{ margin: 0 }}>
                      Ledger Name <span className="bank-reg-required">*</span>
                    </label>
                    {selectedId && (
                      <button
                        type="button"
                        onClick={handleOpenChangeName}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3b82f6',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        Change Name
                      </button>
                    )}
                  </div>
                  <Autocomplete
                    size="small"
                    freeSolo
                    openOnFocus
                    open={ledgerOpen}
                    onOpen={() => setLedgerOpen(true)}
                    onClose={() => {
                      setLedgerOpen(false);
                      highlightedLedgerOptionRef.current = null;
                    }}
                    onHighlightChange={(_, option) => {
                      highlightedLedgerOptionRef.current = option;
                    }}
                    filterOptions={(options, state) => {
                      const q = (state.inputValue || '').trim().toLowerCase();
                      if (!q) return options;
                      return options.filter(
                        (o) =>
                          (o.name && o.name.toLowerCase().includes(q)) ||
                          (o.code && o.code.toLowerCase().includes(q))
                      );
                    }}
                    disabled={!!selectedId}
                    options={ledgerOptions}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name ?? '')}
                    isOptionEqualToValue={(option, val) => (typeof val === 'string' ? option.name === val : option._id === val._id)}
                    value={
                      selectedId
                        ? ledgerOptions.find((o) => o._id === selectedId) ??
                          (watch('name')
                            ? { _id: selectedId, name: watch('name'), code: watch('code') || '' }
                            : null)
                        : ledgerSearch || null
                    }
                    inputValue={ledgerSearch}
                    onChange={(event, newVal) => {
                      setLedgerOpen(false);
                      highlightedLedgerOptionRef.current = null;
                      onLedgerSelect(event, newVal);
                    }}
                    onInputChange={(_, v, reason) => {
                      setLedgerSearch(v);
                      if (reason === 'input' && !selectedId) {
                        setValue('name', v);
                        setValue('aliasName', v);
                        setValue('mailingName', v);
                      }
                    }}
                    slotProps={{
                      paper: {
                        sx: {
                          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          mt: 0.5,
                        },
                      },
                    }}
                    ListboxProps={{
                      sx: {
                        maxHeight: 250,
                        py: 0.5,
                        '& .MuiAutocomplete-option': {
                          px: 1.5,
                          py: 0.7,
                          fontSize: '0.8rem',
                          '&[data-focus="true"], &.Mui-focused': {
                            bgcolor: '#eff6ff !important',
                            color: '#1d4ed8 !important',
                          },
                          '&[aria-selected="true"]': {
                            bgcolor: '#dbeafe !important',
                            color: '#1e40af !important',
                          },
                          '&:hover': {
                            bgcolor: '#f1f5f9 !important',
                          },
                        },
                      },
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        inputRef={ledgerNameInputRef}
                        placeholder="Enter ledger name"
                        required
                        inputProps={{
                          ...params.inputProps,
                          onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (highlightedLedgerOptionRef.current) {
                                const selected = highlightedLedgerOptionRef.current;
                                highlightedLedgerOptionRef.current = null;
                                setLedgerOpen(false);
                                onLedgerSelect(e, selected);
                                setTimeout(() => {
                                  if (underInputRef.current && !underInputRef.current.disabled) {
                                    underInputRef.current.focus();
                                    underInputRef.current.select?.();
                                  } else if (ledgerNameInputRef.current) {
                                    focusNextField(ledgerNameInputRef.current);
                                  }
                                }, 80);
                              } else {
                                setLedgerOpen(false);
                                const typed = ledgerSearch.trim();
                                if (typed && !selectedId) {
                                  setValue('name', typed);
                                  setValue('aliasName', typed);
                                  setValue('mailingName', typed);
                                }
                                setTimeout(() => {
                                  if (underInputRef.current && !underInputRef.current.disabled) {
                                    underInputRef.current.focus();
                                    underInputRef.current.select?.();
                                  } else if (ledgerNameInputRef.current) {
                                    focusNextField(ledgerNameInputRef.current);
                                  }
                                }, 60);
                              }
                            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                              if (!ledgerOpen) {
                                setLedgerOpen(true);
                              }
                            }
                          },
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '5px',
                            backgroundColor: '#ffffff',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                        }}
                      />
                    )}
                    renderOption={(props, option) => {
                      const { key, ...otherProps } = props;
                      return (
                        <li key={option._id || key} {...otherProps} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="body2" fontWeight={600} fontSize="0.8rem" color="inherit">
                              {option.name}
                            </Typography>
                            {option.code && (
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: '0.7rem',
                                  color: 'inherit',
                                  opacity: 0.75,
                                  bgcolor: 'rgba(0,0,0,0.05)',
                                  px: 0.6,
                                  py: 0.2,
                                  borderRadius: '3px',
                                  ml: 1,
                                }}
                              >
                                {option.code}
                              </Typography>
                            )}
                          </Box>
                        </li>
                      );
                    }}
                  />
                </div>

                {/* Under Field */}
                <div className="bank-reg-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="bank-reg-form-label" style={{ margin: 0 }}>
                      Under <span className="bank-reg-required">*</span>
                    </label>
                    {isUnderLocked && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: '10px',
                          fontWeight: 600,
                          color: '#475569',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                        title="Account group is locked for Customer / Supplier Registration"
                      >
                        <LockIcon sx={{ fontSize: 11, color: '#64748b' }} /> Locked
                      </span>
                    )}
                  </div>
                  <Autocomplete
                    size="small"
                    autoHighlight
                    open={underOpen}
                    onOpen={() => setUnderOpen(true)}
                    onClose={() => {
                      setUnderOpen(false);
                      highlightedUnderOptionRef.current = null;
                    }}
                    onHighlightChange={(_, option) => {
                      highlightedUnderOptionRef.current = option;
                    }}
                    disabled={isUnderLocked}
                    options={underOptions}
                    getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name ?? '')}
                    isOptionEqualToValue={(option, val) => option._id === val._id}
                    value={
                      underOptions.find(
                        (o) =>
                          o._id ===
                          (groupIdValue ||
                            (ledgerType === 'Customer' ? receivablesId : ledgerType === 'Supplier' ? payablesId : ''))
                      ) || null
                    }
                    onChange={(_, selectedOption) => {
                      setUnderOpen(false);
                      highlightedUnderOptionRef.current = null;
                      handleGroupChange(selectedOption?._id || '');
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        inputRef={underInputRef}
                        disabled={isUnderLocked}
                        placeholder={isUnderLocked ? 'Locked' : 'Type to search and select group'}
                        required
                        inputProps={{
                          ...params.inputProps,
                          onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (highlightedUnderOptionRef.current) {
                                const selected = highlightedUnderOptionRef.current;
                                highlightedUnderOptionRef.current = null;
                                setUnderOpen(false);
                                handleGroupChange(selected._id || '');
                                setTimeout(() => {
                                  if (regDateInputRef.current) {
                                    regDateInputRef.current.focus();
                                    regDateInputRef.current.select?.();
                                  } else if (underInputRef.current) {
                                    focusNextField(underInputRef.current);
                                  }
                                }, 80);
                              } else {
                                setUnderOpen(false);
                                setTimeout(() => {
                                  if (regDateInputRef.current) {
                                    regDateInputRef.current.focus();
                                    regDateInputRef.current.select?.();
                                  } else if (underInputRef.current) {
                                    focusNextField(underInputRef.current);
                                  }
                                }, 60);
                              }
                            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                              if (!underOpen && !isUnderLocked) {
                                setUnderOpen(true);
                              }
                            }
                          },
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '5px',
                            backgroundColor: isUnderLocked ? '#f1f5f9' : '#ffffff',
                            cursor: isUnderLocked ? 'not-allowed' : 'default',
                            '& fieldset': { borderColor: isUnderLocked ? '#cbd5e1' : '#e2e8f0' },
                            '&:hover fieldset': { borderColor: isUnderLocked ? '#cbd5e1' : '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: isUnderLocked ? '#cbd5e1' : '#3b82f6' },
                            '&.Mui-disabled': {
                              backgroundColor: '#f1f5f9',
                              '& fieldset': { borderColor: '#cbd5e1' },
                            },
                          },
                          '& .MuiInputBase-input.Mui-disabled': {
                            WebkitTextFillColor: '#334155',
                            color: '#334155',
                            fontWeight: 600,
                            cursor: 'not-allowed',
                          },
                        }}
                      />
                    )}
                    renderOption={(props, option) => (
                      <li {...props} key={option._id} style={{ padding: '5px 8px', fontSize: '0.8rem' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <Typography variant="body2" fontWeight={600} fontSize="0.8rem" color="#1a2332">
                            {option.name}
                          </Typography>
                          {option.code && (
                            <Typography
                              variant="caption"
                              sx={{
                                bgcolor: '#f1f5f9',
                                px: 0.75,
                                py: 0.2,
                                borderRadius: '3px',
                                color: '#64748b',
                                fontWeight: 600,
                                fontSize: '0.7rem',
                              }}
                            >
                              {option.code}
                            </Typography>
                          )}
                        </Box>
                      </li>
                    )}
                  />
                  <div className="bank-reg-hint">
                    {isUnderLocked
                      ? `Default account group locked for ${ledgerType || 'this'} registration`
                      : 'Classification group in Chart of Accounts (type to search)'}
                  </div>
                </div>
              </div>

              <div className="bank-reg-form-grid">
                {/* Registration Date */}
                <div className="bank-reg-form-group">
                  <label className="bank-reg-form-label">Registration Date</label>
                  <Controller
                    name="regDate"
                    control={control}
                    render={({ field }) => (
                      <DateInput
                        label=""
                        value={field.value || ''}
                        onChange={field.onChange}
                        size="small"
                        fullWidth
                        inputRef={regDateInputRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (againstRefInputRef.current) {
                              againstRefInputRef.current.focus();
                            } else {
                              focusNextField(e.currentTarget as HTMLElement);
                            }
                          }
                        }}
                      />
                    )}
                  />
                </div>

                {/* Account Code */}
                <div className="bank-reg-form-group">
                  <label className="bank-reg-form-label">Account Code</label>
                  <input
                    type="text"
                    className="bank-reg-input"
                    placeholder="Auto-generated if empty"
                    {...register('code')}
                    disabled
                  />
                  <div className="bank-reg-hint">Auto-generated when empty</div>
                </div>
              </div>

              {/* Checkboxes: Against Ref, Reconciliation, Card Account */}
              <div
                className="bank-reg-form-grid"
                style={{
                  marginTop: 6,
                  marginBottom: 6,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 24,
                  flexWrap: 'wrap',
                }}
              >
                <div className="bank-reg-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, margin: 0 }}>
                  <input
                    type="checkbox"
                    id="chk-against-ref"
                    style={{ width: 15, height: 15, accentColor: '#3b82f6', cursor: 'pointer' }}
                    {...register('againstRef')}
                    ref={(el) => {
                      register('againstRef').ref(el);
                      (againstRefInputRef as any).current = el;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (aliasNameInputRef.current) {
                          aliasNameInputRef.current.focus();
                          aliasNameInputRef.current.select?.();
                        } else {
                          focusNextField(e.currentTarget);
                        }
                      }
                    }}
                  />
                  <label htmlFor="chk-against-ref" className="bank-reg-form-label" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>
                    Against Ref
                  </label>
                </div>

                {isBankSelected && (
                  <>
                    <div className="bank-reg-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, margin: 0 }}>
                      <input
                        type="checkbox"
                        id="chk-reconciliation"
                        style={{ width: 15, height: 15, accentColor: '#3b82f6', cursor: 'pointer' }}
                        {...register('reconciliation')}
                      />
                      <label htmlFor="chk-reconciliation" className="bank-reg-form-label" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>
                        Reconciliation
                      </label>
                    </div>

                    <div className="bank-reg-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, margin: 0 }}>
                      <input
                        type="checkbox"
                        id="chk-card-account"
                        style={{ width: 15, height: 15, accentColor: '#3b82f6', cursor: 'pointer' }}
                        {...register('isCardAccount')}
                      />
                      <label htmlFor="chk-card-account" className="bank-reg-form-label" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>
                        Card Account
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* Cash Selected: Only show Basic Information section and Debit and Credit amount fields */}
              {isCashSelected && (
                <div className="bank-reg-form-grid">
                  <div className="bank-reg-form-group">
                    <label className="bank-reg-form-label">Debit Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="bank-reg-input"
                      placeholder="0.00"
                      {...register('openingBalanceDr')}
                    />
                    <div className="bank-reg-hint">Opening debit balance</div>
                  </div>

                  <div className="bank-reg-form-group">
                    <label className="bank-reg-form-label">Credit Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="bank-reg-input"
                      placeholder="0.00"
                      {...register('openingBalanceCr')}
                    />
                    <div className="bank-reg-hint">Opening credit balance</div>
                  </div>
                </div>
              )}
            </div>

            {/* Bank Details Section */}
            {isBankSelected && (
              <>
                <div className="bank-reg-form-section">
                  <div className="bank-reg-section-header">Bank Details</div>
                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">A/c Holder's Name</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Account holder name"
                        {...register('accountHolderName')}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">A/c No.</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Account number"
                        {...register('accountNumber')}
                      />
                    </div>
                  </div>

                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">IBAN</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="International Bank Account Number"
                        {...register('iban')}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Bank/SWIFT Code</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="SWIFT code"
                        {...register('swiftCode')}
                      />
                    </div>
                  </div>

                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Bank Name</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Name of the bank"
                        {...register('bankName')}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Branch</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Branch name"
                        {...register('branch')}
                      />
                    </div>
                  </div>
                </div>

                {/* VAT Registration Details Section */}
                <div className="bank-reg-form-section">
                  <div className="bank-reg-section-header">VAT Registration Details</div>
                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Registration Type</label>
                      <select className="bank-reg-select" {...register('vatRegistrationType')}>
                        <option value="">Select registration type</option>
                        <option value="regular">Regular</option>
                        <option value="simplified">Simplified</option>
                      </select>
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Date of VAT Registration</label>
                      <Controller
                        name="vatRegistrationDate"
                        control={control}
                        render={({ field }) => (
                          <DateInput
                            label=""
                            value={field.value || ''}
                            onChange={field.onChange}
                            size="small"
                            fullWidth
                          />
                        )}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">TRN (Tax Registration Number)</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Enter TRN"
                        {...register('TRN')}
                      />
                    </div>
                  </div>
                </div>

                {/* Mailing Details Section */}
                <div className="bank-reg-form-section">
                  <div className="bank-reg-section-header">Mailing Details</div>
                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Name</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Mailing name"
                        {...register('mailingName')}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Bank</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Bank name"
                        {...register('mailingBank')}
                      />
                    </div>
                  </div>

                  <div className="bank-reg-form-grid full">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Address</label>
                      <textarea
                        className="bank-reg-textarea"
                        placeholder="Complete mailing address"
                        {...register('address')}
                      />
                    </div>
                  </div>

                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Emirate</label>
                      <select
                        className="bank-reg-select"
                        {...register('state')}
                        ref={(el) => {
                          register('state').ref(el);
                          (emirateBankSelectRef as any).current = el;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            setAdditionalDetailsOpen(true);
                            setTimeout(() => {
                              if (openingBalanceDrRef.current) {
                                openingBalanceDrRef.current.focus();
                                openingBalanceDrRef.current.select?.();
                              }
                            }, 50);
                          }
                        }}
                      >
                        <option value="">Select emirate</option>
                        {UAE_EMIRATES.map((em) => (
                          <option key={em} value={em}>
                            {em}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Country</label>
                      <select className="bank-reg-select" {...register('country')}>
                        <option value="">Select country</option>
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">PO Box</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="P.O. Box number"
                        {...register('poBox')}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Mailing Details in Local Language</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Local language details"
                        {...register('localLanguageDetails')}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Standard Mode Content (when not Bank Details and not Cash) */}
            {!isBankSelected && !isCashSelected && (
              <>
                <div className="bank-reg-form-section">
                  <div className="bank-reg-section-header">Contact Information</div>
                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Business Name (Alias)</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="Alias name"
                        {...register('aliasName')}
                        ref={(el) => {
                          register('aliasName').ref(el);
                          (aliasNameInputRef as any).current = el;
                        }}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Mobile Number</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="+971 50 xxx xxxx"
                        {...register('mobile')}
                      />
                    </div>
                  </div>

                  <div className="bank-reg-form-grid full">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Address</label>
                      <textarea
                        className="bank-reg-textarea"
                        placeholder="Enter complete address"
                        {...register('address')}
                      />
                    </div>
                  </div>

                  <div className="bank-reg-form-grid">
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">VAT Number (TRN)</label>
                      <input
                        type="text"
                        className="bank-reg-input"
                        placeholder="e.g., 100567891234567"
                        {...register('TRN')}
                      />
                    </div>
                    <div className="bank-reg-form-group">
                      <label className="bank-reg-form-label">Emirate</label>
                      <select
                        className="bank-reg-select"
                        {...register('state')}
                        ref={(el) => {
                          register('state').ref(el);
                          (emirateSelectRef as any).current = el;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            setAdditionalDetailsOpen(true);
                            setTimeout(() => {
                              if (openingBalanceDrRef.current) {
                                openingBalanceDrRef.current.focus();
                                openingBalanceDrRef.current.select?.();
                              }
                            }, 50);
                          }
                        }}
                      >
                        <option value="">Select emirate</option>
                        {UAE_EMIRATES.map((em) => (
                          <option key={em} value={em}>
                            {em}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Additional Details Section (Hidden when Cash is selected) */}
            {!isCashSelected && (
              <div className="bank-reg-form-section">
                <div
                  className="bank-reg-section-header"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setAdditionalDetailsOpen(!additionalDetailsOpen)}
                >
                  <span>
                    Additional Details {additionalDetailsOpen ? '' : '(Click to expand)'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {additionalDetailsOpen ? <ArrowUpIcon fontSize="small" /> : <ArrowDownIcon fontSize="small" />}
                  </span>
                </div>

                {additionalDetailsOpen && (
                  <Box sx={{ mt: 2, pt: 1 }}>
                    <div className="bank-reg-form-grid">
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Opening Debit Balance</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="bank-reg-input"
                          placeholder="0.00"
                          {...register('openingBalanceDr')}
                          ref={(el) => {
                            register('openingBalanceDr').ref(el);
                            (openingBalanceDrRef as any).current = el;
                          }}
                        />
                      </div>
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Opening Credit Balance</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="bank-reg-input"
                          placeholder="0.00"
                          {...register('openingBalanceCr')}
                        />
                      </div>
                    </div>

                    <div className="bank-reg-form-grid">
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Telephone Number</label>
                        <input
                          type="text"
                          className="bank-reg-input"
                          placeholder="Landline / Tel"
                          {...register('phone')}
                        />
                      </div>
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Email Address</label>
                        <input
                          type="email"
                          className="bank-reg-input"
                          placeholder="name@example.com"
                          {...register('email')}
                        />
                      </div>
                    </div>

                    <div className="bank-reg-form-grid">
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Credit Limit (AED)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="bank-reg-input"
                          placeholder="0.00"
                          {...register('creditLimit')}
                        />
                      </div>
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Credit Days</label>
                        <input
                          type="number"
                          min="0"
                          className="bank-reg-input"
                          placeholder="0"
                          {...register('creditDays')}
                        />
                      </div>
                    </div>

                    <div className="bank-reg-form-grid">
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Area</label>
                        <input
                          type="text"
                          className="bank-reg-input"
                          placeholder="Area / Zone"
                          {...register('area')}
                        />
                      </div>
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Route</label>
                        <input
                          type="text"
                          className="bank-reg-input"
                          placeholder="Route code or name"
                          {...register('route')}
                        />
                      </div>
                    </div>

                    <div className="bank-reg-form-grid">
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Agency</label>
                        <input
                          type="text"
                          className="bank-reg-input"
                          placeholder="Agency name"
                          {...register('agency')}
                        />
                      </div>
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Discount %</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="bank-reg-input"
                          placeholder="0.00"
                          {...register('discPercent')}
                        />
                      </div>
                    </div>

                    <div className="bank-reg-form-grid">
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Rate Type</label>
                        <input
                          type="text"
                          className="bank-reg-input"
                          placeholder="e.g., Retail, Wholesale"
                          {...register('rateType')}
                        />
                      </div>
                      <div className="bank-reg-form-group">
                        <label className="bank-reg-form-label">Remarks</label>
                        <input
                          type="text"
                          className="bank-reg-input"
                          placeholder="Additional notes"
                          {...register('remarks')}
                        />
                      </div>
                    </div>

                    <div className="bank-reg-form-grid" style={{ marginTop: 6 }}>
                      <div className="bank-reg-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          id="chk-service-item"
                          style={{ width: 14, height: 14, accentColor: '#3b82f6' }}
                          {...register('serviceItem')}
                        />
                        <label htmlFor="chk-service-item" className="bank-reg-form-label" style={{ margin: 0, cursor: 'pointer' }}>
                          Service Item
                        </label>
                      </div>

                      <div className="bank-reg-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          id="chk-taxable"
                          style={{ width: 14, height: 14, accentColor: '#3b82f6' }}
                          {...register('taxable')}
                        />
                        <label htmlFor="chk-taxable" className="bank-reg-form-label" style={{ margin: 0, cursor: 'pointer' }}>
                          Taxable
                        </label>
                      </div>
                    </div>
                  </Box>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="bank-reg-actions">
              <button
                ref={saveBtnRef}
                type="button"
                disabled={isEditMode}
                onClick={() => handleSubmit(onSubmit)()}
                className="bank-reg-btn bank-reg-btn-primary"
              >
                <span className="bank-reg-icon">✓</span> Save
              </button>

              <button
                ref={clearBtnRef}
                type="button"
                onClick={() => {
                  clearForm();
                  setTimeout(() => {
                    ledgerNameInputRef.current?.focus();
                  }, 50);
                }}
                className="bank-reg-btn bank-reg-btn-clear"
              >
                <span className="bank-reg-icon">×</span> Clear
              </button>

              <button
                ref={updateBtnRef}
                type="button"
                disabled={!isEditMode}
                onClick={() => handleSubmit(onEdit)()}
                className="bank-reg-btn bank-reg-btn-tertiary"
              >
                Update
              </button>

              <button
                ref={deleteBtnRef}
                type="button"
                disabled={!isEditMode}
                onClick={onDelete}
                className="bank-reg-btn bank-reg-btn-danger"
              >
                Delete
              </button>
            </div>

            {/* Inline message below the window */}
            {bottomBanner && (
              <Box
                sx={{
                  mt: 2.5,
                  p: 1.5,
                  bgcolor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: '#16a34a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </Box>
                <Typography sx={{ color: '#15803d', fontSize: '0.92rem', fontWeight: 600 }}>
                  {bottomBanner}
                </Typography>
              </Box>
            )}
          </form>
        </div>
      </div>

      {/* Confirmation Save/Update Dialog */}
      <Dialog
        open={confirmSaveOpen}
        onClose={handleCancelSave}
        onKeyDown={handleConfirmDialogKeyDown}
        TransitionProps={{
          onEntered: () => {
            dialogYesBtnRef.current?.focus();
          },
        }}
        PaperProps={{ sx: { borderRadius: '12px', minWidth: 360, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>
          Confirm {pendingAction === 'edit' ? 'Update' : 'Save'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: '0.95rem' }}>
            Do you want to {pendingAction === 'edit' ? 'update' : 'save'} this ledger account?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            ref={dialogNoBtnRef}
            onClick={handleCancelSave}
            variant="outlined"
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              borderColor: '#cbd5e1',
              color: '#64748b',
              fontWeight: 600,
              minWidth: 80,
              '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              '&:focus, &:focus-visible': {
                outline: '3px solid #64748b',
                outlineOffset: '2px',
                borderColor: '#64748b',
                bgcolor: '#f1f5f9',
              },
            }}
          >
            No
          </Button>
          <Button
            ref={dialogYesBtnRef}
            onClick={handleConfirmSave}
            variant="contained"
            autoFocus
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              bgcolor: '#0284c7',
              fontWeight: 600,
              minWidth: 80,
              '&:hover': { bgcolor: '#0369a1' },
              '&:focus, &:focus-visible': {
                outline: '3px solid #0284c7',
                outlineOffset: '2px',
                boxShadow: '0 0 0 4px rgba(2, 132, 199, 0.35)',
              },
            }}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bottom Floating Notification */}
      <Snackbar
        open={!!bottomToast}
        autoHideDuration={3500}
        onClose={() => setBottomToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setBottomToast(null)}
          severity={bottomToast?.severity || 'success'}
          variant="filled"
          sx={{
            minWidth: 320,
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            fontWeight: 600,
            fontSize: '0.95rem',
            bgcolor: bottomToast?.severity === 'success' ? '#16a34a' : undefined,
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            py: 1,
            px: 2.5,
          }}
        >
          {bottomToast?.message}
        </Alert>
      </Snackbar>

      {/* Change Led Name Dialog */}
      <Dialog open={changeNameDialogOpen} onClose={() => setChangeNameDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px', p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Change Ledger Name</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography component="label" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', mb: 0.75 }}>
              Ledger Code
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={changeNameCode}
              disabled
              sx={{ mb: 2 }}
            />
            <Typography component="label" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', mb: 0.75 }}>
              New Ledger Name
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={changeNameValue}
              onChange={(e) => setChangeNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && changeNameValue.trim() && !changeNameSaving) {
                  e.preventDefault();
                  handleChangeNameSave();
                }
              }}
              required
              autoFocus
              inputProps={{ 'data-autofocus': 'true' }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setChangeNameDialogOpen(false)} sx={{ textTransform: 'none', color: '#64748b' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleChangeNameSave}
            disabled={changeNameSaving || !changeNameValue.trim()}
            sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' } }}
          >
            {changeNameSaving ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: '12px', minWidth: 350, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={() => setErrorDialogOpen(false)} autoFocus sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onKeyDown={handleDeleteDialogKeyDown}
        TransitionProps={{
          onEntered: () => {
            deleteYesBtnRef.current?.focus();
          },
        }}
        PaperProps={{ sx: { borderRadius: '12px', minWidth: 350, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#dc2626' }}>Delete Ledger</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            Are you sure you want to delete this ledger? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            ref={deleteNoBtnRef}
            onClick={() => setDeleteConfirmOpen(false)}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              color: '#64748b',
              fontWeight: 600,
              minWidth: 80,
              '&:focus, &:focus-visible': {
                outline: '3px solid #64748b',
                outlineOffset: '2px',
                bgcolor: '#f1f5f9',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            ref={deleteYesBtnRef}
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            autoFocus
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              bgcolor: '#ef4444',
              fontWeight: 600,
              minWidth: 80,
              '&:hover': { bgcolor: '#dc2626' },
              boxShadow: 'none',
              '&:focus, &:focus-visible': {
                outline: '3px solid #ef4444',
                outlineOffset: '2px',
                boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.35)',
              },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
