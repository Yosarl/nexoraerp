import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Save as SaveIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import { ledgerAccountApi, ledgerGroupApi } from '../services/api';
import DateInput from './DateInput';

type Group = { _id: string; name: string; code: string; type: string; isReceivables?: boolean; isPayables?: boolean };
type UnderOption = { _id: string; name: string };
type LedgerOption = { _id: string; name: string; code: string };

interface FormData {
  name: string;
  aliasName: string;
  code: string;
  groupId: string;
  address: string;
  location: string;
  pincode: string;
  mobile: string;
  TRN: string;
  state: string;
  stateCode: string;
  costCentre: string;
  creditLimit: string;
  creditDays: string;
  openingBalanceCr: string;
  openingBalanceDr: string;
  serviceItem: boolean;
  sacHsn: string;
  taxable: boolean;
  area: string;
  route: string;
  day: string;
  district: string;
  agency: string;
  regDate: string;
  discPercent: string;
  category: string;
  rateType: string;
  remarks: string;
  rating: string;
  story: string;
  empCode: string;
  salesMan: string;
  person: string;
  agent2: string;
  phone: string;
  email: string;
  paymentTerms: string;
}

const defaultFormValues: FormData = {
  name: '',
  aliasName: '',
  code: '',
  groupId: '',
  address: '',
  location: '',
  pincode: '',
  mobile: '',
  TRN: '',
  state: '',
  stateCode: '',
  costCentre: '',
  creditLimit: '',
  creditDays: '',
  openingBalanceCr: '',
  openingBalanceDr: '',
  serviceItem: false,
  sacHsn: '',
  taxable: false,
  area: '',
  route: '',
  day: '',
  district: '',
  agency: '',
  regDate: new Date().toISOString().slice(0, 10),
  discPercent: '',
  category: '',
  rateType: '',
  remarks: '',
  rating: '',
  story: '',
  empCode: '',
  salesMan: '',
  person: '',
  agent2: '',
  phone: '',
  email: '',
  paymentTerms: '',
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

export default function LedgerRegForm({
  ledgerType,
  title = 'Ledger Registration',
}: {
  ledgerType: 'Customer' | 'Supplier' | null;
  title?: string;
}) {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);
  const routeLocation = useLocation();
  const routeNavigate = useNavigate();
  const prefillAppliedRef = useRef<string | null>(null);
  const savedLedgerNameRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ledgerOptions, setLedgerOptions] = useState<LedgerOption[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [underOptions, setUnderOptions] = useState<UnderOption[]>([]);
  const [receivablesId, setReceivablesId] = useState<string | null>(null);
  const [payablesId, setPayablesId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [successDialog, setSuccessDialog] = useState<'saved' | 'edited' | 'deleted' | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'edit' | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [customerTabValue, setCustomerTabValue] = useState(0);
  const [ledgerNameDropdownOpen, setLedgerNameDropdownOpen] = useState(false);

  // Refs for Customer Main tab Enter-key flow and initial focus
  const ledgerNameInputRef = useRef<HTMLInputElement>(null);
  const aliasNameRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const vatNoRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const oldBalanceDrRef = useRef<HTMLInputElement>(null);
  const oldBalanceCrRef = useRef<HTMLInputElement>(null);
  const emirateSelectRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Change Led Name Dialog
  const [changeNameDialogOpen, setChangeNameDialogOpen] = useState(false);
  const [changeNameCode, setChangeNameCode] = useState('');
  const [changeNameValue, setChangeNameValue] = useState('');
  const [changeNameSaving, setChangeNameSaving] = useState(false);
  const underDisabled = ledgerType === 'Customer' || ledgerType === 'Supplier';
  const defaultGroupId =
    ledgerType === 'Customer' ? receivablesId
      : ledgerType === 'Supplier' ? payablesId
        : '';

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch, control } = useForm<FormData>({
    defaultValues: defaultFormValues,
  });

  const groupIdValue = watch('groupId');
  const isEditMode = !!selectedId;

  const listType = ledgerType === null ? undefined : ledgerType;

  // Focus Ledger Name when Customer form Main tab is shown
  useEffect(() => {
    if (ledgerType === 'Customer' && customerTabValue === 0) {
      const t = setTimeout(() => ledgerNameInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [ledgerType, customerTabValue]);

  useEffect(() => {
    if (!companyId) return;
    const search = ledgerSearch.trim() || undefined;
    ledgerAccountApi.list(companyId, listType, search).then((res) => {
      const list = (res.data.data as LedgerOption[]) ?? [];
      setLedgerOptions(list);
    });
  }, [companyId, listType, ledgerSearch]);

  useEffect(() => {
    if (!companyId) return;
    ledgerGroupApi.list(companyId).then((res) => {
      const list = (res.data.data as Group[]) ?? [];
      const recv = list.find(
        (g) =>
          g.isReceivables === true ||
          (g.code && g.code.toUpperCase() === 'RECV') ||
          (g.name && g.name.toLowerCase().includes('receiv'))
      );
      const pay = list.find(
        (g) =>
          g.isPayables === true ||
          (g.code && g.code.toUpperCase() === 'PAY') ||
          (g.name && g.name.toLowerCase().includes('payab'))
      );
      const recvId = recv?._id ?? null;
      const payId = pay?._id ?? null;
      setReceivablesId(recvId);
      setPayablesId(payId);
      const options: UnderOption[] = [];
      if (recvId) options.push({ _id: recvId, name: 'Customer' });
      if (payId) options.push({ _id: payId, name: 'Supplier' });
      list.forEach((g) => {
        if (g._id !== recvId && g._id !== payId) options.push({ _id: g._id, name: g.name });
      });
      setUnderOptions(options);
      if (ledgerType === 'Customer' && recvId) setValue('groupId', recvId);
      if (ledgerType === 'Supplier' && payId) setValue('groupId', payId);
    });
  }, [companyId, ledgerType, setValue]);

  const populateForm = useCallback(
    (ledger: Record<string, unknown>) => {
      const gid = (ledger.groupId as { _id?: string })?._id ?? ledger.groupId;
      const ob = Array.isArray(ledger.openingBalances) && financialYearId
        ? (ledger.openingBalances as Array<{ financialYearId: string; amount: number; isDebit: boolean }>).find(
          (b) => String(b.financialYearId) === financialYearId
        )
        : null;
      setValue('name', String(ledger.name ?? ''));
      setValue('aliasName', String(ledger.aliasName ?? ''));
      setValue('code', String(ledger.code ?? ''));
      setValue('groupId', String(gid ?? ''));
      setValue('address', String(ledger.address ?? ''));
      setValue('location', String(ledger.location ?? ''));
      setValue('pincode', String(ledger.pincode ?? ''));
      setValue('mobile', String(ledger.mobile ?? ''));
      setValue('TRN', String(ledger.TRN ?? ''));
      setValue('state', String(ledger.state ?? ''));
      setValue('stateCode', String(ledger.stateCode ?? ''));
      setValue('costCentre', String(ledger.costCentre ?? ''));
      setValue('creditLimit', ledger.creditLimit != null ? String(ledger.creditLimit) : '');
      setValue('creditDays', ledger.creditDays != null ? String(ledger.creditDays) : '');
      setValue('openingBalanceCr', ob && !ob.isDebit ? String(ob.amount) : '');
      setValue('openingBalanceDr', ob && ob.isDebit ? String(ob.amount) : '');
      setValue('serviceItem', Boolean(ledger.serviceItem));
      setValue('sacHsn', String(ledger.sacHsn ?? ''));
      setValue('taxable', Boolean(ledger.taxable));
      setValue('area', String(ledger.area ?? ''));
      setValue('route', String(ledger.route ?? ''));
      setValue('day', String(ledger.day ?? ''));
      setValue('district', String(ledger.district ?? ''));
      setValue('agency', String(ledger.agency ?? ''));
      setValue('regDate', ledger.regDate ? new Date(ledger.regDate as string).toISOString().slice(0, 10) : '');
      setValue('discPercent', ledger.discPercent != null ? String(ledger.discPercent) : '');
      setValue('category', String(ledger.category ?? ''));
      setValue('rateType', String(ledger.rateType ?? ''));
      setValue('remarks', String(ledger.remarks ?? ''));
      setValue('rating', String(ledger.rating ?? ''));
      setValue('story', String(ledger.story ?? ''));
      setValue('empCode', String(ledger.empCode ?? ''));
      setValue('salesMan', String(ledger.salesMan ?? ''));
      setValue('person', String(ledger.person ?? ''));
      setValue('agent2', String(ledger.agent2 ?? ''));
      setValue('phone', String(ledger.phone ?? ''));
      setValue('email', String(ledger.email ?? ''));
      setValue('paymentTerms', String(ledger.paymentTerms ?? ''));
    },
    [financialYearId, setValue]
  );

  const clearForm = useCallback(() => {
    setSelectedId(null);
    setMessage('');
    setLedgerSearch('');
    setCustomerTabValue(0);
    reset(defaultFormValues);
    if (ledgerType === 'Customer' && receivablesId) setValue('groupId', receivablesId);
    if (ledgerType === 'Supplier' && payablesId) setValue('groupId', payablesId);
  }, [reset, setValue, ledgerType, receivablesId, payablesId]);

  // Pre-fill name when navigated from SalesB2C (or similar) with a new customer name
  useEffect(() => {
    const state = routeLocation.state as { prefillName?: string; returnTo?: string } | null;
    if (state?.prefillName && state.prefillName !== prefillAppliedRef.current) {
      prefillAppliedRef.current = state.prefillName;
      clearForm();
      setValue('name', state.prefillName);
      setLedgerSearch(state.prefillName);
    }
  }, [routeLocation.state, clearForm, setValue]);

  const onLedgerSelect = (_: unknown, value: LedgerOption | string | null) => {
    if (!value) {
      setSelectedId(null);
      setValue('name', '');
      setLedgerSearch('');
      return;
    }
    // If user typed a new name (string)
    if (typeof value === 'string') {
      setSelectedId(null);
      setValue('name', value);
      setLedgerSearch(value);
      return;
    }
    // If user selected an existing ledger
    if (!companyId) return;
    ledgerAccountApi.get(value._id, companyId).then((res) => {
      const ledger = res.data.data as Record<string, unknown>;
      if (ledger) {
        setSelectedId(value._id);
        setLedgerSearch(value.name);
        populateForm(ledger);
      }
    });
  };

  const onSubmit = (data: FormData) => {
    if (!companyId) return;
    if (!data.name || !data.name.trim()) {
      setErrorDialogMessage('Ledger name is required');
      setErrorDialogOpen(true);
      return;
    }
    // Show confirmation dialog
    setPendingFormData(data);
    setPendingAction('save');
    setConfirmSaveOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmSaveOpen(false);
    if (!pendingFormData || !companyId) return;
    const data = pendingFormData;
    setMessage('');

    if (pendingAction === 'edit' && selectedId) {
      // Edit existing ledger
      try {
        await ledgerAccountApi.update(selectedId, {
          companyId,
          name: data.name,
          aliasName: data.aliasName || undefined,
          groupId: data.groupId,
          phone: data.phone || undefined,
          mobile: data.mobile || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          location: data.location || undefined,
          pincode: data.pincode || undefined,
          TRN: data.TRN || undefined,
          state: data.state || undefined,
          stateCode: data.stateCode || undefined,
          costCentre: data.costCentre || undefined,
          creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
          creditDays: data.creditDays ? Number(data.creditDays) : undefined,
          paymentTerms: data.paymentTerms || undefined,
          serviceItem: data.serviceItem,
          sacHsn: data.sacHsn || undefined,
          taxable: data.taxable,
          area: data.area || undefined,
          route: data.route || undefined,
          day: data.day || undefined,
          district: data.district || undefined,
          agency: data.agency || undefined,
          regDate: data.regDate || undefined,
          discPercent: data.discPercent ? Number(data.discPercent) : undefined,
          category: data.category || undefined,
          rateType: data.rateType || undefined,
          remarks: data.remarks || undefined,
          rating: data.rating || undefined,
          story: data.story || undefined,
          empCode: data.empCode || undefined,
          salesMan: data.salesMan || undefined,
          person: data.person || undefined,
          agent2: data.agent2 || undefined,
        });
        setPendingFormData(null);
        setPendingAction(null);
        setSuccessDialog('edited');
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to update ledger');
        setErrorDialogOpen(true);
      }
    } else {
      // Create new ledger
      try {
        await ledgerAccountApi.create({
          companyId,
          financialYearId: financialYearId || undefined,
          name: data.name,
          aliasName: data.aliasName || undefined,
          code: data.code || undefined,
          groupId: data.groupId,
          type: ledgerType ?? 'Other',
          phone: data.phone || undefined,
          mobile: data.mobile || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          location: data.location || undefined,
          pincode: data.pincode || undefined,
          TRN: data.TRN || undefined,
          state: data.state || undefined,
          stateCode: data.stateCode || undefined,
          costCentre: data.costCentre || undefined,
          creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
          creditDays: data.creditDays ? Number(data.creditDays) : undefined,
          paymentTerms: data.paymentTerms || undefined,
          openingBalanceDr: data.openingBalanceDr ? Number(data.openingBalanceDr) : undefined,
          openingBalanceCr: data.openingBalanceCr ? Number(data.openingBalanceCr) : undefined,
          serviceItem: data.serviceItem,
          sacHsn: data.sacHsn || undefined,
          taxable: data.taxable,
          area: data.area || undefined,
          route: data.route || undefined,
          day: data.day || undefined,
          district: data.district || undefined,
          agency: data.agency || undefined,
          regDate: data.regDate || undefined,
          discPercent: data.discPercent ? Number(data.discPercent) : undefined,
          category: data.category || undefined,
          rateType: data.rateType || undefined,
          remarks: data.remarks || undefined,
          rating: data.rating || undefined,
          story: data.story || undefined,
          empCode: data.empCode || undefined,
          salesMan: data.salesMan || undefined,
          person: data.person || undefined,
          agent2: data.agent2 || undefined,
        });
        setPendingFormData(null);
        setPendingAction(null);
        savedLedgerNameRef.current = data.name.trim();
        setSuccessDialog('saved');
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

  const onEdit = (data: FormData) => {
    if (!companyId || !selectedId) return;
    // Show confirmation dialog
    setPendingFormData(data);
    setPendingAction('edit');
    setConfirmSaveOpen(true);
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
      setSuccessDialog('deleted');
      clearForm();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to delete ledger');
      setErrorDialogOpen(true);
    }
  };

  const closeSuccessDialog = () => {
    const shouldClearForm = successDialog === 'saved' || successDialog === 'edited';
    setSuccessDialog(null);
    // If we came from another page (e.g. SalesB2C) and just saved, navigate back with created ledger name
    const state = routeLocation.state as { returnTo?: string } | null;
    if (successDialog === 'saved' && state?.returnTo) {
      prefillAppliedRef.current = null;
      const createdName = savedLedgerNameRef.current;
      savedLedgerNameRef.current = null;
      routeNavigate(state.returnTo, { state: createdName ? { createdLedgerName: createdName } : undefined });
      return;
    }
    if (shouldClearForm) clearForm();
  };

  // Change Led Name handlers
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
      // Update the local state
      setLedgerOptions((prev) =>
        prev.map((o) => (o._id === selectedId ? { ...o, name: changeNameValue.trim() } : o))
      );
      setLedgerSearch(changeNameValue.trim());
      setValue('name', changeNameValue.trim());
      setChangeNameDialogOpen(false);
      setMessage('Ledger name updated successfully');
      setTimeout(() => setMessage(''), 2000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorDialogMessage(err?.response?.data?.message ?? 'Failed to update name');
      setErrorDialogOpen(true);
    } finally {
      setChangeNameSaving(false);
    }
  };

  if (!companyId) return <Typography color="error">Select a company first.</Typography>;

  const isCustomerForm = ledgerType === 'Customer';

  const actionButtons = (
    <Box sx={{ mt: 3, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      <Button ref={saveButtonRef} type="submit" variant="contained" disabled={isEditMode} startIcon={<SaveIcon />} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, minWidth: 110, py: 1, fontSize: '0.9rem' }}>SAVE</Button>
      <Button type="button" variant="contained" onClick={clearForm} startIcon={<ClearIcon />} sx={{ bgcolor: '#00bcd4', '&:hover': { bgcolor: '#00acc1' }, minWidth: 110, py: 1, fontSize: '0.9rem' }}>CLEAR</Button>
      <Button type="button" variant="contained" disabled={!isEditMode} onClick={() => handleSubmit(onEdit)()} startIcon={<EditIcon />} sx={{ bgcolor: '#607d8b', '&:hover': { bgcolor: '#546e7a' }, minWidth: 110, py: 1, fontSize: '0.9rem' }}>UPDATE</Button>
      <Button type="button" variant="contained" disabled={!isEditMode} onClick={onDelete} startIcon={<DeleteIcon />} sx={{ bgcolor: '#f44336', '&:hover': { bgcolor: '#d32f2f' }, minWidth: 110, py: 1, fontSize: '0.9rem' }}>DELETE</Button>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Typography>
      </Box>
      <Paper sx={{ p: 3 }}>
        {message && (
          <Typography color="success" sx={{ mb: 2, fontWeight: 'bold' }}>
            {message}
          </Typography>
        )}
        <form onSubmit={handleSubmit(isEditMode ? onEdit : onSubmit)}>
          {isCustomerForm ? (
            <>
              <Tabs value={customerTabValue} onChange={(_: React.SyntheticEvent, v: number) => setCustomerTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tab label="Main" id="customer-tab-main" aria-controls="customer-tabpanel-main" />
                <Tab label="Additional" id="customer-tab-additional" aria-controls="customer-tabpanel-additional" />
              </Tabs>
              <Box role="tabpanel" hidden={customerTabValue !== 0} id="customer-tabpanel-main" aria-labelledby="customer-tab-main">
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4} md={3}>
                    <Controller name="regDate" control={control} render={({ field }) => <DateInput label="Date" value={field.value || ''} onChange={field.onChange} size="small" />} />
                  </Grid>
                  <Grid item xs={12} sm={8} md={9}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Autocomplete
                        size="small"
                        freeSolo
                        disabled={!!selectedId}
                        options={ledgerOptions}
                        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name ?? '')}
                        value={selectedId ? ledgerOptions.find((o) => o._id === selectedId) ?? null : (ledgerSearch || null)}
                        inputValue={ledgerSearch}
                        onChange={onLedgerSelect}
                        onOpen={() => setLedgerNameDropdownOpen(true)}
                        onClose={() => setLedgerNameDropdownOpen(false)}
                        onInputChange={(_, v, reason) => {
                          setLedgerSearch(v);
                          if (reason === 'input' && !selectedId) {
                            setValue('name', v);
                            setValue('aliasName', v);
                          }
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            inputRef={ledgerNameInputRef}
                            label="Ledger Name"
                            required
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !ledgerNameDropdownOpen) {
                                e.preventDefault();
                                aliasNameRef.current?.focus();
                              }
                            }}
                            sx={{ '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                            InputLabelProps={{ shrink: true }}
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props} key={option._id} style={{ padding: '10px 14px', fontSize: '0.95rem', minHeight: 40 }}>
                            <Box><Typography variant="body1" fontWeight={500}>{option.name}</Typography><Typography variant="body2" color="text.secondary">{option.code}</Typography></Box>
                          </li>
                        )}
                        slotProps={{ paper: { sx: { fontSize: '0.95rem', '& .MuiAutocomplete-listbox': { maxHeight: 320 } } } }}
                        sx={{ flex: 1, '& .MuiOutlinedInput-root': { fontSize: '0.95rem' } }}
                      />
                      <Button variant="outlined" size="small" onClick={handleOpenChangeName} disabled={!selectedId} sx={{ minWidth: 'auto', px: 1, py: 0.9, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>Change Name</Button>
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth select size="small" label="Under" required disabled={underDisabled} {...register('groupId', { required: 'Required' })} value={groupIdValue || defaultGroupId || ''} onChange={(e) => setValue('groupId', e.target.value, { shouldValidate: true })} error={!!errors.groupId} helperText={errors.groupId?.message} InputLabelProps={{ shrink: true }}>
                      {underOptions.map((opt) => <MenuItem key={opt._id} value={opt._id}>{opt.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Account Code" {...register('code')} helperText="Auto-generated when empty" InputLabelProps={{ shrink: true }} disabled />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Alias Name" {...register('aliasName')} inputRef={aliasNameRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); mobileRef.current?.focus(); } }} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Mobile" {...register('mobile')} inputRef={mobileRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); vatNoRef.current?.focus(); } }} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="VAT No" {...register('TRN')} inputRef={vatNoRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addressRef.current?.focus(); } }} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Address" multiline rows={2} {...register('address')} inputRef={addressRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); oldBalanceDrRef.current?.focus(); } }} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" type="number" label="Old Balance Debit" {...register('openingBalanceDr')} inputRef={oldBalanceDrRef} inputProps={{ min: 0, step: 0.01 }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); oldBalanceCrRef.current?.focus(); } }} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" type="number" label="Old Balance Credit" {...register('openingBalanceCr')} inputRef={oldBalanceCrRef} inputProps={{ min: 0, step: 0.01 }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); emirateSelectRef.current?.focus(); } }} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth select size="small" label="Emirate" {...register('state')} value={watch('state') || ''} onChange={(e) => setValue('state', e.target.value)} inputRef={emirateSelectRef} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveButtonRef.current?.focus(); } }} InputLabelProps={{ shrink: true }}>
                      <MenuItem value="">— Select —</MenuItem>
                      {UAE_EMIRATES.map((em) => <MenuItem key={em} value={em}>{em}</MenuItem>)}
                    </TextField>
                  </Grid>
                </Grid>
                {actionButtons}
              </Box>
              <Box role="tabpanel" hidden={customerTabValue !== 1} id="customer-tabpanel-additional" aria-labelledby="customer-tab-additional">
                <Grid container spacing={2}>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Location" {...register('location')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Pincode" {...register('pincode')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="State Code" {...register('stateCode')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="SAC/HSN" {...register('sacHsn')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="Cost Centre" {...register('costCentre')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Credit Limit" {...register('creditLimit')} inputProps={{ min: 0, step: 0.01 }} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Days" {...register('creditDays')} inputProps={{ min: 0 }} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Area" {...register('area')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Route" {...register('route')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Day" {...register('day')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="District" {...register('district')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="Agency" {...register('agency')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Disc %" {...register('discPercent')} inputProps={{ min: 0, max: 100, step: 0.01 }} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Category" {...register('category')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Rate Type" {...register('rateType')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Rating" {...register('rating')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="Remarks" {...register('remarks')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="Story" {...register('story')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="EmpCode" {...register('empCode')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Sales Man" {...register('salesMan')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Person" {...register('person')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Agent2" {...register('agent2')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="Tel No" {...register('phone')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={6}><TextField fullWidth size="small" label="E Mail" type="email" {...register('email')} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="Payment Terms" {...register('paymentTerms')} InputLabelProps={{ shrink: true }} /></Grid>
                </Grid>
              </Box>
            </>
          ) : (
            <>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Ledger details</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Autocomplete
                      size="small"
                      freeSolo
                      disabled={!!selectedId}
                      options={ledgerOptions}
                      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name ?? '')}
                      value={selectedId ? ledgerOptions.find((o) => o._id === selectedId) ?? null : (ledgerSearch || null)}
                      inputValue={ledgerSearch}
                      onChange={onLedgerSelect}
                      onInputChange={(_, v, reason) => {
                        setLedgerSearch(v);
                        // Update the name field when typing
                        if (reason === 'input') {
                          if (!selectedId) {
                            setValue('name', v);
                          }
                        }
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Led Name"
                          required
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                          InputLabelProps={{ shrink: true }}
                        />
                      )}
                      renderOption={(props, option) => (
                        <li {...props} key={option._id} style={{ padding: '10px 14px', fontSize: '0.95rem', minHeight: 40 }}>
                          <Box>
                            <Typography variant="body1" fontWeight={500}>{option.name}</Typography>
                            <Typography variant="body2" color="text.secondary">{option.code}</Typography>
                          </Box>
                        </li>
                      )}
                      slotProps={{
                        paper: {
                          sx: {
                            fontSize: '0.95rem',
                            '& .MuiAutocomplete-listbox': { maxHeight: 320 },
                          },
                        },
                      }}
                      sx={{
                        flex: 1,
                        '& .MuiOutlinedInput-root': { fontSize: '0.95rem' },
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleOpenChangeName}
                      disabled={!selectedId}
                      sx={{
                        minWidth: 'auto',
                        px: 1,
                        py: 0.9,
                        fontSize: '0.7rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Change Name
                    </Button>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Alias Name" {...register('aliasName')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Account Code" {...register('code')} helperText="Auto-generated when empty" InputLabelProps={{ shrink: true }} disabled />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    select
                    size="small"
                    label="Under"
                    required
                    disabled={underDisabled}
                    {...register('groupId', { required: 'Required' })}
                    value={groupIdValue || defaultGroupId || ''}
                    onChange={(e) => setValue('groupId', e.target.value, { shouldValidate: true })}
                    error={!!errors.groupId}
                    helperText={errors.groupId?.message}
                    InputLabelProps={{ shrink: true }}
                  >
                    {underOptions.map((opt) => (
                      <MenuItem key={opt._id} value={opt._id}>{opt.name}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Address" multiline rows={2} {...register('address')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Location" {...register('location')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Pincode" {...register('pincode')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Mobile" {...register('mobile')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Vat No." {...register('TRN')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="State" {...register('state')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Code" {...register('stateCode')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Cost Centre" {...register('costCentre')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" type="number" label="Credit Limit" {...register('creditLimit')} inputProps={{ min: 0, step: 0.01 }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" type="number" label="Days" {...register('creditDays')} inputProps={{ min: 0 }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" type="number" label="Old Balance Cr (AED)" {...register('openingBalanceCr')} inputProps={{ min: 0, step: 0.01 }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" type="number" label="Old Balance Dr (AED)" {...register('openingBalanceDr')} inputProps={{ min: 0, step: 0.01 }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel control={<Checkbox {...register('serviceItem')} />} label="Service Item" />
                  <TextField size="small" label="SAC/HSN" {...register('sacHsn')} sx={{ ml: 2, width: 160 }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel control={<Checkbox {...register('taxable')} />} label="Taxable" />
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Additional details</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Area" {...register('area')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Route" {...register('route')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Day" {...register('day')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="District" {...register('district')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Agency" {...register('agency')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <Controller name="regDate" control={control} render={({ field }) => <DateInput label="Reg Date" value={field.value || ''} onChange={field.onChange} size="small" />} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" type="number" label="Disc %" {...register('discPercent')} inputProps={{ min: 0, max: 100, step: 0.01 }} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Category" {...register('category')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Rate Type" {...register('rateType')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Rating" {...register('rating')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Remarks" {...register('remarks')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Story" {...register('story')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="EmpCode" {...register('empCode')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Sales Man" {...register('salesMan')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Person" {...register('person')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Agent2" {...register('agent2')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="Tel No" {...register('phone')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth size="small" label="E Mail" type="email" {...register('email')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Payment Terms" {...register('paymentTerms')} InputLabelProps={{ shrink: true }} />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
          {actionButtons}
          </>
          )}
        </form>
      </Paper>

      {/* Confirmation Dialog */}
      <Dialog open={confirmSaveOpen} onClose={handleCancelSave}>
        <DialogTitle>Confirm {pendingAction === 'edit' ? 'Update' : 'Save'}</DialogTitle>
        <DialogContent>
          <Typography>
            Do you want to {pendingAction === 'edit' ? 'update' : 'save'} this ledger?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelSave} variant="outlined">
            No
          </Button>
          <Button onClick={handleConfirmSave} variant="contained" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!successDialog} onClose={closeSuccessDialog}>
        <DialogTitle>
          {successDialog === 'saved' ? 'Saved' : successDialog === 'edited' ? 'Edited' : 'Deleted'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {successDialog === 'saved'
              ? 'Ledger has been saved successfully.'
              : successDialog === 'edited'
                ? 'Ledger has been updated successfully.'
                : 'Ledger has been deleted successfully.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSuccessDialog} variant="contained" autoFocus>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Led Name Dialog */}
      <Dialog open={changeNameDialogOpen} onClose={() => setChangeNameDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change Ledger Name</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Led Code"
            value={changeNameCode}
            disabled
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            size="small"
            label="Led Name"
            value={changeNameValue}
            onChange={(e) => setChangeNameValue(e.target.value)}
            margin="normal"
            required
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeNameDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleChangeNameSave}
            disabled={changeNameSaving || !changeNameValue.trim()}
            autoFocus
          >
            {changeNameSaving ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)} PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Error</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>{errorDialogMessage}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setErrorDialogOpen(false)} autoFocus sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' }, boxShadow: 'none' }}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} PaperProps={{ sx: { borderRadius: 2, minWidth: 350 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>Delete Ledger</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>Are you sure you want to delete this ledger? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none', borderRadius: 1.5, color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} autoFocus sx={{ textTransform: 'none', borderRadius: 1.5, boxShadow: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
